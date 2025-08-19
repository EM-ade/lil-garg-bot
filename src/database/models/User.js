const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord user information
    discordId: {
        type: String,
        required: true,
        // Removed unique: true here as discordId is not unique across ALL guilds
        index: true // Kept for general user lookups
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    // userGuildId will be a compound key for uniqueness of a user within a guild
    userGuildId: {
        type: String,
        required: true,
        unique: true, // This ensures uniqueness for a user within a specific guild
        index: true
    },
    username: {
        type: String,
        required: true
    },
    discriminator: {
        type: String,
        default: '0000'
    },
    
    // NFT verification information
    walletAddress: {
        type: String,
        default: null,
        index: true
    },
    isVerified: {
        type: Boolean,
        default: false,
        index: true
    },
    isWhitelisted: { // Added for link whitelist system
        type: Boolean,
        default: false,
        // Removed duplicate index: true from here, it's defined below in userSchema.index
    },
    nftTokens: [{
        mint: String,
        name: String,
        image: String,
        verifiedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Verification history
    verificationHistory: [{
        walletAddress: String,
        verifiedAt: Date,
        nftCount: Number,
        status: {
            type: String,
            enum: ['success', 'failed', 'revoked'],
            default: 'success'
        }
    }],
    
    // Role management
    roles: [{
        roleId: String,
        roleName: String,
        assignedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Timestamps
    firstJoined: {
        type: Date,
        default: Date.now
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    lastVerificationCheck: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Compound index for discordId and guildId if userGuildId is not used as primary unique key
// userSchema.index({ discordId: 1, guildId: 1 }, { unique: true });

// Indexes for better query performance (already had discordId and walletAddress)
// userSchema.index({ discordId: 1 }); // Kept for general user lookups
userSchema.index({ walletAddress: 1, isVerified: 1 });
userSchema.index({ lastVerificationCheck: 1 });
userSchema.index({ isWhitelisted: 1 }); // This is now the single definition for this index

// Instance methods
userSchema.methods.addNFT = function(nftData) {
    const existingNFT = this.nftTokens.find(token => token.mint === nftData.mint);
    if (!existingNFT) {
        this.nftTokens.push(nftData);
    }
    return this.save();
};

userSchema.methods.removeNFT = function(mint) {
    this.nftTokens = this.nftTokens.filter(token => token.mint !== mint);
    return this.save();
};

userSchema.methods.updateVerificationStatus = function(isVerified, walletAddress = null) {
    this.isVerified = isVerified;
    if (walletAddress) {
        this.walletAddress = walletAddress;
    }
    this.lastVerificationCheck = new Date();
    
    // Add to verification history
    this.verificationHistory.push({
        walletAddress: walletAddress || this.walletAddress,
        verifiedAt: new Date(),
        nftCount: this.nftTokens.length,
        status: isVerified ? 'success' : 'failed'
    });
    
    return this.save();
};

module.exports = mongoose.model('User', userSchema);
