const crypto = require('crypto');
const logger = require('../utils/logger');
const SolanaConnectionService = require('./solanaConnectionService');
const NFTVerificationService = require('./nftVerification');
const {
  getVerificationSessionStore,
  getUserStore,
  getGuildVerificationConfigStore,
} = require('./serviceFactory');

const DEFAULT_SESSION_TTL_MINUTES = 10;

class VerificationSessionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'VerificationSessionError';
    this.statusCode = statusCode;
  }
}

class VerificationSessionService {
  constructor() {
    this.sessionStore = getVerificationSessionStore();
    this.userStore = getUserStore();
    this.guildVerificationConfigStore = getGuildVerificationConfigStore();
    this.solanaService = new SolanaConnectionService();
    this.nftService = new NFTVerificationService();
    this.sessionTtlMs =
      (parseInt(process.env.VERIFICATION_SESSION_TTL_MINUTES, 10) ||
        DEFAULT_SESSION_TTL_MINUTES) *
      60 *
      1000;
  }

  ensureSupabaseAvailability() {
    if (!this.sessionStore || !this.userStore) {
      throw new VerificationSessionError(
        'Verification portal is not available. Session store is not configured.',
        503
      );
    }
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  computeExpiresAt() {
    return new Date(Date.now() + this.sessionTtlMs).toISOString();
  }

  sanitizeSession(session, { includeMessage = false } = {}) {
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      discordId: session.discord_id,
      guildId: session.guild_id,
      walletAddress: session.wallet_address,
      status: session.status,
      expiresAt: session.expires_at,
      verifiedAt: session.verified_at,
      username: session.username,
      message: includeMessage ? session.signature_payload : undefined,
      createdAt: session.created_at,
    };
  }

  isExpired(session) {
    if (!session?.expires_at) {
      return false;
    }
    return new Date(session.expires_at).getTime() <= Date.now();
  }

  async autoExpire(session) {
    if (!session || session.status !== 'pending') {
      return session;
    }

    if (!this.isExpired(session)) {
      return session;
    }

    const updated = await this.sessionStore.expireSession(session.id);
    logger.debug(
      `[verification] Session ${session.id} automatically expired at ${new Date().toISOString()}`
    );
    return updated;
  }

  async createSession({ discordId, guildId, walletAddress, username }) {
    this.ensureSupabaseAvailability();

    if (!discordId || !guildId) {
      throw new VerificationSessionError(
        'discordId and guildId are required.'
      );
    }

    if (walletAddress && !this.solanaService.isValidSolanaAddress(walletAddress)) {
      throw new VerificationSessionError('Invalid Solana wallet address.');
    }

    const token = this.generateToken();
    const message = this.solanaService.generateVerificationMessage(
      discordId,
      walletAddress
    );
    const expiresAt = this.computeExpiresAt();

    const session = await this.sessionStore.createSession({
      discordId,
      guildId,
      walletAddress: walletAddress || null,
      expiresAt,
      message,
      token,
      username,
    });

    logger.info(
      `[verification] Created session ${session.id} for discordId=${discordId} guildId=${guildId}`
    );

    return {
      token,
      status: session.status,
      expiresAt: session.expires_at,
      message,
    };
  }

  async findSessionByToken(token, options = {}) {
    this.ensureSupabaseAvailability();

    if (!token) {
      throw new VerificationSessionError('Verification token is required.');
    }

    const session = await this.sessionStore.findByToken(token);
    if (!session) {
      return null;
    }

    const maybeExpired = await this.autoExpire(session);
    return this.sanitizeSession(maybeExpired, options);
  }

