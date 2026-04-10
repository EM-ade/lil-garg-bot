# Orihost Deployment Guide for Lil Gargs Bot

## Important Notes

⚠️ **Shared Hosting Limitations**: Orihost shared hosting is designed for web applications, not long-running processes like Discord bots. Your bot may experience:
- Automatic termination after periods of inactivity
- Port changes on restart
- Limited CPU/memory allocation

## Configuration Steps

### 1. Upload Your Files

Upload all project files to your Orihost account via FTP or File Manager:
```
lil-garg-bot/
├── src/
├── package.json
├── .env
```

### 2. Install Dependencies

In Orihost's Terminal or via SSH:
```bash
cd ~/lil-garg-bot
npm install --production
```

### 3. Configure Node.js Application

In your Orihost control panel:

1. Navigate to **Node.js Applications**
2. Click **Create Application**
3. Configure:
   - **Application root**: `lil-garg-bot`
   - **Application URL**: `/` (or a subdomain)
   - **Application startup file**: `src/index.js`
   - **Port**: Leave blank (Orihost will assign automatically)

### 4. Set Environment Variables

In the Orihost control panel, add these environment variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | (auto-assigned by Orihost) |
| `DISCORD_BOT_TOKEN` | Your bot token |
| `MONGO_URL` | Your MongoDB connection string |
| `DB_NAME` | `lil-gargs-cluster` |
| `GEMINI_API_KEY` | Your Gemini API key |
| `HELIUS_API_KEY` | Your Helius API key |
| `NFT_CONTRACT_ADDRESS` | `FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ` |
| `VERIFIED_CREATOR` | `9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA` |
| ... (other vars from .env) | |

### 5. Start the Application

Click **Start** in the Orihost control panel.

## Testing Your Deployment

### Check Health Endpoint

```bash
# Replace with your Orihost domain
curl https://your-domain.onorihost.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-02T17:00:00.000Z",
  "discordConnected": true,
  "port": 12345
}
```

### Test Verification Session Endpoint

```bash
curl https://your-domain.onorihost.com/api/verification/session/<session-token>
```

## Troubleshooting

### Timeout Errors

If you're getting timeout errors:

1. **Check the assigned port**: Orihost assigns a random port. Find it in your control panel or logs.

2. **Verify binding address**: The server now binds to `0.0.0.0` for external access.

3. **Use the correct URL**: 
   - ❌ Don't use: `http://2.56.246.119:3001` (your server's IP:port)
   - ✅ Use: `https://your-domain.onorihost.com` (Orihost's proxy URL)

### Bot Not Connecting to Discord

Check logs for:
- Invalid token errors
- Rate limiting issues
- Network connectivity problems

### Application Keeps Stopping

Shared hosting may terminate long-running processes. Consider:
- Using a VPS instead (DigitalOcean, Linode, etc.)
- Using a bot-specific hosting service (Discloud, Railway, etc.)

## Logs

View logs in Orihost control panel under **Logs** → **Node.js Logs**

Or via SSH:
```bash
tail -f ~/lil-garg-bot/logs/*.log
```

## Alternative: Use a VPS

For better reliability with Discord bots, consider migrating to:

1. **Railway.app** - Free tier available, easy deployment
2. **Render.com** - Free tier, good for bots
3. **DigitalOcean** - $5/month droplet
4. **Oracle Cloud Free Tier** - Always free ARM instances

### Deploy to Railway (Recommended)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Create new project → Deploy from GitHub
4. Add all environment variables
5. Deploy!

## Support

If issues persist, check:
- Orihost documentation for Node.js apps
- Discord Developer Portal for bot status
- MongoDB Atlas for connection issues
