# Multi-Tenant Discord NFT Verification Bot - Architecture Documentation

## Executive Summary

This document describes the architecture of a **multi-tenant SaaS Discord bot** that verifies NFT ownership across multiple Discord servers. The same bot instance serves 50-500+ guilds, with each guild configuring their own NFT collections and role mappings.

### Key Features

- **Single Bot, Multiple Tenants**: One bot application serves unlimited Discord servers
- **Complete Tenant Isolation**: Each guild's data is logically separated by `guild_id`
- **Self-Service Configuration**: Guild admins can configure collections and roles via Discord commands
- **Shared Frontend**: Single web application handles verification for all tenants
- **Anti-Sharing Protection**: One wallet = one Discord user (globally enforced)
- **Solana Message Signing**: Cryptographic proof of wallet ownership (no gas fees)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MULTI-TENANT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │   Guild A    │     │   Guild B    │     │   Guild C    │            │
│  │  (Lil Gargs) │     │ (Other NFT)  │     │  (Another)   │            │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘            │
│         │                    │                    │                      │
│         └────────────────────┼────────────────────┘                      │
│                              │                                           │
│                    ┌─────────▼────────┐                                  │
│                    │  Discord Bot     │                                  │
│                    │  (Single Instance)│                                  │
│                    └─────────┬────────┘                                  │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         │                    │                    │                      │
│  ┌──────▼───────┐   ┌────────▼───────┐   ┌───────▼──────┐              │
│  │  Service     │   │   API Server   │   │   Database   │              │
│  │  Layer       │   │   (Express)    │   │  (PostgreSQL)│              │
│  └──────────────┘   └────────┬───────┘   └──────────────┘              │
│                              │                                           │
│                    ┌─────────▼────────┐                                  │
│                    │  Frontend (Next.js)│                                 │
│                    │  (Shared for all)  │                                 │
│                    └────────────────────┘                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Database Schema Design

### 1.1 Tenant Isolation Strategy

All tenant data is **logically isolated** using `guild_id` foreign keys:

```sql
-- Every table (except wallets) has guild_id for tenant scoping
CREATE TABLE collections (
    id UUID PRIMARY KEY,
    guild_id UUID NOT NULL REFERENCES guilds(id),  -- Tenant boundary
    collection_address TEXT NOT NULL,
    ...
);
```

**Why Logical Isolation (not separate databases)?**
- Simpler operations (one database to manage)
- Efficient cross-tenant analytics
- Easier migrations and schema updates
- Cost-effective for 50-5000 guilds

### 1.2 Core Tables

#### Guilds Table (Root of Multi-Tenancy)

