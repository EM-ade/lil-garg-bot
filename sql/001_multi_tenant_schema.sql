-- ============================================================================
-- MULTI-TENANT DISCORD NFT VERIFICATION BOT - POSTGRESQL SCHEMA
-- ============================================================================
-- This schema supports a single Discord bot serving multiple servers (guilds)
-- with isolated NFT collection configurations and role mappings per guild.
--
-- Key Design Decisions:
-- 1. All tenant data is scoped by guild_id for logical isolation
-- 2. Global wallet table prevents wallet sharing (one wallet = one Discord user)
-- 3. Soft deletes for audit trail and data recovery
-- 4. Comprehensive indexing for performance at scale (500-5000+ guilds)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: CORE TENANT TABLES
-- ============================================================================

-- Guilds table: Stores configuration for each Discord server using the bot
-- This is the root of multi-tenancy - all other tables reference this
CREATE TABLE guilds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id TEXT NOT NULL UNIQUE,  -- Discord's snowflake ID
    guild_name TEXT NOT NULL,
    
    -- Admin configuration
    admin_role_ids TEXT[],  -- Discord role IDs that can manage bot config
    owner_discord_id TEXT,  -- Discord user ID of server owner
    
    -- Bot settings (stored as JSON for flexibility)
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example settings structure:
    -- {
    --   "verificationEnabled": true,
    --   "autoRoleAssignment": true,
    --   "welcomeMessage": "Welcome!",
    --   "premiumTier": "free"
    -- }
    
    -- Stats for dashboard (cached counts)
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example stats:
    -- {
    --   "totalVerified": 150,
    --   "totalMembers": 500,
    --   "lastVerificationAt": "2025-01-01T00:00:00Z"
    -- }
    
    -- Lifecycle management
    is_active BOOLEAN NOT NULL DEFAULT true,  -- Soft delete flag
    was_kicked BOOLEAN NOT NULL DEFAULT false,  -- Track if bot was removed
    kicked_at TIMESTAMPTZ,
    
    -- Timestamps
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When bot was added
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT guilds_guild_id_valid CHECK (guild_id ~ '^\d+$')
);

-- Indexes for guilds table
CREATE INDEX idx_guilds_guild_id ON guilds(guild_id);
CREATE INDEX idx_guilds_is_active ON guilds(is_active);
CREATE INDEX idx_guilds_owner_discord_id ON guilds(owner_discord_id);
CREATE INDEX idx_guilds_joined_at ON guilds(joined_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_guilds_updated_at
    BEFORE UPDATE ON guilds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 2: NFT COLLECTIONS & ROLE MAPPINGS
-- ============================================================================

-- Collections table: NFT collections configured per guild
-- Each guild can have multiple collections they verify against
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    
    -- Collection identification
    collection_address TEXT NOT NULL,  -- Solana collection mint/pubkey
    collection_name TEXT NOT NULL,     -- Human-readable name
    blockchain TEXT NOT NULL DEFAULT 'solana',  -- For future multi-chain
    
    -- Collection metadata (cached from chain)
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example metadata:
    -- {
    --   "image": "https://...",
    --   "description": "...",
    --   "verifiedCreator": "9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA",
    --   "totalSupply": 10000
    -- }
    
    -- Verification rules
    required_nft_count INTEGER NOT NULL DEFAULT 1,  -- Min NFTs to verify
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT collections_collection_address_valid CHECK (LENGTH(collection_address) >= 32),
    CONSTRAINT collections_required_count_positive CHECK (required_nft_count > 0)
);

-- Unique constraint: One collection address per guild
CREATE UNIQUE INDEX idx_collections_guild_address
    ON collections(guild_id, collection_address);

CREATE INDEX idx_collections_guild_id ON collections(guild_id);
CREATE INDEX idx_collections_address ON collections(collection_address);
CREATE INDEX idx_collections_blockchain ON collections(blockchain);

CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Role mappings table: Maps collections to Discord roles
-- Supports complex rules like "own 3 NFTs = Gold role, own 1 = Bronze role"
CREATE TABLE role_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    
    -- Discord role identification
    role_id TEXT NOT NULL,      -- Discord role snowflake ID
    role_name TEXT NOT NULL,    -- Cached role name for display
    
    -- Mapping rules
    min_nft_count INTEGER NOT NULL DEFAULT 1,  -- Minimum NFTs for this role
    max_nft_count INTEGER,                     -- Maximum NFTs (NULL = unlimited)
    
    -- Priority for role assignment (lower = higher priority)
    priority INTEGER NOT NULL DEFAULT 0,
    
    -- Auto-assignment settings
    auto_assign BOOLEAN NOT NULL DEFAULT true,  -- Auto-assign on verification
    auto_remove BOOLEAN NOT NULL DEFAULT false, -- Auto-remove when NFT sold
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT role_mappings_min_count_positive CHECK (min_nft_count > 0),
    CONSTRAINT role_mappings_max_gte_min CHECK (
        max_nft_count IS NULL OR max_nft_count >= min_nft_count
    )
);

