const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const winston = require("winston");
require("dotenv").config();

// Import modules
const { loadCommands } = require("./utils/commandLoader");
const { setupDatabase } = require("./database/connection");
const logger = require("./utils/logger");
const ErrorHandler = require("./utils/errorHandler");
const rateLimiter = require("./utils/rateLimiter");
const chatManager = require("./services/chatManager");

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
  }

  async initialize() {
    try {
      // Setup database connection
      await setupDatabase();

      // Load commands
      await loadCommands(this.client);

      // Login to Discord
      await this.client.login(process.env.DISCORD_BOT_TOKEN);

      logger.info("Lil Gargs Bot initialized successfully!");
    } catch (error) {
      logger.error("Failed to initialize bot:", error);
      process.exit(1);
    }
  }

  setupEventHandlers() {
    this.client.once("ready", () => {
      logger.info(`Bot is ready! Logged in as ${this.client.user.tag}`);
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

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
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot) return;

      if (message.mentions.has(this.client.user)) {
        const response = chatManager.getRandomResponse();
        await message.channel.send(response);
      }
    });

    this.client.on("error", (error) => {
      logger.error("Discord client error:", error);
    });
  }
}

// Start the bot
const bot = new LilGargsBot();
bot.initialize();