```sql
CREATE TABLE guilds (
    id UUID PRIMARY KEY,
    guild_id TEXT NOT NULL UNIQUE,      -- Discord's snowflake ID
    guild_name TEXT NOT NULL,
    admin_role_ids TEXT[],               -- Admin role IDs for this guild
    owner_discord_id TEXT,               -- Server owner's Discord ID
    settings JSONB NOT NULL DEFAULT '{}',
    stats JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    was_kicked BOOLEAN NOT NULL DEFAULT false,
    kicked_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Design Decisions:**
- `guild_id` (Discord's ID) is separate from internal `id` (UUID) for security
- `settings` JSONB allows flexible per-guild configuration without schema changes
- `is_active` enables soft deletes (data retention when bot is kicked)
- `was_kicked` tracks if bot was removed vs. left voluntarily

#### Collections Table

```sql
CREATE TABLE collections (
    id UUID PRIMARY KEY,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    collection_address TEXT NOT NULL,    -- Solana collection mint
    collection_name TEXT NOT NULL,
    blockchain TEXT NOT NULL DEFAULT 'solana',
    metadata JSONB NOT NULL DEFAULT '{}',
    required_nft_count INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One active collection per address per guild
    UNIQUE (guild_id, collection_address) WHERE is_active = true
);
```

#### Role Mappings Table

```sql
CREATE TABLE role_mappings (
    id UUID PRIMARY KEY,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL,               -- Discord role ID
    role_name TEXT NOT NULL,
    min_nft_count INTEGER NOT NULL DEFAULT 1,
    max_nft_count INTEGER,               -- NULL = unlimited
    priority INTEGER NOT NULL DEFAULT 0, -- Lower = higher priority
    auto_assign BOOLEAN NOT NULL DEFAULT true,
    auto_remove BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    UNIQUE (guild_id, role_id) WHERE is_active = true
);
```

**Tiered Roles Example:**
```
Collection: Lil Gargs
├─ Bronze Role: min_nft_count = 1, priority = 3
├─ Silver Role: min_nft_count = 3, priority = 2
└─ Gold Role:   min_nft_count = 5, priority = 1
```

#### Wallets Table (Global Registry)

```sql
CREATE TABLE wallets (
    id UUID PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,  -- Solana address
    owner_discord_id TEXT NOT NULL,       -- Global owner
    owner_username TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlinked_at TIMESTAMPTZ,
    
    -- CRITICAL: One wallet per Discord user globally
    UNIQUE (owner_discord_id) WHERE is_active = true
);
```

**Anti-Sharing Mechanism:**
- Unique constraint on `wallet_address` prevents same wallet for multiple users
- Unique constraint on `owner_discord_id` prevents same user with multiple active wallets
- Checked at application layer with clear error messages

#### Verifications Table

```sql
CREATE TABLE verifications (
    id UUID PRIMARY KEY,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT,
    wallet_address TEXT NOT NULL,
    nfts_owned JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'verified',  -- verified|expired|revoked|failed
    assigned_role_ids TEXT[],
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_reverified_at TIMESTAMPTZ,
    
    -- One active verification per user per guild
    UNIQUE (guild_id, discord_user_id) WHERE status = 'verified'
);
```

#### Verification Sessions Table (Temporary)

```sql
CREATE TABLE verification_sessions (
    id UUID PRIMARY KEY,
    session_token TEXT NOT NULL UNIQUE,
    session_token_hash TEXT NOT NULL UNIQUE,  -- For secure lookup
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT,
    wallet_address TEXT,
    signature_payload TEXT,              -- Message to sign
    signature_valid BOOLEAN,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    
    -- Auto-expire handled by application
    INDEX idx_sessions_expires_at WHERE status = 'pending'
);
```

#### Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
    discord_user_id TEXT,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,  -- guild|collection|role|verification|wallet|admin|system
    old_value JSONB,
    new_value JSONB,
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_audit_logs_guild_occurred (guild_id, occurred_at DESC)
);
```

**Event Types:**
- `guild.joined`, `guild.left`, `guild.kicked`, `guild.config_updated`
- `collection.added`, `collection.updated`, `collection.removed`
- `role.mapping_added`, `role.mapping_updated`, `role.mapping_removed`
- `verification.started`, `verification.completed`, `verification.failed`, `verification.revoked`
- `wallet.linked`, `wallet.unlinked`, `wallet.conflict_detected`

### 1.3 Indexes for Performance

```sql
-- Guild lookups (most common query)
CREATE INDEX idx_guilds_guild_id ON guilds(guild_id);

-- Collection lookups by guild
CREATE INDEX idx_collections_guild_id ON collections(guild_id);
CREATE UNIQUE INDEX idx_collections_guild_address 
    ON collections(guild_id, collection_address) 
    WHERE is_active = true;

-- Verification lookups
CREATE UNIQUE INDEX idx_verifications_guild_user_active
    ON verifications(guild_id, discord_user_id)
    WHERE status = 'verified';

-- Re-verification queries (find expired)
CREATE INDEX idx_verifications_reverify_due
    ON verifications(expires_at)
    WHERE status = 'verified' AND expires_at < NOW();

-- Wallet lookups
CREATE INDEX idx_wallets_address ON wallets(wallet_address);
CREATE UNIQUE INDEX idx_wallets_discord_id 
    ON wallets(owner_discord_id) 
    WHERE is_active = true;
```

---

## 2. Multi-Tenant Architecture

### 2.1 Tenant Isolation Strategy

**Logical Isolation via `guild_id`:**

```typescript
// All queries are scoped by guild_id
async function getCollections(guildId: string) {
  return db.select()
    .from(collections)
    .where(
      and(
        eq(collections.guildId, guildId),  // Tenant boundary
        eq(collections.isActive, true)
      )
    );
}
```

