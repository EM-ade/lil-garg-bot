/**
 * AuditLogService - Comprehensive audit logging for compliance and debugging
 * 
 * This service logs all significant events in the system:
 * - Guild lifecycle events (joined, left, kicked)
 * - Configuration changes (collections, roles)
 * - Verification events (started, completed, failed)
 * - Wallet operations (linked, unlinked, conflicts)
 * - Admin actions
 * 
 * All logs include timestamps and context for forensic analysis.
 */

import { eq, and, desc, type SQL } from 'drizzle-orm';
import { auditLogs, type NewAuditLog, type AuditLog } from '../db/schema';
import type { Database } from '../db';
import logger from '../utils/logger';

export type EventCategory = 'guild' | 'collection' | 'role' | 'verification' | 'wallet' | 'admin' | 'system';

export interface AuditLogEvent {
  guildId?: string;  // UUID of the guild
  discordUserId?: string;  // Discord user ID who performed the action
  eventType: string;
  eventCategory: EventCategory;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogService {
  constructor(private db: Database) {}

  /**
   * Log an event to the audit trail
   */
  async log(event: AuditLogEvent): Promise<AuditLog> {
    try {
      const newLog: NewAuditLog = {
        guildId: event.guildId || null,
        discordUserId: event.discordUserId || null,
        eventType: event.eventType,
        eventCategory: event.eventCategory,
        oldValue: event.oldValue ? JSON.stringify(event.oldValue) as unknown as Record<string, unknown> : null,
        newValue: event.newValue ? JSON.stringify(event.newValue) as unknown as Record<string, unknown> : null,
        metadata: event.metadata || {},
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
      };

      const [created] = await this.db
        .insert(auditLogs)
        .values(newLog)
        .returning();

      logger.debug(`[Audit] Logged event: ${event.eventType}`, {
        guildId: event.guildId,
        userId: event.discordUserId,
      });

      return created;
    } catch (error) {
      // Don't throw on audit log failures - logging should not break the app
      logger.error('[AuditLogService] Failed to log event:', error);
      throw error;
    }
  }

  /**
   * Get audit logs for a specific guild
   */
  async getGuildLogs(
    guildId: string,
    options: {
      limit?: number;
      offset?: number;
      eventCategory?: EventCategory;
      eventType?: string;
    } = {}
  ): Promise<AuditLog[]> {
    const { limit = 50, offset = 0 } = options;

    const conditions: SQL[] = [eq(auditLogs.guildId, guildId)];

    if (options.eventCategory) {
      conditions.push(eq(auditLogs.eventCategory, options.eventCategory));
    }

    if (options.eventType) {
      conditions.push(eq(auditLogs.eventType, options.eventType));
    }

    return this.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(
    discordUserId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AuditLog[]> {
    const { limit = 50, offset = 0 } = options;

    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.discordUserId, discordUserId))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get recent system-wide audit logs
   */
  async getRecentLogs(options: { limit?: number; eventCategory?: EventCategory } = {}): Promise<AuditLog[]> {
    const { limit = 100 } = options;

    const conditions: SQL[] = [];

    if (options.eventCategory) {
      conditions.push(eq(auditLogs.eventCategory, options.eventCategory));
    }

    return this.db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit);
  }

  /**
   * Log guild lifecycle events
   */
  async logGuildEvent(
    guildId: string,
    eventType: 'guild.joined' | 'guild.left' | 'guild.kicked' | 'guild.config_updated',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      guildId,
      eventType,
      eventCategory: 'guild',
      metadata,
    });
  }

  /**
   * Log collection events
   */
  async logCollectionEvent(
    guildId: string,
    eventType: 'collection.added' | 'collection.updated' | 'collection.removed',
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      guildId,
      eventType,
      eventCategory: 'collection',
      oldValue,
      newValue,
    });
  }

  /**
   * Log role mapping events
   */
  async logRoleEvent(
    guildId: string,
    eventType: 'role.mapping_added' | 'role.mapping_updated' | 'role.mapping_removed',
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      guildId,
      eventType,
      eventCategory: 'role',
      oldValue,
      newValue,
    });
  }

  /**
   * Log verification events
   */
  async logVerificationEvent(
    guildId: string,
    discordUserId: string,
    eventType: 'verification.started' | 'verification.completed' | 'verification.failed' | 'verification.revoked',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      guildId,
      discordUserId,
      eventType,
      eventCategory: 'verification',
      metadata,
    });
  }

  /**
   * Log wallet events
   */
  async logWalletEvent(
    discordUserId: string,
    eventType: 'wallet.linked' | 'wallet.unlinked' | 'wallet.conflict_detected',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      discordUserId,
      eventType,
      eventCategory: 'wallet',
      metadata,
    });
  }

  /**
   * Log admin actions
   */
  async logAdminEvent(
    guildId: string,
    discordUserId: string,
    eventType: 'admin.config_changed' | 'admin.role_assigned' | 'admin.role_removed',
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      guildId,
      discordUserId,
      eventType,
      eventCategory: 'admin',
      oldValue,
      newValue,
    });
  }

  /**
   * Search audit logs by metadata
   */
  async searchLogs(query: {
    guildId?: string;
    eventType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    metadataKey?: string;
    metadataValue?: string;
  }): Promise<AuditLog[]> {
    const conditions: SQL[] = [];

    if (query.guildId) {
      conditions.push(eq(auditLogs.guildId, query.guildId));
    }

    if (query.eventType) {
      conditions.push(eq(auditLogs.eventType, query.eventType));
    }

    if (query.dateFrom) {
      conditions.push(auditLogs.occurredAt.gte(query.dateFrom));
    }

    if (query.dateTo) {
      conditions.push(auditLogs.occurredAt.lte(query.dateTo));
    }

    // Note: JSONB metadata search would require raw SQL for complex queries
    // This is a simplified version

    return this.db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(100);
  }

  /**
   * Clean up old audit logs (for scheduled maintenance)
   */
  async cleanupOldLogs(olderThanDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.db
        .delete(auditLogs)
        .where(auditLogs.occurredAt.lt(cutoffDate));

      const deletedCount = result.rowsAffected;
      logger.info(`[AuditLogService] Cleaned up ${deletedCount} old audit logs`);
      return deletedCount;
    } catch (error) {
      logger.error('[AuditLogService] Failed to cleanup old logs:', error);
      throw error;
    }
  }
}
