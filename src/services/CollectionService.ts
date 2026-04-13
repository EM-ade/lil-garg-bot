/**
 * CollectionService - NFT collection management per guild
 * 
 * This service manages NFT collections that guilds verify against:
 * - Add/remove collections
 * - Update collection metadata
 * - Query collections by guild
 * - Validate collection addresses
 * 
 * Each guild can have multiple collections, and each collection
 * can have multiple role mappings (for tiered verification).
 */

import { eq, and, desc } from 'drizzle-orm';
import { 
  collections, 
  type Collection, 
  type NewCollection,
  type NftMetadata 
} from '../db/schema';
import type { Database } from '../db';
import { AuditLogService } from './AuditLogService';
import logger from '../utils/logger';

export interface CollectionInput {
  collectionAddress: string;
  collectionName: string;
  blockchain?: 'solana' | 'ethereum' | 'polygon';  // Future multi-chain support
  requiredNftCount?: number;
  metadata?: {
    image?: string;
    description?: string;
    verifiedCreator?: string;
    totalSupply?: number;
    floorPrice?: number;
  };
}

export interface CollectionWithMetadata extends Collection {
  metadata: {
    image?: string;
    description?: string;
    verifiedCreator?: string;
    totalSupply?: number;
    floorPrice?: number;
  };
}

export class CollectionService {
  private auditLog: AuditLogService;

  constructor(private db: Database) {
    this.auditLog = new AuditLogService(db);
  }

  /**
   * Validate a Solana collection address format
   */
  isValidSolanaAddress(address: string): boolean {
    // Solana addresses are base58-encoded, 32-44 characters
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  }

  /**
   * Add a new NFT collection to a guild
   */
  async addCollection(
    guildId: string,  // Internal UUID
    input: CollectionInput
  ): Promise<Collection> {
    try {
      // Validate collection address
      if (!this.isValidSolanaAddress(input.collectionAddress)) {
        throw new Error(
          `Invalid Solana collection address: ${input.collectionAddress}. ` +
          'Must be a valid base58-encoded Solana address (32-44 characters).'
        );
      }

      // Check if collection already exists for this guild
      const existing = await this.getCollectionByAddress(guildId, input.collectionAddress);
      
      if (existing) {
        if (existing.isActive) {
          throw new Error(
            `Collection ${input.collectionAddress} is already registered for this guild.`
          );
        }
        // Reactivate inactive collection
        return this.reactivateCollection(existing.id);
      }

      const newCollection: NewCollection = {
        guildId,
        collectionAddress: input.collectionAddress,
        collectionName: input.collectionName,
        blockchain: input.blockchain || 'solana',
        metadata: input.metadata || {},
        requiredNftCount: input.requiredNftCount || 1,
      };

      const [created] = await this.db
        .insert(collections)
        .values(newCollection)
        .returning();

      await this.auditLog.logCollectionEvent(guildId, 'collection.added', undefined, {
        collectionId: created.id,
        collectionAddress: input.collectionAddress,
        collectionName: input.collectionName,
      });

      logger.info(
        `[CollectionService] Added collection: ${input.collectionName} (${input.collectionAddress}) to guild ${guildId}`
      );

      return created;
    } catch (error) {
      logger.error('[CollectionService] Failed to add collection:', error);
      throw error;
    }
  }

