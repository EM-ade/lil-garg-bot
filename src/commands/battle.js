const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require("discord.js");
const { Battle, Pet, BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("battle")
    .setDescription("Battle system for Lil Gargs pets")
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start a battle with another user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to battle against")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("accept")
        .setDescription("Accept a pending battle")
        .addStringOption(option =>
          option
            .setName("battle_id")
            .setDescription("ID of the battle to accept")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("arena")
        .setDescription("View the battle arena")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("profile")
        .setDescription("View your battle profile")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // Check if battle system is enabled
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.battleSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Battle system is not enabled in this server.",
          ephemeral: true,
        });
      }

      switch (subcommand) {
        case "start":
          await this.handleStart(interaction, userId, guildId);
          break;
        case "accept":
          await this.handleAccept(interaction, userId, guildId);
          break;
        case "arena":
          await this.handleArena(interaction, guildId);
          break;
        case "profile":
          await this.handleProfile(interaction, userId, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Error in battle command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  },

  async handleStart(interaction, userId, guildId) {
    const opponent = interaction.options.getUser("user");
    
    if (opponent.id === userId) {
      return await interaction.reply({
        content: "❌ You cannot battle yourself!",
        ephemeral: true,
      });
    }

    // Check if either user is already in a battle
    const existingBattle = await Battle.findActiveBattle(userId, guildId);
    if (existingBattle) {
      return await interaction.reply({
        content: "❌ You are already in a battle!",
        ephemeral: true,
      });
    }

    const opponentBattle = await Battle.findActiveBattle(opponent.id, guildId);
    if (opponentBattle) {
      return await interaction.reply({
        content: "❌ Your opponent is already in a battle!",
        ephemeral: true,
      });
    }

    // Check if both users have pets
    const challengerPet = await Pet.findOne({ ownerId: userId, guildId });
    const opponentPet = await Pet.findOne({ ownerId: opponent.id, guildId });

    if (!challengerPet) {
      return await interaction.reply({
        content: "❌ You need a pet to battle! Use `/pet adopt [name]` to get one.",
        ephemeral: true,
      });
    }

    if (!opponentPet) {
      return await interaction.reply({
        content: "❌ Your opponent needs a pet to battle!",
        ephemeral: true,
      });
    }

    // Create battle
    const battle = new Battle({
      challenger: {
        id: userId,
        username: interaction.user.username,
        petId: challengerPet._id,
      },
      opponent: {
        id: opponent.id,
        username: opponent.username,
        petId: opponentPet._id,
      },
      guildId: guildId,
      channelId: interaction.channel.id,
      challengerStats: {
        currentHealth: challengerPet.stats.health,
        maxHealth: challengerPet.stats.health,
        attack: challengerPet.stats.attack,
        defense: challengerPet.stats.defense,
        element: challengerPet.element,
        buffs: [],
        debuffs: [],
      },
              opponentStats: {
          currentHealth: opponentPet.stats.health,
          maxHealth: opponentPet.stats.health,
          attack: opponentPet.stats.attack,
          defense: opponentPet.stats.defense,
          element: opponentPet.element,
          buffs: [],
          debuffs: [],
        },
    });

    await battle.save();

    const embed = this.createBattleEmbed(battle, "⚔️ Battle Challenge!");
    embed.setDescription(`${interaction.user} has challenged ${opponent} to a pet battle!`);

    const buttons = this.createBattleButtons(battle._id, "challenge");
    const message = await interaction.reply({ 
      embeds: [embed], 
      components: [buttons],
      fetchReply: true 
    });

    // Update battle with message ID
    battle.messageId = message.id;
    await battle.save();

    // Notify opponent
    await interaction.channel.send({
      content: `${opponent} You have been challenged to a battle! Use \`/battle accept ${battle._id}\` to accept.`,
    });
  },

  async handleAccept(interaction, userId, guildId) {
    const battleId = interaction.options.getString("battle_id");
    
    const battle = await Battle.findById(battleId).populate("challenger.petId opponent.petId");
    if (!battle) {
      return await interaction.reply({
        content: "❌ Battle not found!",
        ephemeral: true,
      });
    }

    if (battle.opponent.id !== userId) {
      return await interaction.reply({
        content: "❌ This battle is not for you!",
        ephemeral: true,
      });
    }

    if (battle.status !== "pending") {
      return await interaction.reply({
        content: "❌ This battle is no longer pending!",
        ephemeral: true,
      });
    }

    // Start the battle
    battle.status = "active";
    battle.startedAt = new Date();
    battle.lastActivity = new Date();
    await battle.save();

    const embed = this.createBattleEmbed(battle, "⚔️ Battle Started!");
    embed.setDescription(`The battle between ${battle.challenger.username} and ${battle.opponent.username} has begun!`);

    const buttons = this.createBattleButtons(battle._id, "active");
    
    // Update the original message
    try {
      const channel = interaction.channel;
      const message = await channel.messages.fetch(battle.messageId);
      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (error) {
      logger.error("Error updating battle message:", error);
    }

    await interaction.reply({ 
      embeds: [embed], 
      components: [buttons],
      content: "Battle started! Use the buttons below to take your turn."
    });
  },

  async handleArena(interaction, guildId) {
    const pendingBattles = await Battle.findPendingBattles(guildId);
    const activeBattles = await Battle.find({
      guildId: guildId,
      status: "active",
    }).populate("challenger.petId opponent.petId");

    const embed = new EmbedBuilder()
      .setColor("#FF6B35")
      .setTitle("🏟️ Battle Arena")
      .setDescription("Current battles in the arena");

    if (pendingBattles.length === 0 && activeBattles.length === 0) {
      embed.addFields({
        name: "No Battles",
        value: "The arena is quiet. Start a battle with `/battle start @user`!",
        inline: false,
      });
    } else {
      if (pendingBattles.length > 0) {
        const pendingList = pendingBattles
          .slice(0, 5)
          .map(battle => `• ${battle.challenger.username} vs ${battle.opponent.username} (Pending)`)
          .join("\n");
        
        embed.addFields({
          name: "⏳ Pending Battles",
          value: pendingList + (pendingBattles.length > 5 ? `\n... and ${pendingBattles.length - 5} more` : ""),
          inline: false,
        });
      }

      if (activeBattles.length > 0) {
        const activeList = activeBattles
          .slice(0, 5)
          .map(battle => `• ${battle.challenger.username} vs ${battle.opponent.username} (Turn ${battle.turnNumber})`)
          .join("\n");
        
        embed.addFields({
          name: "⚔️ Active Battles",
          value: activeList + (activeBattles.length > 5 ? `\n... and ${activeBattles.length - 5} more` : ""),
          inline: false,
        });
      }
    }

    await interaction.reply({ embeds: [embed] });
  },

  async handleProfile(interaction, userId, guildId) {
    const userPets = await Pet.find({ ownerId: userId, guildId });
    const battles = await Battle.find({
      $or: [
        { "challenger.id": userId },
        { "opponent.id": userId },
      ],
      guildId: guildId,
      status: "completed",
    });

    if (userPets.length === 0) {
      return await interaction.reply({
        content: "❌ You don't have any pets! Use `/pet adopt [name]` to get one.",
        ephemeral: true,
      });
    }

    const mainPet = userPets[0]; // Assuming first pet is main
    const wins = battles.filter(b => b.winner === (b.challenger.id === userId ? "challenger" : "opponent")).length;
    const totalBattles = battles.length;
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor("#FF6B35")
      .setTitle("⚔️ Battle Profile")
      .setDescription(`${interaction.user.username}'s battle statistics`)
      .addFields(
        { name: "🏆 Battle Record", value: `${wins}W - ${totalBattles - wins}L (${winRate}% Win Rate)`, inline: true },
        { name: "🐲 Main Pet", value: `${mainPet.name} (Level ${mainPet.level})`, inline: true },
        { name: "⚡ Pet Power", value: `ATK: ${mainPet.stats.attack} | DEF: ${mainPet.stats.defense}`, inline: true }
      )
      .setFooter({ text: "Use /battle start @user to challenge someone!" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  createBattleEmbed(battle, title) {
    const challengerPet = battle.challenger.petId;
    const opponentPet = battle.opponent.petId;
    
    const elementEmoji = {
      Fire: "🔥",
      Ice: "❄️",
      Nature: "🌿",
      Storm: "⚡",
      Shadow: "👻"
    };

    const embed = new EmbedBuilder()
      .setColor("#FF6B35")
      .setTitle(title)
      .addFields(
        { 
          name: `${elementEmoji[challengerPet.element]} ${battle.challenger.username}'s ${challengerPet.name}`,
          value: `HP: ${battle.challengerStats.currentHealth}/${battle.challengerStats.maxHealth}\nATK: ${battle.challengerStats.attack} | DEF: ${battle.challengerStats.defense}`,
          inline: true 
        },
        { 
          name: "VS",
          value: "⚔️",
          inline: true 
        },
        { 
          name: `${elementEmoji[opponentPet.element]} ${battle.opponent.username}'s ${opponentPet.name}`,
          value: `HP: ${battle.opponentStats.currentHealth}/${battle.opponentStats.maxHealth}\nATK: ${battle.opponentStats.attack} | DEF: ${battle.opponentStats.defense}`,
          inline: true 
        }
      )
      .setFooter({ text: `Turn: ${battle.turnNumber} | Status: ${battle.status}` })
      .setTimestamp();

    return embed;
  },

  createBattleButtons(battleId, type) {
    if (type === "challenge") {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`battle_accept_${battleId}`)
            .setLabel("Accept Challenge")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`battle_decline_${battleId}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );
    } else if (type === "active") {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`battle_attack_${battleId}`)
            .setLabel("Attack")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚔️"),
          new ButtonBuilder()
            .setCustomId(`battle_defend_${battleId}`)
            .setLabel("Defend")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🛡️"),
          new ButtonBuilder()
            .setCustomId(`battle_special_${battleId}`)
            .setLabel("Special")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("✨")
        );
    }

    return new ActionRowBuilder();
  }
};
