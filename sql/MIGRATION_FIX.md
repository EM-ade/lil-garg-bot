# SQL Migration Fix - Index Predicate Error

## Problem

PostgreSQL error: `ERROR: 42P17: functions in index predicate must be marked IMMUTABLE`

This occurs when using `WHERE` clauses in indexes with non-immutable functions like `NOW()`.

## What Was Fixed

### Before (❌ Error):
```sql
CREATE INDEX idx_verifications_expires_at ON verifications(expires_at)
    WHERE expires_at IS NOT NULL AND status = 'verified';

CREATE INDEX idx_verifications_reverify_due ON verifications(expires_at)
    WHERE status = 'verified' AND expires_at < NOW();  -- NOW() is not IMMUTABLE!

CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_end) 
    WHERE window_end < NOW();  -- NOW() is not IMMUTABLE!
```

### After (✅ Works):
```sql
-- Include status in the index columns instead of WHERE clause
CREATE UNIQUE INDEX idx_verifications_guild_user_active
    ON verifications(guild_id, discord_user_id, status);

CREATE INDEX idx_verifications_expires_at ON verifications(expires_at);

-- Query with WHERE in your application code instead
CREATE INDEX idx_verifications_reverify_due
    ON verifications(status, expires_at);

CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_end);
```

## How to Apply Fix

### Option 1: Fresh Database (Recommended)

```bash
# Drop all tables (WARNING: Deletes all data!)
psql "[YOUR_DATABASE_URL]" -c "
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS verification_sessions CASCADE;
DROP TABLE IF EXISTS verifications CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS role_mappings CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS guilds CASCADE;
DROP VIEW IF EXISTS active_verifications CASCADE;
DROP VIEW IF EXISTS guild_config_summary CASCADE;
DROP VIEW IF EXISTS wallet_conflicts CASCADE;
DROP FUNCTION IF EXISTS check_wallet_ownership CASCADE;
DROP FUNCTION IF EXISTS get_guild_role_mappings CASCADE;
DROP FUNCTION IF EXISTS deactivate_guild CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_data CASCADE;
DROP FUNCTION IF EXISTS expire_old_verification_sessions CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
"

# Run corrected schema
psql "[YOUR_DATABASE_URL]" -f sql/001_multi_tenant_schema.sql
```

### Option 2: Fix Existing Indexes

If you already have the old indexes, drop them first:

```bash
psql "[YOUR_DATABASE_URL]" <<EOF
-- Drop old problematic indexes
DROP INDEX IF EXISTS idx_verifications_guild_user_active;
DROP INDEX IF EXISTS idx_verifications_expires_at;
DROP INDEX IF EXISTS idx_verifications_reverify_due;
DROP INDEX IF EXISTS idx_rate_limits_cleanup;
DROP INDEX IF EXISTS idx_verification_sessions_expires_at;
DROP INDEX IF EXISTS idx_wallets_discord_id;
DROP INDEX IF EXISTS idx_wallets_verified;
DROP INDEX IF EXISTS idx_role_mappings_guild_role;
DROP INDEX IF EXISTS idx_collections_guild_address;
DROP INDEX IF EXISTS idx_guilds_is_active;

-- Create corrected indexes
CREATE UNIQUE INDEX idx_verifications_guild_user_active
    ON verifications(guild_id, discord_user_id, status);

CREATE INDEX idx_verifications_expires_at ON verifications(expires_at);
CREATE INDEX idx_verifications_reverify_due ON verifications(status, expires_at);
CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_end);
CREATE INDEX idx_verification_sessions_expires_at ON verification_sessions(expires_at);
CREATE UNIQUE INDEX idx_wallets_discord_id ON wallets(owner_discord_id);
CREATE INDEX idx_wallets_verified ON wallets(is_verified);
CREATE UNIQUE INDEX idx_role_mappings_guild_role ON role_mappings(guild_id, role_id);
CREATE UNIQUE INDEX idx_collections_guild_address ON collections(guild_id, collection_address);
CREATE INDEX idx_guilds_is_active ON guilds(is_active);
EOF
```

## Why This Happens

PostgreSQL requires functions in index `WHERE` clauses (predicates) to be marked `IMMUTABLE`, meaning they always return the same result for the same input.

- `NOW()` is `STABLE` (same within a transaction, but changes)
- `CURRENT_TIMESTAMP` is `STABLE`
- `RANDOM()` is `VOLATILE` (changes every time)

Only `IMMUTABLE` functions like `LOWER()`, `LENGTH()`, or mathematical operations can be used in index predicates.

## Alternative: Use Generated Columns

For better query performance without WHERE clauses in indexes:

```sql
-- Add a generated column
ALTER TABLE verifications 
ADD COLUMN is_verified_active BOOLEAN GENERATED ALWAYS AS (
    status = 'verified'
) STORED;

-- Index the generated column
CREATE INDEX idx_verifications_active ON verifications(is_verified_active);
```

## Verification

After applying the fix, verify indexes exist:

```sql
-- List all indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY indexname;

-- Should show all indexes without errors
```

## Next Steps

1. ✅ Schema now runs without errors
2. ✅ Application queries work the same way
3. ✅ Just filter in your queries instead of index predicates:
   ```sql
   -- Instead of relying on partial index,
   -- just add WHERE to your queries:
   SELECT * FROM verifications
   WHERE status = 'verified' 
     AND expires_at < NOW();
   ```

---

**Note:** The corrected schema file (`sql/001_multi_tenant_schema.sql`) has all these fixes applied.
