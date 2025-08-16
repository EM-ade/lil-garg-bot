const { Events } = require("discord.js");
const { logger } = require("../utils/logger");
const { handleError, BotError, ErrorCodes } = require("../utils/errorHandler");
const { applyRateLimit } = require("../utils/rateLimiter");
const { handleButtons } = require("../utils/buttonHandler");
const { createPet } = require("../utils/dbUtils");
const { createPetEmbed } = require("../utils/embedBuilder");
const {
  getRandomElement,
  getRandomPersonality,
  getElementInfo,
  getPersonalityInfo,
} = require("../services/petMaintenanceService");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!client?.commands) {
      logger.error('Client or commands collection is not initialized');
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: 'Bot is still initializing. Please try again in a moment.',
          ephemeral: true
        });
      }
      return;
    }

    try {
      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        await handleCommandInteraction(interaction, client);
      }
      // Handle buttons
      else if (interaction.isButton()) {
        await handleButtons(interaction, client);
      }
      // Handle select menus
      else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction, client);
      }
      // Handle modals
      else if (interaction.isModalSubmit()) {
        await handleModalInteraction(interaction, client);
      }
      // Handle autocomplete
      else if (interaction.isAutocomplete()) {
        await handleAutocompleteInteraction(interaction, client);
      }
    } catch (error) {
      logger.error("Error handling interaction:", error);
      await handleError(error, interaction);
    }
  },
};

/**
 * Handles command interactions
 * @param {CommandInteraction} interaction - The command interaction
 * @param {Client} client - The Discord client
 */
async function handleCommandInteraction(interaction, client) {
  // Check if commands collection exists
  if (!client.commands) {
    logger.error('client.commands collection is undefined!');
    await interaction.reply({
      content: "Bot is still starting up. Please try again in a moment.",
      ephemeral: true,
    });
    return;
  }

  logger.info(`Looking for command: ${interaction.commandName}`);
  logger.info(`Available commands: ${Array.from(client.commands.keys()).join(', ')}`);
  
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn(`No command matching ${interaction.commandName} was found.`);
    logger.warn(`Commands collection size: ${client.commands.size}`);
    await interaction.reply({
      content: "This command is not currently available.",
      ephemeral: true,
    });
    return;
  }

  try {
    // Apply rate limiting if the command has a cooldown
    if (command.cooldown) {
      applyRateLimit(interaction, command.cooldown);
    }

    // Execute the command
    await command.execute(interaction, client);

    // Log command usage
    logger.info(
      `${interaction.user.tag} used command /${interaction.commandName} in ${
        interaction.guild?.name || "DM"
      }`
    );
  } catch (error) {
    await handleError(error, interaction);
  }
}

/**
 * Handles select menu interactions
 * @param {SelectMenuInteraction} interaction - The select menu interaction
 * @param {Client} client - The Discord client
 */
async function handleSelectMenuInteraction(interaction, client) {
  const [type, action] = interaction.customId.split(":");

  // Handle different select menu types
  switch (type) {
    case "pet":
      // Pet system select menus will be implemented later
      await interaction.reply({
        content: "Pet system select menus are not yet implemented.",
        ephemeral: true,
      });
      break;

    case "battle":
      // Battle system select menus will be implemented later
      await interaction.reply({
        content: "Battle system select menus are not yet implemented.",
        ephemeral: true,
      });
      break;

    case "config":
      // Configuration select menus will be implemented later
      await interaction.reply({
        content: "Configuration select menus are not yet implemented.",
        ephemeral: true,
      });
      break;

    default:
      logger.warn(`Unknown select menu type: ${type}`);
      await interaction.reply({
        content: "This select menu is not configured correctly.",
        ephemeral: true,
      });
  }
}

/**
 * Handles modal interactions
 * @param {ModalSubmitInteraction} interaction - The modal interaction
 * @param {Client} client - The Discord client
 */
async function handleModalInteraction(interaction, client) {
  const [type, action] = interaction.customId.split(":");

  // Handle different modal types
  switch (type) {
    case "pet":
      await handlePetModal(interaction, action);
      break;

    case "nft":
      await handleNftModal(interaction, action);
      break;

    case "ticket":
      await handleTicketModal(interaction, action);
      break;

    case "config":
      // Configuration modals will be implemented later
      await interaction.reply({
        content: "Configuration modals are not yet implemented.",
        ephemeral: true,
      });
      break;

    default:
      logger.warn(`Unknown modal type: ${type}`);
      await interaction.reply({
        content: "This modal is not configured correctly.",
        ephemeral: true,
      });
  }
}

/**
 * Handles pet system modal interactions
 * @param {ModalSubmitInteraction} interaction - The modal interaction
 * @param {string} action - The action to perform
 */
