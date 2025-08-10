const mongoose = require("mongoose");

const petSchema = new mongoose.Schema(
  {
    // Pet ownership
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    ownerUsername: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },

    // Pet identity
    name: {
      type: String,
      required: true,
      maxlength: 32,
    },
    element: {
      type: String,
      enum: ["Fire", "Ice", "Nature", "Storm", "Shadow"],
      required: true,
    },
    personality: {
      type: String,
      enum: ["Brave", "Curious", "Loyal", "Playful"],
      required: true,
    },

    // Stats
    stats: {
      attack: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
      },
      defense: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
      },
      health: {
        type: Number,
        default: 100,
        min: 1,
        max: 200,
      },
      mood: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
      energy: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
    },

    // Progression
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    experienceToNext: {
      type: Number,
      default: 100,
    },

    // Cooldowns
    cooldowns: {
      lastFed: {
        type: Date,
        default: null,
      },
      lastTrained: {
        type: Date,
        default: null,
      },
      lastPlayed: {
        type: Date,
        default: null,
      },
    },

    // Appearance
    appearance: {
      color: {
        type: String,
        default: "#FF6B35", // Lil Gargs brand color
      },
      accessories: [String],
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Instance methods
petSchema.methods.canFeed = function() {
  if (!this.cooldowns.lastFed) return true;
  const now = new Date();
  const timeSinceLastFed = now - this.cooldowns.lastFed;
  return timeSinceLastFed >= 4 * 60 * 60 * 1000; // 4 hours
};

petSchema.methods.canTrain = function() {
  if (!this.cooldowns.lastTrained) return true;
  const now = new Date();
  const timeSinceLastTrained = now - this.cooldowns.lastTrained;
  return timeSinceLastTrained >= 6 * 60 * 60 * 1000; // 6 hours
};

petSchema.methods.canPlay = function() {
  if (!this.cooldowns.lastPlayed) return true;
  const now = new Date();
  const timeSinceLastPlayed = now - this.cooldowns.lastPlayed;
  return timeSinceLastPlayed >= 2 * 60 * 60 * 1000; // 2 hours
};

petSchema.methods.getMoodStatus = function() {
  if (this.stats.mood >= 80) return "happy";
  if (this.stats.mood >= 50) return "content";
  if (this.stats.mood >= 20) return "sad";
  return "miserable";
};

petSchema.methods.addExperience = function(amount) {
  this.experience += amount;
  
  // Check for level up
  while (this.experience >= this.experienceToNext) {
    this.experience -= this.experienceToNext;
    this.level += 1;
    
    // Increase stats on level up
    this.stats.attack += Math.floor(Math.random() * 3) + 1;
    this.stats.defense += Math.floor(Math.random() * 3) + 1;
    this.stats.health += Math.floor(Math.random() * 5) + 2;
    
    // Increase experience requirement for next level
    this.experienceToNext = Math.floor(this.experienceToNext * 1.2);
    
    // Cap stats at maximum
    this.stats.attack = Math.min(this.stats.attack, 100);
    this.stats.defense = Math.min(this.stats.defense, 100);
    this.stats.health = Math.min(this.stats.health, 200);
  }
  
  return this.save();
};

// Static methods
petSchema.statics.getRandomElement = function() {
  const elements = ["Fire", "Ice", "Nature", "Storm", "Shadow"];
  return elements[Math.floor(Math.random() * elements.length)];
};

petSchema.statics.getRandomPersonality = function() {
  const personalities = ["Brave", "Curious", "Loyal", "Playful"];
  return personalities[Math.floor(Math.random() * personalities.length)];
};

module.exports = mongoose.model("Pet", petSchema);