-- Unique constraint: One role per collection/count combination per guild
CREATE UNIQUE INDEX idx_role_mappings_guild_role
    ON role_mappings(guild_id, role_id);

CREATE INDEX idx_role_mappings_guild_id ON role_mappings(guild_id);
CREATE INDEX idx_role_mappings_collection_id ON role_mappings(collection_id);
CREATE INDEX idx_role_mappings_priority ON role_mappings(guild_id, priority);

CREATE TRIGGER update_role_mappings_updated_at
    BEFORE UPDATE ON role_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 3: USER & WALLET MANAGEMENT
-- ============================================================================

-- Wallets table: Global registry of linked wallets
-- CRITICAL: Enforces one wallet = one Discord user globally (anti-sharing)
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Wallet identification
    wallet_address TEXT NOT NULL UNIQUE,  -- Solana wallet address
    
    -- Owner identification (global across all guilds)
    owner_discord_id TEXT NOT NULL,  -- Discord user who owns this wallet
    owner_username TEXT,             -- Cached Discord username
    
    -- Verification status
    is_verified BOOLEAN NOT NULL DEFAULT false,
    last_signature_verified TIMESTAMPTZ,
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlinked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT wallets_address_valid CHECK (LENGTH(wallet_address) >= 32)
);

CREATE UNIQUE INDEX idx_wallets_discord_id
    ON wallets(owner_discord_id);

CREATE INDEX idx_wallets_address ON wallets(wallet_address);
CREATE INDEX idx_wallets_verified ON wallets(is_verified);

CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verifications table: Tracks verification records per guild per user
-- This is the core table for role assignment decisions
CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign keys (tenant isolation)
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    
    -- User identification (denormalized for performance)
    discord_user_id TEXT NOT NULL,
    discord_username TEXT,
    
    -- Verification details
    wallet_address TEXT NOT NULL,
    nfts_owned JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of NFT details at verification
    -- Example nfts_owned:
    -- [
    --   {
    --     "mint": "xyz...",
    --     "name": "Lil Garg #1234",
    --     "image": "https://...",
    --     "collection": "FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ"
    --   }
    -- ]
    
    -- Verification status
    status TEXT NOT NULL DEFAULT 'verified',
    -- Status values: 'verified', 'expired', 'revoked', 'failed'
    
    -- Assigned roles (cached for quick lookup)
    assigned_role_ids TEXT[],
    
    -- Timestamps
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- When re-verification is required
    revoked_at TIMESTAMPTZ,
    last_reverified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT verifications_status_valid CHECK (
        status IN ('verified', 'expired', 'revoked', 'failed')
    )
);

-- Unique constraint: One active verification per user per guild
CREATE UNIQUE INDEX idx_verifications_guild_user_active
    ON verifications(guild_id, discord_user_id, status);

CREATE INDEX idx_verifications_guild_id ON verifications(guild_id);
CREATE INDEX idx_verifications_wallet_id ON verifications(wallet_id);
CREATE INDEX idx_verifications_user_id ON verifications(discord_user_id);
CREATE INDEX idx_verifications_status ON verifications(status);
CREATE INDEX idx_verifications_expires_at ON verifications(expires_at);

-- Index for re-verification queries (status and expires_at)
CREATE INDEX idx_verifications_reverify_due
    ON verifications(status, expires_at);

CREATE TRIGGER update_verifications_updated_at
    BEFORE UPDATE ON verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 4: VERIFICATION SESSIONS (TEMPORARY)
-- ============================================================================

-- Verification sessions table: Temporary sessions for verification flow
-- These are short-lived records for the verification process
CREATE TABLE verification_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Session identification
    session_token TEXT NOT NULL UNIQUE,  -- Random token for URL
    session_token_hash TEXT NOT NULL UNIQUE,  -- Hashed token for secure lookup
    
    -- Context
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT,
    
    -- Wallet info (populated during flow)
    wallet_address TEXT,
    
    -- Signature verification
    signature_payload TEXT,  -- Message that was signed
    signature_valid BOOLEAN,
    
    -- Session state
    status TEXT NOT NULL DEFAULT 'pending',
    -- Status: 'pending', 'verified', 'failed', 'expired', 'cancelled'
    
    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    
    -- Metadata
    ip_address INET,  -- For rate limiting and security
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT verification_sessions_status_valid CHECK (
        status IN ('pending', 'verified', 'failed', 'expired', 'cancelled')
    )
);