async function handlePetModal(interaction, action) {
  if (action === "adopt_modal") {
    const petName = interaction.fields.getTextInputValue("pet_name");
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // Generate random element and personality
      const element = getRandomElement();
      const personality = getRandomPersonality();

      // Create pet data
      const petData = {
        name: petName,
        element,
        personality,
        level: 1,
        xp: 0,
        health: 100,
        maxHealth: 100,
        attack: 10,
        defense: 10,
        energy: 100,
        maxEnergy: 100,
        mood: 100,
        status: "normal",
        cooldowns: {},
        abilities: [`${element} Blast`], // Basic ability based on element
        lastInteraction: new Date(),
      };

      // Create the pet
      const pet = await createPet(userId, guildId, petData);

      // Get element and personality info
      const elementInfo = getElementInfo(element);
      const personalityInfo = getPersonalityInfo(personality);

      // Create adoption embed
      const adoptEmbed = createPetEmbed(
        "🐣 Pet Adopted Successfully!",
        `Congratulations! You've adopted **${petName}**!`,
        pet,
        [
          {
            name: `🧪 ${element} Element`,
            value: elementInfo.description,
            inline: false,
          },
          {
            name: `🎭 ${personality} Personality`,
            value: personalityInfo.description,
            inline: false,
          },
          {
            name: "💡 Getting Started",
            value:
              "Use the buttons above or `/pet` commands to care for your pet!",
            inline: false,
          },
        ]
      );

      await interaction.reply({ embeds: [adoptEmbed], ephemeral: true });
    } catch (error) {
      await handleError(error, interaction);
    }
  }
}

/**
 * Handles NFT system modal interactions
 * @param {ModalSubmitInteraction} interaction - The modal interaction
 * @param {string} action - The action to perform
 */