**Why Not Physical Isolation (separate databases)?**
- Operational complexity (managing 500+ databases)
- Difficult cross-tenant analytics
- Expensive migrations
- Overkill for this use case

**When to Consider Physical Isolation:**
- Enterprise customers requiring data residency
- Regulatory compliance (GDPR, HIPAA)
- 10,000+ tenants

### 2.2 Bot Event Handling

**Guild-Scoped Command Routing:**

```typescript
// Every interaction includes guildId
async function handleCommand(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;  // Tenant identifier
  const db = await getDatabase();
  
  // All operations scoped to this guild
  const guild = await guildConfigService.getGuildByDiscordId(guildId);
  const collections = await collectionService.getCollectionsByGuild(guild.id);
  
  // ... rest of handler
}
```

**Bot Added/Removed Events:**

```typescript
client.on('guildCreate', async (guild) => {
  // Bot was added to a new server
  await guildConfigService.registerGuild({
    guildId: guild.id,
    guildName: guild.name,
    ownerDiscordId: guild.ownerId,
  });
});

client.on('guildDelete', async (guild) => {
  // Bot was kicked or left
  const wasKicked = guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewGuild) === false;
  await guildConfigService.deactivateGuild(guild.id, wasKicked ? 'kicked' : 'left');
});
```

### 2.3 Frontend Tenant Resolution

**JWT-Based Session Flow:**

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│  User   │     │ Discord │     │  Bot     │     │ Frontend │
└────┬────┘     └────┬────┘     └────┬─────┘     └────┬─────┘
     │               │               │                 │
     │ /verify       │               │                 │
     │──────────────>│               │                 │
     │               │ Create session│                 │
     │               │──────────────>│                 │
     │               │               │                 │
     │               │ DM with link  │                 │
     │               │<──────────────│                 │
     │               │               │                 │
     │ Click link    │               │                 │
     │──────────────────────────────>│                 │
     │               │               │                 │
     │               │ Validate JWT  │                 │
     │               │────────────────────────────────>│
     │               │               │                 │
     │               │ Guild config  │                 │
     │               │<────────────────────────────────│
     │               │               │                 │
     │ Show UI       │               │                 │
     │<──────────────│               │                 │
     └───────────────────────────────┴─────────────────┘
```

**Secure URL Pattern:**

```
https://discord.lilgarg.xyz/verify?token=<JWT>&guild=<guildId>
```

**JWT Payload:**

```typescript
interface JwtPayload {
  sessionId: string;      // Verification session token
  guildId: string;        // Internal UUID (not Discord ID)
  discordUserId: string;  // For validation
  discordUsername: string;
  exp: number;            // Expiration (15 minutes)
}
```

**Why JWT?**
- Stateless validation (no database lookup for every request)
- Tamper-proof (signed with secret)
- Contains all necessary context (guild, user, session)
- Short-lived (15 min) reduces risk

### 2.4 Complete Verification Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Discord
    participant Bot
    participant API
    participant Frontend
    participant DB
    participant Solana

    User->>Discord: /verify command
    Discord->>Bot: Interaction (guildId, userId)
    Bot->>DB: Create verification session
    DB-->>Bot: Session token
    Bot->>User: DM with unique link (JWT)
    
    User->>Frontend: Click link
    Frontend->>API: GET /api/verify/validate?token=<JWT>
    API->>API: Verify JWT signature
    API-->>Frontend: Valid + guild context
    
    Frontend->>API: GET /api/guild/:guildId/config
    API->>DB: Fetch guild collections
    DB-->>API: Collections + metadata
    API-->>Frontend: Guild config
    
    Frontend->>User: Show verification UI
    User->>Frontend: Connect wallet
    Frontend->>User: Sign message (Solana)
    User->>Frontend: Signature
    
    Frontend->>API: POST /api/verify/complete
    API->>DB: Get session by token
    DB-->>API: Session data
    
    API->>Solana: Verify signature
    Solana-->>API: Valid
    
    API->>Solana: Check NFT ownership
    Solana-->>API: NFTs owned
    
    API->>DB: Record verification
    API->>Discord: Assign role via API
    Discord-->>User: Role assigned
    
    API-->>Frontend: Success
    Frontend->>User: Show success page
```

---

