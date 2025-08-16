const { logger } = require("../utils/logger");
const { Battle, Pet, User } = require("../database/models");
const { BotError, ErrorCodes } = require("../utils/errorHandler");
const {
  getElementInfo,
  calculateEffectiveStats,
} = require("./petMaintenanceService");
// Simple ID generation function to replace uuid
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Creates a new battle between two users
 * @param {string} challengerId - The challenger's user ID
 * @param {string} opponentId - The opponent's user ID
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The channel ID where the battle was initiated
 * @returns {Promise<Object>} The created battle
 */
async function createBattle(challengerId, opponentId, guildId, channelId) {
  // Get both users' pets
  const challengerPet = await Pet.findOne({ userId: challengerId, guildId });
  const opponentPet = await Pet.findOne({ userId: opponentId, guildId });

  if (!challengerPet) {
    throw new BotError(
      "You don't have a pet! Use `/pet adopt` to get one first.",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  if (!opponentPet) {
    throw new BotError(
      "Your opponent doesn't have a pet!",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  // Check if pets have enough energy
  if (challengerPet.energy < 30) {
    throw new BotError(
      "Your pet doesn't have enough energy to battle! (Minimum: 30 energy)",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  if (opponentPet.energy < 30) {
    throw new BotError(
      "Your opponent's pet doesn't have enough energy to battle!",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  // Check if either user is already in a battle
  const existingBattle = await Battle.findOne({
    guildId,
    status: { $in: ["pending", "active"] },
    $or: [
      { "challenger.userId": challengerId },
      { "opponent.userId": challengerId },
      { "challenger.userId": opponentId },
      { "opponent.userId": opponentId },
    ],
  });

  if (existingBattle) {
    throw new BotError(
      "One of the users is already in an active battle!",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  // Create battle data
  const battleId = generateId();
  const battleData = {
    battleId,
    guildId,
    channelId,
    challenger: {
      userId: challengerId,
      petId: challengerPet._id,
      currentHealth: challengerPet.health,
      currentEnergy: challengerPet.energy,
      buffs: { attack: 0, defense: 0, duration: 0 },
      debuffs: { attack: 0, defense: 0, duration: 0 },
    },
    opponent: {
      userId: opponentId,
      petId: opponentPet._id,
      currentHealth: opponentPet.health,
      currentEnergy: opponentPet.energy,
      buffs: { attack: 0, defense: 0, duration: 0 },
      debuffs: { attack: 0, defense: 0, duration: 0 },
    },
    status: "pending",
    currentTurn: "challenger",
    turnNumber: 1,
    lastActionTime: new Date(),
    battleLog: [],
  };

  const battle = new Battle(battleData);
  await battle.save();

  logger.info(
    `Created battle ${battleId} between ${challengerId} and ${opponentId} in guild ${guildId}`
  );

  return battle;
}

/**
 * Accepts a battle challenge
 * @param {string} battleId - The battle ID
 * @returns {Promise<Object>} The updated battle
 */
async function acceptBattle(battleId) {
  const battle = await Battle.findOne({ battleId, status: "pending" });

  if (!battle) {
    throw new BotError(
      "Battle not found or already started.",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  battle.status = "active";
  battle.lastActionTime = new Date();

  // Add battle start log entry
  battle.addLogEntry({
    turn: battle.turnNumber,
    actor: "system",
    action: "battle_start",
    target: "all",
    damage: 0,
    healing: 0,
    effects: ["Battle has begun!"],
  });

  await battle.save();

  logger.info(`Battle ${battleId} accepted and started`);

  return battle;
}

/**
 * Performs a battle action
 * @param {string} battleId - The battle ID
 * @param {string} userId - The user performing the action
 * @param {string} action - The action type (attack, defend, special)
 * @returns {Promise<Object>} The updated battle with action results
 */
async function performBattleAction(battleId, userId, action) {
  const battle = await Battle.findOne({ battleId, status: "active" })
    .populate("challenger.petId")
    .populate("opponent.petId");

  if (!battle) {
    throw new BotError(
      "Battle not found or not active.",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  // Check if it's the user's turn
  const isChallenger = battle.challenger.userId === userId;
  const isOpponent = battle.opponent.userId === userId;

  if (!isChallenger && !isOpponent) {
    throw new BotError(
      "You are not part of this battle.",
      ErrorCodes.BATTLE_SYSTEM
    );
  }

  const currentTurnUser =
    battle.currentTurn === "challenger"
      ? battle.challenger.userId
      : battle.opponent.userId;
  if (userId !== currentTurnUser) {
    throw new BotError("It's not your turn!", ErrorCodes.BATTLE_SYSTEM);
  }

  // Get attacker and defender
  const attacker = isChallenger ? battle.challenger : battle.opponent;
  const defender = isChallenger ? battle.opponent : battle.challenger;
  const attackerPet = isChallenger
    ? battle.challenger.petId
    : battle.opponent.petId;
  const defenderPet = isChallenger
    ? battle.opponent.petId
    : battle.challenger.petId;

  // Perform the action
  const actionResult = await executeAction(
    action,
    attacker,
    defender,
    attackerPet,
    defenderPet,
    battle
  );

  // Update battle state
  battle.lastActionTime = new Date();
  battle.processTurnEffects();

  // Check for battle end
  if (defender.currentHealth <= 0) {
    battle.status = "completed";
    battle.winner = isChallenger ? "challenger" : "opponent";

    // Calculate rewards
    const rewards = calculateBattleRewards(battle, battle.winner);
    battle.rewards = rewards;

    // Add battle end log entry
    battle.addLogEntry({
      turn: battle.turnNumber,
      actor: "system",
      action: "battle_end",
      target: "all",
      damage: 0,
      healing: 0,
      effects: [`${attackerPet.name} wins the battle!`],
    });

    // Update pet stats and apply rewards
    await applyBattleRewards(battle);
  } else {
    // Switch turns
    battle.currentTurn =
      battle.currentTurn === "challenger" ? "opponent" : "challenger";
    battle.turnNumber += 1;
  }

  await battle.save();

  return {
    battle,
    actionResult,
    battleEnded: battle.status === "completed",
  };
}

/**
 * Executes a battle action
 * @param {string} action - The action type
 * @param {Object} attacker - The attacker data
 * @param {Object} defender - The defender data
 * @param {Object} attackerPet - The attacker's pet
 * @param {Object} defenderPet - The defender's pet
 * @param {Object} battle - The battle object
 * @returns {Promise<Object>} The action result
 */
async function executeAction(
  action,
  attacker,
  defender,
  attackerPet,
  defenderPet,
  battle
) {
  const attackerStats = calculateEffectiveStats(attackerPet);
  const defenderStats = calculateEffectiveStats(defenderPet);

  // Apply buffs and debuffs
  const finalAttack =
    attackerStats.attack + attacker.buffs.attack - attacker.debuffs.attack;
  const finalDefense =
    defenderStats.defense + defender.buffs.defense - defender.debuffs.defense;

  let damage = 0;
  let healing = 0;
  let effects = [];
  let energyCost = 0;

  switch (action) {
    case "attack":
      energyCost = 10;
      if (attacker.currentEnergy < energyCost) {
        throw new BotError(
          "Not enough energy to attack!",
          ErrorCodes.BATTLE_SYSTEM
        );
      }

      // Calculate damage with element effectiveness
      const elementMultiplier = calculateElementMultiplier(
        attackerPet.element,
        defenderPet.element
      );
      const baseDamage = Math.max(
        1,
        finalAttack - Math.floor(finalDefense * 0.5)
      );
      damage = Math.floor(
        baseDamage * elementMultiplier * (0.8 + Math.random() * 0.4)
      ); // 80-120% damage variance

      defender.currentHealth = Math.max(0, defender.currentHealth - damage);
      attacker.currentEnergy -= energyCost;

      effects.push(
        `${attackerPet.name} attacks ${defenderPet.name} for ${damage} damage!`
      );

      if (elementMultiplier > 1) {
        effects.push("It's super effective!");
      } else if (elementMultiplier < 1) {
        effects.push("It's not very effective...");
      }
      break;

    case "defend":
      energyCost = 5;
      if (attacker.currentEnergy < energyCost) {
        throw new BotError(
          "Not enough energy to defend!",
          ErrorCodes.BATTLE_SYSTEM
        );
      }

      // Increase defense for next turn
      attacker.buffs.defense += Math.floor(attackerStats.defense * 0.5);
      attacker.buffs.duration = Math.max(attacker.buffs.duration, 2);
      attacker.currentEnergy -= energyCost;

      effects.push(`${attackerPet.name} takes a defensive stance!`);
      break;

    case "special":
      energyCost = 20;
      if (attacker.currentEnergy < energyCost) {
        throw new BotError(
          "Not enough energy for special attack!",
          ErrorCodes.BATTLE_SYSTEM
        );
      }

      // Special attack based on element
      const specialResult = executeSpecialAttack(
        attackerPet.element,
        attacker,
        defender,
        attackerStats,
        defenderStats
      );
      damage = specialResult.damage;
      healing = specialResult.healing;
      effects = effects.concat(specialResult.effects);

      attacker.currentEnergy -= energyCost;
      break;

    default:
      throw new BotError(
        "Invalid battle action.",
        ErrorCodes.INVALID_ARGUMENTS
      );
  }

  // Add log entry
  battle.addLogEntry({
    turn: battle.turnNumber,
    actor: attackerPet.name,
    action,
    target: defenderPet.name,
    damage,
    healing,
    effects,
  });

  return {
    action,
    damage,
    healing,
    effects,
    energyCost,
    attackerHealth: attacker.currentHealth,
    defenderHealth: defender.currentHealth,
    attackerEnergy: attacker.currentEnergy,
    defenderEnergy: defender.currentEnergy,
  };
}

/**
 * Calculates element effectiveness multiplier
 * @param {string} attackerElement - The attacker's element
 * @param {string} defenderElement - The defender's element
 * @returns {number} The damage multiplier
 */
function calculateElementMultiplier(attackerElement, defenderElement) {
  const elementInfo = getElementInfo(attackerElement);

  if (elementInfo.strongAgainst.includes(defenderElement)) {
    return 1.5; // 50% more damage
  } else if (elementInfo.weakAgainst.includes(defenderElement)) {
    return 0.75; // 25% less damage
  }

  return 1.0; // Normal damage
}

/**
 * Executes a special attack based on element
 * @param {string} element - The pet's element
 * @param {Object} attacker - The attacker data
 * @param {Object} defender - The defender data
 * @param {Object} attackerStats - The attacker's stats
 * @param {Object} defenderStats - The defender's stats
 * @returns {Object} The special attack result
 */
function executeSpecialAttack(
  element,
  attacker,
  defender,
  attackerStats,
  defenderStats
) {
  let damage = 0;
  let healing = 0;
  let effects = [];

  const basePower = attackerStats.attack * 1.5;

  switch (element) {
    case "Fire":
      // Burn attack - high damage with chance to apply burn
      damage = Math.floor(basePower * (0.9 + Math.random() * 0.2));
      defender.currentHealth = Math.max(0, defender.currentHealth - damage);

      if (Math.random() < 0.3) {
        // 30% chance
        defender.debuffs.attack += Math.floor(attackerStats.attack * 0.2);
        defender.debuffs.duration = Math.max(defender.debuffs.duration, 3);
        effects.push(
          "Flame Burst deals massive damage!",
          "The target is burned!"
        );
      } else {
        effects.push("Flame Burst deals massive damage!");
      }
      break;

    case "Ice":
      // Freeze attack - moderate damage with defense buff
      damage = Math.floor(basePower * 0.8);
      defender.currentHealth = Math.max(0, defender.currentHealth - damage);

      attacker.buffs.defense += Math.floor(attackerStats.defense * 0.3);
      attacker.buffs.duration = Math.max(attacker.buffs.duration, 3);

      effects.push("Ice Shard deals damage and creates an ice barrier!");
      break;

    case "Nature":
      // Healing attack - moderate damage with self-heal
      damage = Math.floor(basePower * 0.7);
      healing = Math.floor(attackerStats.maxHealth * 0.2);

      defender.currentHealth = Math.max(0, defender.currentHealth - damage);
      attacker.currentHealth = Math.min(
        attackerStats.maxHealth,
        attacker.currentHealth + healing
      );

      effects.push("Nature's Wrath deals damage and heals the user!");
      break;

    case "Storm":
      // Lightning attack - high damage with energy drain
      damage = Math.floor(basePower * 1.2);
      const energyDrain = Math.min(15, defender.currentEnergy);

      defender.currentHealth = Math.max(0, defender.currentHealth - damage);
      defender.currentEnergy = Math.max(
        0,
        defender.currentEnergy - energyDrain
      );

      effects.push("Lightning Strike deals high damage and drains energy!");
      break;

    case "Shadow":
      // Shadow attack - pierces defense
      damage = Math.floor(basePower * 1.1); // Ignores defense
      defender.currentHealth = Math.max(0, defender.currentHealth - damage);

      defender.debuffs.defense += Math.floor(defenderStats.defense * 0.3);
      defender.debuffs.duration = Math.max(defender.debuffs.duration, 2);

      effects.push("Shadow Strike pierces through defenses!");
      break;
  }

  return { damage, healing, effects };
}

/**
 * Calculates battle rewards
 * @param {Object} battle - The battle object
 * @param {string} winner - The winner ('challenger' or 'opponent')
 * @returns {Object} The rewards
 */
function calculateBattleRewards(battle, winner) {
  const baseXp = 50;
  const baseCoins = 25;

  return {
    winner: {
      xp: baseXp,
      coins: baseCoins,
    },
    loser: {
      xp: Math.floor(baseXp * 0.4), // 40% XP for losing
      coins: Math.floor(baseCoins * 0.2), // 20% coins for losing
    },
  };
}

/**
 * Applies battle rewards to pets and users
 * @param {Object} battle - The battle object
 * @returns {Promise<void>}
 */
async function applyBattleRewards(battle) {
  const challengerPet = await Pet.findById(battle.challenger.petId);
  const opponentPet = await Pet.findById(battle.opponent.petId);

  const challengerUser = await User.findOne({
    userId: battle.challenger.userId,
    guildId: battle.guildId,
  });
  const opponentUser = await User.findOne({
    userId: battle.opponent.userId,
    guildId: battle.guildId,
  });

  const ischallengerWinner = battle.winner === "challenger";

  // Apply rewards to winner
  if (ischallengerWinner) {
    challengerPet.xp += battle.rewards.winner.xp;
    challengerPet.checkLevelUp();
    if (challengerUser) {
      challengerUser.battleStats.wins += 1;
      challengerUser.battleStats.totalBattles += 1;
      challengerUser.coins += battle.rewards.winner.coins;
    }

    opponentPet.xp += battle.rewards.loser.xp;
    opponentPet.checkLevelUp();
    if (opponentUser) {
      opponentUser.battleStats.losses += 1;
      opponentUser.battleStats.totalBattles += 1;
      opponentUser.coins += battle.rewards.loser.coins;
    }
  } else {
    opponentPet.xp += battle.rewards.winner.xp;
    opponentPet.checkLevelUp();
    if (opponentUser) {
      opponentUser.battleStats.wins += 1;
      opponentUser.battleStats.totalBattles += 1;
      opponentUser.coins += battle.rewards.winner.coins;
    }

    challengerPet.xp += battle.rewards.loser.xp;
    challengerPet.checkLevelUp();
    if (challengerUser) {
      challengerUser.battleStats.losses += 1;
      challengerUser.battleStats.totalBattles += 1;
      challengerUser.coins += battle.rewards.loser.coins;
    }
  }

  // Restore some health and energy after battle
  challengerPet.health = Math.min(
    challengerPet.maxHealth,
    challengerPet.health + 20
  );
  challengerPet.energy = Math.min(
    challengerPet.maxEnergy,
    challengerPet.energy + 10
  );
  opponentPet.health = Math.min(opponentPet.maxHealth, opponentPet.health + 20);
  opponentPet.energy = Math.min(opponentPet.maxEnergy, opponentPet.energy + 10);

  // Set battle cooldown
  challengerPet.cooldowns.battle = new Date();
  opponentPet.cooldowns.battle = new Date();

  // Save all changes
  await Promise.all([
    challengerPet.save(),
    opponentPet.save(),
    challengerUser?.save(),
    opponentUser?.save(),
  ]);
}

module.exports = {
  createBattle,
  acceptBattle,
  performBattleAction,
  calculateElementMultiplier,
  calculateBattleRewards,
  applyBattleRewards,
};
