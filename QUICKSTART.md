# 🚀 Quick Start Guide - Multi-Tenant Discord NFT Verification Bot

This guide will help you set up and deploy the multi-tenant NFT verification bot in under 30 minutes.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** v18+ installed ([Download](https://nodejs.org/))
- **PostgreSQL** database (we use Supabase free tier)
- **Discord Bot** application ([Create one here](https://discord.com/developers/applications))
- **Helius API Key** for Solana RPC ([Get free key](https://www.helius.dev/))
- **Git** for version control

---

## 📦 Step 1: Installation

### 1.1 Navigate to Bot Directory

```bash
cd "C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot"
```

### 1.2 Install Dependencies

```bash
# Install production dependencies
npm install

# Install development dependencies (for TypeScript and testing)
npm install -D typescript ts-node @types/node
```

### 1.3 Verify Installation

```bash
# Check Node version (should be 18+)
node --version

# Check npm version
npm --version
```

---

## 🗄️ Step 2: Database Setup

### Option A: Using Supabase (Recommended for Free Tier)

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New Project"
   - Choose free tier
   - Note your project credentials

2. **Get Connection String**
   - Go to Project Settings → Database
   - Copy the **Connection Pooling** string (port 5432 for session pooler)
   - Format: `postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres`

3. **Run Schema Migration**

```bash
# Install Drizzle Kit globally (one time)
npm install -g drizzle-kit

# Apply schema to database
psql "[YOUR_DATABASE_URL]" -f sql/001_multi_tenant_schema.sql
```

**Windows PowerShell alternative:**
```powershell
# If psql is not in PATH, use full path or install PostgreSQL
$env:DATABASE_URL="your_connection_string"
psql $env:DATABASE_URL -f sql/001_multi_tenant_schema.sql
```

### Option B: Using Local PostgreSQL

1. **Install PostgreSQL** (if not already installed)
   - Windows: [PostgreSQL Installer](https://www.postgresql.org/download/windows/)
   - Create a database: `CREATE DATABASE lil_garg_bot;`

2. **Run Migration**

```bash
psql -U postgres -d lil_garg_bot -f sql/001_multi_tenant_schema.sql
```

### Verify Database Setup

```bash
# Connect to database and check tables
psql "[YOUR_DATABASE_URL]" -c "\dt"
```

You should see all 8 tables:
- `guilds`
- `collections`
- `role_mappings`
- `wallets`
- `verifications`
- `verification_sessions`
- `audit_logs`
- `rate_limits`

---

## 🔧 Step 3: Environment Configuration

### 3.1 Create Environment File

Copy the example environment file:

```bash
copy .env.example .env
```

### 3.2 Fill in Environment Variables

Edit `.env` file with your credentials:

```bash
# Discord Configuration
DISCORD_BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_test_server_id_here  # Optional: for faster command deployment

# Database (Supabase Connection String)
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Solana RPC
HELIUS_API_KEY=your_helius_api_key_here
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key_here

# Frontend URL (where users will verify)
FRONTEND_URL=https://discord.lilgarg.xyz

# API Server Configuration
API_PORT=30391
API_HTTPS_PORT=30392
CORS_ALLOWED_ORIGINS=https://discord.lilgarg.xyz,http://localhost:3000

# JWT Configuration (generate a random 32+ character string)
JWT_SECRET=your_random_secret_key_min_32_characters_long
JWT_EXPIRY=15m

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### 3.3 Generate JWT Secret

```bash
# Generate random secret (Node.js)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🤖 Step 4: Discord Bot Setup

### 4.1 Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "NFT Verification Bot"

### 4.2 Get Bot Token

1. Go to "Bot" tab
2. Click "Reset Token" (or "Copy Token" if exists)
3. Save token to `.env` as `DISCORD_BOT_TOKEN`

### 4.3 Configure Bot Permissions

Required permissions:
- ✅ Manage Roles
- ✅ Manage Channels
- ✅ Send Messages
- ✅ Embed Links
- ✅ Use Slash Commands
- ✅ Manage Webhooks

### 4.4 Invite Bot to Server

Generate invite URL:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2684354624&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual client ID.

### 4.5 Enable Privileged Gateway Intents

1. Go to "Bot" tab
2. Scroll to "Privileged Gateway Intents"
3. Enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
4. Click "Save Changes"

---

## 🚀 Step 5: Run the Bot

### 5.1 Deploy Slash Commands

```bash
# Register slash commands with Discord
npm run deploy-commands
```

**Note:** Global commands can take up to 1 hour to propagate. For faster testing, add `GUILD_ID` to `.env` to register commands for a specific server only.

### 5.2 Start Development Server

```bash
# Start bot with hot reload (if using nodemon)
npm run dev

# Or start normally
npm start
```

### 5.3 Verify Bot is Running

You should see logs like:
```
[DB Connection] PostgreSQL connected successfully!
[Commands] Registered 6 slash commands globally
[API] HTTP server listening on port 30391
Bot logged in as: YourBot#1234
```

---

## ✅ Step 6: Test the Bot

### 6.1 Test Admin Commands

In your Discord server, type:

```
/setup collection FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ Lil Gargs 1
```

Expected response: ✅ Collection Added

```
/setup role @YourRole Lil Gargs 1
```

Expected response: ✅ Role Mapping Created

```
/config view
```

Expected response: Shows your configuration

### 6.2 Test User Commands

```
/verify
```

Expected response: DM with verification link

### 6.3 Test API Endpoints

```bash
# Health check
curl http://localhost:30391/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":123.456}
```

---

## 🧪 Step 7: Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run specific test suite
npm run test:services    # Test services only
npm run test:api         # Test API endpoints only
npm run test:commands    # Test commands only

# Generate coverage report
npm test -- --coverage
```

Open `coverage/lcov-report/index.html` in browser to view detailed coverage.

---

## 🔍 Step 8: Troubleshooting

### Bot Won't Start

**Error: DATABASE_URL is not defined**
```bash
# Check .env file exists
ls .env

# Verify DATABASE_URL format
echo $DATABASE_URL
```

**Error: Invalid connection string**
- Ensure you're using port 5432 (session pooler) not 6543
- Check password doesn't contain special characters (URL encode if needed)

**Error: Cannot find module 'drizzle-orm'**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Commands Not Appearing in Discord

1. **Wait up to 1 hour** for global commands
2. **For faster testing**, use guild-specific commands:
   - Add `GUILD_ID=your_server_id` to `.env`
   - Restart bot
   - Commands appear in 5 seconds

### Verification Fails

**Error: Invalid Solana address**
- Check collection address is valid base58 (32-44 characters)
- No spaces or special characters

**Error: Helius API failed**
- Verify API key in `.env`
- Check Helius dashboard for rate limits

### Database Connection Issues

**Test connection manually:**
```bash
psql "[YOUR_DATABASE_URL]" -c "SELECT 1"
```

**Check active connections:**
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();
```

---

## 📊 Step 9: Monitoring

### View Logs

```bash
# Bot logs (if using PM2)
pm2 logs lil-garg-bot

# Or check log files
ls logs/
```

### Database Queries

Enable query logging in `.env`:
```bash
LOG_LEVEL=debug
```

### API Metrics

```bash
# Health check with uptime
curl http://localhost:30391/health

# Connection stats (add endpoint)
curl http://localhost:30391/api/stats
```

---

## 🎯 Next Steps

### Configure Your First Guild

1. **Add Collection:**
   ```
   /setup collection <address> <name> 1
   ```

2. **Create Discord Role:**
   - Server Settings → Roles
   - Create "NFT Holder" role

3. **Map Role:**
   ```
   /setup role @NFT Holder <collection> 1
   ```

4. **Test Verification:**
   ```
   /verify
   ```

### Set Up Re-verification Job

Add to your deployment config (Fly.io, Heroku, etc.):

```bash
# Run re-verification daily at 2 AM
0 2 * * * node src/jobs/reverification.js
```

### Enable HTTPS for API

For production, use HTTPS:

```bash
# Generate self-signed cert (development)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365

# Update .env
API_HTTPS_PORT=30392
```

---

## 🆘 Getting Help

### Common Issues

| Issue | Solution |
|-------|----------|
| Bot offline | Check token, internet connection |
| Commands not working | Wait 1 hour or use GUILD_ID |
| Database errors | Verify connection string |
| Verification fails | Check Helius API key |

### Support Channels

- **GitHub Issues:** [Create issue](https://github.com/your-repo/issues)
- **Discord:** [Join support server](your-discord-link)
- **Documentation:** See `ARCHITECTURE.md`

---

## 📝 Checklist

Before going to production:

- [ ] All tests passing (`npm test`)
- [ ] Database migrations applied
- [ ] Environment variables set (no defaults)
- [ ] Bot invited to server with correct permissions
- [ ] Slash commands registered
- [ ] HTTPS enabled for API
- [ ] Logging configured
- [ ] Rate limiting enabled
- [ ] Backup strategy in place
- [ ] Monitoring alerts configured

---

## 🎉 Success!

Your multi-tenant NFT verification bot is now running! 

**What you can do now:**
- ✅ Add the bot to multiple servers
- ✅ Each server configures their own collections
- ✅ Users verify via shared frontend
- ✅ Roles assigned automatically
- ✅ Audit trail for all actions

**Scale to 500+ guilds:**
- Add Redis for caching
- Enable connection pooling
- Set up monitoring (DataDog, New Relic)
- Configure auto-scaling

---

**Last Updated:** 2026-01-01  
**Version:** 2.0.0
