mkdir -p supabase/migrations
cat <<'SQL' > supabase/migrations/0001_initial_schema.sql
-- Enable required extensions (run once per database)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================
-- Core Entities
-- =====================

CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id text NOT NULL,
    guild_id text NOT NULL,
    username text NOT NULL,
    wallet_address text,
    is_verified boolean NOT NULL DEFAULT false,
    is_whitelisted boolean NOT NULL DEFAULT false,
    first_joined timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    last_verification_check timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_discord_guild_unique
    ON public.users (discord_id, guild_id);

CREATE INDEX users_wallet_verified_idx
    ON public.users (wallet_address, is_verified);

CREATE INDEX users_last_check_idx
    ON public.users (last_verification_check);

CREATE INDEX users_whitelisted_idx
    ON public.users (is_whitelisted);

CREATE TABLE public.user_nft_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mint text NOT NULL,
    name text,
    image text,
    verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_nft_tokens_user_idx
    ON public.user_nft_tokens (user_id);

CREATE INDEX user_nft_tokens_mint_idx
    ON public.user_nft_tokens (mint);

CREATE TABLE public.user_verification_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    wallet_address text NOT NULL,
    verified_at timestamptz NOT NULL,
    nft_count integer NOT NULL DEFAULT 0,
    status text NOT NULL CHECK (status IN ('success', 'failed', 'revoked'))
);

CREATE INDEX user_verification_history_user_idx
    ON public.user_verification_history (user_id);

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id text NOT NULL,
    role_name text,
    assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_roles_user_idx
    ON public.user_roles (user_id);

-- =====================
-- Documents / Knowledge Base
-- =====================

CREATE TABLE public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    filename text NOT NULL UNIQUE,
    content text NOT NULL,
    content_type text NOT NULL DEFAULT 'text',
    description text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT 'general',
    is_active boolean NOT NULL DEFAULT true,
    is_processed boolean NOT NULL DEFAULT false,
    file_size integer NOT NULL DEFAULT 0,
    file_hash text UNIQUE,
    uploaded_by_discord_id text,
    uploaded_by_username text,
    usage_count integer NOT NULL DEFAULT 0,
    last_used timestamptz,
    processing_status text NOT NULL DEFAULT 'pending',
    processing_error text,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_active_processed_idx
    ON public.documents (is_active, is_processed);

CREATE INDEX documents_category_idx
    ON public.documents (category);

CREATE INDEX documents_uploaded_by_idx
    ON public.documents (uploaded_by_discord_id);

CREATE INDEX documents_fulltext_idx
    ON public.documents
    USING GIN (to_tsvector('english',
        coalesce(title, '') || ' ' ||
        coalesce(content, '') || ' ' ||
        coalesce(description, '')
    ));

CREATE TABLE public.document_tags (
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    tag text NOT NULL,
    PRIMARY KEY (document_id, tag)
);

CREATE TABLE public.document_embeddings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    chunk text NOT NULL,
    embedding vector(1536) -- adjust dimension as needed for your model
);

CREATE INDEX document_embeddings_document_idx
    ON public.document_embeddings (document_id);

CREATE INDEX document_embeddings_chunk_idx
    ON public.document_embeddings (document_id, chunk_index);

-- =====================
-- Guild Configuration
-- =====================

CREATE TABLE public.bot_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL UNIQUE,
    guild_name text NOT NULL,
    log_channel_id text,
    verification_channel_id text,
    verification_message_id text,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    stats jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bot_configs_guild_idx
    ON public.bot_configs (guild_id);

CREATE TABLE public.bot_config_role_tiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_config_id uuid NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
    nft_count integer NOT NULL,
    role_id text NOT NULL,
    role_name text NOT NULL,
    UNIQUE (bot_config_id, nft_count)
);

CREATE TABLE public.bot_config_admin_roles (
    bot_config_id uuid NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
    role_id text NOT NULL,
    PRIMARY KEY (bot_config_id, role_id)
);

CREATE TABLE public.bot_config_moderator_roles (
    bot_config_id uuid NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
    role_id text NOT NULL,
    PRIMARY KEY (bot_config_id, role_id)
);

-- =====================
-- Feature Tables
-- =====================

CREATE TABLE public.pets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    element text,
    personality text,
    level integer NOT NULL DEFAULT 1,
    experience integer NOT NULL DEFAULT 0,
    hunger integer NOT NULL DEFAULT 50,
    happiness integer NOT NULL DEFAULT 50,
    energy integer NOT NULL DEFAULT 50,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pets_user_idx
    ON public.pets (user_id);

CREATE TABLE public.pet_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    performed_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX pet_activities_pet_idx
    ON public.pet_activities (pet_id);

CREATE TABLE public.battles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL,
    challenger_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    defender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    winner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending',
    wager_amount integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX battles_guild_idx
    ON public.battles (guild_id);

CREATE TABLE public.battle_log_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
    turn integer NOT NULL,
    actor uuid,
    action text NOT NULL,
    result text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX battle_log_entries_battle_idx
    ON public.battle_log_entries (battle_id);

CREATE TABLE public.tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    category text,
    priority text NOT NULL DEFAULT 'medium',
    title text,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tickets_status_idx
    ON public.tickets (status);

CREATE INDEX tickets_guild_idx
    ON public.tickets (guild_id);

CREATE TABLE public.ticket_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_discord_id text NOT NULL,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_messages_ticket_idx
    ON public.ticket_messages (ticket_id);

-- =====================
-- Verification (future phases)
-- =====================

CREATE TABLE public.verification_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id text NOT NULL,
    guild_id text NOT NULL,
    token_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    wallet_address text,
    signature_payload text,
    expires_at timestamptz NOT NULL,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX verification_sessions_token_hash_idx
    ON public.verification_sessions (token_hash);

CREATE TABLE public.verification_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.verification_sessions(id) ON DELETE CASCADE,
    ip_hash text,
    user_agent text,
    result_code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_attempts_session_idx
    ON public.verification_attempts (session_id);

-- =====================
-- Guild Verification Contract Rules
-- =====================

CREATE TABLE public.guild_verification_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL,
    contract_address text NOT NULL,
    required_nft_count integer NOT NULL DEFAULT 1,
    role_id text,
    role_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guild_verification_contracts
    ADD CONSTRAINT guild_verification_contracts_guild_contract_unique
    UNIQUE (guild_id, contract_address);

CREATE INDEX guild_verification_contracts_guild_idx
    ON public.guild_verification_contracts (guild_id);