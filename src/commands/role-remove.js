const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../src/utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-remove')
    .setDescription('Manually removes a token-gated role from a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to remove the role from.')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to remove.')
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
      if (!targetUser.roles.cache.has(targetRole.id)) {
        return interaction.editReply(`✅ ${targetUser.user.tag} does not have the ${targetRole.name} role.`);
      }

      await targetUser.roles.remove(targetRole);
      logger.info(`Manually removed role '${targetRole.name}' from ${targetUser.user.tag} by ${interaction.user.tag}.`);
      return interaction.editReply(`✅ Successfully removed the ${targetRole.name} role from ${targetUser.user.tag}.`);
    } catch (error) {
      logger.error(`Error removing role '${targetRole.name}' from ${targetUser.user.tag}: ${error.message}`);
      return interaction.editReply(`❌ Failed to remove the role. Please ensure the bot has permission to manage roles and that its role is higher than the role you are trying to remove.`);
    }
  },
};