## 3. Service Layer Architecture

### 3.1 Service Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                   VerificationService                    │
│  (Orchestrates entire verification flow)                 │
└──────┬──────────────────────┬──────────────────┬────────┘
       │                      │                  │
       ▼                      ▼                  ▼
┌─────────────┐      ┌────────────────┐  ┌──────────────┐
│ WalletService│      │ SolanaService  │  │ RoleMapping  │
│ (Anti-sharing)│      │ (NFT checking) │  │  Service     │
└──────┬──────┘      └────────┬───────┘  └──────┬───────┘
       │                      │                  │
       ▼                      ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                   Database (PostgreSQL)                  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Service Responsibilities

#### GuildConfigService
- CRUD operations for guild settings
- Admin role management
- Guild lifecycle (register, deactivate, reactivate)
- Permission checks

#### CollectionService
- Add/remove NFT collections per guild
- Validate Solana collection addresses
- Fetch collection metadata from chain

#### RoleMappingService
- Map collections to Discord roles
- Tiered role support (Bronze/Silver/Gold)
- Role eligibility calculation

#### WalletService
- Link wallet to Discord user
- **Enforce one-wallet-one-user rule**
- Prevent wallet sharing

#### SolanaService
- Generate verification messages
- Verify signed messages (prove ownership)
- Check NFT ownership via Helius DAS API
- Support any collection (dynamic)

#### VerificationService
- Create verification sessions
- Complete verification flow
- Assign Discord roles
- Re-verification logic

#### AuditLogService
- Log all significant events
- Compliance and debugging
- Searchable audit trail

---

## 4. Security & Edge Cases

### 4.1 Wallet Sharing Prevention

**Scenario:** Two users try to link the same wallet

**Prevention Mechanism:**

```typescript
async function linkWallet(input: WalletLinkInput) {
  // Check if wallet already exists
  const existing = await this.getWalletByAddress(input.walletAddress);
  
  if (existing) {
    if (existing.ownerDiscordId !== input.discordUserId) {
      // CONFLICT: Different user owns this wallet
      await this.auditLog.logWalletEvent(
        input.discordUserId,
        'wallet.conflict_detected',
        {
          walletAddress: input.walletAddress,
          existingOwnerDiscordId: existing.ownerDiscordId,
        }
      );
      
      throw new Error(
        'This wallet is already linked to another Discord user. ' +
        'Each wallet can only be linked to one Discord account.'
      );
    }
  }
  
  // ... proceed with linking
}
```

**Database Enforcement:**
```sql
-- Unique constraint prevents duplicates
CREATE UNIQUE INDEX idx_wallets_address ON wallets(wallet_address);
```

### 4.2 Same Wallet in Multiple Guilds

**Scenario:** User verifies in Guild A and Guild B

**Resolution:** ALLOWED

```typescript
// Wallet is linked globally to user
const wallet = await walletService.getOrCreateWallet({
  walletAddress,
  discordUserId: user.id,  // Same user across guilds
});

// Verification is per-guild
await verificationService.createVerificationRecord({
  guildId: guildA.id,  // Guild A
  walletId: wallet.id,
  discordUserId: user.id,
});

await verificationService.createVerificationRecord({
  guildId: guildB.id,  // Guild B
  walletId: wallet.id,
  discordUserId: user.id,
});
```

**Why Allow This?**
- User owns their wallet
- Natural behavior (user joins multiple NFT communities)
- Each guild has independent verification requirements

### 4.3 User Sells NFT After Verification

**Scenario:** User verified with NFT, then sells it

**Detection:** Scheduled re-verification job

```typescript
// Run daily to check all verified users
async function reverifyAllUsers() {
  const verificationsDue = await verificationService.getVerificationsDueForRecheck();
  
  for (const verification of verificationsDue) {
    const result = await verificationService.reverifyUser(
      verification.guildId,
      verification.discordUserId
    );
    
    if (!result.isStillVerified) {
      // User no longer owns NFT
      // Remove roles if auto_remove is enabled
      await discordClient.removeRoles(
        verification.guildId,
        verification.discordUserId,
        result.removedRoles
      );
    }
  }
}
```

**Re-verification Interval:** Configurable per guild (default: 7 days)

### 4.4 Guild Admin Removes Collection

