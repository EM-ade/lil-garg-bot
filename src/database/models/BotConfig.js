const mongoose = require("mongoose");

const botConfigSchema = new mongoose.Schema(
  {
    // Guild-specific configuration
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    guildName: {
      type: String,
      required: true,
    },

    // Role configuration
    verifiedRoleId: {
      type: String,
      default: null,
    },
    adminRoleIds: [
      {
        type: String,
      },
    ],
    moderatorRoleIds: [
      {
        type: String,
      },
    ],

    // Channel configuration
    logChannelId: {
      type: String,
      default: null,
    },
    verificationChannelId: {
      type: String,
      default: null,
    },
    aiChatChannelIds: [
      {
        type: String,
      },
    ],
    petChannelId: {
      type: String,
      default: null,
    },
    battleChannelId: {
      type: String,
      default: null,
    },
    ticketChannelId: {
      type: String,
      default: null,
    },
    welcomeChannelId: {
      type: String,
      default: null,
    },

    // NFT verification settings
    nftVerification: {
      enabled: {
        type: Boolean,
        default: true,
      },
      requireMinimumNFTs: {
        type: Number,
        default: 1,
      },
      autoRoleAssignment: {
        type: Boolean,
        default: true,
      },
      reverificationInterval: {
        type: Number,
        default: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      },
      roleTiers: [
        {
          nftCount: {
            type: Number,
            required: true,
          },
          roleId: {
            type: String,
            required: true,
          },
          roleName: {
            type: String,
            required: true,
          },
        },
      ],
    },

    // AI chat settings
    aiChat: {
      enabled: {
        type: Boolean,
        default: true,
      },
      allowedChannels: [
        {
          type: String,
        },
      ],
      responseDelay: {
        type: Number,
        default: 1000, // milliseconds
      },
      maxResponseLength: {
        type: Number,
        default: 2000,
      },
      requireMention: {
        type: Boolean,
        default: false,
      },
    },

    // Command permissions
    commandPermissions: {
      verify: {
        allowedRoles: [String],
        allowedUsers: [String],
        cooldown: {
          type: Number,
          default: 60000, // 1 minute
        },
      },
      addDocument: {
        allowedRoles: [String],
        allowedUsers: [String],
        cooldown: {
          type: Number,
          default: 5000, // 5 seconds
        },
      },
      removeDocument: {
        allowedRoles: [String],
        allowedUsers: [String],
        cooldown: {
          type: Number,
          default: 5000, // 5 seconds
        },
      },
    },

    // Bot behavior settings
    behavior: {
      welcomeMessage: {
        enabled: {
          type: Boolean,
          default: true,
        },
        message: {
          type: String,
          default:
            "Welcome to the Lil Gargs community! Use `/verify` to verify your NFT ownership.",
        },
      },
      autoModeration: {
        enabled: {
          type: Boolean,
          default: false,
        },
        deleteInvalidCommands: {
          type: Boolean,
          default: false,
        },
        linkWhitelist: [{ type: String }] // Array of user IDs
      },
    },

    // Pet system settings
    petSystem: {
      enabled: {
        type: Boolean,
        default: false,
      },
      maxPetsPerUser: {
        type: Number,
        default: 1,
      },
      feedCooldown: {
        type: Number,
        default: 4 * 60 * 60 * 1000, // 4 hours
      },
      trainCooldown: {
        type: Number,
        default: 6 * 60 * 60 * 1000, // 6 hours
      },
      playCooldown: {
        type: Number,
        default: 2 * 60 * 60 * 1000, // 2 hours
      },
    },

    // Battle system settings
    battleSystem: {
      enabled: {
        type: Boolean,
        default: false,
      },
      battleTimeout: {
        type: Number,
        default: 10 * 60 * 1000, // 10 minutes
      },
      maxActiveBattles: {
        type: Number,
        default: 10,
      },
      rewardMultiplier: {
        type: Number,
        default: 1.0,
      },
    },

    // Ticket system settings
    ticketSystem: {
      enabled: {
        type: Boolean,
        default: false,
      },
      maxTicketsPerUser: {
        type: Number,
        default: 3,
      },
      autoCloseAfter: {
        type: Number,
        default: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
      staffRoleIds: [
        {
          type: String,
        },
      ],
    },

    // Statistics
    stats: {
      totalVerifications: {
        type: Number,
        default: 0,
      },
      totalAIQueries: {
        type: Number,
        default: 0,
      },
      totalDocuments: {
        type: Number,
        default: 0,
      },
    },

    // Configuration metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      discordId: String,
      username: String,
    },
  },
  {
    timestamps: true,
  }
);

// Instance methods
botConfigSchema.methods.incrementStat = function (statName) {
  if (this.stats[statName] !== undefined) {
    this.stats[statName] += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

botConfigSchema.methods.updateConfig = function (updates, updatedBy) {
  Object.assign(this, updates);
  this.lastUpdated = new Date();
  this.updatedBy = updatedBy;
  return this.save();
};

module.exports = mongoose.model("BotConfig", botConfigSchema);
