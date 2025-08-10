# Deployment Guide

This guide covers deploying the Lil Gargs Discord Bot to various platforms.

## Prerequisites

Before deploying, ensure you have:
- All required API keys and tokens
- MongoDB database set up
- Discord bot created and configured
- Environment variables configured

## Local Development

### Setup
```bash
# Clone repository
git clone <repository-url>
cd new-lil-gargs-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Deploy commands to Discord
node src/deploy-commands.js

# Start development server
npm run dev
```

### Development Scripts
```bash
# Start with auto-restart
npm run dev

# Start production mode
npm start

# Deploy commands only
npm run deploy-commands

# Run tests (if implemented)
npm test
```

## Production Deployment

### Option 1: VPS/Dedicated Server

#### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash lilgargs
sudo usermod -aG sudo lilgargs
```

#### 2. Application Deployment
```bash
# Switch to application user
sudo su - lilgargs

# Clone repository
git clone <repository-url>
cd new-lil-gargs-bot

# Install dependencies
npm install --production

# Configure environment
cp .env.example .env
# Edit .env with production values

# Deploy Discord commands
node src/deploy-commands.js

# Start with PM2
pm2 start src/index.js --name "lil-gargs-bot"
pm2 save
pm2 startup
```

#### 3. PM2 Configuration
Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'lil-gargs-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
```

Start with ecosystem:
```bash
pm2 start ecosystem.config.js
```

### Option 2: Docker Deployment

#### 1. Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/
COPY .env.example ./

# Create logs and documents directories
RUN mkdir -p logs documents

# Expose port (if needed for health checks)
EXPOSE 3000

# Start application
CMD ["node", "src/index.js"]
```

#### 2. Create docker-compose.yml
```yaml
version: '3.8'

services:
  lil-gargs-bot:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
      - ./documents:/app/documents
    depends_on:
      - mongodb

  mongodb:
    image: mongo:6
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongodb_data:
```

#### 3. Deploy with Docker
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f lil-gargs-bot

# Stop services
docker-compose down
```

### Option 3: Cloud Platforms

#### Heroku Deployment

1. **Prepare for Heroku**
```bash
# Install Heroku CLI
# Create Procfile
echo "worker: node src/index.js" > Procfile

# Create package.json scripts
npm pkg set scripts.start="node src/index.js"
npm pkg set scripts.deploy-commands="node src/deploy-commands.js"
```

2. **Deploy to Heroku**
```bash
# Login and create app
heroku login
heroku create lil-gargs-bot

# Set environment variables
heroku config:set DISCORD_BOT_TOKEN=your_token
heroku config:set MONGO_URL=your_mongo_url
# ... set all required variables

# Deploy
git add .
git commit -m "Deploy to Heroku"
git push heroku main

# Deploy commands
heroku run npm run deploy-commands

# Scale worker
heroku ps:scale worker=1
```

#### Railway Deployment

1. **Connect Repository**
   - Go to [Railway](https://railway.app)
   - Connect your GitHub repository
   - Select the repository

2. **Configure Environment**
   - Add all environment variables
   - Set start command: `node src/index.js`

3. **Deploy**
   - Railway will automatically deploy on push
   - Run command deployment: `node src/deploy-commands.js`

#### DigitalOcean App Platform

1. **Create App Spec**
Create `.do/app.yaml`:
```yaml
name: lil-gargs-bot
services:
- name: bot
  source_dir: /
  github:
    repo: your-username/new-lil-gargs-bot
    branch: main
  run_command: node src/index.js
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: NODE_ENV
    value: production
  # Add other environment variables
```

2. **Deploy**
```bash
# Install doctl
# Create app
doctl apps create .do/app.yaml

# Update app
doctl apps update <app-id> .do/app.yaml
```

## Database Setup

### MongoDB Atlas (Recommended)

1. **Create Cluster**
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Create free cluster
   - Configure network access (0.0.0.0/0 for cloud deployment)
   - Create database user

2. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy connection string
   - Replace `<password>` with your password

### Self-Hosted MongoDB

```bash
# Install MongoDB
sudo apt-get install -y mongodb

# Start service
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Create database and user
mongo
> use lil-gargs-cluster
> db.createUser({
    user: "lilgargs",
    pwd: "secure_password",
    roles: ["readWrite"]
  })
```

## Environment Configuration

### Production Environment Variables

```bash
# Required
DISCORD_BOT_TOKEN=your_discord_bot_token
MONGO_URL=your_mongodb_connection_string
DB_NAME=lil-gargs-cluster
GEMINI_API_KEY=your_gemini_api_key
HELIUS_API_KEY=your_helius_api_key
NFT_CONTRACT_ADDRESS=FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ
VERIFIED_CREATOR=9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA

# Production settings
NODE_ENV=production
LOG_LEVEL=info
DEBUG_MODE=false

# Optional
DISCORD_GUILD_ID=your_guild_id
VERIFIED_ROLE_NAME=Lil Gargs Holder
ADMIN_ROLE_NAME=Admin
LOG_CHANNEL_NAME=bot-logs
```

## Monitoring and Maintenance

### Health Checks

Create `src/health.js`:
```javascript
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});
```

### Log Monitoring

```bash
# PM2 logs
pm2 logs lil-gargs-bot

# Docker logs
docker-compose logs -f lil-gargs-bot

# File logs
tail -f logs/combined.log
tail -f logs/error.log
```

### Backup Strategy

```bash
# MongoDB backup
mongodump --uri="your_mongo_url" --out=backup/$(date +%Y%m%d)

# Document backup
tar -czf documents-backup-$(date +%Y%m%d).tar.gz documents/

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
mongodump --uri="$MONGO_URL" --out=backup/$DATE
tar -czf backup/documents-$DATE.tar.gz documents/
# Upload to cloud storage
```

## Security Considerations

### Environment Security
- Never commit `.env` files
- Use secure random passwords
- Rotate API keys regularly
- Use environment-specific configurations

### Network Security
- Use HTTPS for all external APIs
- Restrict MongoDB network access
- Use VPN for server access
- Enable firewall rules

### Application Security
- Keep dependencies updated
- Monitor for security vulnerabilities
- Use rate limiting
- Validate all inputs

## Troubleshooting

### Common Deployment Issues

1. **Bot not starting**
   - Check environment variables
   - Verify API keys
   - Check MongoDB connection

2. **Commands not working**
   - Redeploy commands: `node src/deploy-commands.js`
   - Check bot permissions
   - Verify guild ID (if using guild commands)

3. **Memory issues**
   - Increase memory limits
   - Check for memory leaks
   - Monitor resource usage

4. **Database connection issues**
   - Check network connectivity
   - Verify connection string
   - Check MongoDB status

### Performance Optimization

- Use connection pooling
- Implement caching where appropriate
- Monitor resource usage
- Optimize database queries
- Use CDN for static assets

## Scaling

### Horizontal Scaling
- Use multiple bot instances with different tokens
- Implement load balancing
- Use shared database
- Coordinate between instances

### Vertical Scaling
- Increase server resources
- Optimize memory usage
- Use clustering
- Implement caching

## Maintenance

### Regular Tasks
- Update dependencies
- Monitor logs
- Check API rate limits
- Backup database
- Review security

### Updates
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Restart application
pm2 restart lil-gargs-bot

# Or with Docker
docker-compose pull
docker-compose up -d
```
