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
  periodicRoleCheck,
  setNftCache,
  NFTCache;

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
  ({ periodicRoleCheck, setNftCache } = require("./services/nftRoleManagerService"));
  NFTCache = require("./services/redisCache");

  // Setup global error handlers
  ErrorHandler.setupGlobalErrorHandlers();
} catch (importError) {
  const errorTime = new Date();
  console.error(
    `[${errorTime.toISOString()}] [IMPORT] Critical error during module imports:`,
    importError,
  );
  console.error(
    `[${errorTime.toISOString()}] [IMPORT] Error details:`,
    importError.message,
  );
  console.error(
    `[${errorTime.toISOString()}] [IMPORT] Error stack:`,
    importError.stack,
  );
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
      `[${initStartTime.toISOString()}] [INIT] Starting bot initialization...`,
    );

    try {
      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to setup database...`,
      );
      // Setup database connection
      await setupDatabase();
      console.log(
        `[${new Date().toISOString()}] [INIT] Database setup complete.`,
      );

      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to load commands...`,
      );
      // Load commands
      await loadCommands(this.client);
      console.log(
        `[${new Date().toISOString()}] [INIT] Commands loaded successfully.`,
      );

      console.log(
        `[${new Date().toISOString()}] [INIT] Attempting to login to Discord...`,
      );
      // Login to Discord
      await this.client.login(process.env.DISCORD_BOT_TOKEN);
      console.log(
        `[${new Date().toISOString()}] [INIT] Discord login successful.`,
      );

      const initEndTime = new Date();
      const initDuration = (initEndTime - initStartTime) / 1000;
      logger.info("Lil Gargs Bot initialized successfully!");
      console.log(
        `[${initEndTime.toISOString()}] [INIT] Bot initialization complete (took ${initDuration.toFixed(
          2,
        )}s).`,
      );
    } catch (error) {
      const errorTime = new Date();
      console.error(
        `[${errorTime.toISOString()}] [INIT] Failed to initialize bot:`,
        error,
      );
      console.error(
        `[${errorTime.toISOString()}] [INIT] Error details:`,
        error.message,
      );
      console.error(
        `[${errorTime.toISOString()}] [INIT] Error stack:`,
        error.stack,
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

        // Initialize Redis NFT cache
        let nftCache = null;
        try {
          nftCache = new NFTCache(config.redis.url);
          await nftCache.connect();
          setNftCache(nftCache);
          this.nftCache = nftCache;
          logger.info("NFT Redis cache initialized");
        } catch (error) {
          logger.warn(`Failed to connect to Redis, running without cache: ${error.message}`);
        }

        // Start per-server periodic role check scheduler
        schedulePeriodicRoleChecks(this.client);
      } catch (error) {
        logger.error("Failed to start automated services:", error);
      }
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = this.client.commands.get(interaction.commandName);

        if (!command) {
          logger.warn(
            `No command matching ${interaction.commandName} was found.`,
          );
          await interaction
            .reply({
              content: "❌ This command is deprecated or no longer exists.",
              flags: 64,
            })
            .catch(console.error);
          return;
        }

        try {
          // Apply rate limiting
          const canExecute = await rateLimiter.applyRateLimit(
            interaction,
            interaction.commandName,
            5, // 5 uses per user per minute
            60000, // 1 minute window
            100, // 100 global uses per minute
            60000, // 1 minute window
          );

          if (!canExecute) {
            return; // Rate limit message already pictured
          }

          await command.execute(interaction);
        } catch (error) {
          await ErrorHandler.handleCommandError(
            interaction,
            error,
            interaction.commandName,
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
            flags: 64,
          });
        } else if (interaction.customId === "nft_verify_button") {
          // Handle NFT verification button
          const verifyNftCommand = this.client.commands.get("verify-nft");
          if (verifyNftCommand && verifyNftCommand.handleButtonInteraction) {
            await verifyNftCommand.handleButtonInteraction(interaction);
          } else {
            await interaction.reply({
              content:
                "❌ Verification system not available. Please try again later.",
              flags: 64,
            });
          }
        } else if (interaction.customId.startsWith("ticket_")) {
          // Handle ticket button interactions
          await this.handleTicketButton(interaction);
        }
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
            message.reference.messageId,
          );
        } catch (fetchError) {
          logger.warn(
            `Failed to fetch replied message ${message.reference?.messageId}: ${fetchError.message}`,
          );
        }
      }
      const isBotReply =
        repliedMessage && repliedMessage.author.id === this.client.user.id;

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
        const verifyNftCommand = this.client.commands.get("verify-nft");
        if (verifyNftCommand && verifyNftCommand.handleModalSubmit) {
          await verifyNftCommand.handleModalSubmit(interaction);
        } else {
          await interaction.reply({
            content: "❌ NFT verification handler not found.",
            flags: 64,
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
          flags: 64,
        });
      }
    } catch (error) {
      logger.error("Error handling modal submit:", error);
      await interaction.reply({
        content: "❌ An error occurred while processing your submission.",
        flags: 64,
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
          },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });

      // Send initial message in ticket channel
      const ticketEmbed = new (require("discord.js").EmbedBuilder)()
        .setColor("#FF6B35")
        .setTitle(`🎫 Ticket #${ticket._id.toString().slice(-6)}`)
        .setDescription(
          `**Subject:** ${subject}\n\n**Description:** ${description}`,
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
          },
        )
        .setTimestamp();

      await ticketChannel.send({
        content: `Welcome ${interaction.user}! Staff will be with you shortly.`,
        embeds: [ticketEmbed],
      });

      logger.info(
        `Ticket created for ${username} (${userId}) in ${guild.name}`,
      );
    } catch (error) {
      logger.error("Error in ticket create modal:", error);
      await interaction.reply({
        content:
          "❌ An error occurred while creating your ticket. Please try again.",
        flags: 64,
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
          flags: 64,
        });
      }

      // Check if pet system is enabled
      const { BotConfig } = require("./database/models");
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.petSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Pet system is not enabled in this server.",
          flags: 64,
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
          },
        )
        .setFooter({ text: `Use /pet status to check on ${petName}!` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });

      logger.info(
        `Pet ${petName} adopted by ${username} (${userId}) in ${interaction.guild.name}`,
      );
    } catch (error) {
      logger.error("Error in pet adopt modal:", error);
      await interaction.reply({
        content:
          "❌ An error occurred while adopting your pet. Please try again.",
        flags: 64,
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

  async handleTicketButton(interaction) {
    try {
      logger.info(
        `[Ticket Button] Handling button: ${interaction.customId}, replied: ${interaction.replied}, deferred: ${interaction.deferred}`,
      );

      // Check if interaction is already acknowledged
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: false });
        logger.info(`[Ticket Button] Deferred reply successfully`);
      } else {
        logger.warn(
          `[Ticket Button] Interaction already acknowledged - replied: ${interaction.replied}, deferred: ${interaction.deferred}`,
        );
      }

      const { Ticket, BotConfig } = require("./database/models");
      // customId format: ticket_ACTION_TICKETID
      const parts = interaction.customId.split("_");
      const action = parts[1]; // 'close', 'assign', or 'status'
      const ticketId = parts[2]; // the MongoDB _id

      logger.info(`[Ticket Button] Action: ${action}, TicketId: ${ticketId}`);

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return await interaction.editReply({
          content: "❌ Ticket not found.",
        });
      }

      const botConfig = await BotConfig.findOne({
        guildId: interaction.guild.id,
      });
      const isStaff =
        botConfig?.ticketSystem?.staffRoleIds?.some((roleId) =>
          interaction.member.roles.cache.has(roleId),
        ) || interaction.member.permissions.has("Administrator");

      const isCreator = ticket.creator.id === interaction.user.id;

      switch (action) {
        case "close":
          if (!isStaff && !isCreator) {
            return await interaction.editReply({
              content: "❌ You don't have permission to close this ticket.",
            });
          }

          const closedBy = {
            id: interaction.user.id,
            username: interaction.user.username,
          };

          await ticket.closeTicket(closedBy);

          await interaction.editReply({
            content: `✅ Ticket ${ticket.ticketId} has been closed. This channel will be deleted in 5 seconds.`,
          });

          setTimeout(async () => {
            try {
              await interaction.guild.channels.delete(ticket.channelId);
            } catch (error) {
              logger.error("Error deleting ticket channel:", error);
            }
          }, 5000);
          break;

        case "assign":
          if (!isStaff) {
            return await interaction.editReply({
              content: "❌ Only staff can assign tickets.",
            });
          }

          await ticket.assignStaff(
            interaction.user.id,
            interaction.user.username,
          );

          const { EmbedBuilder } = require("discord.js");
          const assignEmbed = new EmbedBuilder()
            .setColor("#FF6B35")
            .setTitle("👤 Ticket Assigned")
            .setDescription(
              `This ticket has been assigned to ${interaction.user.username}`,
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [assignEmbed] });
          break;

        case "status":
          if (!isStaff) {
            return await interaction.editReply({
              content: "❌ Only staff can update ticket status.",
            });
          }

          await interaction.editReply({
            content:
              "Use `/ticket status` command to update the ticket status.",
          });
          break;

        case "transcript":
          if (!isStaff) {
            return await interaction.editReply({
              content: "❌ Only staff can request ticket transcripts.",
            });
          }

          await interaction.editReply({
            content:
              "📄 Transcript feature coming soon. Please export messages manually for now.",
          });
          break;

        default:
          await interaction.editReply({
            content: "❌ Unknown ticket action.",
          });
      }
    } catch (error) {
      logger.error(`[Ticket Button] Error handling ticket button:`, {
        error: error.message,
        stack: error.stack,
        customId: interaction.customId,
        replied: interaction.replied,
        deferred: interaction.deferred,
      });

      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: "❌ An error occurred while processing your request.",
          });
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ An error occurred while processing your request.",
            flags: 64,
          });
        }
      } catch (replyError) {
        logger.error(
          `[Ticket Button] Failed to send error message:`,
          replyError.message,
        );
      }
    }
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
          botConfig.welcomeChannelId,
        );
      }

      if (!welcomeChannel) {
        welcomeChannel =
          member.guild.systemChannel ||
          member.guild.channels.cache.find(
            (channel) => channel.name.includes("general") && channel.type === 0,
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
        `Sent welcome message for ${member.user.username} in ${member.guild.name}`,
      );
    } catch (error) {
      logger.error("Error in handleNewMember:", error);
    }
  }
}

