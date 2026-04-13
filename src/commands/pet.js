const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require("discord.js");
const { Pet, BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pet")
    .setDescription("Manage your Lil Gargs pet")
    .addSubcommand(subcommand =>
      subcommand
        .setName("adopt")
        .setDescription("Adopt a new pet")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription("Name for your new pet")
            .setRequired(true)
            .setMaxLength(32)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("feed")
        .setDescription("Feed your pet to restore energy and mood")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("train")
        .setDescription("Train your pet to increase stats")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("play")
        .setDescription("Play with your pet to increase mood")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Check your pet's status")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("rename")
        .setDescription("Rename your pet")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription("New name for your pet")
            .setRequired(true)
            .setMaxLength(32)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // Check if pet system is enabled
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.petSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Pet system is not enabled in this server.",
          flags: 64,
        });
      }

      switch (subcommand) {
        case "adopt":
          await this.handleAdopt(interaction, userId, guildId);
          break;
        case "feed":
          await this.handleFeed(interaction, userId, guildId);
          break;
        case "train":
          await this.handleTrain(interaction, userId, guildId);
          break;
        case "play":
          await this.handlePlay(interaction, userId, guildId);
          break;
        case "status":
          await this.handleStatus(interaction, userId, guildId);
          break;
        case "rename":
          await this.handleRename(interaction, userId, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Error in pet command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        flags: 64,
      });
    }
  },

  async handleAdopt(interaction, userId, guildId) {
    const petName = interaction.options.getString("name");
    
    // Check if user already has a pet
    const existingPet = await Pet.findOne({ ownerId: userId, guildId });
    if (existingPet) {
      return await interaction.reply({
        content: "❌ You already have a pet! Use `/pet status` to check on them.",
        flags: 64,
      });
    }

    // Check pet limit
    const botConfig = await BotConfig.findOne({ guildId });
    const userPetCount = await Pet.countDocuments({ ownerId: userId, guildId });
    if (userPetCount >= (botConfig?.petSystem?.maxPetsPerUser || 1)) {
      return await interaction.reply({
        content: "❌ You have reached the maximum number of pets allowed.",
        flags: 64,
      });
    }

    // Create new pet
    const newPet = new Pet({
      ownerId: userId,
      ownerUsername: interaction.user.username,
      guildId: guildId,
      name: petName,
      element: Pet.getRandomElement(),
      personality: Pet.getRandomPersonality(),
    });

    await newPet.save();

    const embed = this.createPetEmbed(newPet, "🐲 Pet Adopted!");
    embed.setDescription(`Congratulations! You've adopted **${petName}**, a ${newPet.element} ${newPet.personality} Lil Garg!`);

    await interaction.reply({ embeds: [embed] });
  },

  async handleFeed(interaction, userId, guildId) {
    const pet = await Pet.findOne({ ownerId: userId, guildId });
    if (!pet) {
      return await interaction.reply({
        content: "❌ You don't have a pet! Use `/pet adopt [name]` to get one.",
        flags: 64,
      });
    }

    if (!pet.canFeed()) {
      const timeLeft = this.getTimeUntilAction(pet.cooldowns.lastFed, 4 * 60 * 60 * 1000);
      return await interaction.reply({
        content: `❌ ${pet.name} is not hungry yet. Try again in ${timeLeft}.`,
        flags: 64,
      });
    }

    // Feed the pet
    pet.stats.energy = Math.min(100, pet.stats.energy + 30);
    pet.stats.mood = Math.min(100, pet.stats.mood + 15);
    pet.cooldowns.lastFed = new Date();
    pet.lastActivity = new Date();
    
    await pet.save();

    const embed = this.createPetEmbed(pet, "🍖 Pet Fed!");
    embed.setDescription(`${pet.name} happily eats the food! Their energy and mood have increased.`);

    await interaction.reply({ embeds: [embed] });
  },

  async handleTrain(interaction, userId, guildId) {
    const pet = await Pet.findOne({ ownerId: userId, guildId });
    if (!pet) {
      return await interaction.reply({
        content: "❌ You don't have a pet! Use `/pet adopt [name]` to get one.",
        flags: 64,
      });
    }

    if (!pet.canTrain()) {
      const timeLeft = this.getTimeUntilAction(pet.cooldowns.lastTrained, 6 * 60 * 60 * 1000);
      return await interaction.reply({
        content: `❌ ${pet.name} is too tired to train. Try again in ${timeLeft}.`,
        flags: 64,
      });
    }

    if (pet.stats.energy < 20) {
      return await interaction.reply({
        content: `❌ ${pet.name} is too tired to train. Feed them first!`,
        flags: 64,
      });
    }

    // Train the pet
    const statGain = Math.floor(Math.random() * 3) + 1;
    const statChoice = Math.random() < 0.5 ? "attack" : "defense";
    pet.stats[statChoice] = Math.min(100, pet.stats[statChoice] + statGain);
    pet.stats.energy = Math.max(0, pet.stats.energy - 20);
    pet.cooldowns.lastTrained = new Date();
    pet.lastActivity = new Date();
    
    await pet.save();

    const embed = this.createPetEmbed(pet, "⚔️ Pet Trained!");
    embed.setDescription(`${pet.name} completed their training! Their ${statChoice} increased by ${statGain}.`);

    await interaction.reply({ embeds: [embed] });
  },

  async handlePlay(interaction, userId, guildId) {
    const pet = await Pet.findOne({ ownerId: userId, guildId });
    if (!pet) {
      return await interaction.reply({
        content: "❌ You don't have a pet! Use `/pet adopt [name]` to get one.",
        flags: 64,
      });
    }

    if (!pet.canPlay()) {
      const timeLeft = this.getTimeUntilAction(pet.cooldowns.lastPlayed, 2 * 60 * 60 * 1000);
      return await interaction.reply({
        content: `❌ ${pet.name} is not in the mood to play. Try again in ${timeLeft}.`,
        flags: 64,
      });
    }

    // Play with the pet
    pet.stats.mood = Math.min(100, pet.stats.mood + 25);
    pet.stats.energy = Math.max(0, pet.stats.energy - 10);
    pet.cooldowns.lastPlayed = new Date();
    pet.lastActivity = new Date();
    
    await pet.save();

    const embed = this.createPetEmbed(pet, "🎾 Pet Played!");
    embed.setDescription(`${pet.name} had a great time playing! Their mood has improved significantly.`);

    await interaction.reply({ embeds: [embed] });
  },

  async handleStatus(interaction, userId, guildId) {
    const pet = await Pet.findOne({ ownerId: userId, guildId });
    if (!pet) {
      return await interaction.reply({
        content: "❌ You don't have a pet! Use `/pet adopt [name]` to get one.",
        flags: 64,
      });
    }

    const embed = this.createPetEmbed(pet, "📊 Pet Status");
    
    // Add cooldown information
    const feedCooldown = pet.canFeed() ? "✅ Ready" : this.getTimeUntilAction(pet.cooldowns.lastFed, 4 * 60 * 60 * 1000);
    const trainCooldown = pet.canTrain() ? "✅ Ready" : this.getTimeUntilAction(pet.cooldowns.lastTrained, 6 * 60 * 60 * 1000);
    const playCooldown = pet.canPlay() ? "✅ Ready" : this.getTimeUntilAction(pet.cooldowns.lastPlayed, 2 * 60 * 60 * 1000);

    embed.addFields(
      { name: "🕒 Cooldowns", value: `Feed: ${feedCooldown}\nTrain: ${trainCooldown}\nPlay: ${playCooldown}`, inline: true }
    );

    await interaction.reply({ embeds: [embed] });
  },

  async handleRename(interaction, userId, guildId) {
    const newName = interaction.options.getString("name");
    const pet = await Pet.findOne({ ownerId: userId, guildId });
    
    if (!pet) {
      return await interaction.reply({
        content: "❌ You don't have a pet! Use `/pet adopt [name]` to get one.",
        flags: 64,
      });
    }

    const oldName = pet.name;
    pet.name = newName;
    pet.lastActivity = new Date();
    
    await pet.save();

    const embed = this.createPetEmbed(pet, "✏️ Pet Renamed!");
    embed.setDescription(`Your pet has been renamed from **${oldName}** to **${newName}**!`);

    await interaction.reply({ embeds: [embed] });
  },

  createPetEmbed(pet, title) {
    const moodStatus = pet.getMoodStatus();
    const moodEmoji = {
      happy: "😊",
      content: "😐",
      sad: "😢",
      miserable: "😭"
    };

    const elementEmoji = {
      Fire: "🔥",
      Ice: "❄️",
      Nature: "🌿",
      Storm: "⚡",
      Shadow: "👻"
    };

    const embed = new EmbedBuilder()
      .setColor(pet.appearance.color)
      .setTitle(`${elementEmoji[pet.element]} ${title}`)
      .setDescription(`**${pet.name}** - ${pet.element} ${pet.personality}`)
      .addFields(
        { name: "📊 Stats", value: `Attack: ${pet.stats.attack}\nDefense: ${pet.stats.defense}\nHealth: ${pet.stats.health}`, inline: true },
        { name: "💚 Status", value: `Mood: ${moodEmoji[moodStatus]} ${pet.stats.mood}%\nEnergy: ⚡ ${pet.stats.energy}%`, inline: true },
        { name: "⭐ Progression", value: `Level: ${pet.level}\nXP: ${pet.experience}/${pet.experienceToNext}`, inline: true }
      )
      .setFooter({ text: `Owner: ${pet.ownerUsername} • Created: ${pet.createdAt.toLocaleDateString()}` })
      .setTimestamp();

    return embed;
  },

  getTimeUntilAction(lastAction, cooldown) {
    if (!lastAction) return "Ready";
    
    const now = new Date();
    const timeSince = now - lastAction;
    const timeLeft = cooldown - timeSince;
    
    if (timeLeft <= 0) return "Ready";
    
    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
};
