-- Verify recent verification session state and related user records

-- Latest sessions
select
    id,
    discord_id,
    guild_id,
    status,
    expires_at,
    verified_at,
    updated_at,
    created_at
from public.verification_sessions
order by created_at desc
limit 10;

-- Attempts for the most recent session (replace :session_id if needed)
-- select *
-- from public.verification_attempts
-- where session_id = 'YOUR_SESSION_UUID'
-- order by created_at desc;

-- User profile with verification flags
select
    id,
    discord_id,
    guild_id,
    wallet_address,
    is_verified,
    last_verified_at,
    created_at,
    updated_at
from public.users
where discord_id = '1356652426240852009'
order by updated_at desc
limit 5;

-- Recent verification history entries
select
    user_id,
    wallet_address,
    nft_count,
    status,
    verified_at,
    created_at
from public.user_verification_history
order by created_at desc
limit 10;

-- Latest NFT token snapshots (optional)
select
    user_id,
    mint,
    name,
    image,
    verified_at,
    created_at
from public.user_nft_tokens
order by created_at desc
limit 10;
