# Environment Variables for Hugging Face Spaces Deployment

This document lists all environment variables required by the Lil Gargs Discord Bot.

## 🔴 Required Variables

These **MUST** be set as Secrets in your Hugging Face Space settings:

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for the NFT verification flow (`/verify-nft` command). Without them, verification sessions cannot be created or retrieved.

| Variable Name | Description | Example |
|---------------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Your Discord bot token from Discord Developer Portal | `MTIz...abc` |
| `MONGO_URL` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `DB_NAME` | MongoDB database name | `lilgargs_prod` |
| `GEMINI_API_KEY` | Google Gemini API key for AI features | `AIzaSy...xyz` |
| `HELIUS_API_KEY` | Helius API key for Solana NFT data | `abc123...` |
| `NFT_CONTRACT_ADDRESS` | Solana NFT contract/mint address | `ABC123...xyz` |
| `VERIFIED_CREATOR` | Verified creator address for NFT validation | `XYZ789...abc` |
| `DISCORD_CLIENT_ID` | Discord application client ID | `1234567890` |
| `SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...xyz` |

## 🟡 Optional Variables

These enhance functionality but have defaults:

| Variable Name | Description | Default | Example |
|---------------|-------------|---------|---------|
| `DISCORD_GUILD_ID` | Primary Discord server ID | _(none)_ | `9876543210` |
| `DISCORD_SERVER_ID` | Alternate Discord server ID | _(none)_ | `9876543210` |
| `GUILD_ID` | Another guild ID variant | _(none)_ | `9876543210` |
| `FRONTEND_URL` | Frontend application URL | `http://localhost:5173` | `https://lilgarg.xyz` |
| `USE_SUPABASE` | Enable Supabase integration | `false` | `true` |
| `REDIS_URL` | Redis connection URL for caching | `redis://localhost:6379` | `redis://user:pass@redis:6379` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | _(empty)_ | `https://lilgarg.xyz,https://discord.lilgarg.xyz` |
| `GEMINI_MODEL` | Gemini AI model to use | `gemini-1.0-pro` | `gemini-1.5-pro` |
| `MAX_TOKENS` | Maximum AI tokens per response | `1000` | `2000` |
| `TEMPERATURE` | AI creativity level (0.0-1.0) | `0.7` | `0.8` |
| `VERIFIED_ROLE_NAME` | Name for verified NFT role | `Lil Gargs Holder` | `NFT Verified` |
| `ADMIN_ROLE_NAME` | Name for admin role | `Admin` | `Server Admin` |
| `LOG_CHANNEL_NAME` | Name for bot log channel | `bot-logs` | `bot-activity` |
| `NODE_ENV` | Runtime environment | `development` | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` | `debug`, `warn`, `error` |
| `DEBUG_MODE` | Enable debug logging | `false` | `true` |
| `IPFS_IMAGE_FOLDER` | IPFS folder for NFT images | _(none)_ | `ipfs/images` |
| `IPFS_JSON_FOLDER` | IPFS folder for NFT metadata | _(none)_ | `ipfs/metadata` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.mainnet-beta.solana.com` | `https://rpc.helius.xyz/...` |
| `PORT` | HTTP server port | `30391` | `8080` |
| `API_PORT` | Alternate HTTP port | `30391` | `8080` |
| `API_HTTPS_PORT` | HTTPS server port | `30392` | `8443` |
| `HTTPS_PORT` | Alternate HTTPS port | `30392` | `8443` |

## 📝 How to Add Secrets in Hugging Face Spaces

1. Go to your Space on Hugging Face
2. Click **Settings** tab
3. Scroll to **Repository secrets**
4. Click **New secret**
5. Add each variable name and its value
6. Click **Save**

## 🔒 Security Notes

- **NEVER** commit these values to `.env` files in the repository
- All secrets are encrypted at rest by Hugging Face
- Rotate your tokens regularly for security
- Use production-grade MongoDB and Redis URLs (not localhost)

## 📊 Health Check Endpoints

After deployment, these endpoints are available on port `7860`:

- `/health` - Returns JSON with bot status
- `/hf-ping` - Returns plain text "pong" (for uptime monitors)

Example:
```bash
curl https://your-username-lil-gargs-bot.hf.space/health
```
