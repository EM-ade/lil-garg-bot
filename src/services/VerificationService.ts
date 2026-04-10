/**
 * VerificationService - Orchestrates the NFT verification flow
 * 
 * This is the core service that coordinates the entire verification process:
 * 1. Create verification session (for frontend flow)
 * 2. Validate session token
 * 3. Verify wallet signature (prove ownership)
 * 4. Check NFT ownership (via SolanaService)
 * 5. Determine eligible roles (via RoleMappingService)
 * 6. Assign Discord roles
 * 7. Record verification in database
 * 
 * This service is guild-aware - all operations are scoped to a specific guild.
 */

import { eq, and, sql, lt } from 'drizzle-orm';
import { 
  verificationSessions, 
  verifications,
  wallets,
  type VerificationSession,
  type NewVerificationSession,
  type Verification,
  type NewVerification,
} from '../db/schema';
import type { Database } from '../db';
import { SolanaService } from './SolanaService';
import { WalletService } from './WalletService';
import { RoleMappingService, type NftOwnershipResult } from './RoleMappingService';
import { CollectionService } from './CollectionService';
import { AuditLogService } from './AuditLogService';
import { GuildConfigService } from './GuildConfigService';
import logger from '../utils/logger';
import crypto from 'crypto';

export interface VerificationSessionInput {
  guildId: string;  // Internal UUID
  discordUserId: string;
  discordUsername: string;
  walletAddress?: string;  // Optional - can be provided later
  ipAddress?: string;
  userAgent?: string;
}

export interface VerificationSessionResult {
  token: string;
  status: string;
  expiresAt: string;
  message: string;  // Message to sign
  guildName: string;
  collections: Array<{
    address: string;
    name: string;
    requiredCount: number;
  }>;
}

export interface CompleteVerificationInput {
  token: string;
  signature: string;
  walletAddress: string;
  discordUsername?: string;
}

export interface VerificationResult {
  isVerified: boolean;
  nftCount: number;
  nfts: Array<{
    mint: string;
    name: string;
    image?: string;
  }>;
  assignedRoles: string[];
  eligibleRoles: Array<{
    roleId: string;
    roleName: string;
    minNftCount: number;
    ownedCount: number;
  }>;
  walletAddress: string;
  verifiedAt: Date;
}

export interface ReverificationResult {
  isStillVerified: boolean;
  rolesChanged: boolean;
  addedRoles: string[];
  removedRoles: string[];
  nftCount: number;
}

export class VerificationService {
  private solanaService: SolanaService;
  private walletService: WalletService;
  private roleMappingService: RoleMappingService;
  private collectionService: CollectionService;
  private auditLog: AuditLogService;
  private guildConfigService: GuildConfigService;