**Scenario:** Admin removes collection that has verified users

**Behavior:** Existing verified users keep roles until re-verification

```typescript
async function removeCollection(collectionId: string) {
  const collection = await this.getCollectionById(collectionId);
  
  // Soft delete (don't remove data)
  await this.db.update(collections)
    .set({ isActive: false })
    .where(eq(collections.id, collectionId));
  
  // Existing verifications remain valid
  // On next re-verification, users will fail if they only owned from this collection
}
```

**Why This Approach?**
- Don't punish users for admin decisions
- Gives admin time to add replacement collection
- Audit trail preserved

### 4.5 Bot Removed and Re-added

**Scenario:** Bot is kicked, then re-added to same server

**Data Retention Policy:**

```typescript
// When bot is kicked
async function deactivateGuild(id: string, reason: 'kicked' | 'left') {
  await this.db.update(guilds)
    .set({
      isActive: false,
      wasKicked: reason === 'kicked',
      kickedAt: new Date(),
    })
    .where(eq(guilds.id, id));
  
  // Data is SOFT DELETED (retained)
}

// When bot is re-added
async function reactivateGuild(id: string) {
  await this.db.update(guilds)
    .set({
      isActive: true,
      wasKicked: false,
      kickedAt: null,
    })
    .where(eq(guilds.id, id));
  
  // All previous configuration restored
}

// Hard delete after 30 days (scheduled job)
async function cleanupOldGuilds() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  await this.db.delete(guilds)
    .where(
      and(
        eq(guilds.isActive, false),
        lt(guilds.kickedAt, cutoffDate)
      )
    );
}
```

### 4.6 Verification Link Sharing Prevention

**Scenario:** User shares verification link with another user

**Prevention:**

```typescript
// JWT includes discordUserId
const jwtPayload: JwtPayload = {
  sessionId: session.token,
  guildId: guild.id,
  discordUserId: user.id,  // Tied to original user
  discordUsername: user.username,
};

// On verification completion
async function completeVerification(input: CompleteVerificationInput) {
  const payload = verifyJwt(input.token);
  
  // Validate JWT user matches Discord interaction user
  if (payload.discordUserId !== interaction.user.id) {
    throw new Error('Verification link is not valid for this user');
  }
  
  // ... proceed
}
```

**Additional Protections:**
- JWT expires in 15 minutes
- Session token is single-use
- IP address logged for forensic analysis

---

## 5. Caching Strategy

### 5.1 What to Cache

**In-Memory Cache (Node.js Map):**

```typescript
// Guild configurations (change infrequently)
const guildConfigCache = new Map<string, GuildConfig>();

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
```

**Cache Keys:**
- `guild:{guildId}:config` - Guild settings
- `guild:{guildId}:collections` - Active collections
- `guild:{guildId}:roles` - Role mappings

### 5.2 Cache Invalidation

```typescript
// Invalidate on config changes
async function updateGuildSettings(guildId: string, settings: Partial<GuildSettings>) {
  const updated = await this.db.update(guilds)...;
  
  // Invalidate cache
  guildConfigCache.delete(`guild:${guildId}:config`);
  
  return updated;
}

// Invalidate on collection changes
async function addCollection(guildId: string, input: CollectionInput) {
  const collection = await this.db.insert(collections)...;
  
  // Invalidate collections cache
  guildConfigCache.delete(`guild:${guildId}:collections`);
  
  return collection;
}
```

### 5.3 Where Redis Would Help (If Added Later)

**Redis Use Cases:**
1. **Distributed Cache**: Multiple bot instances share cache
2. **Rate Limiting**: Atomic counters for rate limits
3. **Session Storage**: Verification sessions with auto-expiry
4. **Pub/Sub**: Cross-instance event propagation

**Example Redis Integration:**

```typescript
// Rate limiting with Redis
async function checkRateLimit(key: string, limit: number, windowMs: number) {
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.pexpire(key, windowMs);
  }
  
  return current <= limit;
}
```

---

## 6. Rate Limiting

### 6.1 Rate Limit Tiers

