-- 0003_guild_verification_settings.sql
-- Add per-server Helius API key and periodic check configuration

-- Add per-server Helius API key column
ALTER TABLE public.guild_verification_contracts
ADD COLUMN IF NOT EXISTS helius_api_key TEXT;

-- Add periodic check toggle (default enabled)
ALTER TABLE public.guild_verification_contracts
ADD COLUMN IF NOT EXISTS periodic_check_enabled BOOLEAN DEFAULT TRUE;

-- Add periodic check interval in minutes (default 360 = 6 hours)
ALTER TABLE public.guild_verification_contracts
ADD COLUMN IF NOT EXISTS periodic_check_interval_minutes INTEGER DEFAULT 360;

-- Index for faster lookups by guild_id when querying settings
CREATE INDEX IF NOT EXISTS guild_verification_contracts_periodic_idx
    ON public.guild_verification_contracts (guild_id, periodic_check_enabled)
    WHERE periodic_check_enabled = TRUE;
