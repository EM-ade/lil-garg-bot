/**
 * RoleMappingService - Discord role to NFT collection mappings
 * 
 * This service manages the mapping between NFT collections and Discord roles:
 * - Create/update/remove role mappings
 * - Query role mappings by guild or collection
 * - Determine which roles a user should have based on NFT ownership
 * - Handle tiered role assignments (e.g., Bronze, Silver, Gold based on NFT count)
 * 
 * Role mappings support:
 * - Minimum NFT count thresholds
 * - Maximum NFT count (for exclusive roles)
 * - Priority ordering (for resolving conflicts)
 * - Auto-assignment and auto-removal settings
 */

import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { 
  roleMappings, 
  collections,
  type RoleMapping, 
  type NewRoleMapping 
} from '../db/schema';
import type { Database } from '../db';
import { AuditLogService } from './AuditLogService';
import logger from '../utils/logger';

export interface RoleMappingInput {
  collectionId?: string;  // Optional - can map roles without specific collection
  roleId: string;
  roleName: string;
  minNftCount?: number;
  maxNftCount?: number;
  priority?: number;
  autoAssign?: boolean;
  autoRemove?: boolean;
}

export interface RoleMappingWithCollection extends RoleMapping {
  collection?: {
    collectionAddress: string;
    collectionName: string;
  } | null;
}

export interface NftOwnershipResult {
  collectionAddress: string;
  ownedCount: number;
}

/**
 * Result of role eligibility check
 */
export interface RoleEligibilityResult {
  roleId: string;
  roleName: string;
  collectionAddress?: string;
  minNftCount: number;
  maxNftCount?: number;
  ownedCount: number;
  isEligible: boolean;
  priority: number;
  autoAssign: boolean;
}

export class RoleMappingService {
  private auditLog: AuditLogService;

  constructor(private db: Database) {
    this.auditLog = new AuditLogService(db);
  }

  /**
   * Create a new role mapping
   */
  async createRoleMapping(
    guildId: string,
    input: RoleMappingInput
  ): Promise<RoleMapping> {
    try {
      // Validate NFT count thresholds
      const minCount = input.minNftCount || 1;
      
      if (minCount < 1) {
        throw new Error('Minimum NFT count must be at least 1');
      }

      if (input.maxNftCount !== undefined && input.maxNftCount < minCount) {
        throw new Error('Maximum NFT count must be greater than or equal to minimum');
      }

      // Check if role already exists for this guild
      const existing = await this.getRoleMappingByRoleId(guildId, input.roleId);
      
      if (existing && existing.isActive) {
        throw new Error(
          `Role mapping for role ${input.roleName} already exists in this guild.`
        );
      }

      const newMapping: NewRoleMapping = {
        guildId,
        collectionId: input.collectionId || null,
        roleId: input.roleId,
        roleName: input.roleName,
        minNftCount: minCount,
        maxNftCount: input.maxNftCount || null,
        priority: input.priority || 0,
        autoAssign: input.autoAssign !== false,  // Default to true
        autoRemove: input.autoRemove || false,
      };

      const [created] = await this.db
        .insert(roleMappings)
        .values(newMapping)
        .returning();

      await this.auditLog.logRoleEvent(guildId, 'role.mapping_added', undefined, {
        roleMappingId: created.id,
        roleId: input.roleId,
        roleName: input.roleName,
        collectionId: input.collectionId,
        minNftCount: minCount,
      });

      logger.info(
        `[RoleMappingService] Created role mapping: ${input.roleName} (${input.roleId}) for guild ${guildId}`
      );

      return created;
    } catch (error) {
      logger.error('[RoleMappingService] Failed to create role mapping:', error);
      throw error;
    }
  }