| Endpoint/Action | Limit | Window | Scope |
|-----------------|-------|--------|-------|
| Verification | 3 | 10 minutes | Per user |
| API Requests | 100 | 1 minute | Per IP |
| Discord Commands | 5 | 1 minute | Per user |
| Re-verification | 1 | 5 minutes | Per user |
| Admin Commands | 10 | 1 minute | Per user |

### 6.2 Implementation

```typescript
// Database-backed rate limiting (works across instances)
async function checkRateLimit(
  keyType: 'guild' | 'user' | 'ip',
  keyValue: string,
  action: string,
  limit: number,
  windowMinutes: number
): Promise<boolean> {
  const windowEnd = new Date(Date.now() + windowMinutes * 60 * 1000);
  
  // Upsert rate limit record
  const result = await db`
    INSERT INTO rate_limits (key_type, key_value, action, request_count, window_start, window_end)
    VALUES (${keyType}, ${keyValue}, ${action}, 1, NOW(), ${windowEnd})
    ON CONFLICT (key_type, key_value, action, window_start)
    DO UPDATE SET request_count = rate_limits.request_count + 1
    RETURNING request_count
  `;
  
  return result[0].request_count <= limit;
}

// Usage in API endpoint
app.post('/api/verify/complete', async (req, res) => {
  const ip = req.ip;
  const allowed = await checkRateLimit('ip', ip, 'verification', 100, 1);
  
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  // ... proceed
});
```

---

## 7. Deployment Architecture

### 7.1 Single Instance Deployment

```
┌─────────────────────────────────────┐
│         Single Server               │
│  ┌───────────────────────────────┐  │
│  │  Discord Bot + API Server     │  │
│  │  (Node.js Process)            │  │
│  └───────────────┬───────────────┘  │
│                  │                  │
│  ┌───────────────▼───────────────┐  │
│  │  PostgreSQL (Supabase)        │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Suitable For:** 50-200 guilds

### 7.2 Multi-Instance Deployment (Future Scaling)

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
└─────────────────────┬───────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
  ┌──────▼──────┐ ┌──▼────────┐ ┌──▼──────────┐
  │  Bot Inst 1 │ │ Bot Inst 2│ │  Bot Inst 3 │
  │  + API      │ │ + API     │ │  + API      │
  └──────┬──────┘ └───┬───────┘ └───┬─────────┘
         │            │             │
         └────────────┼─────────────┘
                      │
         ┌────────────▼────────────┐
         │  PostgreSQL (Primary)   │
         └─────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │  Redis (Cache + Queue)  │  [Optional]
         └─────────────────────────┘
```

**Suitable For:** 200-5000+ guilds

---

## 8. Monitoring & Observability

### 8.1 Key Metrics to Track

**Guild Metrics:**
- Total guilds (active, inactive, kicked)
- Guilds added/removed per day
- Average collections per guild

**Verification Metrics:**
- Verifications initiated/completed/failed per hour
- Average verification time
- Re-verification failure rate

**Wallet Metrics:**
- Total wallets linked
- Wallet conflict attempts (security metric)
- Wallet unlinks per day

**Performance Metrics:**
- API response time (p50, p95, p99)
- Database query time
- Helius API latency

### 8.2 Alerting Rules

| Metric | Threshold | Action |
|--------|-----------|--------|
| Verification failure rate | > 20% | Page on-call |
| API error rate | > 5% | Page on-call |
| Database connections | > 80% of max | Warning |
| Helius API errors | > 10% | Warning |
| Wallet conflicts | Spike > 3σ | Investigate (potential attack) |

---

## 9. Migration from Single-Tenant

### 9.1 Data Migration Strategy

**Phase 1: Dual-Write (Week 1)**
- Keep existing MongoDB schema
- Write new data to both MongoDB and PostgreSQL
- Read from MongoDB (source of truth)

**Phase 2: Backfill (Week 2)**
- Migrate historical data to PostgreSQL
- Validate data consistency

**Phase 3: Read Switch (Week 3)**
- Read from PostgreSQL
- MongoDB becomes read-only backup

**Phase 4: Decommission (Week 4)**
- Remove MongoDB writes
- Archive MongoDB data

### 9.2 Schema Mapping

