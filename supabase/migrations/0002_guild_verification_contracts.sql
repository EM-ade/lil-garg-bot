-- 0002_guild_verification_contracts.sql
-- Adds per-guild contract threshold configuration for NFT verification roles

CREATE TABLE IF NOT EXISTS public.guild_verification_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL,
    contract_address text NOT NULL,
    required_nft_count integer NOT NULL DEFAULT 1,
    role_id text,
    role_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'guild_verification_contracts_guild_contract_unique'
    ) THEN
        ALTER TABLE public.guild_verification_contracts
            ADD CONSTRAINT guild_verification_contracts_guild_contract_unique
            UNIQUE (guild_id, contract_address);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS guild_verification_contracts_guild_idx
    ON public.guild_verification_contracts (guild_id);
