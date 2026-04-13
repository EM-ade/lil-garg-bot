# Lil Gargs Bot - Developer Guide

## Overview

**Lil Gargs Bot** is a multi-tenant Discord bot serving multiple Discord servers with isolated NFT verification per server. It supports NFT ownership verification, welcome messages, ticketing, pet systems, battle arenas, and AI chatbot features.

- **Bot Client ID:** `1403343230900109332`
- **Frontend URL:** `https://discord.lilgarg.xyz`
- **API Ports:** HTTP: `30391`, HTTPS: `30392`
- **Location:** `C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot`

---

## Architecture

### Database
- **Primary:** MongoDB (`lil-gargs-cluster`)
- **Primary Model:** `BotConfig` - stores all guild-specific configuration
- **Other Models:** `User`, `Ticket`, `Pet`, `Document`, etc.
- **PostgreSQL:** Schema ready for migration (not yet active)

### BotConfig Structure
The `BotConfig` model is the central configuration store for each guild. Key fields:
```js
{
  guildId: String,
  guildName: String,
  nftVerification: {
    enabled: Boolean,
    collections: [
      {
        contractAddress: String,
        contractName: String,
        requiredNftCount: Number,
        roleId: String,
        roleName: String,
        minNftCount: Number,
        maxNftCount: Number,
        createdAt: Date,
        updatedAt: Date
      }
    ],
    autoRoleAssignment: Boolean,
    reverificationInterval: Number
  },
  welcomeChannelId: String,
  behavior: {
    welcomeMessage: { enabled: Boolean, message: String }
  },
  petSystem: { enabled: Boolean },
  ticketSystem: { enabled: Boolean, staffRoleIds: [String], maxTicketsPerUser: Number },
  battleSystem: { enabled: Boolean },
  aiChat: { enabled: Boolean, allowedChannels: [String] },
  security: { lockdown: { active: Boolean } }
}
```

---

## Slash Commands

### Deployed Commands (6 total, registered globally)

| Command | Subcommands | Permission | Description |
|---------|-------------|------------|-------------|
| `/setup` | `collection`, `role`, `remove`, `dashboard` | Administrator | Configure NFT verification |
| `/config` | `view`, `reset` | Administrator | View/manage bot configuration |
| `/verify` | — | Everyone | Start NFT verification |
| `/wallet` | `show`, `unlink` | Everyone | Manage linked wallet |
| `/reverify` | — | Everyone | Re-check NFT ownership |
| `/welcome` | `setup`, `disable`, `test` | Administrator | Manage welcome messages |

### Command Files
- `src/commands/setup.js` - Collection & role management
- `src/commands/config.js` - View/reset configuration
- `src/commands/verify.js` - User verification
- `src/commands/wallet.js` - Wallet management
- `src/commands/reverify.js` - Re-verification
- `src/commands/welcome.js` - Welcome system
- Many more: `ticket.js`, `pet.js`, `battle.js`, `gargoracle.js`, `nft-monitor.js`, etc.

### Deprecated Commands (NOT loaded, NOT deployed)
- `add-nft-contract.js`
- `config-nft-role.js`
- `remove-verification.js`
- `set-verification-log-channel.js`
- `setup-verification.js`

These are listed in both `src/utils/commandLoader.js` and `src/deploy-commands.js` under `deprecatedCommandFiles`.

---

## Key Code Patterns

### Interaction Response Pattern (Critical!)
All command handlers **MUST** call `deferReply()` as the **first async operation** to avoid Discord's 3-second interaction timeout:

```js
async function handleSomething(interaction) {
  const someOption = interaction.options.getString("option", true);
  
  // MUST defer immediately
  await interaction.deferReply({ flags: 64 });
  
  // THEN do async work
  const data = await SomeModel.findOne({ ... });
  
  // Then editReply
  await interaction.editReply({ embeds: [embed] });
}
```

**Do NOT** call `interaction.reply()` if the handler may do database writes — always `deferReply()` first.

### Error Handler
The `ErrorHandler` class (`src/utils/errorHandler.js`) handles errors correctly:
```js
if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
} else {
    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
}
```

### Command Loading
Commands are loaded in `src/utils/commandLoader.js`:
1. Reads all `.js` files from `src/commands/`
2. Filters out deprecated files
3. Validates `data` and `execute` properties exist
4. Adds to `client.commands` collection