CREATE INDEX idx_verification_sessions_token ON verification_sessions(session_token);
CREATE INDEX idx_verification_sessions_token_hash ON verification_sessions(session_token_hash);
CREATE INDEX idx_verification_sessions_guild_id ON verification_sessions(guild_id);
CREATE INDEX idx_verification_sessions_user_id ON verification_sessions(discord_user_id);
CREATE INDEX idx_verification_sessions_status ON verification_sessions(status);
CREATE INDEX idx_verification_sessions_expires_at ON verification_sessions(expires_at);

-- Auto-expire old sessions (trigger-based cleanup)
CREATE OR REPLACE FUNCTION expire_old_verification_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark sessions as expired if past their expiration time
    UPDATE verification_sessions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_verification_session_expiry
    AFTER INSERT ON verification_sessions
    EXECUTE FUNCTION expire_old_verification_sessions();

CREATE TRIGGER update_verification_sessions_updated_at
    BEFORE UPDATE ON verification_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 5: AUDIT LOGGING
-- ============================================================================

-- Audit logs table: Comprehensive logging for compliance and debugging
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event context
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
    discord_user_id TEXT,  -- Who performed the action
    
    -- Event details
    event_type TEXT NOT NULL,
    -- Event types:
    --   Guild: 'guild.joined', 'guild.left', 'guild.kicked', 'guild.config_updated'
    --   Collection: 'collection.added', 'collection.updated', 'collection.removed'
    --   Role: 'role.mapping_added', 'role.mapping_updated', 'role.mapping_removed'
    --   Verification: 'verification.started', 'verification.completed', 'verification.failed', 'verification.revoked'
    --   Wallet: 'wallet.linked', 'wallet.unlinked', 'wallet.conflict_detected'
    --   Admin: 'admin.config_changed', 'admin.role_assigned', 'admin.role_removed'
    
    event_category TEXT NOT NULL,
    -- Categories: 'guild', 'collection', 'role', 'verification', 'wallet', 'admin', 'system'
    
    -- Event data
    old_value JSONB,  -- Previous state (for updates/deletes)
    new_value JSONB,  -- New state (for creates/updates)
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Additional context
    
    -- Request context (for web actions)
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT audit_logs_event_type_valid CHECK (LENGTH(event_type) > 0),
    CONSTRAINT audit_logs_event_category_valid CHECK (
        event_category IN ('guild', 'collection', 'role', 'verification', 'wallet', 'admin', 'system')
    )
);

CREATE INDEX idx_audit_logs_guild_id ON audit_logs(guild_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(discord_user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_event_category ON audit_logs(event_category);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC);

-- Composite index for guild audit trail queries
CREATE INDEX idx_audit_logs_guild_occurred
    ON audit_logs(guild_id, occurred_at DESC);

-- ============================================================================
-- SECTION 6: RATE LIMITING
-- ============================================================================

-- Rate limit tracking table: Per-guild and per-user rate limiting
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rate limit key (composite identifier)
    key_type TEXT NOT NULL,  -- 'guild', 'user', 'ip', 'wallet'
    key_value TEXT NOT NULL, -- guild_id, discord_user_id, IP address, etc.
    action TEXT NOT NULL,    -- 'verification', 'command', 'api_request'
    
    -- Tracking
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_end TIMESTAMPTZ NOT NULL,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT rate_limits_key_type_valid CHECK (
        key_type IN ('guild', 'user', 'ip', 'wallet')
    ),
    CONSTRAINT rate_limits_count_positive CHECK (request_count >= 0)
);

-- Unique constraint for tracking within a window
CREATE UNIQUE INDEX idx_rate_limits_key_window
    ON rate_limits(key_type, key_value, action, window_start);

CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_end);

-- ============================================================================
-- SECTION 7: VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active verifications with guild and wallet info
CREATE VIEW active_verifications AS
SELECT 
    v.id,
    v.guild_id,
    g.guild_name,
    v.discord_user_id,
    v.discord_username,
    v.wallet_id,
    w.wallet_address,
    v.nfts_owned,
    v.verified_at,
    v.expires_at,
    v.assigned_role_ids
FROM verifications v
JOIN guilds g ON v.guild_id = g.id
JOIN wallets w ON v.wallet_id = w.id
WHERE v.status = 'verified' 
  AND g.is_active = true
  AND w.is_active = true;

-- View: Guild configuration summary
CREATE VIEW guild_config_summary AS
SELECT 
    g.id,
    g.guild_id,
    g.guild_name,
    g.is_active,
    COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) as active_collections,
    COUNT(DISTINCT r.id) FILTER (WHERE r.is_active = true) as active_role_mappings,
    COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'verified') as verified_members,
    g.joined_at,
    g.stats
