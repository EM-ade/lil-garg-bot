# NFT Verification Setup Guide

## Prerequisites

1. **Helius API Key** - Get one from https://helius.dev (free tier works)
2. **Bot invited** to your Discord server with admin permissions
3. **Supabase configured** with the required columns

### Database Setup (Run in Supabase SQL Editor)

```sql
ALTER TABLE guild_verification_contracts 
ADD COLUMN IF NOT EXISTS helius_api_key text,
ADD COLUMN IF NOT EXISTS periodic_check_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS periodic_check_interval_minutes integer DEFAULT 60;
```

---

## Commands Overview

### 1. Set Helius API Key (Required First)

```
/verification-config settings helius_api_key:YOUR_HELIUS_API_KEY
```

Each server must provide their own Helius API key. The bot will NOT work without it.

**Example:**
```
/verification-config settings helius_api_key=a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

### 2. Add NFT Collection for Verification

```
/verification-config add <contract_address> [required_nfts] [role]
```

| Option | Required | Description |
|--------|----------|-------------|
| `contract_address` | Yes | Solana mint address of the NFT collection |
| `required_nfts` | No | Minimum NFTs needed (default: 1) |
| `role` | No | Discord role to assign when verified |

**Example:**
```
/verification-config add FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ required_nfts:1 role:@LilGargsHolder
```

---

### 3. List Verification Rules

```
/verification-config list
```

Shows all configured NFT collections and their requirements for the current server.

---

### 4. Remove Verification Rule

```
/verification-config remove <contract_address>
```

Removes an NFT collection from verification requirements.

**Example:**
```
/verification-config remove FP2bGBGHWrW4w82hsSDGc5L83CvEmW2shGkttS7aZ
```

---

### 5. User Verification Command

Users run this to verify NFT ownership:

```
/verify-nft
```

Flow:
1. User runs `/verify-nft`
2. Bot creates a verification session
3. User clicks the button to open the verification portal
4. User connects wallet and signs a message
5. Bot verifies NFT ownership via Helius API
6. Roles are automatically assigned if requirements are met

---

## Periodic Verification (Optional)

Enable periodic NFT ownership checks:

```
/verification-config settings periodic_enabled:true periodic_interval:60
```

- `periodic_enabled` - Enable/disable periodic checks
- `periodic_interval` - Check interval in minutes (60-1440, default: 360)

---

## Quick Setup Checklist

- [ ] Get Helius API key from https://helius.dev
- [ ] Run database migration (SQL above)
- [ ] Run `/verification-config settings helius_api_key=<YOUR_KEY>`
- [ ] Run `/verification-config add <COLLECTION_ADDRESS> required_nfts:1`
- [ ] Users run `/verify-nft` to verify

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/verification-config` not showing | Restart bot - commands deploy automatically on startup |
| "Helius API key not configured" error | Run `/verification-config settings helius_api_key=<YOUR_KEY>` |
| Verification fails | Ensure collection address is correct and user owns at least 1 NFT |
| Duplicate commands | Bot auto-deploys on startup - restart to fix |