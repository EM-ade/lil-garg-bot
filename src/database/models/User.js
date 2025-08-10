const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord user information
    discordId: {
        type: String,
        required: true,
        unique: true,
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

// Indexes for better query performance
userSchema.index({ discordId: 1, isVerified: 1 });
userSchema.index({ walletAddress: 1, isVerified: 1 });
userSchema.index({ lastVerificationCheck: 1 });

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