  async verifySession(token, signature, { username, requester, walletAddress: providedWallet } = {}) {
    this.ensureSupabaseAvailability();

    if (!token || !signature) {
      throw new VerificationSessionError(
        'Verification token and signature are required.'
      );
    }

    const session = await this.sessionStore.findByToken(token);
    if (!session) {
      throw new VerificationSessionError('Session not found.', 404);
    }

    const activeSession = await this.autoExpire(session);
    if (activeSession.status === 'expired') {
      await this.recordAttempt(activeSession.id, 'expired', requester);
      throw new VerificationSessionError('Verification session has expired.', 410);
    }

    if (activeSession.status !== 'pending') {
      await this.recordAttempt(activeSession.id, 'already_completed', requester);
      throw new VerificationSessionError('Verification session already completed.', 409);
    }

    const message = activeSession.signature_payload;
    let walletAddress = activeSession.wallet_address;

    if (!walletAddress) {
      walletAddress = providedWallet;

      if (!walletAddress) {
        throw new VerificationSessionError(
          'Verification session is missing wallet address. Please restart verification.',
          400
        );
      }

      if (!this.solanaService.isValidSolanaAddress(walletAddress)) {
        throw new VerificationSessionError('Invalid Solana wallet address provided.', 400);
      }

      await this.sessionStore.updateSession(activeSession.id, {
        wallet_address: walletAddress,
        updated_at: new Date().toISOString(),
      });
    }

    const signatureValid = await this.solanaService.verifySignedMessage(
      message,
      signature,
      walletAddress
    );

    if (!signatureValid) {
      await this.sessionStore.updateSession(activeSession.id, {
        status: 'failed',
        updated_at: new Date().toISOString(),
      });
      await this.recordAttempt(activeSession.id, 'invalid_signature', requester);
      throw new VerificationSessionError('Invalid wallet signature.', 401);
    }

    let contractRules = [];
    if (this.guildVerificationConfigStore) {
      try {
        contractRules = await this.guildVerificationConfigStore.listByGuild(
          activeSession.guild_id
        );
      } catch (error) {
        logger.warn(
          `[verification] Failed to load guild contract rules for ${activeSession.guild_id}: ${error.message}`
        );
      }
    }

    const ruleContracts = contractRules
      .map((rule) => rule.contractAddress)
      .filter(Boolean);

    const verificationResult = await this.nftService.verifyNFTOwnership(
      walletAddress,
      {
        contractAddresses: ruleContracts,
      }
    );

    const contractSummaries = contractRules.map((rule) => {
      const key = rule.contractAddress?.toLowerCase?.();
      const ownedCount = key ? verificationResult.byContract?.[key] || 0 : 0;
      return {
        contractAddress: rule.contractAddress,
        requiredNftCount: rule.requiredNftCount,
        roleId: rule.roleId,
        roleName: rule.roleName,
        ownedCount,
        meetsRequirement: ownedCount >= (rule.requiredNftCount || 1),
      };
    });

    const meetsAnyRule =
      contractSummaries.length > 0
        ? contractSummaries.some((summary) => summary.meetsRequirement)
        : verificationResult.isVerified;

    const enrichedVerification = {
      ...verificationResult,
      isVerified: meetsAnyRule,
      contracts: contractSummaries,
    };

    const userRecord = await this.userStore.ensureUserRecord({
      discordId: activeSession.discord_id,
      guildId: activeSession.guild_id,
      username: username || activeSession.username,
    });

    const resolvedUsername = username || activeSession.username;

    const lastVerifiedAt = await this.updateUserVerification(
      activeSession,
      enrichedVerification,
      resolvedUsername,
      userRecord?.id
    );

    const sessionStatus = enrichedVerification.isVerified ? 'verified' : 'completed';

    const updatedSession = await this.sessionStore.updateSession(
      activeSession.id,
      {
        status: sessionStatus,
        verified_at: lastVerifiedAt,
        updated_at: lastVerifiedAt,
      }
    );

    await this.recordAttempt(activeSession.id, 'verified', requester);

    return {
      session: this.sanitizeSession(updatedSession),
      verification: {
        walletAddress: enrichedVerification.walletAddress,
        nftCount: enrichedVerification.nftCount,
        isVerified: enrichedVerification.isVerified,
        nfts: enrichedVerification.nfts,
        contracts: enrichedVerification.contracts,
        byContract: enrichedVerification.byContract,
        verifiedAt: lastVerifiedAt,
      },
    };
  }

  async updateUserVerification(session, verificationResult, username, userId) {
    const lastVerifiedAt = new Date().toISOString();

    const resolvedUsername = username || session.username;

    await this.userStore.upsertVerificationStatus({
      discordId: session.discord_id,
      guildId: session.guild_id,
      username: resolvedUsername,
      walletAddress: verificationResult.walletAddress,
      isVerified: verificationResult.isVerified,
      lastVerified: lastVerifiedAt,
    });

    if (userId && this.userStore.replaceUserTokensByUserId) {
      await this.userStore.replaceUserTokensByUserId(
        userId,
        (verificationResult.nfts || []).map((nft) => ({
          mint: nft.mint,
          name: nft.name,
          image: nft.image,
          verifiedAt: lastVerifiedAt,
        }))
      );
    }

    if (userId && this.userStore.addVerificationHistoryByUserId) {
      await this.userStore.addVerificationHistoryByUserId(userId, {
        walletAddress: verificationResult.walletAddress,
        nftCount: verificationResult.nftCount,
        status: verificationResult.isVerified ? 'success' : 'failed',
        verifiedAt: lastVerifiedAt,
        username: resolvedUsername,
      });
    }

    return lastVerifiedAt;
  }

  async recordAttempt(sessionId, resultCode, requester = {}) {
    if (!this.sessionStore.recordAttempt) {
      return;
    }

    try {
      const ipHash = this.hashValue(requester.ip);
      await this.sessionStore.recordAttempt({
        sessionId,
        resultCode,
        ipHash,
        userAgent: requester.userAgent,
      });
    } catch (error) {
      logger.warn(
        `[verification] Failed to record verification attempt for session ${sessionId}: ${error.message}`
      );
    }
  }

  hashValue(value) {
    if (!value) {
      return null;
    }
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = {
  verificationSessionService: new VerificationSessionService(),
  VerificationSessionError,
};