// Start the bot
// Set up Express server for API routes
const app = express();
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const path = require("path");

// Determine ports FIRST (needed by route handlers below)
const HF_PORT = 7860;
console.log(`[${new Date().toISOString()}] [PORT-DEBUG] process.env.PORT = "${process.env.PORT}"`);
const PRIMARY_PORT = parseInt(process.env.PORT, 10) || HF_PORT;
console.log(`[${new Date().toISOString()}] [PORT-DEBUG] PRIMARY_PORT = ${PRIMARY_PORT}`);
const HTTPS_PORT =
  process.env.API_HTTPS_PORT || process.env.HTTPS_PORT || 30392;

// Request logging middleware - logs EVERY request for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] [REQUEST] ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

// Verification session endpoint - MUST be before /api routes to avoid conflicts
app.get("/verify-session/:token", async (req, res) => {
  console.log(`[${new Date().toISOString()}] [VERIFY-SESSION] HIT - Token: ${req.params.token?.slice(0, 16)}... Origin: ${req.headers.origin || 'none'}`);
  try {
    const { verificationSessionService } = require('./services/verificationSessionService');
    const session = await verificationSessionService.findSessionByToken(req.params.token, { includeMessage: true });
    if (!session) {
      console.log(`[${new Date().toISOString()}] [VERIFY-SESSION] Not found for token: ${req.params.token?.slice(0, 16)}...`);
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    console.log(`[${new Date().toISOString()}] [VERIFY-SESSION] Found: ${session.status}`);
    res.json({ success: true, session });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [VERIFY-SESSION] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// CORS configuration
const corsFromEnv = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Update allowed origins to include frontend
const allowedOrigins = Array.from(
  new Set([
    ...corsFromEnv,
    config?.frontend?.url || "http://localhost:5173",
    "http://localhost:5173",
    "https://lilgarg.xyz",
    "https://discord.lilgarg.xyz",
    "http://2.56.246.119:30391",
    "https://2.56.246.119:30392",
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
const multiTenantVerifyRouter = require("./api/multiTenantVerify");

app.use("/api", verificationCallbackRouter);
app.use("/api", verifyRouter);
app.use("/api", verificationSessionsRouter);
app.use("/api", multiTenantVerifyRouter);

// Make Discord client available to API routes
let discordClient = null;

// Health check endpoint for hosting providers
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    discordConnected: !!discordClient && discordClient.isReady(),
    httpPort: PRIMARY_PORT,
    httpsPort: HTTPS_PORT,
  });
});

// Simple ping endpoint for uptime monitors (UptimeRobot, etc.)
app.get("/hf-ping", (req, res) => {
  res.type("text/plain").send("pong");
});

// Root route to verify connectivity
app.get("/", (req, res) => {
  res.type("text/html").send(
    "<h1>🐲 Lil Gargs Bot API</h1><p>Server is running.</p>" +
    `<p>Port: ${PRIMARY_PORT} | Discord: ${!!discordClient}</p>`
  );
});

// Debug: test if /api/* paths work at all
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API routes are accessible" });
});

// Debug: Supabase connectivity check
app.get("/debug/supabase", async (req, res) => {
  const { isSupabaseAvailable, getSupabaseClient } = require('./database/supabaseClient');
  const available = isSupabaseAvailable();
  res.json({
    supabaseAvailable: available,
    supabaseUrl: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET',
  });
});

// Load SSL certificates (optional - only if files exist)
const keyPath = path.join(__dirname, "../server.key");
const certPath = path.join(__dirname, "../server.crt");
const sslFilesExist = fs.existsSync(keyPath) && fs.existsSync(certPath);

if (sslFilesExist) {
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  const httpsServer = https.createServer(sslOptions, app);
  httpsServer.listen(HTTPS_PORT, "0.0.0.0", () => {
    console.log(
      `[${new Date().toISOString()}] [API] HTTPS Server running on port ${HTTPS_PORT}`,
    );
  });
} else {
  console.log(
    `[${new Date().toISOString()}] [API] SSL certificates not found, skipping HTTPS server`,
  );
}

// Primary HTTP listener - on HF Spaces this MUST be port 7860
// For local/Orihost deployment, PORT env var can override
app.listen(PRIMARY_PORT, "0.0.0.0", () => {
  console.log(
    `[${new Date().toISOString()}] [HTTP] Express server listening on port ${PRIMARY_PORT}`,
  );
});

// Catch-all 404 handler for debugging - catches requests that don't match any route
app.use((req, res) => {
  console.log(`[${new Date().toISOString()}] [404] No route matched: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Not Found", path: req.path });
});

// Function to set the Discord client once the bot is ready
function setDiscordClient(client) {
  discordClient = client;
  app.set("discordClient", client);
  console.log(
    `[${new Date().toISOString()}] [API] Discord client set for API routes`,
  );
}

/**
 * Per-server periodic role check scheduler.
 * Each guild with periodic checks enabled gets its own independent timer.
 */
const periodicTimers = new Map();

async function schedulePeriodicRoleChecks(client) {
  const { getGuildVerificationConfigStore } = require('./services/serviceFactory');
  const guildVerificationConfigStore = getGuildVerificationConfigStore();

  if (!guildVerificationConfigStore) {
    logger.warn('No guild verification config store — skipping periodic role check setup');
    return;
  }

  try {
    // Get all rules across all guilds
    const allRules = await guildVerificationConfigStore.listAll();

    // Group by guild
    const guildMap = new Map();
    for (const rule of allRules) {
      if (!guildMap.has(rule.guildId)) {
        guildMap.set(rule.guildId, {
          periodicCheckEnabled: rule.periodicCheckEnabled !== false,
          periodicCheckIntervalMinutes: rule.periodicCheckIntervalMinutes || 360,
        });
      }
    }

    // Clear existing timers
    for (const [guildId, timer] of periodicTimers) {
      clearInterval(timer);
    }
    periodicTimers.clear();

    // Set up per-guild timers
    for (const [guildId, settings] of guildMap) {
      if (!settings.periodicCheckEnabled) {
        logger.info(`Periodic checks disabled for guild ${guildId}`);
        continue;
      }

      const intervalMs = settings.periodicCheckIntervalMinutes * 60 * 1000;
      const timer = setInterval(async () => {
        try {
          logger.info(`Running periodic role check for guild ${guildId}`);
          await periodicRoleCheck(client, guildId);
        } catch (error) {
          logger.error(`Error in periodic role check for guild ${guildId}:`, error);
        }
      }, intervalMs);

      periodicTimers.set(guildId, timer);
      const hours = (settings.periodicCheckIntervalMinutes / 60).toFixed(1);
      logger.info(
        `Scheduled periodic role checks for guild ${guildId} every ${hours} hours`,
      );
    }

    if (guildMap.size === 0) {
      logger.info('No guilds with verification rules found — no periodic checks scheduled');
    }
  } catch (error) {
    logger.error('Failed to schedule periodic role checks:', error);
  }
}

// Make it globally accessible for re-scheduling when configs change
global.schedulePeriodicRoleChecks = schedulePeriodicRoleChecks;

function deployCommands() {
  return new Promise((resolve, reject) => {
    const { REST, Routes } = require("discord.js");
    const fs = require("fs");
    const path = require("path");

    const clientId = process.env.DISCORD_CLIENT_ID || Buffer.from(process.env.DISCORD_BOT_TOKEN.split(".")[0], "base64").toString("ascii");
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

    const commandsPath = path.join(__dirname, "commands");
    const deprecatedCommandFiles = new Set([
      "add-nft-contract.js",
      "config-nft-role.js",
      "remove-verification.js",
      "set-verification-log-channel.js",
      "setup-verification.js",
    ]);

    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js") && !deprecatedCommandFiles.has(file));

    const commands = [];
    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
      }
    }

    // Clean up guild-specific commands (prevents duplicates)
    const guildIds = [process.env.DISCORD_SERVER_ID, process.env.GUILD_ID].filter(Boolean);
    
    const cleanupPromises = guildIds.map(async (guildId) => {
      try {
        const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        if (guildCommands.length > 0) {
          await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        }
      } catch (err) { /* ignore */ }
    });

    Promise.all(cleanupPromises).then(async () => {
      try {
        const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`[STARTUP] Deployed ${data.length} slash commands`);
        resolve();
      } catch (err) {
        reject(err);
      }
    }).catch(reject);
  });
}

// Wrap in async IIFE
(async function() {
  console.log(`[${new Date().toISOString()}] [STARTUP] Creating bot instance...`);
  try {
    const bot = new LilGargsBot();
    console.log(
      `[${new Date().toISOString()}] [STARTUP] Bot instance created successfully.`,
    );

    console.log(
      `[${new Date().toISOString()}] [STARTUP] Deploying slash commands...`,
    );
    await deployCommands();
    console.log(
      `[${new Date().toISOString()}] [STARTUP] Slash commands deployed successfully.`,
    );

    console.log(
      `[${new Date().toISOString()}] [STARTUP] Starting bot initialization...`,
    );
    bot.initialize();
    console.log(
      `[${new Date().toISOString()}] [STARTUP] Bot initialization called successfully.`,
    );
  } catch (startupError) {
    const errorTime = new Date();
    console.error(
      `[${errorTime.toISOString()}] [STARTUP] Critical error during bot startup:`,
      startupError,
    );
    console.error(
      `[${errorTime.toISOString()}] [STARTUP] Error details:`,
      startupError.message,
    );
    console.error(
      `[${errorTime.toISOString()}] [STARTUP] Error stack:`,
      startupError.stack,
    );
    process.exit(1);
  }
})();