### Command Deployment
```bash
npm run deploy:mt        # Deploys via scripts/deploy-mt-commands.js
```
The deploy script builds command definitions using `SlashCommandBuilder` and pushes them to Discord via `Routes.applicationCommands(clientId)`.

---

## Services

| Service | File | Purpose |
|---------|------|---------|
| AIChatbot | `src/services/aiChatbot.js` | Gemini AI chat & welcome messages |
| NFTVerification | `src/services/nftVerification.js` | Solana NFT ownership checks |
| NFTMonitoring | `src/services/nftMonitoringService.js` | Automated NFT re-verification |
| PetMaintenance | `src/services/petMaintenanceService.js` | Pet upkeep automation |
| ChatManager | `src/services/chatManager.js` | Chat routing & management |
| SecurityManager | `src/utils/securityManager.js` | Permissions & lockdown |
| RateLimiter | `src/utils/rateLimiter.js` | Per-user & global rate limiting |

---

## Environment Variables

Key `.env` variables:
```env
DISCORD_BOT_TOKEN=...
CLIENT_ID=1403343230900109332
MONGO_URL=mongodb+srv://...
DATABASE_URL=postgresql://...   # Future use
FRONTEND_URL=https://discord.lilgarg.xyz
GEMINI_API_KEY=...
HELIUS_API_KEY=...
JWT_SECRET=...
ADMIN_ROLE_NAME=Admin
```

---

## How to Add a New Command

1. Create `src/commands/yourCommand.js` with:
```js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { BotConfig } = require("../database/models");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yourcommand")
    .setDescription("Description here"),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    // ... your logic
    await interaction.editReply({ embeds: [embed] });
  },
};
```

2. Add the command definition to `scripts/deploy-mt-commands.js` in the `commands` array.

3. Run `npm run deploy:mt` to register with Discord.

4. Restart the bot to load the new command handler.

---

## How to Run

```bash
npm start          # Production
npm run dev        # Development (if configured)
npm run deploy:mt  # Deploy slash commands
```

---

## Known Issues / Technical Debt

1. **MongoDB still primary** — PostgreSQL schema is ready but services are TypeScript and need compilation/conversion to JavaScript.
2. **User model** — The `User` model has fields: `discord_id`, `guild_id`, `wallet_address`, `is_verified`, `last_verification_check`. Check `src/database/models/index.js` for the full schema.
3. **NFTVerificationService** — `src/services/nftVerification.js` may need review for the `verifyNFTOwnership(walletAddress, options)` method signature used by `reverify.js`.
4. **Two bot instances** — There may be a legacy bot ("lil-garg") running alongside "Lil Gargs Bot". Only Client ID `1403343230900109332` is active for this codebase.

---

## File Structure (Key Files)

```
lil-garg-bot/
├── src/
│   ├── index.js                    # Bot entry point, event handlers
│   ├── deploy-commands.js          # Deploy commands (auto-deprecated filter)
│   ├── config/
│   │   └── environment.js          # Env config loader
│   ├── commands/                   # All command handlers
│   │   ├── setup.js                # /setup (collection, role, remove, dashboard)
│   │   ├── config.js               # /config (view, reset)
│   │   ├── verify.js               # /verify
│   │   ├── wallet.js               # /wallet (show, unlink)
│   │   ├── reverify.js             # /reverify
│   │   ├── welcome.js              # /welcome (setup, disable, test)
│   │   └── ...                     # Many other commands
│   ├── database/
│   │   ├── connection.js           # MongoDB connection
│   │   └── models/
│   │       └── index.js            # Model exports
│   ├── services/                   # Business logic services
│   └── utils/
│       ├── commandLoader.js        # Loads commands from disk
│       ├── errorHandler.js         # Error handling & retries
│       ├── logger.js               # Winston logger
│       └── rateLimiter.js          # Rate limiting
├── scripts/
│   └── deploy-mt-commands.js       # Command deployment script
├── .env                            # Environment variables
└── package.json
```

---

## Contact / Context

This document was generated on 2026-04-04 after fixing command loading issues where deprecated commands were causing "Unknown interaction" (Discord error 10062) timeouts. All active commands now properly use `deferReply()` before async operations and use the `BotConfig` model for data persistence.
