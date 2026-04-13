/**
 * GuildConfigService - CRUD operations for guild settings
 * 
 * This service manages all guild-level configuration:
 * - Guild registration (when bot is added)
 * - Admin role configuration
 * - Guild settings (JSONB)
 * - Guild stats caching
 * - Guild lifecycle (activate, deactivate, kick)
 * 
 * All operations are scoped by guild_id for tenant isolation.
 */

import { eq, and, sql } from 'drizzle-orm';
import { 
  guilds, 
  type Guild, 
  type NewGuild, 
  type GuildSettings, 
  type GuildStats,
  type GuildWithTypedSettings 
} from '../db/schema';
import type { Database } from '../db';
import { AuditLogService } from './AuditLogService';
import logger from '../utils/logger';

export interface GuildConfig {
  id: string;
  guildId: string;
  guildName: string;
  adminRoleIds: string[];
  ownerDiscordId?: string;
  settings: GuildSettings;
  stats: GuildStats;
  isActive: boolean;
  joinedAt: Date;
}

export interface CreateGuildInput {
  guildId: string;
  guildName: string;
  ownerDiscordId?: string;
  adminRoleIds?: string[];
}

export interface UpdateGuildInput {
  guildName?: string;
  adminRoleIds?: string[];
  ownerDiscordId?: string;
  settings?: Partial<GuildSettings>;
}

export class GuildConfigService {
  private auditLog: AuditLogService;

  constructor(private db: Database) {
    this.auditLog = new AuditLogService(db);
  }

  /**
   * Register a new guild (called when bot is added to a server)
   */
  async registerGuild(input: CreateGuildInput): Promise<Guild> {
    try {
      // Check if guild already exists
      const existing = await this.getGuildByDiscordId(input.guildId);
      
      if (existing) {
        // Reactivate if was deactivated
        if (!existing.isActive) {
          return this.reactivateGuild(existing.id);
        }
        return existing;
      }

      const newGuild: NewGuild = {
        guildId: input.guildId,
        guildName: input.guildName,
        ownerDiscordId: input.ownerDiscordId,
        adminRoleIds: input.adminRoleIds || [],
        settings: {
          verificationEnabled: true,
          autoRoleAssignment: true,
          premiumTier: 'free',
          reverificationIntervalDays: 7,
        },
        stats: {
          totalVerified: 0,
          totalMembers: 0,
        },
      };

      const [created] = await this.db
        .insert(guilds)
        .values(newGuild)
        .returning();

      await this.auditLog.logGuildEvent(created.id, 'guild.joined', {
        guildName: input.guildName,
        ownerDiscordId: input.ownerDiscordId,
      });

      logger.info(`[GuildConfig] Registered new guild: ${input.guildName} (${input.guildId})`);
      return created;
    } catch (error) {
      logger.error('[GuildConfigService] Failed to register guild:', error);
      throw error;
    }
  }

