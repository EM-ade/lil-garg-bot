
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garg-info')
    .setDescription('Displays information about the lil Gargs NFT collection.'),
  async execute(interaction) {
    const gargInfoEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('lil Gargs NFT Collection')
      .setDescription('Here is some information about the lil Gargs NFT collection.')
      .addFields(
        { name: 'Collection Link', value: '[Link to the collection on OpenSea](https://opensea.io/collection/lilgargs)', inline: true },
        { name: 'Project Lore', value: 'The lil Gargs are a collection of mischievous creatures from the Gargoyleverse.', inline: true },
        { name: 'Utility', value: 'Holding a lil Garg grants you access to exclusive channels and events.', inline: true }
      )
      .setImage('https://i.imgur.com/example.png') // Replace with a relevant image
      .setTimestamp()
      .setFooter({ text: 'Gargoyleverse', iconURL: 'https://i.imgur.com/example.png' }); // Replace with a relevant icon

    await interaction.reply({ embeds: [gargInfoEmbed] });
  },
};
