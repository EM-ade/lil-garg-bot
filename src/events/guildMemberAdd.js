const { Events, EmbedBuilder } = require('discord.js');
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      const botConfig = await BotConfig.findOne({ guildId: member.guild.id });

      if (botConfig && botConfig.welcomeChannelId && botConfig.behavior?.welcomeMessage?.enabled) {
        const channel = member.guild.channels.cache.get(botConfig.welcomeChannelId);
        if (channel) {
          const welcomeMessage = botConfig.behavior.welcomeMessage.message
            .replace(/{user}/g, member.toString())
            .replace(/{server}/g, member.guild.name);

          const embed = new EmbedBuilder()
            .setColor("#0099FF")
            .setTitle(`🎉 Welcome to ${member.guild.name}!`)
            .setDescription(welcomeMessage)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

          await channel.send({ embeds: [embed] });
          logger.info(`Sent welcome message to ${member.user.tag} in ${member.guild.name}.`);
        }
      }
    } catch (error) {
      logger.error('Error sending welcome message:', error);
    }
  },
};
