const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const winston = require("winston");
const express = require("express");
require("dotenv").config();

console.log(`[${new Date().toISOString()}] Bot starting...`);

// Import modules
let config,
  loadCommands,
  setupDatabase,
  logger,
  ErrorHandler,
  rateLimiter,
  chatManager,
  AIChatbot,
  SecurityManager,
  ButtonHandler,
  CleanupManager,
  NFTMonitoringService,
  PetMaintenanceService,
  periodicRoleCheck;

try {
    config = require("./config/environment");
    ({ loadCommands } = require("./utils/commandLoader"));
    setupDatabase = require("./database/connection");
    logger = require("./utils/logger");
    ErrorHandler = require("./utils/errorHandler");
    rateLimiter = require("./utils/rateLimiter");
    chatManager = require("./services/chatManager");
    AIChatbot = require("./services/aiChatbot");
    SecurityManager = require("./utils/securityManager");
    ButtonHandler = require("./utils/buttonHandler");
    CleanupManager = require("./utils/cleanupManager");
    NFTMonitoringService = require("./services/nftMonitoringService");
    PetMaintenanceService = require("./services/petMaintenanceService");
    ({ periodicRoleCheck } = require("./services/nftRoleManagerService"));

    // Setup global error handlers
    ErrorHandler.setupGlobalErrorHandlers();
} catch (importError) {
    const errorTime = new Date();
    console.error(`[${errorTime.toISOString()}] [IMPORT] Critical error during module imports:`, importError);
    console.error(`[${errorTime.toISOString()}] [IMPORT] Error details:`, importError.message);
    console.error(`[${errorTime.toISOString()}] [IMPORT] Error stack:`, importError.stack);
    process.exit(1);
}

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
    const initStartTime = new Date();
    console.log(
      `[${initStartTime.toISOString()}] [INIT] Starting bot initialization...`
    );

    try {
      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to setup database...`
      );
      // Setup database connection
      await setupDatabase();
      console.log(
        `[${new Date().toISOString()}] [INIT] Database setup complete.`
      );

      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to load commands...`
      );
      // Load commands
      await loadCommands(this.client);
      console.log(
        `[${new Date().toISOString()}] [INIT] Commands loaded successfully.`
      );

      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to login to Discord...`
      );
      // Login to Discord
      await this.client.login(process.env.DISCORD_BOT_TOKEN);
      console.log(
        `[${new Date().toISOString()}] [INIT] Discord login successful.`
      );

      const initEndTime = new Date();
      const initDuration = (initEndTime - initStartTime) / 1000;
      logger.info("Lil Gargs Bot initialized successfully!");
      console.log(
        `[${initEndTime.toISOString()}] [INIT] Bot initialization complete (took ${initDuration.toFixed(
          2
        )}s).`
      );
    } catch (error) {
      const errorTime = new Date();
      console.error(
        `[${errorTime.toISOString()}] [INIT] Failed to initialize bot:`,
        error
      );
      console.error(
        `[${errorTime.toISOString()}] [INIT] Error details:`,
        error.message
      );
      console.error(
        `[${errorTime.toISOString()}] [INIT] Error stack:`,
        error.stack
      );
      logger.error("Failed to initialize bot:", error);
      process.exit(1);
    }
  }

  setupEventHandlers() {
    this.client.once("ready", async () => {
      logger.info(`Bot is ready! Logged in as ${this.client.user.tag}`);

      // Set Discord client for API routes
      setDiscordClient(this.client);

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

        // Schedule periodic NFT role checks (e.e.g., every 30 minutes)
        const periodicIntervalMs = 5 * 60 * 1000; // 5 minutes (testing)
        setInterval(() => periodicRoleCheck(this.client), periodicIntervalMs);
        logger.info(`Scheduled periodic NFT role checks every ${periodicIntervalMs / 1000}s (testing).`);
      } catch (error) {
        logger.error('Failed to start automated services:', error)
      }
    })

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = this.client.commands.get(interaction.commandName)
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
            return; // Rate limit message already pictured
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
      } else if (interaction.isButton()) {
        // Handle button interactions
        if (interaction.customId === "welcome_nft_verify") {
          // Instead of opening a modal, we instruct the user to use the slash command
          await interaction.reply({
            content:
              "Please use the `/verify-nft` command directly to verify your wallet.",
            ephemeral: true,
          });
        } else if (interaction.customId === "nft_verify_button") {
          // Handle NFT verification button
          const verifyNftCommand = this.client.commands.get('verify-nft');
          if (verifyNftCommand && verifyNftCommand.handleButtonInteraction) {
            await verifyNftCommand.handleButtonInteraction(interaction);
          } else {
            await interaction.reply({
              content: "❌ Verification system not available. Please try again later.",
              ephemeral: true,
            });
          }
        }
        // You can add more button handlers here if needed
        // else if (interaction.customId === 'another_button') { /* ... */ }
      }
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot) {
        return;
      }

      const mentionRegex = new RegExp(`<@!?${this.client.user.id}>`);
      const hasDirectMention = mentionRegex.test(message.content);
      const isBroadcastMention = message.mentions.everyone;

      const isReply = message.reference && message.reference.messageId;
      let repliedMessage;
      if (isReply) {
        try {
          repliedMessage = await message.channel.messages.fetch(
            message.reference.messageId
          );
        } catch (fetchError) {
          logger.warn(
            `Failed to fetch replied message ${message.reference?.messageId}: ${fetchError.message}`
          );
        }
      }
      const isBotReply = repliedMessage && repliedMessage.author.id === this.client.user.id;

      if (!hasDirectMention && !isBotReply) {
        return;
      }

      if (isBroadcastMention && !isBotReply) {
        return;
      }

      try {
        // Initialize AI chatbot
        const aiChatbot = new AIChatbot();
        await aiChatbot.processAiChatMention(message, this.client);
      } catch (error) {
        logger.error("Error handling mentioned message:", error);
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

      // Handle NFT verification modal
      if (customId === "nft_verify_modal") {
        const verifyNftCommand = this.client.commands.get('verify-nft');
        if (verifyNftCommand && verifyNftCommand.handleModalSubmit) {
          await verifyNftCommand.handleModalSubmit(interaction);
        } else {
          await interaction.reply({
            content: "❌ NFT verification handler not found.",
            ephemeral: true,
          });
        }
      } else if (customId === "ticket_create_modal") {
        await this.handleTicketCreateModal(interaction);
      } else if (customId === "pet_adopt_modal") {
        await this.handlePetAdoptModal(interaction);
      } else {
        logger.warn(`Unhandled modal submission: ${customId}`);
        await interaction.reply({
          content: "Unhandled modal submission.",
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error("Error handling modal submit:", error);
      await interaction.reply({
          content: "❌ An error occurred while processing your submission.",
          ephemeral: true,
      });
    }
  }

  // Removed handleVerifyWalletModal as its functionality is now in /verify-nft command
  // async handleVerifyWalletModal(interaction) { ... }

  async handleTicketCreateModal(interaction) {
    try {
      const subject = interaction.fields.getTextInputValue("ticket_subject");
      const description =
        interaction.fields.getTextInputValue("ticket_description");
      const category =
        interaction.fields.getTextInputValue("ticket_category") || "general";
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guild = interaction.guild;

      // Create ticket channel
      const channelName = `ticket-${username}`;
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: 0, // Text channel
        parent:
          guild.channels.cache.find((ch) => ch.name === "Tickets")?.id || null,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ["ViewChannel"],
          },
          {
            id: userId,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
        ],
      });

      // Create ticket record
      const { Ticket } = require("./database/models");
      const ticket = new Ticket({
        userId: userId,
        username: username,
        guildId: guild.id,
        channelId: ticketChannel.id,
        subject: subject,
        description: description,
        category: category,
        status: "open",
        priority: "medium",
      });

      await ticket.save();

      // Send ticket confirmation
      const embed = new (require("discord.js").EmbedBuilder)()
        .setColor("#FF6B35")
        .setTitle("🎫 Ticket Created Successfully")
        .setDescription(`Your ticket has been created in ${ticketChannel}`)
        .addFields(
          {
            name: "Subject",
            value: subject,
            inline: false,
          },
          {
            name: "Category",
            value: category,
            inline: true,
          },
          {
            name: "Status",
            value: "Open",
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Send initial message in ticket channel
      const ticketEmbed = new (require("discord.js").EmbedBuilder)()
        .setColor("#FF6B35")
        .setTitle(`🎫 Ticket #${ticket._id.toString().slice(-6)}`)
        .setDescription(
          `**Subject:** ${subject}\n\n**Description:** ${description}`
        )
        .addFields(
          {
            name: "Created By",
            value: username,
            inline: true,
          },
          {
            name: "Category",
            value: category,
            inline: true,
          },
          {
            name: "Status",
            value: "Open",
            inline: true,
          }
        )
        .setTimestamp();

      await ticketChannel.send({
        content: `Welcome ${interaction.user}! Staff will be with you shortly.`,
        embeds: [ticketEmbed],
      });

      logger.info(
        `Ticket created for ${username} (${userId}) in ${guild.name}`
      );
    } catch (error) {
      logger.error("Error in ticket create modal:", error);
      await interaction.reply({
        content:
          "❌ An error occurred while creating your ticket. Please try again.",
        ephemeral: true,
      });
    }
  }

  async handlePetAdoptModal(interaction) {
    try {
      const petName = interaction.fields.getTextInputValue("pet_name");
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guildId = interaction.guild.id;

      // Check if user already has a pet
      const { Pet } = require("./database/models");
      const existingPet = await Pet.findOne({ ownerId: userId, guildId });
      if (existingPet) {
        return await interaction.reply({
          content: `❌ You already have a pet named **${existingPet.name}**!`,
          ephemeral: true,
        });
      }

      // Check if pet system is enabled
      const { BotConfig } = require("./database/models");
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.petSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Pet system is not enabled in this server.",
          ephemeral: true,
        });
      }

      // Create new pet
      const pet = new Pet({
        ownerId: userId,
        ownerUsername: username,
        guildId: guildId,
        name: petName,
        element: this.getRandomElement(),
        personality: this.getRandomPersonality(),
      });

      await pet.save();

      // Create success embed
      const embed = new (require("discord.js").EmbedBuilder)()
        .setColor("#00FF00")
        .setTitle("🐲 Pet Adoption Successful!")
        .setDescription(`Congratulations! You've adopted **${petName}**!`)
        .addFields(
          {
            name: "Element",
            value: pet.element,
            inline: true,
          },
          {
            name: "Personality",
            value: pet.personality,
            inline: true,
          },
          {
            name: "Level",
            value: "1",
            inline: true,
          }
        )
        .setFooter({ text: `Use /pet status to check on ${petName}!` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      logger.info(
        `Pet ${petName} adopted by ${username} (${userId}) in ${interaction.guild.name}`
      );
    } catch (error) {
      logger.error("Error in pet adopt modal:", error);
      await interaction.reply({
        content:
          "❌ An error occurred while adopting your pet. Please try again.",
        ephemeral: true,
      });
    }
  }

  getRandomElement() {
    const elements = ["Fire", "Ice", "Nature", "Storm", "Shadow"];
    return elements[Math.floor(Math.random() * elements.length)];
  }

  getRandomPersonality() {
    const personalities = ["Brave", "Curious", "Loyal", "Playful"];
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
            name: member.guild.name,
          });
        } catch (error) {
          logger.error("Failed to generate AI welcome message:", error);
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
            customId: "welcome_pet_adopt",
            label: "Adopt Pet",
            style: require("discord.js").ButtonStyle.Primary,
            emoji: "🐲",
          },
          {
            // This button now suggests using the slash command instead of opening a modal
            customId: "welcome_nft_verify",
            label: "Verify NFT (Use /verify-nft)",
            style: require("discord.js").ButtonStyle.Success,
            emoji: "💎",
          },
          {
            customId: "welcome_battle_start",
            label: "Start Battle",
            style: require("discord.js").ButtonStyle.Secondary,
            emoji: "⚔️",
          },
        ]);
        components.push(welcomeButtons);
      }

      await welcomeChannel.send({
        content: `Welcome ${member}! 🎉`,
        embeds: [embed],
        components: components,
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
// Set up Express server for API routes
const app = express();
const cors = require('cors');

const corsFromEnv = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    ...corsFromEnv,
    config?.frontend?.url || 'http://localhost:5173',
    'http://localhost:5173',
  ]),
);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Mount the API routes
const verificationCallbackRouter = require("./api/verificationCallback");
const verifyRouter = require("./api/verify");
const verificationSessionsRouter = require("./api/verificationSessions");
app.use("/api", verificationCallbackRouter);
app.use("/api", verifyRouter);
app.use("/api", verificationSessionsRouter);

// Make Discord client available to API routes
let discordClient = null;

// Start the Express server
const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] [API] Server running on port ${PORT}`);
});

// Function to set the Discord client once the bot is ready
function setDiscordClient(client) {
  discordClient = client;
  app.set('discordClient', client);
  console.log(`[${new Date().toISOString()}] [API] Discord client set for API routes`);
}

console.log(`[${new Date().toISOString()}] [STARTUP] Creating bot instance...`);
try {
    const bot = new LilGargsBot();
    console.log(`[${new Date().toISOString()}] [STARTUP] Bot instance created successfully.`);

    console.log(`[${new Date().toISOString()}] [STARTUP] Starting bot initialization...`);
    bot.initialize();
    console.log(`[${new Date().toISOString()}] [STARTUP] Bot initialization called successfully.`);
} catch (startupError) {
    const errorTime = new Date();
    console.error(`[${errorTime.toISOString()}] [STARTUP] Critical error during bot startup:`, startupError);
    console.error(`[${errorTime.toISOString()}] [STARTUP] Error details:`, startupError.message);
    console.error(`[${errorTime.toISOString()}] [STARTUP] Error stack:`, startupError.stack);
    process.exit(1);
}
