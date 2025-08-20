const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../src/utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-add')
    .setDescription('Manually assigns a token-gated role to a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to assign the role to.')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to assign.')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getMember('user');
    const targetRole = interaction.options.getRole('role');

    if (!targetUser || !targetRole) {
      return interaction.editReply('Invalid user or role provided.');
    }

    try {
      if (targetUser.roles.cache.has(targetRole.id)) {
        return interaction.editReply(`✅ ${targetUser.user.tag} already has the ${targetRole.name} role.`);
      }

      await targetUser.roles.add(targetRole);
      logger.info(`Manually assigned role '${targetRole.name}' to ${targetUser.user.tag} by ${interaction.user.tag}.`);
      return interaction.editReply(`✅ Successfully assigned the ${targetRole.name} role to ${targetUser.user.tag}.`);
    } catch (error) {
      logger.error(`Error assigning role '${targetRole.name}' to ${targetUser.user.tag}: ${error.message}`);
      return interaction.editReply(`❌ Failed to assign the role. Please ensure the bot has permission to manage roles and that its role is higher than the role you are trying to assign.`);
    }
  },
};