  constructor(private db: Database) {
    this.solanaService = new SolanaService(db);
    this.walletService = new WalletService(db);
    this.roleMappingService = new RoleMappingService(db);
    this.collectionService = new CollectionService(db);
    this.auditLog = new AuditLogService(db);
    this.guildConfigService = new GuildConfigService(db);
  }

  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).toString('hex');
  }

  /**
   * Create a new verification session
   * 
   * This is called when a user initiates verification via Discord command.
   * Returns a token that can be used to complete verification on the frontend.
   */
  async createSession(input: VerificationSessionInput): Promise<VerificationSessionResult> {
    try {
      // Validate guild exists
      const guild = await this.guildConfigService.getGuildById(input.guildId);
      
      if (!guild) {
        throw new Error(`Guild not found: ${input.guildId}`);
      }

      // Validate wallet address if provided
      if (input.walletAddress && !this.solanaService.isValidSolanaAddress(input.walletAddress)) {
        throw new Error(`Invalid Solana wallet address: ${input.walletAddress}`);
      }

      // Generate token and message
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);
      
      const message = this.solanaService.generateVerificationMessage(
        input.discordUserId,
        input.walletAddress || ''
      );

      // Session expires in 10 minutes
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Create session record
      const newSession: NewVerificationSession = {
        guildId: input.guildId,
        discordUserId: input.discordUserId,
        discordUsername: input.discordUsername,
        walletAddress: input.walletAddress || null,
        sessionToken: token,
        sessionTokenHash: tokenHash,
        signaturePayload: message,
        status: 'pending',
        expiresAt,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
      };

      const [created] = await this.db
        .insert(verificationSessions)
        .values(newSession)
        .returning();

      // Get guild's active collections
      const collections = await this.collectionService.getCollectionsByGuild(input.guildId);

      await this.auditLog.logVerificationEvent(
        input.guildId,
        input.discordUserId,
        'verification.started',
        {
          sessionId: created.id,
          walletAddress: input.walletAddress,
        }
      );

      logger.info(
        `[VerificationService] Created session ${created.id} for user ${input.discordUserId} in guild ${input.guildId}`
      );

      return {
        token,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        message,
        guildName: guild.guildName,
        collections: collections.map(c => ({
          address: c.collectionAddress,
          name: c.collectionName,
          requiredCount: c.requiredNftCount,
        })),
      };
    } catch (error) {
      logger.error('[VerificationService] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get session by token
   */
  async getSessionByToken(token: string): Promise<VerificationSession | null> {
    const tokenHash = this.hashToken(token);

    const result = await this.db
      .select()
      .from(verificationSessions)
      .where(eq(verificationSessions.sessionTokenHash, tokenHash))
      .limit(1);

    const session = result[0];

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.status === 'pending' && new Date(session.expiresAt) < new Date()) {
      // Mark as expired
      await this.db
        .update(verificationSessions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(verificationSessions.id, session.id));

      return { ...session, status: 'expired' };
    }

    return session;
  }

  /**
   * Complete verification flow
   * 
   * This is called by the frontend after the user signs the message.
   * Performs all verification steps and assigns roles.
   */
  async completeVerification(
    input: CompleteVerificationInput,
    requesterInfo?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<VerificationResult> {
    const { token, signature, walletAddress, discordUsername } = input;

    try {
      // Step 1: Get and validate session
      const session = await this.getSessionByToken(token);

      if (!session) {
        throw new Error('Verification session not found. Please restart verification.');
      }

      if (session.status !== 'pending') {
        throw new Error(
          `Verification session is no longer pending (status: ${session.status}). ` +
          'Please restart verification.'
        );
      }

      // Step 2: Verify wallet signature
      const signatureValid = await this.solanaService.verifySignedMessage(
        session.signaturePayload!,
        signature,
        walletAddress
      );

      if (!signatureValid) {
        await this.db
          .update(verificationSessions)
          .set({ 
            status: 'failed',
            signatureValid: false,
            updatedAt: new Date() 
          })
          .where(eq(verificationSessions.id, session.id));

        throw new Error('Invalid wallet signature. Please try again.');
      }

      // Step 3: Link wallet to user (or verify existing link)
      await this.walletService.getOrCreateWallet({
        walletAddress,
        discordUserId: session.discordUserId,
        discordUsername: discordUsername || session.discordUsername || '',
      });

      // Mark wallet as verified
      await this.walletService.markWalletAsVerified(walletAddress);

      // Step 4: Get guild's collections for verification
      const collections = await this.collectionService.getCollectionsByGuild(session.guildId);

      if (collections.length === 0) {
        throw new Error(
          'This server has not configured any NFT collections for verification. ' +
          'Please contact the server administrator.'
        );
      }

      // Step 5: Verify guild has Helius API key configured (enforced - no fallback)
      const guild = await this.guildConfigService.getGuildById(session.guildId);
      if (!guild?.settings?.heliusApiKey) {
        throw new Error(
          'This server has not configured a Helius API key for NFT verification. ' +
          'Ask an admin to run: /verification-config settings helius_api_key=<your-helius-api-key>'
        );
      }

      // Step 6: Verify NFT ownership
      const collectionAddresses = collections.map(c => c.collectionAddress);
      const verifiedCreators: Record<string, string> = {};
      
      // Extract verified creators from collection metadata
      for (const collection of collections) {
        if (collection.metadata?.verifiedCreator) {
          verifiedCreators[collection.collectionAddress] = collection.metadata.verifiedCreator;
        }
      }

      const nftVerification = await this.solanaService.verifyNFTOwnership(walletAddress, {
        collectionAddresses,
        verifiedCreators,
        guildId: session.guildId,  // Pass guild ID for per-guild Helius API key
      });

      // Step 6: Determine eligible roles
      const ownershipResults: NftOwnershipResult[] = collections.map(c => ({
        collectionAddress: c.collectionAddress,
        ownedCount: nftVerification.byContract[c.collectionAddress] || 0,
      }));

      const eligibleRoles = await this.roleMappingService.getEligibleRoles(
        session.guildId,
        ownershipResults
      );

      const rolesToAssign = eligibleRoles
        .filter(r => r.isEligible && r.autoAssign)
        .map(r => r.roleId);

      // Step 7: Update verification session
      await this.db
        .update(verificationSessions)
        .set({
          status: 'verified',
          verifiedAt: new Date(),
          walletAddress,
          signatureValid: true,
          updatedAt: new Date(),
        })
        .where(eq(verificationSessions.id, session.id));

      // Step 8: Record verification in database
      const existingVerification = await this.getVerificationByUser(
        session.guildId,
        session.discordUserId
      );

      if (existingVerification) {
        // Update existing verification
        await this.updateVerificationRecord(existingVerification.id, {
          walletAddress,
          nftsOwned: nftVerification.nfts,
          status: nftVerification.isVerified ? 'verified' : 'failed',
          assignedRoleIds: rolesToAssign,
        });
      } else {
        // Create new verification record
        await this.createVerificationRecord({
          guildId: session.guildId,
          walletAddress,
          discordUserId: session.discordUserId,
          discordUsername: discordUsername || session.discordUsername || '',
          nftsOwned: nftVerification.nfts,
          status: nftVerification.isVerified ? 'verified' : 'failed',
          assignedRoleIds: rolesToAssign,
        });
      }

      // Step 9: Log the verification
      await this.auditLog.logVerificationEvent(
        session.guildId,
        session.discordUserId,
        'verification.completed',
        {
          walletAddress,
          nftCount: nftVerification.nftCount,
          isVerified: nftVerification.isVerified,
          rolesAssigned: rolesToAssign.length,
        }
      );

      logger.info(
        `[VerificationService] Completed verification for user ${session.discordUserId} ` +
        `in guild ${session.guildId}: ${nftVerification.isVerified ? 'VERIFIED' : 'NOT VERIFIED'} ` +
        `(${nftVerification.nftCount} NFTs, ${rolesToAssign.length} roles)`
      );

      return {
        isVerified: nftVerification.isVerified,
        nftCount: nftVerification.nftCount,
        nfts: nftVerification.nfts.map(n => ({
          mint: n.mint,
          name: n.name,
          image: n.image,
        })),
        assignedRoles: rolesToAssign,
        eligibleRoles: eligibleRoles.map(r => ({
          roleId: r.roleId,
          roleName: r.roleName,
          minNftCount: r.minNftCount,
          ownedCount: r.ownedCount,
        })),
        walletAddress,
        verifiedAt: new Date(),
      };
    } catch (error) {
      logger.error('[VerificationService] Failed to complete verification:', error);
      throw error;
    }
  }

  /**
   * Create a verification record in the database
   */
  private async createVerificationRecord(input: {
    guildId: string;
    walletAddress: string;
    discordUserId: string;
    discordUsername: string;
    nftsOwned: Array<{ mint: string; name: string; image?: string }>;
    status: 'verified' | 'failed' | 'expired' | 'revoked';
    assignedRoleIds?: string[];
    expiresAt?: Date;
  }): Promise<Verification> {
    // Get wallet ID
    const wallet = await this.walletService.getWalletByAddress(input.walletAddress);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const guild = await this.guildConfigService.getGuildById(input.guildId);
    const reverificationInterval = guild?.settings?.reverificationIntervalDays || 7;
    const expiresAt = input.expiresAt || new Date(Date.now() + reverificationInterval * 24 * 60 * 60 * 1000);

    const newVerification: NewVerification = {
      guildId: input.guildId,
      walletId: wallet.id,
      discordUserId: input.discordUserId,
      discordUsername: input.discordUsername,
      walletAddress: input.walletAddress,
      nftsOwned: input.nftsOwned,
      status: input.status,
      assignedRoleIds: input.assignedRoleIds || [],
      expiresAt,
    };

    const [created] = await this.db
      .insert(verifications)
      .values(newVerification)
      .returning();

    return created;
  }

  /**
   * Update an existing verification record
   */
  private async updateVerificationRecord(
    id: string,
    input: Partial<{
      walletAddress: string;
      nftsOwned: Array<{ mint: string; name: string; image?: string }>;
      status: 'verified' | 'failed' | 'expired' | 'revoked';
      assignedRoleIds: string[];
    }>
  ): Promise<Verification> {
    const [updated] = await this.db
      .update(verifications)
      .set({
        ...input,
        lastReverifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(verifications.id, id))
      .returning();

    return updated;
  }

  /**
   * Get verification record by user and guild
   */
  async getVerificationByUser(
    guildId: string,
    discordUserId: string
  ): Promise<Verification | null> {
    const result = await this.db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.guildId, guildId),
          eq(verifications.discordUserId, discordUserId)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Re-verify a user's NFT ownership
   * 
   * Called periodically to check if users still own their NFTs.
   */
  async reverifyUser(
    guildId: string,
    discordUserId: string
  ): Promise<ReverificationResult> {
    try {
      const verification = await this.getVerificationByUser(guildId, discordUserId);

      if (!verification) {
        throw new Error('No verification record found for this user in this guild.');
      }

      if (verification.status !== 'verified') {
        throw new Error('User is not currently verified.');
      }

      // Verify guild has Helius API key configured (enforced - no fallback)
      const guildForReverify = await this.guildConfigService.getGuildById(guildId);
      if (!guildForReverify?.settings?.heliusApiKey) {
        throw new Error(
          'This server has not configured a Helius API key for NFT verification. ' +
          'Please ask an admin to set up the Helius configuration.'
        );
      }

      // Get current NFT ownership
      const nftVerification = await this.solanaService.verifyNFTOwnership(
        verification.walletAddress,
        {
          collectionAddresses: [],  // Will be populated from collections
          guildId,
        }
      );

      // Get guild's collections
      const collections = await this.collectionService.getCollectionsByGuild(guildId);
      const collectionAddresses = collections.map(c => c.collectionAddress);

      // Re-verify with actual collections
      const updatedNftVerification = await this.solanaService.verifyNFTOwnership(
        verification.walletAddress,
        { collectionAddresses, guildId }
      );

      // Get new role eligibility
      const ownershipResults: NftOwnershipResult[] = collections.map(c => ({
        collectionAddress: c.collectionAddress,
        ownedCount: updatedNftVerification.byContract[c.collectionAddress] || 0,
      }));

      const newEligibleRoles = await this.roleMappingService.getEligibleRoles(
        guildId,
        ownershipResults
      );

      const newRolesToAssign = newEligibleRoles
        .filter(r => r.isEligible && r.autoAssign)
        .map(r => r.roleId);

      // Compare with current roles
      const currentRoles = new Set(verification.assignedRoleIds || []);
      const newRoles = new Set(newRolesToAssign);

      const addedRoles = newRolesToAssign.filter(r => !currentRoles.has(r));
      const removedRoles = (verification.assignedRoleIds || []).filter(r => !newRoles.has(r));

      const rolesChanged = addedRoles.length > 0 || removedRoles.length > 0;
      const isStillVerified = updatedNftVerification.isVerified;

      // Update verification record
      await this.updateVerificationRecord(verification.id, {
        nftsOwned: updatedNftVerification.nfts,
        status: isStillVerified ? 'verified' : 'expired',
        assignedRoleIds: newRolesToAssign,
      });

      logger.info(
        `[VerificationService] Re-verified user ${discordUserId} in guild ${guildId}: ` +
        `${isStillVerified ? 'STILL VERIFIED' : 'NO LONGER VERIFIED'}`
      );

      return {
        isStillVerified,
        rolesChanged,
        addedRoles,
        removedRoles,
        nftCount: updatedNftVerification.nftCount,
      };
    } catch (error) {
      logger.error('[VerificationService] Failed to re-verify user:', error);
      throw error;
    }
  }

  /**
   * Revoke a user's verification
   * 
   * Called when admin manually removes verification or user sells NFT.
   */
  async revokeVerification(
    guildId: string,
    discordUserId: string,
    reason: string = 'Manual revocation'
  ): Promise<void> {
    try {
      const verification = await this.getVerificationByUser(guildId, discordUserId);

      if (!verification) {
        return;  // Already not verified
      }

      await this.updateVerificationRecord(verification.id, {
        status: 'revoked',
        assignedRoleIds: [],
      });

      await this.auditLog.logVerificationEvent(
        guildId,
        discordUserId,
        'verification.revoked',
        { reason }
      );

      logger.info(
        `[VerificationService] Revoked verification for user ${discordUserId} in guild ${guildId}: ${reason}`
      );
    } catch (error) {
      logger.error('[VerificationService] Failed to revoke verification:', error);
      throw error;
    }
  }

  /**
   * Get verifications that need re-verification
   * 
   * Used by scheduled job to periodically check users.
   */
  async getVerificationsDueForRecheck(limit: number = 100): Promise<Verification[]> {
    return this.db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.status, 'verified'),
          lt(verifications.expiresAt, new Date())
        )
      )
      .limit(limit);
  }

  /**
   * Get verification statistics for a guild
   */
  async getVerificationStats(guildId: string): Promise<{
    totalVerified: number;
    totalFailed: number;
    totalExpired: number;
    totalRevoked: number;
    expiringSoon: number;  // Expiring in next 24 hours
  }> {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const result = await this.db
      .select({
        totalVerified: sql<number>`count(*) filter (where status = 'verified')`,
        totalFailed: sql<number>`count(*) filter (where status = 'failed')`,
        totalExpired: sql<number>`count(*) filter (where status = 'expired')`,
        totalRevoked: sql<number>`count(*) filter (where status = 'revoked')`,
        expiringSoon: sql<number>`count(*) filter (
          where status = 'verified' 
          and expires_at > ${now} 
          and expires_at < ${tomorrow}
        )`,
      })
      .from(verifications)
      .where(eq(verifications.guildId, guildId))
      .then(rows => rows[0]);

    return {
      totalVerified: Number(result.totalVerified),
      totalFailed: Number(result.totalFailed),
      totalExpired: Number(result.totalExpired),
      totalRevoked: Number(result.totalRevoked),
      expiringSoon: Number(result.expiringSoon),
    };
  }
}
