# Discord Bot Troubleshooting Guide

## "The application did not respond" Error

This error occurs when Discord doesn't receive a response from your bot within 3 seconds. Here's how to fix it:

### Step 1: Check Bot Status

First, verify your bot is running:

```bash
# Check Fly.io app status
fly status

# View real-time logs
fly logs -f
```

### Step 2: Deploy Commands

The most common cause is missing slash commands. Deploy them:

```bash
# SSH into your Fly.io app
fly ssh console

# Run the debug script to check and deploy commands
node debug-commands.js

# Or use the original deploy script
node src/deploy-commands.js

# Exit the container
exit
```

### Step 3: Verify Environment Variables

Check that all required secrets are set:

```bash
# List all secrets
fly secrets list

# Required variables:
# - DISCORD_TOKEN
# - CLIENT_ID  
# - GUILD_ID (optional, for faster command deployment)
# - MONGODB_URI
# - GEMINI_API_KEY
# - HELIUS_API_KEY
# - NODE_ENV
```

### Step 4: Check Bot Permissions

Ensure your bot has the correct permissions in Discord:

1. **Bot Permissions** (when adding to server):
   - `applications.commands` - For slash commands
   - `bot` - Basic bot functionality
   - `Send Messages` - To respond to commands
   - `Use Slash Commands` - To register commands

2. **OAuth2 Scopes**:
   - `bot`
   - `applications.commands`

### Step 5: Verify Bot is in Server

Make sure your bot is actually in the Discord server:

1. Check the member list - your bot should appear
2. Bot should show as "Online" (green dot)
3. If offline, check the logs for connection errors

### Step 6: Test with Simple Command

Try a basic command first:
- `/help` - Should show help information
- `/status` - Should show bot status

### Step 7: Check Logs for Errors

Look for specific error messages:

```bash
fly logs
```

Common error patterns:
- `DiscordAPIError[50001]: Missing Access` - Bot lacks permissions
- `DiscordAPIError[50035]: Invalid Form Body` - Command structure issue
- `Invalid token` - Wrong DISCORD_TOKEN
- `Connection timeout` - Network/database issues

### Step 8: Database Connection Issues

If commands deploy but still don't respond:

```bash
# Check if MongoDB is accessible
fly ssh console
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ Database error:', err));
"
```

### Step 9: Manual Command Registration

If automatic deployment fails, try manual registration:

```bash
# In your Fly.io console
fly ssh console

# Run this to see what commands are loaded
node -e "
const fs = require('fs');
const commands = fs.readdirSync('./src/commands').filter(f => f.endsWith('.js'));
console.log('Command files:', commands);
commands.forEach(file => {
  try {
    const cmd = require('./src/commands/' + file);
    console.log('✅', file, '- Name:', cmd.data?.name);
  } catch (e) {
    console.log('❌', file, '- Error:', e.message);
  }
});
"
```

### Step 10: Restart the Bot

Sometimes a simple restart fixes issues:

```bash
# Restart your Fly.io app
fly apps restart your-app-name

# Or redeploy
fly deploy
```

## Common Solutions

### Solution 1: Missing GUILD_ID
Add your Discord server ID for faster command deployment:

```bash
fly secrets set GUILD_ID="your_discord_server_id"
```

### Solution 2: Command Timeout Issues
If commands are slow, increase timeout handling in your code or optimize database queries.

### Solution 3: Rate Limiting
If you're hitting Discord's rate limits, the bot may not respond. Check logs for rate limit messages.

### Solution 4: Memory Issues
Scale up if the bot is running out of memory:

```bash
fly scale memory 1024
```

## Debug Commands

Use the included `debug-commands.js` script:

```bash
# Local testing (with .env file)
node debug-commands.js

# On Fly.io
fly ssh console
node debug-commands.js
```

This script will:
- ✅ Check all command files load correctly
- ✅ Verify environment variables
- ✅ Deploy commands with detailed logging
- ✅ Show exactly what commands were registered

## Quick Checklist

- [ ] Bot is online in Discord server
- [ ] All environment variables are set (`fly secrets list`)
- [ ] Commands are deployed (`node debug-commands.js`)
- [ ] Bot has correct permissions in server
- [ ] Database connection is working
- [ ] No errors in logs (`fly logs`)
- [ ] Bot responds to `/help` command

## Still Not Working?

If none of the above solutions work:

1. **Check Discord Developer Portal**:
   - Verify bot token is correct
   - Check if bot is disabled
   - Regenerate token if needed

2. **Test Locally**:
   - Copy `.env.example` to `.env`
   - Add your tokens
   - Run `npm run dev`
   - Test commands locally

3. **Contact Support**:
   - Share the output of `fly logs`
   - Share the output of `node debug-commands.js`
   - Provide your bot's permissions and setup details

The debug script and this guide should resolve 99% of "application did not respond" errors!