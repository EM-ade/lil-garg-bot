const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("place-buttons")
    .setDescription("Place feature buttons in specific channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pet-system")
        .setDescription("Place pet system buttons in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to place pet system buttons")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("verification-flow")
        .setDescription("Post the Lil Gargs verification flow message in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post the verification message")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption((option) =>
          option
            .setName("sticky")
            .setDescription("Save this message so the bot can recreate it if removed")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("nft-verification")
        .setDescription("Place NFT verification buttons in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to place NFT verification buttons")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("battle-system")
        .setDescription("Place battle system buttons in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to place battle system buttons")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ticket-system")
        .setDescription("Place ticket system buttons in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to place ticket system buttons")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("feature-hub")
        .setDescription("Place all feature buttons in a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to place all feature buttons")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove feature buttons from a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to remove buttons from")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName("feature")
            .setDescription("Which feature buttons to remove")
            .setRequired(true)
            .addChoices(
              { name: "All Features", value: "all" },
              { name: "Pet System", value: "pet" },
              { name: "NFT Verification", value: "nft" },
              { name: "Battle System", value: "battle" },
              { name: "Ticket System", value: "ticket" },
            ),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      // Get or create bot config
      let botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig) {
        botConfig = new BotConfig({
          guildId: guildId,
          guildName: interaction.guild.name
        });
        await botConfig.save();
      }

      switch (subcommand) {
        case "pet-system":
          await this.handlePetSystemButtons(interaction, botConfig);
          break;
        case "nft-verification":
          await this.handleNFTVerificationButtons(interaction, botConfig);
          break;
        case "battle-system":
          await this.handleBattleSystemButtons(interaction, botConfig);
          break;
        case "ticket-system":
          await this.handleTicketSystemButtons(interaction, botConfig);
          break;
        case "verification-flow":
          await this.handleVerificationFlow(interaction, botConfig);
          break;
        case "feature-hub":
          await this.handleFeatureHubButtons(interaction, botConfig);
          break;
        case "remove":
          await this.handleRemoveButtons(interaction, botConfig);
          break;
      }
    } catch (error) {
      logger.error(`Error in place-buttons command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        flags: 64,
      });
    }
  },

  async handlePetSystemButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    
    try {
      // Create pet system embed
      const embed = new EmbedBuilder()
        .setColor("#FF6B35")
        .setTitle("🐲 Lil Gargs Pet System")
        .setDescription("Welcome to the pet system! Here you can adopt, train, and care for your very own Lil Garg companion.")
        .addFields(
          { name: "🐾 Adopt a Pet", value: "Get your first companion and start your journey", inline: false },
          { name: "🍖 Feed Your Pet", value: "Keep your pet healthy and happy", inline: false },
          { name: "⚡ Train Your Pet", value: "Increase your pet's stats and abilities", inline: false },
          { name: "🎮 Play with Pet", value: "Boost your pet's mood and energy", inline: false }
        )
        .setFooter({ text: "Use the buttons below to interact with the pet system!" })
        .setTimestamp();

      // Create pet system buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_pet_adopt")
            .setLabel("Adopt Pet")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🐲"),
          new ButtonBuilder()
            .setCustomId("feature_pet_status")
            .setLabel("Pet Status")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📊")
        );

      // Send the message with buttons
      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      // Update bot config
      botConfig.petSystem = {
        ...botConfig.petSystem,
        enabled: true,
        buttonChannelId: channel.id
      };
      await botConfig.save();

      await interaction.reply({
        content: `✅ Pet system buttons have been placed in ${channel}!`,
        flags: 64
      });

      logger.info(`Pet system buttons placed in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error placing pet system buttons:", error);
      await interaction.reply({
        content: "❌ Failed to place pet system buttons. Please try again.",
        flags: 64
      });
    }
  },

  async handleNFTVerificationButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    
    try {
      // Create NFT verification embed
      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle("💎 Lil Gargs NFT Verification")
        .setDescription("Connect your Solana wallet to verify your Lil Gargs NFT ownership and unlock exclusive roles!")
        .addFields(
          { name: "🔐 Verify Wallet", value: "Connect your wallet to check NFT ownership", inline: false },
          { name: "🎭 Role Assignment", value: "Get roles based on your NFT collection", inline: false },
          { name: "📊 Check Status", value: "View your current verification status", inline: false },
          { name: "🔄 Auto Updates", value: "Roles update automatically when holdings change", inline: false }
        )
        .setFooter({ text: "Click the button below to start verification!" })
        .setTimestamp();

      // Create NFT verification buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_nft_verify")
            .setLabel("Verify NFT")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💎"),
          new ButtonBuilder()
            .setCustomId("check_status")
            .setLabel("Check Status")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📊")
        );

      // Send the message with buttons
      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      await interaction.reply({
        content: `✅ NFT verification buttons have been placed in ${channel}!`,
        flags: 64
      });

      logger.info(`NFT verification buttons placed in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error placing NFT verification buttons:", error);
      await interaction.reply({
        content: "❌ Failed to place NFT verification buttons. Please try again.",
        flags: 64
      });
    }
  },

  async handleBattleSystemButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    
    try {
      // Create battle system embed
      const embed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("⚔️ Lil Gargs Battle Arena")
        .setDescription("Enter the arena and challenge other members to epic battles with your trained pets!")
        .addFields(
          { name: "🎯 Start Battle", value: "Challenge another member to a duel", inline: false },
          { name: "🏆 Battle Arena", value: "View ongoing battles and rankings", inline: false },
          { name: "📊 Battle Profile", value: "Check your battle statistics", inline: false },
          { name: "🔥 Elemental Combat", value: "Use elemental strengths and weaknesses", inline: false }
        )
        .setFooter({ text: "Ready to prove your worth in battle?" })
        .setTimestamp();

      // Create battle system buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_battle_start")
            .setLabel("Start Battle")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚔️"),
          new ButtonBuilder()
            .setCustomId("battle_arena")
            .setLabel("View Arena")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🏆")
        );

      // Send the message with buttons
      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      // Update bot config
      botConfig.battleSystem = {
        ...botConfig.battleSystem,
        enabled: true,
        buttonChannelId: channel.id
      };
      await botConfig.save();

      await interaction.reply({
        content: `✅ Battle system buttons have been placed in ${channel}!`,
        flags: 64
      });

      logger.info(`Battle system buttons placed in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error placing battle system buttons:", error);
      await interaction.reply({
        content: "❌ Failed to place battle system buttons. Please try again.",
        flags: 64
      });
    }
  },

  async handleTicketSystemButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    
    try {
      // Create ticket system embed
      const embed = new EmbedBuilder()
        .setColor("#F39C12")
        .setTitle("🎫 Lil Gargs Support Tickets")
        .setDescription("Need help or have a question? Create a support ticket and our staff will assist you!")
        .addFields(
          { name: "📝 Create Ticket", value: "Open a new support ticket", inline: false },
          { name: "📋 Ticket Categories", value: "General, Support, Bug Reports, Feature Requests", inline: false },
          { name: "🔒 Private Channels", value: "Tickets create private channels for privacy", inline: false },
          { name: "⚡ Quick Response", value: "Staff will respond to your ticket promptly", inline: false }
        )
        .setFooter({ text: "Click the button below to create a ticket!" })
        .setTimestamp();

      // Create ticket system buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_create_ticket")
            .setLabel("Create Ticket")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎫"),
          new ButtonBuilder()
            .setCustomId("ticket_list")
            .setLabel("My Tickets")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📋")
        );

      // Send the message with buttons
      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      // Update bot config
      botConfig.ticketSystem = {
        ...botConfig.ticketSystem,
        enabled: true,
        buttonChannelId: channel.id
      };
      await botConfig.save();

      await interaction.reply({
        content: `✅ Ticket system buttons have been placed in ${channel}!`,
        flags: 64
      });

      logger.info(`Ticket system buttons placed in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error placing ticket system buttons:", error);
      await interaction.reply({
        content: "❌ Failed to place ticket system buttons. Please try again.",
        flags: 64
      });
    }
  },

  async handleFeatureHubButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    
    try {
      // Create feature hub embed
      const embed = new EmbedBuilder()
        .setColor("#FF6B35")
        .setTitle("🌟 Lil Gargs Feature Hub")
        .setDescription("Welcome to the Lil Gargs community! Here you can access all the main features of our server.")
        .addFields(
          { name: "🐲 Pet System", value: "Adopt and train your Lil Garg companion", inline: false },
          { name: "💎 NFT Verification", value: "Verify your NFT ownership and get roles", inline: false },
          { name: "⚔️ Battle Arena", value: "Challenge other members in epic battles", inline: false },
          { name: "🎫 Support Tickets", value: "Get help from our staff team", inline: false }
        )
        .setFooter({ text: "Choose a feature below to get started!" })
        .setTimestamp();

      // Create feature hub buttons (2 rows)
      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_pet_adopt")
            .setLabel("Adopt Pet")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🐲"),
          new ButtonBuilder()
            .setCustomId("feature_nft_verify")
            .setLabel("Verify NFT")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💎")
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("feature_battle_start")
            .setLabel("Start Battle")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚔️"),
          new ButtonBuilder()
            .setCustomId("feature_create_ticket")
            .setLabel("Create Ticket")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎫")
        );

      // Send the message with buttons
      await channel.send({
        embeds: [embed],
        components: [row1, row2]
      });

      // Update bot config
      botConfig.featureHub = {
        enabled: true,
        channelId: channel.id
      };
      await botConfig.save();

      await interaction.reply({
        content: `✅ Feature hub has been created in ${channel}!`,
        flags: 64
      });

      logger.info(`Feature hub created in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error creating feature hub:", error);
      await interaction.reply({
        content: "❌ Failed to create feature hub. Please try again.",
        flags: 64
      });
    }
  },

  async handleRemoveButtons(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    const feature = interaction.options.getString("feature");
    
    try {
      if (feature === "all") {
        // Remove all feature buttons from the channel
        const messages = await channel.messages.fetch({ limit: 100 });
        
        for (const [messageId, message] of messages) {
          if (message.author.id === interaction.client.user.id && message.components.length > 0) {
            try {
              await message.delete();
            } catch (error) {
              logger.error(`Failed to delete message ${messageId}:`, error);
            }
          }
        }

        // Clear all feature channel IDs
        botConfig.petSystem = { ...botConfig.petSystem, buttonChannelId: null };
        botConfig.battleSystem = { ...botConfig.battleSystem, buttonChannelId: null };
        botConfig.ticketSystem = { ...botConfig.ticketSystem, buttonChannelId: null };
        botConfig.featureHub = { enabled: false, channelId: null };

        await interaction.reply({
          content: `✅ All feature buttons have been removed from ${channel}!`,
          flags: 64
        });
      } else {
        // Remove specific feature buttons
        const messages = await channel.messages.fetch({ limit: 100 });
        
        for (const [messageId, message] of messages) {
          if (message.author.id === interaction.client.user.id && message.components.length > 0) {
            // Check if this message contains the specific feature
            const hasFeature = message.components.some(row => 
              row.components.some(button => button.customId?.includes(feature))
            );
            
            if (hasFeature) {
              try {
                await message.delete();
              } catch (error) {
                logger.error(`Failed to delete message ${messageId}:`, error);
              }
            }
          }
        }

        // Clear specific feature channel ID
        switch (feature) {
          case "pet":
            botConfig.petSystem = { ...botConfig.petSystem, buttonChannelId: null };
            break;
          case "battle":
            botConfig.battleSystem = { ...botConfig.battleSystem, buttonChannelId: null };
            break;
          case "ticket":
            botConfig.ticketSystem = { ...botConfig.ticketSystem, buttonChannelId: null };
            break;
        }

        await interaction.reply({
          content: `✅ ${feature} system buttons have been removed from ${channel}!`,
          flags: 64
        });
      }

      await botConfig.save();
      logger.info(`${feature} buttons removed from ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error removing buttons:", error);
      await interaction.reply({
        content: "❌ Failed to remove buttons. Please try again.",
        flags: 64,
      });
    }
  },

  async handleVerificationFlow(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");

    try {
      const embed = new EmbedBuilder()
        .setColor("#8B008B")
        .setTitle("🪄 Lil Gargs NFT Verification")
        .setDescription("Click the button below to verify your Lil Gargs NFT ownership and claim your holder role.")
        .addFields(
          {
            name: "📋 How it works",
            value:
              '1. Click "Verify Now"\n2. Enter your Solana wallet address\n3. We check your Lil Gargs holding\n4. Roles update automatically',
          },
          {
            name: "💡 Tip",
            value: "Verification happens instantly inside Discord—no external portal required.",
          },
        )
        .setFooter({ text: "Need help? Contact an admin." })
        .setTimestamp();

      const verifyButton = new ButtonBuilder()
        .setCustomId("nft_verify_button")
        .setLabel("Verify Now")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅");

      const actionRow = new ActionRowBuilder().addComponents(verifyButton);

      await channel.send({
        embeds: [embed],
        components: [actionRow],
      });

      await interaction.reply({
        content: `✅ Verification message posted in ${channel}.`,
        flags: 64,
      });
    } catch (error) {
      logger.error("Error posting verification flow message:", error);
      await interaction.reply({
        content: "❌ Failed to post the verification message. Please try again.",
        flags: 64,
      });
    }
  },
};
