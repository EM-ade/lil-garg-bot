# Lil Gargs Discord Bot

A comprehensive Discord bot for the Lil Gargs NFT community featuring NFT verification and AI-powered chatbot capabilities.

## Features

### 🔐 NFT Verification System
- Verify Solana wallet ownership of Lil Gargs NFTs
- Automatic role assignment for verified holders
- Support for multiple NFTs per user
- Verification history tracking
- Re-verification capabilities

### 🤖 AI-Powered Chatbot
- Google Gemini AI integration
- Document-based knowledge system
- Context-aware responses
- Admin-managed knowledge base
- Rate limiting and error handling

### 📚 Document Management
- Upload documents to knowledge base
- Support for multiple file formats (.txt, .md, .pdf, .docx)
- Document categorization and tagging
- Search and retrieval system
- Usage analytics

### ⚙️ Administration Features
- Role-based permissions
- Comprehensive logging
- Rate limiting
- Error handling
- Configuration management

## Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB database
- Discord Bot Token
- Google Gemini API Key
- Helius API Key (for Solana NFT verification)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd new-lil-gargs-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Deploy commands**
   ```bash
   node src/deploy-commands.js
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following:

#### Required Variables
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `GEMINI_API_KEY` - Google Gemini API key
- `HELIUS_API_KEY` - Helius API key for Solana
- `NFT_CONTRACT_ADDRESS` - Lil Gargs contract address
- `VERIFIED_CREATOR` - Verified creator address

#### Optional Variables
- `DISCORD_GUILD_ID` - For guild-specific commands
- `VERIFIED_ROLE_NAME` - Name of verified role (default: "Lil Gargs Holder")
- `ADMIN_ROLE_NAME` - Name of admin role (default: "Admin")
- `LOG_CHANNEL_NAME` - Log channel name (default: "bot-logs")

### Discord Bot Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application
   - Go to "Bot" section
   - Create bot and copy token

2. **Set Bot Permissions**
   Required permissions:
   - Send Messages
   - Use Slash Commands
   - Manage Roles
   - Read Message History
   - Embed Links
   - Attach Files

3. **Invite Bot to Server**
   - Go to "OAuth2" > "URL Generator"
   - Select "bot" and "applications.commands"
   - Select required permissions
   - Use generated URL to invite bot

## Commands

### User Commands

#### `/verify <wallet>`
Verify NFT ownership with your Solana wallet address.
- **Parameters**: `wallet` - Your Solana wallet address
- **Example**: `/verify 9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA`

#### `/ask <question>`
Ask the AI assistant about Lil Gargs.
- **Parameters**: `question` - Your question (3-500 characters)
- **Example**: `/ask What is the Lil Gargs collection about?`

#### `/status`
Check your verification status and bot statistics.

#### `/list-documents [category] [page]`
View documents in the knowledge base.
- **Parameters**: 
  - `category` (optional) - Filter by category
  - `page` (optional) - Page number

### Admin Commands

#### `/add-document <file> [title] [description] [category] [tags]`
Add a document to the AI knowledge base.
- **Parameters**:
  - `file` - Document file (.txt, .md, .pdf, .docx)
  - `title` (optional) - Document title
  - `description` (optional) - Document description
  - `category` (optional) - Document category
  - `tags` (optional) - Comma-separated tags

#### `/remove-document <document_id>`
Remove a document from the knowledge base.
- **Parameters**: `document_id` - ID of document to remove

## File Structure

```
src/
├── commands/           # Discord slash commands
├── config/            # Configuration files
├── database/          # Database models and connection
├── services/          # Core services (NFT, AI, Documents)
├── utils/             # Utility functions
└── index.js           # Main bot file

documents/             # Uploaded documents storage
logs/                  # Log files
```

## Database Schema

### Users Collection
- Discord user information
- NFT verification status
- Wallet addresses
- Verification history
- Role assignments

### Documents Collection
- Document metadata
- Content and embeddings
- Usage statistics
- Processing status

### BotConfig Collection
- Guild-specific configuration
- Role and channel settings
- Feature toggles
- Statistics

## API Integration

### Helius API (Solana NFTs)
- NFT ownership verification
- Collection validation
- Metadata retrieval

### Google Gemini AI
- Natural language processing
- Context-aware responses
- Document-based knowledge

## Error Handling

The bot includes comprehensive error handling:
- User-friendly error messages
- Detailed logging
- Automatic retry for transient errors
- Rate limiting protection
- Graceful degradation

## Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All log entries
- `error.log` - Error entries only
- Console output in development

## Rate Limiting

Built-in rate limiting prevents abuse:
- Per-user command limits
- Global command limits
- Configurable time windows
- Automatic cleanup

## Security

- Input validation on all commands
- File type restrictions
- Size limits on uploads
- Permission-based access control
- Secure environment variable handling

## Troubleshooting

### Common Issues

1. **Bot not responding to commands**
   - Check bot permissions
   - Verify commands are deployed
   - Check bot token validity

2. **NFT verification failing**
   - Verify Helius API key
   - Check wallet address format
   - Confirm NFT contract address

3. **AI responses not working**
   - Check Gemini API key
   - Verify documents are uploaded
   - Check document processing status

4. **Database connection errors**
   - Verify MongoDB URL
   - Check network connectivity
   - Confirm database permissions

### Support

For additional support:
1. Check the logs in `logs/` directory
2. Review error messages in Discord
3. Verify environment configuration
4. Check API key validity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.
