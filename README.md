---
title: Lil Gargs Bot
emoji: 🐲
colorFrom: purple
colorTo: blue
sdk: docker
app_file: src/index.js
pinned: false
---

# Lil Gargs Bot 🐲
A multi-tenant Discord NFT verification bot with AI-powered features, pet system, and ticket management.

## 🌐 Hosted on Hugging Face Spaces
This bot is deployed on **Hugging Face Spaces** using Docker. The Space runs 24/7 with automatic keep-alive on port `7860`.

## ✨ Features
- 💎 **NFT Verification** - Verify Solana NFT ownership and assign roles automatically
- 🤖 **AI Chatbot** - Powered by Google Gemini for intelligent conversations
- 🐲 **Pet System** - Adopt, train, and battle with custom Lil Garg pets
- 🎫 **Ticket System** - Create and manage support tickets with staff assignment
- 🔒 **Multi-Tenant** - Support for multiple Discord servers with independent configurations
- 📊 **NFT Monitoring** - Real-time monitoring of NFT holdings and transfers
- 🔄 **Redis Caching** - Optimized performance with Redis-based caching
- 📝 **Comprehensive Logging** - Winston-powered structured logging

## 🚀 Deployment

### Hugging Face Spaces
The bot is containerized and deployed via Docker:
1. Push code to Hugging Face Space
2. Add required secrets in Space Settings → Repository secrets
3. Space builds automatically using the `Dockerfile`
4. Keep-alive server on port `7860` prevents sleep

### Required Secrets
See [`ENV_VARIABLES.md`](ENV_VARIABLES.md) for the complete list of environment variables.

**Minimum required:**
- `DISCORD_BOT_TOKEN`
- `MONGO_URL`
- `DB_NAME`
- `GEMINI_API_KEY`
- `HELIUS_API_KEY`
- `NFT_CONTRACT_ADDRESS`
- `VERIFIED_CREATOR`
- `DISCORD_CLIENT_ID`

## 🛠️ Local Development
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Start the bot
npm start

# Deploy slash commands
npm run deploy-commands
```

## 📁 Project Structure
lil-garg-bot/
├── src/
│   ├── api/              # Express API routes
│   ├── commands/         # Discord slash commands
│   ├── config/           # Configuration files
│   ├── database/         # Database models and connection
│   ├── events/           # Discord event handlers
│   ├── services/         # Core business logic services
│   ├── utils/            # Utility functions and helpers
│   └── index.js          # Main entry point
├── Dockerfile            # Hugging Face Spaces deployment
├── package.json          # Dependencies and scripts
└── ENV_VARIABLES.md      # Environment variables documentation

## 🔗 Useful Links
- [Discord.js Documentation](https://discord.js.org/)
- [Hugging Face Spaces](https://huggingface.co/spaces)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Google Gemini API](https://ai.google.dev/)

## 📄 License
ISC

---
**Need help?** Check the [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) or contact the Lil Gargs team.