async function handleNftModal(interaction, action) {
  if (action === "verify_modal") {
    const walletAddress = interaction.fields.getTextInputValue("wallet_address").trim();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    try {
      const {
        verifyNftOwnership,
        updateUserRoles,
        storeVerificationData,
        isValidSolanaAddress
      } = require('../services/nftVerification');
      const { getGuildConfig } = require('../utils/dbUtils');
      const { createSuccessEmbed, createErrorEmbed } = require('../utils/embedBuilder');
      
      // Validate wallet address
      if (!isValidSolanaAddress(walletAddress)) {
        throw new BotError(
          'Invalid Solana wallet address. Please provide a valid base58 encoded address.',
          ErrorCodes.NFT_VERIFICATION
        );
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Verify NFT ownership
      const verificationResult = await verifyNftOwnership(walletAddress);
      
      // Store verification data
      await storeVerificationData(userId, guildId, walletAddress, verificationResult);
      
      // Get guild config and update roles
      const config = await getGuildConfig(guildId);
      const assignedRoles = await updateUserRoles(interaction.member, verificationResult.nftCount, config);
      
      // Create verification result embed
      let embed;
      
      if (verificationResult.nftCount > 0) {
        embed = createSuccessEmbed(
          '✅ NFT Verification Successful!',
          `You own **${verificationResult.nftCount}** Lil' Gargs NFT${verificationResult.nftCount !== 1 ? 's' : ''}!`,
          [
            {
              name: '🎭 Roles Assigned',
              value: assignedRoles.length > 0 ? assignedRoles.map(role => `• ${role}`).join('\n') : 'No roles configured',
              inline: false
            },
            {
              name: '💼 Wallet Address',
              value: `\`${walletAddress}\``,
              inline: false
            }
          ]
        );
        
        // Add NFT details if there are any
        if (verificationResult.nfts.length > 0) {
          const nftList = verificationResult.nfts.slice(0, 5).map(nft =>
            `• ${nft.name || 'Unnamed NFT'}`
          ).join('\n');
          
          embed.addFields({
            name: `🖼️ Your NFTs ${verificationResult.nfts.length > 5 ? `(showing 5 of ${verificationResult.nfts.length})` : ''}`,
            value: nftList,
            inline: false
          });
        }
      } else {
        embed = createErrorEmbed(
          '❌ No NFTs Found',
          'No Lil\' Gargs NFTs were found in your wallet.',
          [
            {
              name: '💼 Wallet Address',
              value: `\`${walletAddress}\``,
              inline: false
            },
            {
              name: '💡 Tips',
              value: '• Make sure you\'re using the correct wallet address\n• Ensure your NFTs are in your wallet (not staked or listed)\n• Try again in a few minutes if you just transferred NFTs',
              inline: false
            }
          ]
        );
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      await handleError(error, interaction);
    }
  }
}

/**
 * Handles ticket system modal interactions
 * @param {ModalSubmitInteraction} interaction - The modal interaction
 * @param {string} action - The action to perform
 */
async function handleTicketModal(interaction, action) {
  if (action === "create_modal") {
    const category = interaction.fields.getTextInputValue("ticket_category").trim();
    const subject = interaction.fields.getTextInputValue("ticket_subject").trim();
    const description = interaction.fields.getTextInputValue("ticket_description").trim();
    const priority = interaction.fields.getTextInputValue("ticket_priority")?.trim().toLowerCase() || 'low';
    
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    try {
      const { getGuildConfig } = require('../utils/dbUtils');
      const { Ticket } = require('../database/models');
      const { createSuccessEmbed, createInfoEmbed } = require('../utils/embedBuilder');
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
      
      // Get guild configuration
      const config = await getGuildConfig(guildId);
      
      if (!config?.ticketSystem?.enabled) {
        throw new BotError(
          'Ticket system is not enabled on this server.',
          ErrorCodes.TICKET_SYSTEM
        );
      }
      
      // Validate priority
      const validPriorities = ['low', 'medium', 'high'];
      const ticketPriority = validPriorities.includes(priority) ? priority : 'low';
      
      await interaction.deferReply({ ephemeral: true });
      
      // Generate ticket number
      const ticketCount = await Ticket.countDocuments({ guildId });
      const ticketNumber = ticketCount + 1;
      
      // Get category channel
      const category_channel = interaction.guild.channels.cache.get(config.ticketSystem.categoryId);
      if (!category_channel) {
        throw new BotError(
          'Ticket category channel not found. Please contact an administrator.',
          ErrorCodes.TICKET_SYSTEM
        );
      }
      
      // Create ticket channel
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${ticketNumber.toString().padStart(4, '0')}`,
        type: ChannelType.GuildText,
        parent: category_channel.id,
        topic: `Ticket #${ticketNumber} - ${subject} | Created by ${interaction.user.tag}`,
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: userId, // Ticket creator
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: interaction.client.user.id, // Bot
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages
            ]
          }
        ]
      });
      
      // Add support role permissions if configured
      if (config.ticketSystem.supportRoleId) {
        await ticketChannel.permissionOverwrites.create(config.ticketSystem.supportRoleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          ManageMessages: true
        });
      }
      
      // Create ticket in database
      const ticket = new Ticket({
        ticketNumber,
        guildId,
        userId,
        channelId: ticketChannel.id,
        category,
        subject,
        description,
        priority: ticketPriority,
        status: 'open',
        createdAt: new Date()
      });
      
      await ticket.save();
      
      // Create ticket embed
      const priorityEmojis = {
        low: '🟢',
        medium: '🟡',
        high: '🔴'
      };
      
      const ticketEmbed = createInfoEmbed(
        `🎫 Ticket #${ticketNumber}`,
        'Your support ticket has been created!',
        [
          {
            name: '👤 Created by',
            value: `${interaction.user}`,
            inline: true
          },
          {
            name: '🏷️ Category',
            value: category,
            inline: true
          },
          {
            name: '📋 Priority',
            value: `${priorityEmojis[ticketPriority]} ${ticketPriority.charAt(0).toUpperCase() + ticketPriority.slice(1)}`,
            inline: true
          },
          {
            name: '📝 Subject',
            value: subject,
            inline: false
          },
          {
            name: '📄 Description',
            value: description.length > 1000 ? description.substring(0, 1000) + '...' : description,
            inline: false
          }
        ]
      );
      
      // Create close button
      const closeButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:close')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );
      
      // Send ticket message to the channel
      await ticketChannel.send({
        content: `${interaction.user} ${config.ticketSystem.supportRoleId ? `<@&${config.ticketSystem.supportRoleId}>` : ''}`,
        embeds: [ticketEmbed],
        components: [closeButton]
      });
      
      // Send confirmation to user
      const confirmEmbed = createSuccessEmbed(
        '✅ Ticket Created Successfully!',
        `Your ticket has been created: ${ticketChannel}`,
        [
          {
            name: '🎫 Ticket Number',
            value: `#${ticketNumber}`,
            inline: true
          },
          {
            name: '📋 Priority',
            value: `${priorityEmojis[ticketPriority]} ${ticketPriority.charAt(0).toUpperCase() + ticketPriority.slice(1)}`,
            inline: true
          }
        ]
      );
      
      await interaction.editReply({ embeds: [confirmEmbed] });
      
      // Log ticket creation
      if (config.ticketSystem.logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(config.ticketSystem.logChannelId);
        if (logChannel) {
          const logEmbed = createInfoEmbed(
            '🎫 New Ticket Created',
            `Ticket #${ticketNumber} has been created`,
            [
              {
                name: '👤 User',
                value: `${interaction.user}`,
                inline: true
              },
              {
                name: '🏷️ Category',
                value: category,
                inline: true
              },
              {
                name: '📋 Priority',
                value: `${priorityEmojis[ticketPriority]} ${ticketPriority.charAt(0).toUpperCase() + ticketPriority.slice(1)}`,
                inline: true
              },
              {
                name: '📝 Subject',
                value: subject,
                inline: false
              },
              {
                name: '🔗 Channel',
                value: `${ticketChannel}`,
                inline: false
              }
            ]
          );
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
      
    } catch (error) {
      await handleError(error, interaction);
    }
  }
}

/**
 * Handles autocomplete interactions
 * @param {AutocompleteInteraction} interaction - The autocomplete interaction
 * @param {Client} client - The Discord client
 */
async function handleAutocompleteInteraction(interaction, client) {
  const command = client.commands.get(interaction.commandName);

  if (!command || !command.autocomplete) {
    return;
  }

  try {
    await command.autocomplete(interaction, client);
  } catch (error) {
    logger.error(
      `Error handling autocomplete for ${interaction.commandName}:`,
      error
    );
  }
}
