# Administrator Guide

This guide covers administrative tasks and configuration for the Lil Gargs Discord Bot.

## Initial Setup

### 1. Bot Configuration

After deploying the bot, configure it for your server:

1. **Invite the bot** to your Discord server with appropriate permissions
2. **Run initial commands** to set up the bot
3. **Configure roles and channels** as needed

### 2. Required Permissions

The bot needs these Discord permissions:
- **Send Messages** - To respond to commands
- **Use Slash Commands** - To register and use slash commands
- **Manage Roles** - To assign/remove verified roles
- **Read Message History** - To process messages
- **Embed Links** - To send rich embeds
- **Attach Files** - For document management

### 3. Role Setup

The bot will automatically create a verified role if it doesn't exist:
- Default name: "Lil Gargs Holder"
- Customizable via `VERIFIED_ROLE_NAME` environment variable
- Green color (#00ff00)
- No special permissions by default

## Administrative Commands

### User Management

#### Check User Status
```
/status
```
Shows verification status, NFT count, and bot statistics.

#### Manual Role Management
If automatic role assignment fails, manually assign roles through Discord's interface.

### Document Management

#### Adding Documents
```
/add-document file:document.txt title:"Guide Title" description:"Description" category:guide tags:"tag1,tag2"
```

**Supported file types:**
- `.txt` - Plain text
- `.md` - Markdown
- `.pdf` - PDF documents
- `.docx` - Word documents
- `.json` - JSON data

**Categories:**
- `general` - General information
- `faq` - Frequently asked questions
- `guide` - How-to guides
- `rules` - Server rules
- `lore` - Lil Gargs lore/story
- `technical` - Technical documentation

#### Removing Documents
```
/remove-document document_id:507f1f77bcf86cd799439011
```

Get document IDs from `/list-documents` command.

#### Viewing Documents
```
/list-documents category:faq page:1
```

### Knowledge Base Management

#### Best Practices for Documents

1. **Clear Titles**: Use descriptive titles that users might search for
2. **Good Descriptions**: Add helpful descriptions for context
3. **Proper Categories**: Categorize documents appropriately
4. **Relevant Tags**: Use tags that users might search for
5. **Quality Content**: Ensure content is accurate and up-to-date

#### Document Organization

```
General Structure:
├── FAQ Documents
│   ├── "What is Lil Gargs?"
│   ├── "How to buy Lil Gargs?"
│   └── "Roadmap and Future Plans"
├── Guides
│   ├── "Setting up a Solana Wallet"
│   ├── "How to Verify NFT Ownership"
│   └── "Using the Discord Bot"
├── Rules
│   ├── "Community Guidelines"
│   └── "Trading Rules"
└── Lore
    ├── "Lil Gargs Origin Story"
    └── "Character Backgrounds"
```

## Configuration Management

### Environment Variables

#### Core Settings
```bash
# Bot Identity
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_guild_id  # Optional: for faster command deployment

# Database
MONGO_URL=your_mongodb_url
DB_NAME=lil-gargs-cluster

# AI Configuration
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash
MAX_TOKENS=1000
TEMPERATURE=0.7

# NFT Verification
HELIUS_API_KEY=your_helius_key
NFT_CONTRACT_ADDRESS=FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ
VERIFIED_CREATOR=9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA
```

#### Role Configuration
```bash
VERIFIED_ROLE_NAME=Lil Gargs Holder
ADMIN_ROLE_NAME=Admin
LOG_CHANNEL_NAME=bot-logs
```

#### Feature Toggles
```bash
NODE_ENV=production
LOG_LEVEL=info
DEBUG_MODE=false
```

### Database Configuration

The bot automatically creates necessary database collections:

#### Users Collection
Stores user verification data:
- Discord ID and username
- Wallet addresses
- NFT ownership records
- Verification history
- Role assignments

#### Documents Collection
Stores knowledge base documents:
- Document content and metadata
- Processing status
- Usage statistics
- Embeddings for AI retrieval

#### BotConfig Collection
Stores server-specific configuration:
- Role and channel IDs
- Feature toggles
- Usage statistics

## Monitoring and Maintenance

### Log Monitoring

#### Log Files
```bash
logs/
├── combined.log    # All log entries
├── error.log       # Error entries only
└── pm2-*.log       # PM2 process logs (if using PM2)
```

#### Important Log Events
- User verifications
- Document uploads/removals
- AI query processing
- Error conditions
- Rate limit violations

### Health Checks

#### Bot Status Indicators
1. **Discord Connection**: Bot shows as online
2. **Database Connection**: No connection errors in logs
3. **Command Responses**: Commands respond normally
4. **AI Functionality**: `/ask` command works
5. **NFT Verification**: `/verify` command works

#### Troubleshooting Commands
```bash
# Check bot process
pm2 status lil-gargs-bot

# View recent logs
pm2 logs lil-gargs-bot --lines 50

# Restart bot
pm2 restart lil-gargs-bot

# Check database connection
mongo "your_mongo_url"
```

### Performance Monitoring

#### Key Metrics
- Command response times
- Database query performance
- Memory usage
- API rate limit usage
- Error rates

#### Optimization Tips
1. **Regular Database Cleanup**: Remove old verification history
2. **Document Management**: Remove unused documents
3. **Log Rotation**: Implement log rotation to prevent disk space issues
4. **Memory Monitoring**: Watch for memory leaks

## Security Management

### Access Control

#### Admin Permissions
Users with admin permissions can:
- Add/remove documents
- View all bot statistics
- Access configuration commands

#### Permission Levels
1. **Server Administrator**: Full Discord admin permissions
2. **Manage Guild**: Can manage server settings
3. **Admin Role**: Users with configured admin role
4. **Moderator Role**: Users with configured moderator role

### Security Best Practices

1. **API Key Security**
   - Never share API keys
   - Rotate keys regularly
   - Use environment variables only
   - Monitor API usage

2. **Database Security**
   - Use strong passwords
   - Restrict network access
   - Regular backups
   - Monitor access logs

3. **Bot Security**
   - Minimal required permissions
   - Regular updates
   - Input validation
   - Rate limiting

## Backup and Recovery

### Database Backup

#### Automated Backup Script
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/path/to/backups"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
mongodump --uri="$MONGO_URL" --out="$BACKUP_DIR/db_$DATE"

# Backup documents
tar -czf "$BACKUP_DIR/documents_$DATE.tar.gz" documents/

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "db_*" -mtime +7 -exec rm -rf {} \;
find $BACKUP_DIR -name "documents_*" -mtime +7 -delete

echo "Backup completed: $DATE"
```

#### Recovery Process
```bash
# Restore database
mongorestore --uri="$MONGO_URL" --drop /path/to/backup/db_backup

# Restore documents
tar -xzf /path/to/backup/documents_backup.tar.gz

# Restart bot
pm2 restart lil-gargs-bot
```

## Troubleshooting

### Common Issues

#### 1. Bot Not Responding
**Symptoms**: Commands don't work, bot appears offline
**Solutions**:
- Check bot token validity
- Verify Discord permissions
- Check network connectivity
- Review error logs

#### 2. NFT Verification Failing
**Symptoms**: `/verify` command always fails
**Solutions**:
- Verify Helius API key
- Check NFT contract address
- Test with known NFT holder
- Check API rate limits

#### 3. AI Not Working
**Symptoms**: `/ask` command returns errors
**Solutions**:
- Verify Gemini API key
- Check document processing status
- Review AI service logs
- Test with simple questions

#### 4. Database Connection Issues
**Symptoms**: Bot starts but commands fail
**Solutions**:
- Check MongoDB connection string
- Verify database credentials
- Test network connectivity
- Check database server status

### Error Codes

The bot uses error codes for easier troubleshooting:
- `NET_001`: Network/connectivity issues
- `DB_001`: Database-related errors
- `PERM_001`: Permission-related errors
- `NFT_001`: NFT verification errors
- `AI_001`: AI service errors
- `FILE_001`: File/document errors
- `RATE_001`: Rate limiting errors
- `GEN_001`: General errors

## Updates and Maintenance

### Regular Maintenance Tasks

#### Weekly
- Review error logs
- Check API usage/limits
- Monitor bot performance
- Verify backup completion

#### Monthly
- Update dependencies
- Review and clean old data
- Check security updates
- Analyze usage statistics

#### Quarterly
- Full security review
- Performance optimization
- Documentation updates
- Feature planning

### Update Process

1. **Backup Current State**
   ```bash
   # Backup database and documents
   ./backup.sh
   ```

2. **Update Code**
   ```bash
   git pull origin main
   npm install
   ```

3. **Deploy Commands** (if changed)
   ```bash
   npm run deploy-commands
   ```

4. **Restart Bot**
   ```bash
   pm2 restart lil-gargs-bot
   ```

5. **Verify Functionality**
   - Test key commands
   - Check logs for errors
   - Monitor for issues

## Support and Resources

### Getting Help

1. **Check Logs**: Always check logs first
2. **Review Documentation**: Consult this guide and README
3. **Test Components**: Isolate the issue
4. **Community Support**: Reach out to the development team

### Useful Resources

- [Discord.js Documentation](https://discord.js.org/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Google Gemini AI Documentation](https://ai.google.dev/)
- [Helius API Documentation](https://docs.helius.xyz/)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)

### Emergency Contacts

In case of critical issues:
1. Stop the bot: `pm2 stop lil-gargs-bot`
2. Check logs for errors
3. Contact development team
4. Implement temporary measures if needed
