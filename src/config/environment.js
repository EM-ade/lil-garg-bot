require('dotenv').config();

const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'MONGO_URL',
    'DB_NAME',
    'GEMINI_API_KEY',
    'HELIUS_API_KEY',
    'NFT_CONTRACT_ADDRESS',
    'VERIFIED_CREATOR'
];

function validateEnvironment() {
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

const config = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_BOT_TOKEN,
        guildId: process.env.DISCORD_GUILD_ID, // Optional: for guild-specific commands
    },
    
    // Database Configuration
    database: {
        url: process.env.MONGO_URL,
        name: process.env.DB_NAME,
    },
    
    // AI Configuration
    ai: {
        geminiApiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        maxTokens: parseInt(process.env.MAX_TOKENS) || 1000,
        temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
    },
    
    // NFT/Solana Configuration
    nft: {
        heliusApiKey: process.env.HELIUS_API_KEY,
        contractAddress: process.env.NFT_CONTRACT_ADDRESS,
        verifiedCreator: process.env.VERIFIED_CREATOR,
        ipfsImageFolder: process.env.IPFS_IMAGE_FOLDER,
        ipfsJsonFolder: process.env.IPFS_JSON_FOLDER,
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    },
    
    // Bot Configuration
    bot: {
        verifiedRoleName: process.env.VERIFIED_ROLE_NAME || 'Lil Gargs Holder',
        adminRoleName: process.env.ADMIN_ROLE_NAME || 'Admin',
        logChannelName: process.env.LOG_CHANNEL_NAME || 'bot-logs',
    },
    
    // Development Configuration
    development: {
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
        debugMode: process.env.DEBUG_MODE === 'true',
    }
};

// Validate environment on module load
validateEnvironment();

module.exports = config;
