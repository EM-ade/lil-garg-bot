/**
 * Reverify Command - Re-check NFT ownership and update roles
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../database/models');
const { getGuildVerificationConfigStore } = require('../services/serviceFactory');
const logger = require('../utils/logger');
const NFTVerificationService = require('../services/nftVerification');

const guildVerificationConfigStore = getGuildVerificationConfigStore();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Re-check your NFT ownership and update roles'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      // Find user's verification record
      const user = await User.findOne({
        discord_id: userId,
        guild_id: guildId
      });

      if (!user || !user.wallet_address) {
        const embed = new EmbedBuilder()
          .setColor(0xFBBC04)
          .setTitle('⚠️ Not Verified')
          .setDescription(
            'You are not verified in this server.\n\n' +
            'Use `/verify` to start the verification process.'
          );

        return interaction.editReply({ embeds: [embed] });
      }

      if (!user.is_verified) {
        return interaction.editReply({
          content: `❌ Your verification status is "pending" or "failed". Please use /verify to verify again.`,
          flags: 64,
        });
      }

      // Get verification rules for this guild
      const rules = guildVerificationConfigStore
        ? await guildVerificationConfigStore.listByGuild(guildId)
        : [];

      if (rules.length === 0) {
        return interaction.editReply({
          content: '❌ This server has not configured any NFT verification rules. Use `/verification-config add` to set up rules.',
          flags: 64,
        });
      }

      const nftService = new NFTVerificationService();

      // Get collection addresses from rules
      const collectionAddresses = rules.map(r => r.contractAddress).filter(Boolean);

      // Check NFT ownership
      const verificationResult = await nftService.verifyNFTOwnership(user.wallet_address, {
        contractAddresses: collectionAddresses
      });

      // Check role eligibility
      let roleChanged = false;
      let addedRoles = [];
      let removedRoles = [];
      const member = await interaction.guild.members.fetch(userId);

      // Check if user meets requirements for any configured rule
      let meetsAnyRequirement = false;
      for (const rule of rules) {
        const ownedCount = verificationResult.byContract?.[rule.contractAddress?.toLowerCase()] || 0;
        const requiredCount = rule.requiredNftCount || 1;

        if (ownedCount >= requiredCount) {
          meetsAnyRequirement = true;

          const role = rule.roleId
            ? member.roles.cache.get(rule.roleId)
            : member.guild.roles.cache.find(r => r.name === rule.roleName);

          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role.id);
            addedRoles.push(role.name);
            roleChanged = true;
          }
        } else {
          const role = rule.roleId
            ? member.roles.cache.get(rule.roleId)
            : member.guild.roles.cache.find(r => r.name === rule.roleName);

          if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role.id);
            removedRoles.push(role.name);
            roleChanged = true;
          }
        }
      }

      // Update user record
      user.is_verified = meetsAnyRequirement;
      user.last_verification_check = new Date();
      await user.save();

      const embed = new EmbedBuilder()
        .setColor(meetsAnyRequirement ? 0x34A853 : 0xEA4335)
        .setTitle(meetsAnyRequirement ? '✅ Re-verification Complete' : '⚠️ Verification Expired')
        .setDescription(
          meetsAnyRequirement
            ? 'Your NFT ownership has been confirmed. Your roles have been updated.'
            : 'You no longer meet the NFT ownership requirements for this server. Your roles have been removed.'
        )
        .addFields(
          { name: 'NFTs Owned', value: verificationResult.nftCount.toString(), inline: true },
          { name: 'Status', value: meetsAnyRequirement ? 'Verified' : 'Not Verified', inline: true }
        );

      if (roleChanged) {
        if (addedRoles.length > 0) {
          embed.addFields({
            name: 'Roles Added',
            value: addedRoles.map(r => `• ${r}`).join('\n') || 'None',
            inline: false
          });
        }

        if (removedRoles.length > 0) {
          embed.addFields({
            name: 'Roles Removed',
            value: removedRoles.map(r => `• ${r}`).join('\n') || 'None',
            inline: false
          });
        }
      }

      embed.setFooter({ text: 'You can re-verify again in 5 minutes' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(
        `[Reverify] User ${interaction.user.username} re-verified in guild ${guildId}: ${meetsAnyRequirement ? 'VERIFIED' : 'NOT VERIFIED'}`
      );

    } catch (error) {
      logger.error('Error in reverify command:', error);
      await interaction.editReply({
        content: '❌ An error occurred during re-verification. Please try again later.',
        flags: 64,
      });
    }
  },
};
