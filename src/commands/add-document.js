const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const DocumentManager = require("../services/documentManager");
const RoleManager = require("../utils/roleManager");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");
const axios = require("axios");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-document")
    .setDescription("Add a document to the AI knowledge base")
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("Document file to add (.txt, .md, .pdf, .docx)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Title for the document")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Description of the document")
        .setRequired(false)
        .setMaxLength(500)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category for the document")
        .setRequired(false)
        .addChoices(
          { name: "General", value: "general" },
          { name: "FAQ", value: "faq" },
          { name: "Guide", value: "guide" },
          { name: "Rules", value: "rules" },
          { name: "Lore", value: "lore" },
          { name: "Technical", value: "technical" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("tags")
        .setDescription("Tags for the document (comma-separated)")
        .setRequired(false)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guild = interaction.guild;
      const guildId = guild?.id;

      // Check permissions
      const roleManager = new RoleManager(interaction.client);
      const hasPermission =
        (await roleManager.hasAdminPermissions(guild, userId)) ||
        (await roleManager.hasModeratorPermissions(guild, userId));

      if (!hasPermission) {
        return await interaction.editReply({
          content:
            "❌ You do not have permission to add documents. Only administrators and moderators can add documents.",
        });
      }

      // Get the uploaded file
      const attachment = interaction.options.getAttachment("file");
      if (!attachment) {
        return await interaction.editReply({
          content: "❌ No file was provided.",
        });
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (attachment.size > maxSize) {
        return await interaction.editReply({
          content: "❌ File is too large. Maximum file size is 10MB.",
        });
      }

      // Validate file type
      const allowedExtensions = [".txt", ".md", ".pdf", ".docx", ".json"];
      const fileExtension = attachment.name
        .toLowerCase()
        .substring(attachment.name.lastIndexOf("."));

      if (!allowedExtensions.includes(fileExtension)) {
        return await interaction.editReply({
          content: `❌ File type not supported. Allowed types: ${allowedExtensions.join(
            ", "
          )}`,
        });
      }

      // Download the file content as a buffer
      let fileBuffer;
      try {
        const response = await axios.get(attachment.url, {
          responseType: "arraybuffer", // Download as a buffer
        });
        fileBuffer = response.data;
      } catch (error) {
        logger.error("Error downloading file:", error);
        return await interaction.editReply({
          content: "❌ Failed to download the file. Please try again.",
        });
      }

      // Validate content
      if (!fileBuffer || fileBuffer.length === 0) {
        return await interaction.editReply({
          content: "❌ The file appears to be empty or could not be read.",
        });
      }

      // Prepare metadata
      const title =
        interaction.options.getString("title") ||
        attachment.name.replace(/\.[^/.]+$/, "");
      const description = interaction.options.getString("description") || "";
      const category = interaction.options.getString("category") || "general";
      const tagsString = interaction.options.getString("tags") || "";
      const tags = tagsString
        ? tagsString.split(",").map((tag) => tag.trim().toLowerCase())
        : [];

      const metadata = {
        title,
        description,
        category,
        tags,
        uploadedBy: {
          discordId: userId,
          username: username,
          uploadedAt: new Date(),
        },
      };

      // Initialize document manager and add document
      const documentManager = new DocumentManager();
      await documentManager.initialize();

      const document = await documentManager.addDocument(
        attachment.name,
        fileBuffer, // Pass the buffer
        metadata
      );

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("✅ Document Added Successfully")
        .setDescription(`The document has been added to the AI knowledge base.`)
        .addFields(
          { name: "Title", value: document.title, inline: true },
          { name: "Category", value: document.category, inline: true },
          {
            name: "File Size",
            value: `${(document.fileSize / 1024).toFixed(1)} KB`,
            inline: true,
          },
          { name: "Filename", value: document.filename, inline: false }
        )
        .setFooter({
          text: `Added by ${username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      if (description) {
        embed.addFields({
          name: "Description",
          value: description,
          inline: false,
        });
      }

      if (tags.length > 0) {
        embed.addFields({
          name: "Tags",
          value: tags.join(", "),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

      // Update bot config stats
      if (guildId) {
        await BotConfig.findOneAndUpdate(
          { guildId },
          { $inc: { "stats.totalDocuments": 1 } },
          { upsert: true }
        );
      }

      // Log the action
      logger.info(
        `Document added by ${username} (${userId}): ${document.title} (${document._id})`
      );
    } catch (error) {
      logger.error("Error in add-document command:", error);

      let errorMessage = "An error occurred while adding the document.";

      if (error.message.includes("already exists")) {
        errorMessage =
          "❌ A document with this content or filename already exists.";
      } else if (error.message.includes("File type")) {
        errorMessage = `❌ ${error.message}`;
      } else if (error.message.includes("File size")) {
        errorMessage = `❌ ${error.message}`;
      } else if (error.message.includes("empty")) {
        errorMessage = `❌ ${error.message}`;
      }

      const errorEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("❌ Error Adding Document")
        .setDescription(errorMessage)
        .addFields({
          name: "Error Details",
          value: error.message || "Unknown error",
          inline: false,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};