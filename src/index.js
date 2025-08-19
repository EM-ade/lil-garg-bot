const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const winston = require("winston");
require("dotenv").config();

console.log(`[${new Date().toISOString()}] Bot starting...`);

// Import modules
const { loadCommands } = require("./utils/commandLoader");
const setupDatabase = require("./database/connection"); // Corrected import
const logger = require("./utils/logger");
const ErrorHandler = require("./utils/errorHandler");
const rateLimiter = require("./utils/rateLimiter");
const chatManager = require("./services/chatManager");
const AIChatbot = require("./services/aiChatbot");
const SecurityManager = require("./utils/securityManager");
const ButtonHandler = require("./utils/buttonHandler");
const CleanupManager = require("./utils/cleanupManager");
const NFTMonitoringService = require("./services/nftMonitoringService");
const PetMaintenanceService = require("./services/petMaintenanceService");

// Setup global error handlers
ErrorHandler.setupGlobalErrorHandlers();

class LilGargsBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.client.commands = new Collection();
    this.setupEventHandlers();
    
    // Initialize security and button handlers
    this.securityManager = new SecurityManager(this.client);
    this.buttonHandler = new ButtonHandler(this.client);
    this.cleanupManager = new CleanupManager(this.client);
    
    // Initialize NFT monitoring service
    this.nftMonitoringService = new NFTMonitoringService();
    this.nftMonitoringService.client = this.client; // Pass client reference
    
    // Initialize pet maintenance service
    this.petMaintenanceService = new PetMaintenanceService();
    
    // Make services available on the client for commands to access
    this.client.nftMonitoringService = this.nftMonitoringService;
    this.client.petMaintenanceService = this.petMaintenanceService;
  }

  async initialize() {
    try {
 console.log(`[${new Date().toISOString()}] Attempting to setup database...`);
      // Setup database connection
      await setupDatabase();
 console.log(`[${new Date().toISOString()}] Database setup complete.`);

 console.log(`[${new Date().toISOString()}] Attempting to load commands...`);

      // Load commands
      await loadCommands(this.client);

      // Login to Discord
      await this.client.login(process.env.DISCORD_BOT_TOKEN);

      logger.info("Lil Gargs Bot initialized successfully!");
 console.log(`[${new Date().toISOString()}] Bot successfully logged in.`);
    } catch (error) {
      logger.error("Failed to initialize bot:", error);
      process.exit(1);
    }
  }

  setupEventHandlers() {
    this.client.once("ready", async () => {
      logger.info(`Bot is ready! Logged in as ${this.client.user.tag}`);
      
      // Start automated services
      try {
        // Start NFT monitoring service
        await this.nftMonitoringService.startMonitoring();
        logger.info("NFT monitoring service started successfully");
        
        // Start pet maintenance service
        await this.petMaintenanceService.startMaintenance();
        logger.info("Pet maintenance service started successfully");
        
        // Start cleanup manager
        this.cleanupManager.setupCleanupJobs();
        logger.info("Cleanup manager started successfully");
      } catch (error) {
        logger.error("Error starting automated services:", error);
      }
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = this.client.commands.get(interaction.commandName);
        if (!command) return;

        try {
          // Apply rate limiting
          const canExecute = await rateLimiter.applyRateLimit(
            interaction,
            interaction.commandName,
            5, // 5 uses per user per minute
            60000, // 1 minute window
            100, // 100 global uses per minute
            60000 // 1 minute window
          );

          if (!canExecute) {
            return; // Rate limit message already sent
          }

          await command.execute(interaction);
        } catch (error) {
          await ErrorHandler.handleCommandError(
            interaction,
            error,
            interaction.commandName
          );
        }
      } else if (interaction.isModalSubmit()) {
        // Handle modal submissions
        await this.handleModalSubmit(interaction);
      }
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot || !message.mentions.has(this.client.user)) {
        return;
      }

      try {
        // Show the bot is typing
        await message.channel.sendTyping();

        // Extract the question from the message, removing the bot mention
        const question = message.content.replace(/<@!?\d+>/, "").trim();

        if (question.length < 3) {
          await message.reply("Please ask a more detailed question.");
          return;
        }

        // Initialize AI chatbot
        const aiChatbot = new AIChatbot();
        const result = await aiChatbot.generateGeneralResponse(question);

        // Send the response
        await message.reply(result.response);
      } catch (error) {
        logger.error("Error handling mentioned message:", error);
        await message.reply(
          "Sorry, I had trouble coming up with a response. Please try again."
        );
      }
    });

    this.client.on("error", (error) => {
      logger.error("Discord client error:", error);
    });

    // Handle new member joins for welcome system
    this.client.on("guildMemberAdd", async (member) => {
      try {
        await this.handleNewMember(member);
      } catch (error) {
        logger.error("Error handling new member:", error);
      }
    });
  }

  async handleModalSubmit(interaction) {
    try {
      const customId = interaction.customId;
      
      if (customId === 'verify_wallet_modal') {
        await this.handleVerifyWalletModal(interaction);
      } else if (customId === 'ticket_create_modal') {
        await this.handleTicketCreateModal(interaction);
      } else if (customId === 'pet_adopt_modal') {
        await this.handlePetAdoptModal(interaction);
      }
    } catch (error) {
      logger.error('Error handling modal submit:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing your submission.',
        ephemeral: true
      });
    }
  }

  async handleVerifyWalletModal(interaction) {
    try {
      const walletAddress = interaction.fields.getTextInputValue('wallet_address');
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guild = interaction.guild;

      // Initialize services
      const NFTVerificationService = require('./services/nftVerification');
      const RoleManager = require('./utils/roleManager');
      const nftService = new NFTVerificationService();
      const roleManager = new RoleManager(interaction.client);

      // Validate wallet address
      if (!nftService.isValidSolanaAddress(walletAddress)) {
        return await interaction.reply({
          content: '❌ Invalid Solana wallet address. Please provide a valid wallet address.',
          ephemeral: true
        });
      }

      // Check if user is already verified with this wallet
      const { User } = require('./database/models');
      const existingUser = await User.findOne({ discordId: userId });
      if (existingUser && existingUser.isVerified && existingUser.walletAddress === walletAddress) {
        return await interaction.reply({
          content: '✅ You are already verified with this wallet address!',
          ephemeral: true
        });
      }

      // Verify NFT ownership
      const verificationResult = await nftService.verifyNFTOwnership(walletAddress);

      if (!verificationResult.isVerified) {
        // Update user record with failed verification
        await User.findOneAndUpdate(
          { discordId: userId },
          {
            discordId: userId,
            username: username,
            walletAddress: walletAddress,
            isVerified: false,
            lastVerificationCheck: new Date(),
            $push: {
              verificationHistory: {
                walletAddress: walletAddress,
                verifiedAt: new Date(),
                nftCount: 0,
                status: 'failed'
              }
            }
          },
          { upsert: true, new: true }
        );

        const embed = new (require('discord.js').EmbedBuilder)()
          .setColor('#FF0000')
          .setTitle('❌ Verification Failed')
          .setDescription('No Lil Gargs NFTs found in this wallet.')
          .addFields({
            name: 'Wallet Address',
            value: walletAddress,
            inline: false
          })
          .setTimestamp();

        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Create or update user record
      const user = await User.findOneAndUpdate(
        { discordId: userId },
        {
          discordId: userId,
          username: username,
          walletAddress: walletAddress,
          isVerified: true,
          nftTokens: verificationResult.nfts.map(nft => ({
            mint: nft.mint,
            name: nft.name,
            image: nft.image,
            verifiedAt: new Date()
          })),
          lastVerificationCheck: new Date(),
          $push: {
            verificationHistory: {
              walletAddress: walletAddress,
              verifiedAt: new Date(),
              nftCount: verificationResult.nftCount,
              status: 'success'
            }
          }
        },
        { upsert: true, new: true }
      );

      // Assign roles based on NFT count
      await roleManager.assignRolesByNFTCount(guild, userId, verificationResult.nftCount);

      // Create success embed
      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor('#00FF00')
        .setTitle('✅ Verification Successful!')
        .setDescription(`Welcome to the Lil Gargs community!`)
        .addFields(
          {
            name: 'Wallet Address',
            value: walletAddress,
            inline: false
          },
          {
            name: 'NFTs Found',
            value: verificationResult.nftCount.toString(),
            inline: true
          },
          {
            name: 'Status',
            value: 'Verified',
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Log verification
      logger.info(`User ${username} (${userId}) verified successfully with ${verificationResult.nftCount} NFTs`);
    } catch (error) {
      logger.error('Error in verify wallet modal:', error);
      await interaction.reply({
        content: '❌ An error occurred during verification. Please try again.',
        ephemeral: true
      });
    }
  }

  async handleTicketCreateModal(interaction) {
    try {
      const subject = interaction.fields.getTextInputValue('ticket_subject');
      const description = interaction.fields.getTextInputValue('ticket_description');
      const category = interaction.fields.getTextInputValue('ticket_category') || 'general';
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guild = interaction.guild;

      // Create ticket channel
      const channelName = `ticket-${username}`;
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: 0, // Text channel
        parent: guild.channels.cache.find(ch => ch.name === 'Tickets')?.id || null,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel']
          },
          {
            id: userId,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });

      // Create ticket record
      const { Ticket } = require('./database/models');
      const ticket = new Ticket({
        userId: userId,
        username: username,
        guildId: guild.id,
        channelId: ticketChannel.id,
        subject: subject,
        description: description,
        category: category,
        status: 'open',
        priority: 'medium'
      });

      await ticket.save();

      // Send ticket confirmation
      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor('#FF6B35')
        .setTitle('🎫 Ticket Created Successfully')
        .setDescription(`Your ticket has been created in ${ticketChannel}`)
        .addFields(
          {
            name: 'Subject',
            value: subject,
            inline: false
          },
          {
            name: 'Category',
            value: category,
            inline: true
          },
          {
            name: 'Status',
            value: 'Open',
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Send initial message in ticket channel
      const ticketEmbed = new (require('discord.js').EmbedBuilder)()
        .setColor('#FF6B35')
        .setTitle(`🎫 Ticket #${ticket._id.toString().slice(-6)}`)
        .setDescription(`**Subject:** ${subject}\n\n**Description:** ${description}`)
        .addFields(
          {
            name: 'Created By',
            value: username,
            inline: true
          },
          {
            name: 'Category',
            value: category,
            inline: true
          },
          {
            name: 'Status',
            value: 'Open',
            inline: true
          }
        )
        .setTimestamp();

      await ticketChannel.send({
        content: `Welcome ${interaction.user}! Staff will be with you shortly.`,
        embeds: [ticketEmbed]
      });

      logger.info(`Ticket created for ${username} (${userId}) in ${guild.name}`);
    } catch (error) {
      logger.error('Error in ticket create modal:', error);
      await interaction.reply({
        content: '❌ An error occurred while creating your ticket. Please try again.',
        ephemeral: true
      });
    }
  }

  async handlePetAdoptModal(interaction) {
    try {
      const petName = interaction.fields.getTextInputValue('pet_name');
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guildId = interaction.guild.id;

      // Check if user already has a pet
      const { Pet } = require('./database/models');
      const existingPet = await Pet.findOne({ ownerId: userId, guildId });
      if (existingPet) {
        return await interaction.reply({
          content: `❌ You already have a pet named **${existingPet.name}**!`,
          ephemeral: true
        });
      }

      // Check if pet system is enabled
      const { BotConfig } = require('./database/models');
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.petSystem?.enabled) {
        return await interaction.reply({
          content: '❌ Pet system is not enabled in this server.',
          ephemeral: true
        });
      }

      // Create new pet
      const pet = new Pet({
        ownerId: userId,
        ownerUsername: username,
        guildId: guildId,
        name: petName,
        element: this.getRandomElement(),
        personality: this.getRandomPersonality()
      });

      await pet.save();

      // Create success embed
      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor('#00FF00')
        .setTitle('🐲 Pet Adoption Successful!')
        .setDescription(`Congratulations! You've adopted **${petName}**!`)
        .addFields(
          {
            name: 'Element',
            value: pet.element,
            inline: true
          },
          {
            name: 'Personality',
            value: pet.personality,
            inline: true
          },
          {
            name: 'Level',
            value: '1',
            inline: true
          }
        )
        .setFooter({ text: `Use /pet status to check on ${petName}!` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      logger.info(`Pet ${petName} adopted by ${username} (${userId}) in ${interaction.guild.name}`);
    } catch (error) {
      logger.error('Error in pet adopt modal:', error);
      await interaction.reply({
        content: '❌ An error occurred while adopting your pet. Please try again.',
        ephemeral: true
      });
    }
  }

  getRandomElement() {
    const elements = ['Fire', 'Ice', 'Nature', 'Storm', 'Shadow'];
    return elements[Math.floor(Math.random() * elements.length)];
  }

  getRandomPersonality() {
    const personalities = ['Brave', 'Curious', 'Loyal', 'Playful'];
    return personalities[Math.floor(Math.random() * personalities.length)];
  }

  async handleNewMember(member) {
    try {
      const { BotConfig } = require("./database/models");
      const botConfig = await BotConfig.findOne({ guildId: member.guild.id });

      // Check if welcome system is enabled
      if (!botConfig?.behavior?.welcomeMessage?.enabled) {
        return;
      }

      // Get welcome channel (default to system channel or general)
      let welcomeChannel = null;
      if (botConfig.welcomeChannelId) {
        welcomeChannel = member.guild.channels.cache.get(
          botConfig.welcomeChannelId
        );
      }

      if (!welcomeChannel) {
        welcomeChannel =
          member.guild.systemChannel ||
          member.guild.channels.cache.find(
            (channel) => channel.name.includes("general") && channel.type === 0
          );
      }

      if (!welcomeChannel) {
        logger.warn(`No welcome channel found for guild ${member.guild.name}`);
        return;
      }

      // Generate AI welcome message
      const aiChatbot = new AIChatbot();
      let welcomeMessage = null;
      
      // Check if custom welcome message is configured
      if (botConfig.behavior?.welcomeMessage?.customMessage) {
        welcomeMessage = botConfig.behavior.welcomeMessage.customMessage;
      } else {
        // Generate AI-powered welcome message
        try {
          welcomeMessage = await aiChatbot.generateWelcomeMessage(member, {
            name: member.guild.name
          });
        } catch (error) {
          logger.error('Failed to generate AI welcome message:', error);
          // Use fallback message
          welcomeMessage = `🎉 Welcome to Lil Gargs, **${member.user.username}**! 🐲

We're thrilled to have you join our amazing community! Here you'll find:
🐲 **Pet System** - Adopt and train your own Lil Garg
⚔️ **Battle Arena** - Challenge other members in epic battles  
💎 **NFT Verification** - Connect your wallet and unlock exclusive roles
🤖 **AI Assistant** - Get help with \`/askgarg\` or mystical guidance with \`/gargoracle\`

Jump right in and start exploring! Use \`/pet adopt [name]\` to get your first companion, or \`/battle start @user\` to challenge someone to a duel. 

Welcome to the family! 🎊`;
        }
      }

      // Create welcome embed using the enhanced embed builder
      const EmbedBuilder = require("./utils/embedBuilder");
      const embed = EmbedBuilder.createWelcomeEmbed(member, welcomeMessage);

      // Add welcome buttons if configured
      let components = [];
      if (botConfig.behavior?.welcomeMessage?.showButtons) {
        const welcomeButtons = EmbedBuilder.createButtonRow([
          {
            customId: 'welcome_pet_adopt',
            label: 'Adopt Pet',
            style: require('discord.js').ButtonStyle.Primary,
            emoji: '🐲'
          },
          {
            customId: 'welcome_nft_verify',
            label: 'Verify NFT',
            style: require('discord.js').ButtonStyle.Success,
            emoji: '💎'
          },
          {
            customId: 'welcome_battle_start',
            label: 'Start Battle',
            style: require('discord.js').ButtonStyle.Secondary,
            emoji: '⚔️'
          }
        ]);
        components.push(welcomeButtons);
      }

      await welcomeChannel.send({
        content: `Welcome ${member}! 🎉`,
        embeds: [embed],
        components: components
      });

      logger.info(
        `Sent welcome message for ${member.user.username} in ${member.guild.name}`
      );
    } catch (error) {
      logger.error("Error in handleNewMember:", error);
    }
  }
}

// Start the bot
const bot = new LilGargsBot();
bot.initialize();