  /**
   * Get role mapping by internal ID
   */
  async getRoleMappingById(id: string): Promise<RoleMapping | null> {
    const result = await this.db
      .select()
      .from(roleMappings)
      .where(eq(roleMappings.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get role mapping by Discord role ID within a guild
   */
  async getRoleMappingByRoleId(
    guildId: string,
    roleId: string
  ): Promise<RoleMapping | null> {
    const result = await this.db
      .select()
      .from(roleMappings)
      .where(
        and(
          eq(roleMappings.guildId, guildId),
          eq(roleMappings.roleId, roleId)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get all active role mappings for a guild (ordered by priority)
   */
  async getRoleMappingsByGuild(guildId: string): Promise<RoleMappingWithCollection[]> {
    const results = await this.db
      .select({
        roleMapping: roleMappings,
        collection: {
          collectionAddress: collections.collectionAddress,
          collectionName: collections.collectionName,
        },
      })
      .from(roleMappings)
      .leftJoin(collections, eq(roleMappings.collectionId, collections.id))
      .where(
        and(
          eq(roleMappings.guildId, guildId),
          eq(roleMappings.isActive, true)
        )
      )
      .orderBy(
        asc(roleMappings.priority),
        desc(roleMappings.minNftCount)  // Higher NFT count requirements first
      );

    return results.map(r => ({
      ...r.roleMapping,
      collection: r.collection,
    }));
  }

  /**
   * Get role mappings for a specific collection
   */
  async getRoleMappingsByCollection(collectionId: string): Promise<RoleMapping[]> {
    return this.db
      .select()
      .from(roleMappings)
      .where(
        and(
          eq(roleMappings.collectionId, collectionId),
          eq(roleMappings.isActive, true)
        )
      )
      .orderBy(asc(roleMappings.priority));
  }

  /**
   * Update a role mapping
   */
  async updateRoleMapping(
    id: string,
    input: Partial<RoleMappingInput>
  ): Promise<RoleMapping> {
    try {
      const existing = await this.getRoleMappingById(id);
      
      if (!existing) {
        throw new Error(`Role mapping not found: ${id}`);
      }

      // Validate NFT count thresholds
      const minCount = input.minNftCount ?? existing.minNftCount;
      
      if (minCount < 1) {
        throw new Error('Minimum NFT count must be at least 1');
      }

      const maxCount = input.maxNftCount ?? existing.maxNftCount;
      if (maxCount !== null && maxCount < minCount) {
        throw new Error('Maximum NFT count must be greater than or equal to minimum');
      }

      const updateData: Partial<RoleMapping> = {};

      if (input.collectionId !== undefined) {
        updateData.collectionId = input.collectionId;
      }

      if (input.roleName !== undefined) {
        updateData.roleName = input.roleName;
      }

      if (input.minNftCount !== undefined) {
        updateData.minNftCount = input.minNftCount;
      }

      if (input.maxNftCount !== undefined) {
        updateData.maxNftCount = input.maxNftCount;
      }

      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }

      if (input.autoAssign !== undefined) {
        updateData.autoAssign = input.autoAssign;
      }

      if (input.autoRemove !== undefined) {
        updateData.autoRemove = input.autoRemove;
      }

      const [updated] = await this.db
        .update(roleMappings)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(roleMappings.id, id))
        .returning();

      await this.auditLog.logRoleEvent(existing.guildId, 'role.mapping_updated', {
        roleMappingId: id,
        ...existing,
      }, {
        roleMappingId: id,
        ...updated,
      });

      logger.info(`[RoleMappingService] Updated role mapping: ${updated.roleName} (${id})`);
      return updated;
    } catch (error) {
      logger.error('[RoleMappingService] Failed to update role mapping:', error);
      throw error;
    }
  }

  /**
   * Deactivate a role mapping (soft delete)
   */
  async removeRoleMapping(id: string): Promise<void> {
    try {
      const mapping = await this.getRoleMappingById(id);
      
      if (!mapping) {
        return;
      }

      await this.db
        .update(roleMappings)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(roleMappings.id, id));

      await this.auditLog.logRoleEvent(mapping.guildId, 'role.mapping_removed', {
        roleMappingId: id,
        roleId: mapping.roleId,
        roleName: mapping.roleName,
      });

      logger.info(`[RoleMappingService] Removed role mapping: ${mapping.roleName} (${id})`);
    } catch (error) {
      logger.error('[RoleMappingService] Failed to remove role mapping:', error);
      throw error;
    }
  }

  /**
   * Reactivate a previously deactivated role mapping
   */
  async reactivateRoleMapping(id: string): Promise<RoleMapping> {
    const [updated] = await this.db
      .update(roleMappings)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(roleMappings.id, id))
      .returning();

    logger.info(`[RoleMappingService] Reactivated role mapping: ${updated.roleName} (${id})`);
    return updated;
  }

  /**
   * Permanently delete a role mapping
   */
  async deleteRoleMapping(id: string): Promise<void> {
    try {
      const mapping = await this.getRoleMappingById(id);
      
      if (!mapping) {
        return;
      }

      await this.db
        .delete(roleMappings)
        .where(eq(roleMappings.id, id));

      await this.auditLog.logRoleEvent(mapping.guildId, 'role.mapping_removed', {
        roleMappingId: id,
        permanentDeletion: true,
      });

      logger.warn(`[RoleMappingService] Permanently deleted role mapping: ${mapping.roleName} (${id})`);
    } catch (error) {
      logger.error('[RoleMappingService] Failed to delete role mapping:', error);
      throw error;
    }
  }

  /**
   * Determine which roles a user is eligible for based on NFT ownership
   * 
   * @param guildId - Guild UUID
   * @param ownershipResults - NFT ownership counts per collection
   * @returns Array of role eligibility results
   */
  async getEligibleRoles(
    guildId: string,
    ownershipResults: NftOwnershipResult[]
  ): Promise<RoleEligibilityResult[]> {
    const roleMappings = await this.getRoleMappingsByGuild(guildId);
    
    // Create a map of collection address to owned count
    const ownershipMap = new Map(
      ownershipResults.map(r => [r.collectionAddress.toLowerCase(), r.ownedCount])
    );

    const eligibleRoles: RoleEligibilityResult[] = [];

    for (const mapping of roleMappings) {
      // Get owned count for this collection
      let ownedCount = 0;
      
      if (mapping.collection) {
        const collectionKey = mapping.collection.collectionAddress.toLowerCase();
        ownedCount = ownershipMap.get(collectionKey) || 0;
      } else {
        // If no collection is specified, sum all owned NFTs
        ownedCount = ownershipResults.reduce((sum, r) => sum + r.ownedCount, 0);
      }

      // Check eligibility
      const isEligible = 
        ownedCount >= mapping.minNftCount &&
        (mapping.maxNftCount === null || ownedCount <= mapping.maxNftCount);

      eligibleRoles.push({
        roleId: mapping.roleId,
        roleName: mapping.roleName,
        collectionAddress: mapping.collection?.collectionAddress,
        minNftCount: mapping.minNftCount,
        maxNftCount: mapping.maxNftCount || undefined,
        ownedCount,
        isEligible,
        priority: mapping.priority,
        autoAssign: mapping.autoAssign,
      });
    }

    // Sort by priority (lower = higher priority)
    return eligibleRoles.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get roles that should be assigned to a user
   * (subset of eligible roles with autoAssign = true)
   */
  async getRolesToAssign(
    guildId: string,
    ownershipResults: NftOwnershipResult[]
  ): Promise<string[]> {
    const eligibleRoles = await this.getEligibleRoles(guildId, ownershipResults);
    
    return eligibleRoles
      .filter(r => r.isEligible && r.autoAssign)
      .map(r => r.roleId);
  }

  /**
   * Get roles that should be removed from a user
   * (roles they have but are no longer eligible for, with autoRemove = true)
   */
  async getRolesToRemove(
    guildId: string,
    ownershipResults: NftOwnershipResult[],
    currentRoleIds: string[]
  ): Promise<string[]> {
    const eligibleRoles = await this.getEligibleRoles(guildId, ownershipResults);
    const eligibleRoleIds = new Set(
      eligibleRoles.filter(r => r.isEligible).map(r => r.roleId)
    );

    // Find role mappings that are set to auto-remove
    const roleMappings = await this.getRoleMappingsByGuild(guildId);
    const autoRemoveRoleIds = new Set(
      roleMappings.filter(r => r.autoRemove).map(r => r.roleId)
    );

    // Return roles that user has but is not eligible for
    return currentRoleIds.filter(roleId => 
      !eligibleRoleIds.has(roleId) && autoRemoveRoleIds.has(roleId)
    );
  }

  /**
   * Bulk update role mappings for a collection
   * Useful for setting up tiered roles (Bronze, Silver, Gold)
   */
  async createTieredRoleMappings(
    guildId: string,
    collectionId: string,
    tiers: Array<{
      roleId: string;
      roleName: string;
      minNftCount: number;
      maxNftCount?: number;
      priority?: number;
    }>
  ): Promise<RoleMapping[]> {
    const created: RoleMapping[] = [];

    for (const tier of tiers) {
      try {
        const mapping = await this.createRoleMapping(guildId, {
          collectionId,
          roleId: tier.roleId,
          roleName: tier.roleName,
          minNftCount: tier.minNftCount,
          maxNftCount: tier.maxNftCount,
          priority: tier.priority,
        });
        created.push(mapping);
      } catch (error) {
        logger.error(
          `[RoleMappingService] Failed to create tier ${tier.roleName}:`,
          error
        );
        throw error;  // Fail fast on tiered setup
      }
    }

    return created;
  }

  /**
   * Get role mapping statistics for a guild
   */
  async getRoleMappingStats(guildId: string): Promise<{
    totalMappings: number;
    autoAssignEnabled: number;
    autoRemoveEnabled: number;
    tieredCollections: number;
  }> {
    const mappings = await this.getRoleMappingsByGuild(guildId);

    return {
      totalMappings: mappings.length,
      autoAssignEnabled: mappings.filter(m => m.autoAssign).length,
      autoRemoveEnabled: mappings.filter(m => m.autoRemove).length,
      tieredCollections: new Set(mappings.map(m => m.collectionId)).size,
    };
  }
}
