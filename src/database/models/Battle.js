const mongoose = require("mongoose");

const battleSchema = new mongoose.Schema(
  {
    // Battle participants
    challenger: {
      id: {
        type: String,
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      petId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pet",
        required: true,
      },
    },
    opponent: {
      id: {
        type: String,
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      petId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pet",
        required: true,
      },
    },

    // Battle state
    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "pending",
    },
    currentTurn: {
      type: String,
      enum: ["challenger", "opponent"],
      default: "challenger",
    },
    turnNumber: {
      type: Number,
      default: 1,
    },

    // Battle mechanics
    challengerStats: {
      currentHealth: Number,
      maxHealth: Number,
      attack: Number,
      defense: Number,
      element: String,
      buffs: [String],
      debuffs: [String],
    },
    opponentStats: {
      currentHealth: Number,
      maxHealth: Number,
      attack: Number,
      defense: Number,
      element: String,
      buffs: [String],
      debuffs: [String],
    },

    // Battle history
    turns: [
      {
        turnNumber: Number,
        player: String,
        action: {
          type: String,
          enum: ["attack", "defend", "special"],
        },
        damage: Number,
        healing: Number,
        effects: [String],
        message: String,
      },
    ],

    // Battle settings
    guildId: {
      type: String,
      required: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
    },

    // Timestamps
    startedAt: {
      type: Date,
      default: null,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },

    // Results
    winner: {
      type: String,
      enum: ["challenger", "opponent", "draw"],
      default: null,
    },
    rewards: {
      experience: Number,
      coins: Number,
      items: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Instance methods
battleSchema.methods.isPlayerTurn = function(playerId) {
  const currentPlayer = this.currentTurn === "challenger" ? this.challenger.id : this.opponent.id;
  return currentPlayer === playerId;
};

battleSchema.methods.switchTurn = function() {
  this.currentTurn = this.currentTurn === "challenger" ? "opponent" : "challenger";
  this.turnNumber += 1;
  this.lastActivity = new Date();
  return this.save();
};

battleSchema.methods.addTurn = function(turnData) {
  this.turns.push({
    turnNumber: this.turnNumber,
    ...turnData,
  });
  return this.save();
};

battleSchema.methods.calculateDamage = function(attacker, defender, action) {
  let baseDamage = attacker.attack;
  
  // Elemental strengths/weaknesses
  const elementMultiplier = this.getElementMultiplier(attacker.element, defender.element);
  baseDamage *= elementMultiplier;
  
  // Action modifiers
  switch (action) {
    case "attack":
      baseDamage *= 1.0;
      break;
    case "special":
      baseDamage *= 1.5;
      break;
    case "defend":
      baseDamage *= 0.5;
      break;
  }
  
  // Defense reduction
  const finalDamage = Math.max(1, Math.floor(baseDamage * (100 / (100 + defender.defense))));
  
  return finalDamage;
};

battleSchema.methods.getElementMultiplier = function(attackerElement, defenderElement) {
  const strengths = {
    Fire: { Ice: 1.5, Nature: 0.8, Storm: 1.0, Shadow: 1.2 },
    Ice: { Fire: 0.8, Nature: 1.2, Storm: 1.0, Shadow: 1.5 },
    Nature: { Fire: 1.2, Ice: 0.8, Storm: 1.5, Shadow: 1.0 },
    Storm: { Fire: 1.0, Ice: 1.2, Nature: 0.8, Shadow: 1.5 },
    Shadow: { Fire: 0.8, Ice: 1.5, Nature: 1.0, Storm: 0.8 },
  };
  
  return strengths[attackerElement]?.[defenderElement] || 1.0;
};

battleSchema.methods.isBattleOver = function() {
  return this.challengerStats.currentHealth <= 0 || this.opponentStats.currentHealth <= 0;
};

battleSchema.methods.getWinner = function() {
  if (this.challengerStats.currentHealth <= 0 && this.opponentStats.currentHealth <= 0) {
    return "draw";
  } else if (this.challengerStats.currentHealth <= 0) {
    return "opponent";
  } else if (this.opponentStats.currentHealth <= 0) {
    return "challenger";
  }
  return null;
};

battleSchema.methods.calculateRewards = function() {
  const baseExp = 50;
  const baseCoins = 10;
  
  // Bonus for longer battles
  const turnBonus = Math.floor(this.turnNumber * 5);
  
  // Elemental bonus
  const elementBonus = 10;
  
  this.rewards = {
    experience: baseExp + turnBonus + elementBonus,
    coins: baseCoins + Math.floor(turnBonus / 10),
    items: this.getRandomItems(),
  };
  
  return this.rewards;
};

battleSchema.methods.getRandomItems = function() {
  const possibleItems = ["Health Potion", "Energy Drink", "Training Manual", "Rare Gem"];
  const items = [];
  
  // 20% chance for each item
  possibleItems.forEach(item => {
    if (Math.random() < 0.2) {
      items.push(item);
    }
  });
  
  return items;
};

// Static methods
battleSchema.statics.findActiveBattle = function(userId, guildId) {
  return this.findOne({
    $or: [
      { "challenger.id": userId },
      { "opponent.id": userId },
    ],
    guildId: guildId,
    status: { $in: ["pending", "active"] },
  });
};

battleSchema.statics.findPendingBattles = function(guildId) {
  return this.find({
    guildId: guildId,
    status: "pending",
  }).populate("challenger.petId opponent.petId");
};

module.exports = mongoose.model("Battle", battleSchema);