  /**
   * Get collection by internal ID
   */
  async getCollectionById(id: string): Promise<Collection | null> {
    const result = await this.db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get collection by address within a guild
   */
  async getCollectionByAddress(
    guildId: string,
    collectionAddress: string
  ): Promise<Collection | null> {
    const result = await this.db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.guildId, guildId),
          eq(collections.collectionAddress, collectionAddress)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get all active collections for a guild
   */
  async getCollectionsByGuild(guildId: string): Promise<Collection[]> {
    return this.db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.guildId, guildId),
          eq(collections.isActive, true)
        )
      )
      .orderBy(desc(collections.createdAt));
  }

  /**
   * Update collection metadata
   */
  async updateCollection(
    id: string,
    input: Partial<CollectionInput>
  ): Promise<Collection> {
    try {
      const existing = await this.getCollectionById(id);
      
      if (!existing) {
        throw new Error(`Collection not found: ${id}`);
      }

      // Validate new address if provided
      if (input.collectionAddress && !this.isValidSolanaAddress(input.collectionAddress)) {
        throw new Error(`Invalid Solana collection address: ${input.collectionAddress}`);
      }

      const updateData: Partial<Collection> = {};

      if (input.collectionAddress !== undefined) {
        updateData.collectionAddress = input.collectionAddress;
      }

      if (input.collectionName !== undefined) {
        updateData.collectionName = input.collectionName;
      }

      if (input.blockchain !== undefined) {
        updateData.blockchain = input.blockchain;
      }

      if (input.metadata !== undefined) {
        updateData.metadata = {
          ...existing.metadata,
          ...input.metadata,
        };
      }

      if (input.requiredNftCount !== undefined) {
        updateData.requiredNftCount = input.requiredNftCount;
      }

      const [updated] = await this.db
        .update(collections)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(collections.id, id))
        .returning();

      await this.auditLog.logCollectionEvent(existing.guildId, 'collection.updated', {
        collectionId: id,
        ...existing,
      }, {
        collectionId: id,
        ...updated,
      });

      logger.info(`[CollectionService] Updated collection: ${updated.collectionName} (${id})`);
      return updated;
    } catch (error) {
      logger.error('[CollectionService] Failed to update collection:', error);
      throw error;
    }
  }

  /**
   * Deactivate a collection (soft delete)
   */
  async removeCollection(id: string): Promise<void> {
    try {
      const collection = await this.getCollectionById(id);
      
      if (!collection) {
        return; // Already removed or never existed
      }

      await this.db
        .update(collections)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(collections.id, id));

      await this.auditLog.logCollectionEvent(collection.guildId, 'collection.removed', {
        collectionId: id,
        collectionAddress: collection.collectionAddress,
        collectionName: collection.collectionName,
      });

      logger.info(`[CollectionService] Removed collection: ${collection.collectionName} (${id})`);
    } catch (error) {
      logger.error('[CollectionService] Failed to remove collection:', error);
      throw error;
    }
  }

  /**
   * Reactivate a previously deactivated collection
   */
  async reactivateCollection(id: string): Promise<Collection> {
    const [updated] = await this.db
      .update(collections)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id))
      .returning();

    logger.info(`[CollectionService] Reactivated collection: ${updated.collectionName} (${id})`);
    return updated;
  }

  /**
   * Permanently delete a collection
   * WARNING: This will fail if there are role mappings referencing this collection
   */
  async deleteCollection(id: string): Promise<void> {
    try {
      const collection = await this.getCollectionById(id);
      
      if (!collection) {
        return;
      }

      await this.db
        .delete(collections)
        .where(eq(collections.id, id));

      await this.auditLog.logCollectionEvent(collection.guildId, 'collection.removed', {
        collectionId: id,
        permanentDeletion: true,
      });

      logger.warn(`[CollectionService] Permanently deleted collection: ${collection.collectionName} (${id})`);
    } catch (error) {
      // Check if it's a foreign key constraint violation
      if ((error as any).code === '23503') {
        throw new Error(
          `Cannot delete collection "${collection.collectionName}" because it has associated role mappings. ` +
          'Please remove the role mappings first.'
        );
      }
      logger.error('[CollectionService] Failed to delete collection:', error);
      throw error;
    }
  }

  /**
   * Update collection metadata from on-chain data
   * This is called by the Solana service after fetching metadata
   */
  async updateCollectionMetadata(
    id: string,
    metadata: {
      image?: string;
      description?: string;
      verifiedCreator?: string;
      totalSupply?: number;
    }
  ): Promise<void> {
    try {
      await this.db
        .update(collections)
        .set({
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(collections.id, id));
    } catch (error) {
      logger.error('[CollectionService] Failed to update collection metadata:', error);
      // Don't throw - metadata update is not critical
    }
  }

  /**
   * Get collection count for a guild
   */
  async getCollectionCount(guildId: string): Promise<number> {
    const result = await this.db
      .select({ count: collections.id })
      .from(collections)
      .where(
        and(
          eq(collections.guildId, guildId),
          eq(collections.isActive, true)
        )
      );

    return result.length;
  }

  /**
   * Get all collections across all guilds (admin function)
   */
  async getAllCollections(options: { limit?: number; offset?: number } = {}): Promise<Collection[]> {
    const { limit = 100, offset = 0 } = options;

    return this.db
      .select()
      .from(collections)
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Search collections by name or address
   */
  async searchCollections(
    guildId: string,
    query: string
  ): Promise<Collection[]> {
    const collections = await this.getCollectionsByGuild(guildId);
    
    const lowerQuery = query.toLowerCase();
    
    return collections.filter(c => 
      c.collectionName.toLowerCase().includes(lowerQuery) ||
      c.collectionAddress.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get collections that need metadata refresh
   * (for background metadata fetching job)
   */
  async getCollectionsNeedingMetadataRefresh(limit: number = 50): Promise<Collection[]> {
    return this.db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.isActive, true),
          // Collections with empty or minimal metadata
          eq(collections.metadata, {})
        )
      )
      .limit(limit);
  }
}