```typescript
// MongoDB (Old)
{
  _id: ObjectId,
  discord_id: "123456789",
  guild_id: "987654321",
  wallet_address: "xyz...",
  is_verified: true,
  nfts: [...]
}

// PostgreSQL (New)
{
  id: UUID,
  guild_id: UUID (FK),
  wallet_id: UUID (FK),
  discord_user_id: "123456789",
  wallet_address: "xyz...",
  status: "verified",
  nfts_owned: [...],
  verified_at: TIMESTAMPTZ
}
```

---

## 10. Future Enhancements

### 10.1 Planned Features

1. **Multi-Chain Support**
   - Ethereum NFTs (ERC-721)
   - Polygon NFTs
   - Abstract blockchain selection per collection

2. **Premium Tiers**
   - Free: 1 collection, 100 verifications/month
   - Basic: 5 collections, 1000 verifications/month
   - Premium: Unlimited collections, unlimited verifications

3. **Advanced Role Rules**
   - Trait-based verification (specific NFT attributes)
   - Token count thresholds (1-3 NFTs = Bronze, 4-10 = Silver)
   - Time-based roles (verified for 30+ days = Veteran)

4. **Dashboard Features**
   - Real-time verification analytics
   - Member management UI
   - Bulk role assignment
   - Webhook integrations

### 10.2 Scalability Considerations

**When to Shard Database:**
- 10,000+ guilds
- 1M+ verification records
- Query performance degrades despite indexing

**Sharding Strategy:**
- Shard by `guild_id` hash
- Each shard contains complete tenant data
- Application-layer routing

---

## Appendix A: Environment Variables

```bash
# Discord
DISCORD_BOT_TOKEN=your_bot_token
CLIENT_ID=your_client_id

# Database (Supabase)
DATABASE_URL=postgresql://user:password@host:5432/dbname
# Use port 5432 for session pooler (long-running connections)
# Use port 6543 for transaction pooler (serverless)

# Solana
HELIUS_API_KEY=your_helius_api_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Frontend
FRONTEND_URL=https://discord.lilgarg.xyz
CORS_ALLOWED_ORIGINS=https://discord.lilgarg.xyz,https://your-domain.com

# API Server
API_PORT=30391
API_HTTPS_PORT=30392
JWT_SECRET=your_jwt_secret_32_bytes_min
JWT_EXPIRY=15m

# Rate Limiting
RATE_LIMIT_VERIFICATION=3
RATE_LIMIT_VERIFICATION_WINDOW=600000  # 10 minutes
RATE_LIMIT_API=100
RATE_LIMIT_API_WINDOW=60000  # 1 minute

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

---

## Appendix B: API Reference

### POST /api/verify/session

Create verification session.

**Request:**
```json
{
  "guildId": "1409680783882457244",
  "discordUserId": "123456789",
  "discordUsername": "username",
  "walletAddress": "xyz..."  // Optional
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "sessionId": "session_uuid",
  "message": "Discord NFT Verification...",
  "expiresAt": "2025-01-01T00:10:00Z",
  "guildName": "Lil Gargs",
  "collections": [
    {
      "address": "FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ",
      "name": "Lil Gargs",
      "requiredCount": 1
    }
  ]
}
```

### POST /api/verify/complete

Complete verification with signature.

**Request:**
```json
{
  "token": "jwt_token_here",
  "signature": "bs58_encoded_signature",
  "walletAddress": "xyz..."
}
```

**Response:**
```json
{
  "success": true,
  "isVerified": true,
  "nftCount": 3,
  "nfts": [...],
  "assignedRoles": ["role_id_1", "role_id_2"],
  "eligibleRoles": [...]
}
```

---

## Appendix C: Discord Commands Reference

### Admin Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/setup collection <address> <name> [required]` | Register NFT collection | Admin |
| `/setup role <role> <collection> [min] [max]` | Map collection to role | Admin |
| `/setup remove <collection>` | Remove collection | Admin |
| `/setup dashboard` | Get dashboard link | Admin |
| `/config view` | Show configuration | Admin |
| `/config reset` | Reset configuration | Admin |

### User Commands

| Command | Description |
|---------|-------------|
| `/verify [wallet]` | Start verification |
| `/wallet show` | Show linked wallet |
| `/wallet unlink` | Unlink wallet |
| `/reverify` | Re-check NFT ownership |

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-01  
**Author:** Multi-Tenant Architecture Team