FROM guilds g
LEFT JOIN collections c ON g.id = c.guild_id
LEFT JOIN role_mappings r ON g.id = r.guild_id
LEFT JOIN verifications v ON g.id = v.guild_id
GROUP BY g.id, g.guild_id, g.guild_name, g.is_active, g.joined_at, g.stats;

-- View: Wallet conflicts (attempts to share wallets)
CREATE VIEW wallet_conflicts AS
SELECT 
    w.wallet_address,
    w.owner_discord_id,
    COUNT(*) as conflict_count,
    ARRAY_AGG(DISTINCT v.guild_id) as guilds_involved
FROM wallets w
LEFT JOIN verifications v ON w.id = v.wallet_id
WHERE w.is_active = true
GROUP BY w.wallet_address, w.owner_discord_id
HAVING COUNT(*) > 1;

-- ============================================================================
-- SECTION 8: FUNCTIONS & PROCEDURES
-- ============================================================================

-- Function: Check if wallet is already linked to another user
CREATE OR REPLACE FUNCTION check_wallet_ownership(
    p_wallet_address TEXT,
    p_discord_user_id TEXT
)
RETURNS TABLE (
    is_available BOOLEAN,
    existing_owner_discord_id TEXT,
    conflict_details TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN w.id IS NULL THEN TRUE
            WHEN w.owner_discord_id = p_discord_user_id THEN TRUE
            ELSE FALSE
        END as is_available,
        w.owner_discord_id as existing_owner_discord_id,
        CASE 
            WHEN w.id IS NULL THEN NULL
            WHEN w.owner_discord_id = p_discord_user_id THEN NULL
            ELSE 'Wallet is already linked to another Discord user'
        END as conflict_details
    FROM wallets w
    WHERE w.wallet_address = p_wallet_address
      AND w.is_active = true;
    
    -- If no row found, wallet is available
    IF NOT FOUND THEN
        RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Get role mappings for a guild (ordered by priority)
CREATE OR REPLACE FUNCTION get_guild_role_mappings(p_guild_id UUID)
RETURNS TABLE (
    role_id TEXT,
    role_name TEXT,
    collection_address TEXT,
    min_nft_count INTEGER,
    max_nft_count INTEGER,
    priority INTEGER,
    auto_assign BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.role_id,
        r.role_name,
        c.collection_address,
        r.min_nft_count,
        r.max_nft_count,
        r.priority,
        r.auto_assign
    FROM role_mappings r
    LEFT JOIN collections c ON r.collection_id = c.id
    WHERE r.guild_id = p_guild_id
      AND r.is_active = true
    ORDER BY r.priority ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Soft delete a guild and all related data
CREATE OR REPLACE FUNCTION deactivate_guild(p_guild_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_guild_exists BOOLEAN;
BEGIN
    -- Check if guild exists
    SELECT EXISTS(SELECT 1 FROM guilds WHERE id = p_guild_id) INTO v_guild_exists;
    
    IF NOT v_guild_exists THEN
        RETURN FALSE;
    END IF;
    
    -- Soft delete the guild (CASCADE will handle related records)
    UPDATE guilds
    SET 
        is_active = false,
        was_kicked = true,
        kicked_at = NOW(),
        updated_at = NOW()
    WHERE id = p_guild_id;
    
    -- Log the action
    INSERT INTO audit_logs (guild_id, event_type, event_category, metadata)
    VALUES (
        p_guild_id,
        'guild.kicked',
        'guild',
        jsonb_build_object('reason', 'Bot removed from server')
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup old expired data (for scheduled job)
CREATE OR REPLACE FUNCTION cleanup_expired_data(
    p_days_to_keep INTEGER DEFAULT 30
)
RETURNS TABLE (
    table_name TEXT,
    rows_deleted INTEGER
) AS $$
DECLARE
    v_rows_deleted INTEGER;
BEGIN
    -- Cleanup expired verification sessions
    DELETE FROM verification_sessions
    WHERE status IN ('expired', 'cancelled', 'failed')
      AND expires_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RETURN NEXT;
    table_name := 'verification_sessions';
    rows_deleted := v_rows_deleted;
    
    -- Cleanup old rate limit records
    DELETE FROM rate_limits
    WHERE window_end < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RETURN NEXT;
    table_name := 'rate_limits';
    rows_deleted := v_rows_deleted;
    
    -- Cleanup old audit logs (keep longer for compliance)
    DELETE FROM audit_logs
    WHERE occurred_at < NOW() - ((p_days_to_keep * 3) || ' days')::INTERVAL;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RETURN NEXT;
    table_name := 'audit_logs';
    rows_deleted := v_rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 9: INITIAL DATA (OPTIONAL)
-- ============================================================================

-- Insert a default "system" guild for global configurations if needed
-- INSERT INTO guilds (guild_id, guild_name, settings)
-- VALUES ('0', 'System', '{"isSystem": true}'::jsonb);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