  /**
   * Get guild by Discord ID
   */
  async getGuildByDiscordId(guildId: string): Promise<Guild | null> {
    const result = await this.db
      .select()
      .from(guilds)
      .where(eq(guilds.guildId, guildId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get guild by internal UUID
   */
  async getGuildById(id: string): Promise<Guild | null> {
    const result = await this.db
      .select()
      .from(guilds)
      .where(eq(guilds.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get or create guild (idempotent operation)
   */
  async getOrCreateGuild(input: CreateGuildInput): Promise<Guild> {
    const existing = await this.getGuildByDiscordId(input.guildId);
    
    if (existing) {
      return existing;
    }

    return this.registerGuild(input);
  }

  /**
   * Update guild configuration
   */
  async updateGuild(id: string, input: UpdateGuildInput): Promise<Guild> {
    try {
      const existing = await this.getGuildById(id);
      
      if (!existing) {
        throw new Error(`Guild not found: ${id}`);
      }

      const updateData: Partial<Guild> = {};

      if (input.guildName !== undefined) {
        updateData.guildName = input.guildName;
      }

      if (input.adminRoleIds !== undefined) {
        updateData.adminRoleIds = input.adminRoleIds;
      }

      if (input.ownerDiscordId !== undefined) {
        updateData.ownerDiscordId = input.ownerDiscordId;
      }

      if (input.settings !== undefined) {
        updateData.settings = {
          ...existing.settings,
          ...input.settings,
        } as GuildSettings;
      }

      const [updated] = await this.db
        .update(guilds)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(guilds.id, id))
        .returning();

      await this.auditLog.logGuildEvent(id, 'guild.config_updated', {
        oldValue: existing,
        newValue: updateData,
      });

      logger.info(`[GuildConfig] Updated guild: ${updated.guildName} (${updated.guildId})`);
      return updated;
    } catch (error) {
      logger.error('[GuildConfigService] Failed to update guild:', error);
      throw error;
    }
  }

  /**
   * Update guild settings (partial update)
   */
  async updateGuildSettings(id: string, settings: Partial<GuildSettings>): Promise<Guild> {
    return this.updateGuild(id, { settings });
  }

  /**
   * Update guild stats (cached values)
   */
  async updateGuildStats(id: string, stats: Partial<GuildStats>): Promise<Guild> {
    const guild = await this.getGuildById(id);
    
    if (!guild) {
      throw new Error(`Guild not found: ${id}`);
    }

    const [updated] = await this.db
      .update(guilds)
      .set({
        stats: {
          ...guild.stats,
          ...stats,
        } as GuildStats,
        updatedAt: new Date(),
      })
      .where(eq(guilds.id, id))
      .returning();

    return updated;
  }

  /**
   * Add admin role to guild
   */
  async addAdminRole(id: string, roleId: string): Promise<Guild> {
    const guild = await this.getGuildById(id);
    
    if (!guild) {
      throw new Error(`Guild not found: ${id}`);
    }

    const adminRoleIds = guild.adminRoleIds || [];
    
    if (!adminRoleIds.includes(roleId)) {
      adminRoleIds.push(roleId);
    }

    return this.updateGuild(id, { adminRoleIds });
  }

  /**
   * Remove admin role from guild
   */
  async removeAdminRole(id: string, roleId: string): Promise<Guild> {
    const guild = await this.getGuildById(id);
    
    if (!guild) {
      throw new Error(`Guild not found: ${id}`);
    }

    const adminRoleIds = (guild.adminRoleIds || []).filter(id => id !== roleId);

    return this.updateGuild(id, { adminRoleIds });
  }

  /**
   * Check if a Discord user has admin permissions in the guild
   */
  async hasAdminPermissions(guildId: string, discordUserId: string, discordRoleIds: string[]): Promise<boolean> {
    const guild = await this.getGuildByDiscordId(guildId);
    
    if (!guild) {
      return false;
    }

    // Check if user is the owner
    if (guild.ownerDiscordId === discordUserId) {
      return true;
    }

    // Check if user has any admin role
    const adminRoleIds = guild.adminRoleIds || [];
    return discordRoleIds.some(roleId => adminRoleIds.includes(roleId));
  }

  /**
   * Deactivate a guild (soft delete)
   * Called when bot is kicked or leaves a server
   */
  async deactivateGuild(id: string, reason: 'kicked' | 'left'): Promise<void> {
    try {
      const guild = await this.getGuildById(id);
      
      if (!guild) {
        return; // Already deleted or never existed
      }

      await this.db
        .update(guilds)
        .set({
          isActive: false,
          wasKicked: reason === 'kicked',
          kickedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(guilds.id, id));

      await this.auditLog.logGuildEvent(id, reason === 'kicked' ? 'guild.kicked' : 'guild.left', {
        reason,
      });

      logger.info(`[GuildConfig] Deactivated guild: ${guild.guildName} (${guild.guildId}) - ${reason}`);
    } catch (error) {
      logger.error('[GuildConfigService] Failed to deactivate guild:', error);
      throw error;
    }
  }

  /**
   * Reactivate a previously deactivated guild
   * Called when bot is re-added to a server
   */
  async reactivateGuild(id: string): Promise<Guild> {
    const [updated] = await this.db
      .update(guilds)
      .set({
        isActive: true,
        wasKicked: false,
        kickedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(guilds.id, id))
      .returning();

    await this.auditLog.logGuildEvent(id, 'guild.joined', {
      reactivated: true,
    });

    logger.info(`[GuildConfig] Reactivated guild: ${updated.guildName} (${updated.guildId})`);
    return updated;
  }

  /**
   * Permanently delete a guild and all related data
   * WARNING: This is irreversible - use with caution
   */
  async deleteGuild(id: string): Promise<void> {
    try {
      const guild = await this.getGuildById(id);
      
      if (!guild) {
        return;
      }

      // Delete will cascade to all related records due to ON DELETE CASCADE
      await this.db
        .delete(guilds)
        .where(eq(guilds.id, id));

      await this.auditLog.logGuildEvent(id, 'guild.kicked', {
        permanentDeletion: true,
      });

      logger.warn(`[GuildConfig] Permanently deleted guild: ${guild.guildName} (${guild.guildId})`);
    } catch (error) {
      logger.error('[GuildConfigService] Failed to delete guild:', error);
      throw error;
    }
  }

  /**
   * Get all active guilds
   */
  async getAllActiveGuilds(options: { limit?: number; offset?: number } = {}): Promise<Guild[]> {
    const { limit = 100, offset = 0 } = options;

    return this.db
      .select()
      .from(guilds)
      .where(eq(guilds.isActive, true))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get guild count statistics
   */
  async getGuildStats(): Promise<{
    totalGuilds: number;
    activeGuilds: number;
    inactiveGuilds: number;
    kickedGuilds: number;
  }> {
    const result = await this.db
      .select({
        totalGuilds: sql<number>`count(*)`,
        activeGuilds: sql<number>`count(*) filter (where is_active = true)`,
        inactiveGuilds: sql<number>`count(*) filter (where is_active = false)`,
        kickedGuilds: sql<number>`count(*) filter (where was_kicked = true)`,
      })
      .from(guilds)
      .then(rows => rows[0]);

    return {
      totalGuilds: Number(result.totalGuilds),
      activeGuilds: Number(result.activeGuilds),
      inactiveGuilds: Number(result.inactiveGuilds),
      kickedGuilds: Number(result.kickedGuilds),
    };
  }

  /**
   * Search guilds by name
   */
  async searchGuilds(query: string, limit: number = 20): Promise<Guild[]> {
    // Note: For production, consider using PostgreSQL full-text search
    // This is a simple LIKE-based search
    return this.db
      .select()
      .from(guilds)
      .where(eq(guilds.isActive, true))
      .limit(limit);
  }
}
