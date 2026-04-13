/**
 * Drizzle ORM Schema Definition for Multi-Tenant Discord NFT Verification Bot
 * 
 * This file defines all database tables using Drizzle's TypeScript schema builder.
 * The schema is designed for multi-tenancy with complete isolation per Discord guild.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  integer,
  timestamp,
  inet,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// GUILDS TABLE - Root of multi-tenancy
// ============================================================================

export const guilds = pgTable(
  'guilds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: text('guild_id').notNull().unique(),
    guildName: text('guild_name').notNull(),
    
    // Admin configuration
    adminRoleIds: text('admin_role_ids').array(),
    ownerDiscordId: text('owner_discord_id'),
    
    // Bot settings
    settings: jsonb('settings').notNull().default({}),
    stats: jsonb('stats').notNull().default({}),
    
    // Lifecycle management
    isActive: boolean('is_active').notNull().default(true),
    wasKicked: boolean('was_kicked').notNull().default(false),
    kickedAt: timestamp('kicked_at'),
    
    // Timestamps
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_guilds_guild_id').on(table.guildId),
    index('idx_guilds_owner_discord_id').on(table.ownerDiscordId),
    index('idx_guilds_joined_at').on(table.joinedAt),
  ]
);

// ============================================================================
// COLLECTIONS TABLE - NFT collections per guild
// ============================================================================

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    
    // Collection identification
    collectionAddress: text('collection_address').notNull(),
    collectionName: text('collection_name').notNull(),
    blockchain: text('blockchain').notNull().default('solana'),
    
    // Collection metadata
    metadata: jsonb('metadata').notNull().default({}),
    
    // Verification rules
    requiredNftCount: integer('required_nft_count').notNull().default(1),
    
    // Lifecycle
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_collections_guild_address')
      .on(table.guildId, table.collectionAddress)
      ),
    index('idx_collections_guild_id').on(table.guildId),
    index('idx_collections_address').on(table.collectionAddress),
    index('idx_collections_blockchain').on(table.blockchain),
  ]
);

// ============================================================================
// ROLE MAPPINGS TABLE - Collection to Discord role mappings
// ============================================================================

export const roleMappings = pgTable(
  'role_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .references(() => collections.id, { onDelete: 'cascade' }),
    
    // Discord role identification
    roleId: text('role_id').notNull(),
    roleName: text('role_name').notNull(),
    
    // Mapping rules
    minNftCount: integer('min_nft_count').notNull().default(1),
    maxNftCount: integer('max_nft_count'),
    
    // Priority
    priority: integer('priority').notNull().default(0),
    
    // Auto-assignment settings
    autoAssign: boolean('auto_assign').notNull().default(true),
    autoRemove: boolean('auto_remove').notNull().default(false),
    
    // Lifecycle
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_role_mappings_guild_role')
      .on(table.guildId, table.roleId)
      ),
    index('idx_role_mappings_guild_id').on(table.guildId),
    index('idx_role_mappings_collection_id').on(table.collectionId),
    index('idx_role_mappings_priority').on(table.guildId, table.priority),
  ]
);

// ============================================================================
// WALLETS TABLE - Global wallet registry (anti-sharing)
// ============================================================================

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    
    // Wallet identification
    walletAddress: text('wallet_address').notNull().unique(),
    
    // Owner identification
    ownerDiscordId: text('owner_discord_id').notNull(),
    ownerUsername: text('owner_username'),
    
    // Verification status
    isVerified: boolean('is_verified').notNull().default(false),
    lastSignatureVerified: timestamp('last_signature_verified'),
    
    // Lifecycle
    isActive: boolean('is_active').notNull().default(true),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
    unlinkedAt: timestamp('unlinked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_wallets_discord_id')
      .on(table.ownerDiscordId)
      ),
    index('idx_wallets_address').on(table.walletAddress),
    index('idx_wallets_verified').on(table.isVerified)),
  ]
);

// ============================================================================
// VERIFICATIONS TABLE - Verification records per guild
// ============================================================================

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    
    // Foreign keys
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    
    // User identification (denormalized)
    discordUserId: text('discord_user_id').notNull(),
    discordUsername: text('discord_username'),
    
    // Verification details
    walletAddress: text('wallet_address').notNull(),
    nftsOwned: jsonb('nfts_owned').notNull().default([]),
    
    // Status
    status: text('status').notNull().default('verified'),
    
    // Assigned roles
    assignedRoleIds: text('assigned_role_ids').array(),
    
    // Timestamps
    verifiedAt: timestamp('verified_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    lastReverifiedAt: timestamp('last_reverified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_verifications_guild_user_active')
      .on(table.guildId, table.discordUserId)
      ),
    index('idx_verifications_guild_id').on(table.guildId),
    index('idx_verifications_wallet_id').on(table.walletId),
    index('idx_verifications_user_id').on(table.discordUserId),
    index('idx_verifications_status').on(table.status),
    index('idx_verifications_expires_at')
      .on(table.expiresAt)
      .and(table.status)),
    index('idx_verifications_reverify_due')
      .on(table.expiresAt)
      .and(table.expiresAt))),
  ]
);

// ============================================================================
// VERIFICATION SESSIONS TABLE - Temporary sessions for verification flow
// ============================================================================

export const verificationSessions = pgTable(
  'verification_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    
    // Session identification
    sessionToken: text('session_token').notNull().unique(),
    sessionTokenHash: text('session_token_hash').notNull().unique(),
    
    // Context
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    discordUserId: text('discord_user_id').notNull(),
    discordUsername: text('discord_username'),
    
    // Wallet info
    walletAddress: text('wallet_address'),
    
    // Signature verification
    signaturePayload: text('signature_payload'),
    signatureValid: boolean('signature_valid'),
    
    // Session state
    status: text('status').notNull().default('pending'),
    
    // Expiration
    expiresAt: timestamp('expires_at').notNull(),
    verifiedAt: timestamp('verified_at'),
    
    // Metadata
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_verification_sessions_token').on(table.sessionToken),
    index('idx_verification_sessions_token_hash').on(table.sessionTokenHash),
    index('idx_verification_sessions_guild_id').on(table.guildId),
    index('idx_verification_sessions_user_id').on(table.discordUserId),
    index('idx_verification_sessions_status').on(table.status),
    index('idx_verification_sessions_expires_at')
      .on(table.expiresAt)
      ),
  ]
);

// ============================================================================
// AUDIT LOGS TABLE - Comprehensive logging
// ============================================================================

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    
    // Event context
    guildId: uuid('guild_id').references(() => guilds.id, { onDelete: 'set null' }),
    discordUserId: text('discord_user_id'),
    
    // Event details
    eventType: text('event_type').notNull(),
    eventCategory: text('event_category').notNull(),
    
    // Event data
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    metadata: jsonb('metadata').notNull().default({}),
    
    // Request context
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    
    // Timestamps
    occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_logs_guild_id').on(table.guildId),
    index('idx_audit_logs_user_id').on(table.discordUserId),
    index('idx_audit_logs_event_type').on(table.eventType),
    index('idx_audit_logs_event_category').on(table.eventCategory),
    index('idx_audit_logs_occurred_at').on(table.occurredAt.desc()),
    index('idx_audit_logs_guild_occurred')
      .on(table.guildId, table.occurredAt.desc()),
  ]
);

// ============================================================================
// RATE LIMITS TABLE - Per-guild and per-user rate limiting
// ============================================================================

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    
    // Rate limit key
    keyType: text('key_type').notNull(),
    keyValue: text('key_value').notNull(),
    action: text('action').notNull(),
    
    // Tracking
    requestCount: integer('request_count').notNull().default(1),
    windowStart: timestamp('window_start').notNull().defaultNow(),
    windowEnd: timestamp('window_end').notNull(),
    
    // Metadata
    metadata: jsonb('metadata').notNull().default({}),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_rate_limits_key_window')
      .on(table.keyType, table.keyValue, table.action, table.windowStart),
    index('idx_rate_limits_cleanup')
      .on(table.windowEnd)
      )),
  ]
);

// ============================================================================
// RELATIONS - Define table relationships for Drizzle ORM
// ============================================================================

export const guildsRelations = relations(guilds, ({ many }) => ({
  collections: many(collections),
  roleMappings: many(roleMappings),
  verifications: many(verifications),
  auditLogs: many(auditLogs),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  guild: one(guilds, {
    fields: [collections.guildId],
    references: [guilds.id],
  }),
  roleMappings: many(roleMappings),
}));

export const roleMappingsRelations = relations(roleMappings, ({ one }) => ({
  guild: one(guilds, {
    fields: [roleMappings.guildId],
    references: [guilds.id],
  }),
  collection: one(collections, {
    fields: [roleMappings.collectionId],
    references: [collections.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ many }) => ({
  verifications: many(verifications),
}));

export const verificationsRelations = relations(verifications, ({ one }) => ({
  guild: one(guilds, {
    fields: [verifications.guildId],
    references: [guilds.id],
  }),
  wallet: one(wallets, {
    fields: [verifications.walletId],
    references: [wallets.id],
  }),
}));

export const verificationSessionsRelations = relations(verificationSessions, ({ one }) => ({
  guild: one(guilds, {
    fields: [verificationSessions.guildId],
    references: [guilds.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  guild: one(guilds, {
    fields: [auditLogs.guildId],
    references: [guilds.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS - TypeScript types for use in services
// ============================================================================

export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;

// Guild settings and stats types (JSONB fields)
export interface GuildSettings {
  verificationEnabled?: boolean;
  autoRoleAssignment?: boolean;
  welcomeMessage?: string;
  premiumTier?: 'free' | 'basic' | 'premium';
  reverificationIntervalDays?: number;
  allowMultipleWallets?: boolean;
  customBrandColor?: string;
  customLogoUrl?: string;
  heliusApiKey?: string;  // Per-guild Helius API key for NFT verification
}

export interface GuildStats {
  totalVerified?: number;
  totalMembers?: number;
  lastVerificationAt?: string;
}

// Extend Guild type with properly typed settings and stats
export type GuildWithTypedSettings = Omit<Guild, 'settings' | 'stats'> & {
  settings: GuildSettings;
  stats: GuildStats;
};

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type RoleMapping = typeof roleMappings.$inferSelect;
export type NewRoleMapping = typeof roleMappings.$inferInsert;

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type VerificationSession = typeof verificationSessions.$inferSelect;
export type NewVerificationSession = typeof verificationSessions.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;

// NFT types for verification
export interface NftMetadata {
  mint: string;
  name: string;
  image?: string;
  description?: string;
  collection?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

export interface VerificationNfts {
  nfts: NftMetadata[];
  nftCount: number;
  verifiedAt: string;
}
