const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { Ticket, BotConfig } = require("../database/models");
const logger = require("../utils/logger");

const PRIORITY_META = {
  low: { label: "Low", emoji: "🟢", color: "#2ECC71" },
  medium: { label: "Medium", emoji: "🟡", color: "#F1C40F" },
  high: { label: "High", emoji: "🟠", color: "#E67E22" },
  urgent: { label: "Critical", emoji: "🔴", color: "#E74C3C" },
};

const STATUS_META = {
  open: { label: "Open", emoji: "🟢" },
  in_progress: { label: "In Progress", emoji: "🔧" },
  waiting: { label: "Waiting", emoji: "⏳" },
  resolved: { label: "Resolved", emoji: "✅" },
  closed: { label: "Closed", emoji: "⚫" },
};

const CATEGORY_LABELS = {
  general: "General",
  support: "Support",
  bug: "Bug Report",
  feature: "Feature Request",
  billing: "Billing",
  other: "Other",
};

const DEFAULT_EMBED_COLOR = "#5865F2";

function formatPriority(priority) {
  return PRIORITY_META[priority] || PRIORITY_META.medium;
}

function formatStatus(status) {
  return STATUS_META[status] || STATUS_META.open;
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || "General";
}

function getRelativeTimestamp(date) {
  if (!date) {
    return "Unknown";
  }
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${unix}:R>`;
}

function getShortTicketId(ticketId) {
  if (!ticketId) {
    return "UNKNOWN";
  }
  return ticketId.slice(-6).toUpperCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage support tickets")
    .addSubcommand(subcommand =>
      subcommand
        .setName("create")
        .setDescription("Create a new support ticket")
        .addStringOption(option =>
          option
            .setName("subject")
            .setDescription("Brief subject of your ticket")
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName("description")
            .setDescription("Detailed description of your issue")
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption(option =>
          option
            .setName("category")
            .setDescription("Category of your ticket")
            .setRequired(false)
            .addChoices(
              { name: "General", value: "general" },
              { name: "Support", value: "support" },
              { name: "Bug Report", value: "bug" },
              { name: "Feature Request", value: "feature" },
              { name: "Billing", value: "billing" },
              { name: "Other", value: "other" }
            )
        )
        .addStringOption(option =>
          option
            .setName("priority")
            .setDescription("Priority level of your ticket")
            .setRequired(false)
            .addChoices(
              { name: "Low", value: "low" },
              { name: "Medium", value: "medium" },
              { name: "High", value: "high" },
              { name: "Urgent", value: "urgent" }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("close")
        .setDescription("Close a ticket")
        .addStringOption(option =>
          option
            .setName("ticket_id")
            .setDescription("ID of the ticket to close")
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName("summary")
            .setDescription("Summary of the resolution")
            .setRequired(false)
            .setMaxLength(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List your tickets")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("assign")
        .setDescription("Assign a ticket to staff (Staff only)")
        .addStringOption(option =>
          option
            .setName("ticket_id")
            .setDescription("ID of the ticket to assign")
            .setRequired(true)
        )
        .addUserOption(option =>
          option
            .setName("staff")
            .setDescription("Staff member to assign the ticket to")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Update ticket status (Staff only)")
        .addStringOption(option =>
          option
            .setName("ticket_id")
            .setDescription("ID of the ticket to update")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("status")
            .setDescription("New status for the ticket")
            .setRequired(true)
            .addChoices(
              { name: "Open", value: "open" },
              { name: "In Progress", value: "in_progress" },
              { name: "Waiting", value: "waiting" },
              { name: "Resolved", value: "resolved" },
              { name: "Closed", value: "closed" }
            )
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      // Check if ticket system is enabled
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.ticketSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Ticket system is not enabled in this server.",
          ephemeral: true,
        });
      }

      switch (subcommand) {
        case "create":
          await this.handleCreate(interaction, userId, guildId);
          break;
        case "close":
          await this.handleClose(interaction, userId, guildId);
          break;
        case "list":
          await this.handleList(interaction, userId, guildId);
          break;
        case "assign":
          await this.handleAssign(interaction, userId, guildId);
          break;
        case "status":
          await this.handleStatus(interaction, userId, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Error in ticket command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  },

  async handleCreate(interaction, userId, guildId) {
    const subject = interaction.options.getString("subject");
    const description = interaction.options.getString("description");
    const category = interaction.options.getString("category") || "general";
    const priority = interaction.options.getString("priority") || "medium";

    // Check ticket limit
    const botConfig = await BotConfig.findOne({ guildId });
    const userTicketCount = await Ticket.countDocuments({ "creator.id": userId, guildId, status: { $ne: "closed" } });
    if (userTicketCount >= (botConfig?.ticketSystem?.maxTicketsPerUser || 3)) {
      return await interaction.reply({
        content: "❌ You have reached the maximum number of open tickets. Please close some before creating new ones.",
        ephemeral: true,
      });
    }

    // Create ticket channel
    const ticketId = Ticket.generateTicketId(guildId);
    const channelName = `ticket-${interaction.user.username}`;
    
    let ticketChannel;
    try {
      ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: interaction.channel.parent, // Same category as current channel
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: userId, // Ticket creator
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          // Staff permissions
          ...(botConfig?.ticketSystem?.staffRoleIds || []).map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
          })),
        ],
      });
    } catch (error) {
      logger.error("Error creating ticket channel:", error);
      return await interaction.reply({
        content: "❌ Failed to create ticket channel. Please try again later.",
        ephemeral: true,
      });
    }

    // Create ticket record
    const ticket = new Ticket({
      ticketId: ticketId,
      guildId: guildId,
      channelId: ticketChannel.id,
      creator: {
        id: userId,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
      },
      subject: subject,
      description: description,
      category: category,
      priority: priority,
    });

    await ticket.save();

    const ticketEmbed = this.createTicketEmbed({
      ticket,
      guild: interaction.guild,
      createdBy: interaction.user,
    });

    const components = this.createTicketButtons(ticket._id);

    // Notify staff roles
    let staffMentions = "";
    if (botConfig?.ticketSystem?.staffRoleIds && botConfig.ticketSystem.staffRoleIds.length > 0) {
      staffMentions = botConfig.ticketSystem.staffRoleIds.map(roleId => `<@&${roleId}>`).join(" ");
    } else {
      const adminRole = interaction.guild.roles.cache.find(role =>
        role.name.toLowerCase() === "admin" || role.permissions.has(PermissionFlagsBits.Administrator)
      );
      if (adminRole) {
        staffMentions = `<@&${adminRole.id}>`;
      }
    }

    await ticketChannel.send({
      content: staffMentions ? `${staffMentions} New ticket created.` : null,
      embeds: [ticketEmbed],
      components,
    });

    // Acknowledge to user with summary
    await interaction.reply({
      embeds: [this.createTicketConfirmationEmbed(ticket, ticketChannel)],
      ephemeral: true,
    });

    // Log ticket creation
    logger.info(`Ticket created: ${ticketId} by ${interaction.user.username} in ${interaction.guild.name}`);
  },

  async handleClose(interaction, userId, guildId) {
    const ticketId = interaction.options.getString("ticket_id");
    const summary = interaction.options.getString("summary");

    let ticket;
    if (ticketId) {
      ticket = await Ticket.findById(ticketId);
    } else {
      // Find ticket in current channel
      ticket = await Ticket.findOne({ channelId: interaction.channel.id });
    }

    if (!ticket) {
      return await interaction.reply({
        content: "❌ No ticket found in this channel or with the specified ID.",
        ephemeral: true,
      });
    }

    // Check permissions
    const botConfig = await BotConfig.findOne({ guildId });
    const isStaff = botConfig?.ticketSystem?.staffRoleIds?.some(roleId => 
      interaction.member.roles.cache.has(roleId)
    ) || interaction.member.permissions.has('Administrator');
    const isCreator = ticket.creator.id === userId;

    if (!isStaff && !isCreator) {
      return await interaction.reply({
        content: "❌ You don't have permission to close this ticket.",
        ephemeral: true,
      });
    }

    // Close the ticket
    const closedBy = {
      id: userId,
      username: interaction.user.username,
    };

    await ticket.closeTicket(closedBy, summary);

    // Delete the channel
    try {
      await interaction.guild.channels.delete(ticket.channelId);
    } catch (error) {
      logger.error("Error deleting ticket channel:", error);
    }

    // Confirm closure
    await interaction.reply({
      content: `✅ Ticket ${ticket.ticketId} has been closed.`,
      ephemeral: true,
    });

    // Log ticket closure
    logger.info(`Ticket closed: ${ticket.ticketId} by ${interaction.user.username} in ${interaction.guild.name}`);
  },

  async handleList(interaction, userId, guildId) {
    const tickets = await Ticket.findUserTickets(userId, guildId);

    if (tickets.length === 0) {
      return await interaction.reply({
        content: "❌ You don't have any tickets.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setTitle("🎫 Your Tickets")
      .setDescription(`You have ${tickets.length} ticket(s)`);

    tickets.slice(0, 10).forEach(ticket => {
      embed.addFields({
        name: `${formatStatus(ticket.status).emoji} ${ticket.subject}`,
        value: `**ID:** ${ticket.ticketId}\n**Status:** ${formatStatus(ticket.status).label}\n**Category:** ${getCategoryLabel(ticket.category)}\n**Priority:** ${formatPriority(ticket.priority).emoji} ${formatPriority(ticket.priority).label}\n**Created:** ${getRelativeTimestamp(ticket.createdAt)}`,
        inline: false,
      });
    });

    if (tickets.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${tickets.length} tickets` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleAssign(interaction, userId, guildId) {
    // Check staff permissions
    const botConfig = await BotConfig.findOne({ guildId });
    const isStaff = botConfig?.ticketSystem?.staffRoleIds?.some(roleId => 
      interaction.member.roles.cache.has(roleId)
    ) || interaction.member.permissions.has('Administrator');

    if (!isStaff) {
      return await interaction.reply({
        content: "❌ You don't have permission to assign tickets.",
        ephemeral: true,
      });
    }

    const ticketId = interaction.options.getString("ticket_id");
    const staffMember = interaction.options.getUser("staff");

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return await interaction.reply({
        content: "❌ Ticket not found.",
        ephemeral: true,
      });
    }

    if (ticket.status === "closed") {
      return await interaction.reply({
        content: "❌ Cannot assign a closed ticket.",
        ephemeral: true,
      });
    }

    // Assign the ticket
    await ticket.assignStaff(staffMember.id, staffMember.username);

    // Update the ticket channel permissions
    try {
      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(staffMember, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          ManageMessages: true,
        });
      }
    } catch (error) {
      logger.error("Error updating channel permissions:", error);
    }

    // Send notification in ticket channel
    try {
      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      if (channel) {
        const assignEmbed = new EmbedBuilder()
          .setColor("#FF6B35")
          .setTitle("👤 Ticket Assigned")
          .setDescription(`This ticket has been assigned to ${staffMember.username}`)
          .setTimestamp();

        await channel.send({ embeds: [assignEmbed] });
      }
    } catch (error) {
      logger.error("Error sending assignment notification:", error);
    }

    await interaction.reply({
      content: `✅ Ticket ${ticket.ticketId} has been assigned to ${staffMember.username}.`,
      ephemeral: true,
    });
  },

  async handleStatus(interaction, userId, guildId) {
    // Check staff permissions
    const botConfig = await BotConfig.findOne({ guildId });
    const isStaff = botConfig?.ticketSystem?.staffRoleIds?.some(roleId => 
      interaction.member.roles.cache.has(roleId)
    ) || interaction.member.permissions.has('Administrator');

    if (!isStaff) {
      return await interaction.reply({
        content: "❌ You don't have permission to update ticket status.",
        ephemeral: true,
      });
    }

    const ticketId = interaction.options.getString("ticket_id");
    const newStatus = interaction.options.getString("status");

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return await interaction.reply({
        content: "❌ Ticket not found.",
        ephemeral: true,
      });
    }

    if (ticket.status === "closed") {
      return await interaction.reply({
        content: "❌ Cannot update status of a closed ticket.",
        ephemeral: true,
      });
    }

    // Update status
    const updatedBy = {
      id: userId,
      username: interaction.user.username,
    };

    await ticket.updateStatus(newStatus, updatedBy);

    // Send notification in ticket channel
    try {
      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      if (channel) {
        const statusMeta = formatStatus(newStatus);
        const priorityMeta = formatPriority(ticket.priority);

        const statusEmbed = new EmbedBuilder()
          .setColor(priorityMeta.color)
          .setAuthor({
            name: `${interaction.guild.name} • Ticket Update`,
            iconURL: interaction.guild.iconURL() ?? undefined,
          })
          .setTitle(`${statusMeta.emoji} Status Updated`)
          .addFields(
            { name: "Ticket", value: `#${getShortTicketId(ticket.ticketId)}`, inline: true },
            { name: "New Status", value: `${statusMeta.emoji} ${statusMeta.label}`, inline: true },
            { name: "Updated By", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();

        await channel.send({ embeds: [statusEmbed] });
      }
    } catch (error) {
      logger.error("Error sending status notification:", error);
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(priorityMeta.color)
          .setDescription(`✅ Status updated to **${statusMeta.label}** for ticket #${getShortTicketId(ticket.ticketId)}.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },

  createTicketEmbed({ ticket, guild, createdBy }) {
    const priorityMeta = formatPriority(ticket.priority);
    const statusMeta = formatStatus(ticket.status);

    return new EmbedBuilder()
      .setColor(priorityMeta.color)
      .setAuthor({
        name: `${guild.name} • Support Ticket`,
        iconURL: guild.iconURL() ?? undefined,
      })
      .setTitle(`Ticket #${getShortTicketId(ticket.ticketId)} • ${ticket.subject}`)
      .setDescription(ticket.description || "*No description provided.*")
      .addFields(
        { name: "Status", value: `${statusMeta.emoji} ${statusMeta.label}`, inline: true },
        { name: "Priority", value: `${priorityMeta.emoji} ${priorityMeta.label}`, inline: true },
        { name: "Category", value: getCategoryLabel(ticket.category), inline: true },
        { name: "Created", value: getRelativeTimestamp(ticket.createdAt), inline: true },
        { name: "Created By", value: `<@${createdBy.id}>`, inline: true },
        {
          name: "Assigned",
          value: ticket.assignedTo?.id ? `<@${ticket.assignedTo.id}>` : "Unassigned",
          inline: true,
        },
      )
      .setTimestamp(ticket.createdAt)
      .setFooter({ text: "Use the buttons below to manage this ticket." });
  },

  createTicketConfirmationEmbed(ticket, channel) {
    const priorityMeta = formatPriority(ticket.priority);

    return new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setTitle("Ticket Created")
      .setDescription(`Channel: ${channel}`)
      .addFields(
        { name: "Subject", value: ticket.subject, inline: true },
        {
          name: "Priority",
          value: `${priorityMeta.emoji} ${priorityMeta.label}`,
          inline: true,
        },
        { name: "Reference ID", value: ticket.ticketId },
      )
      .setTimestamp();
  },

  createTicketButtons(ticketId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketId}`)
          .setLabel("Close Ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_assign_${ticketId}`)
          .setLabel("Assign Self")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ticket_status_${ticketId}`)
          .setLabel("Update Status")
          .setEmoji("📌")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`ticket_transcript_${ticketId}`)
          .setLabel("Request Transcript")
          .setEmoji("🧾")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  },
};
