
const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garg-info')
    .setDescription('Displays information about the lil Gargs NFT collection.'),
  async execute(interaction) {
    const gargInfoEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('About the lil Gargs Collection')
      .setDescription('A collection of 666 handcrafted Gargoyles on the Solana blockchain. Each Garg, a unique fusion of ancient stone and mystical energies, stands vigilant, protecting the sacred lore of their creators. They are more than mere statues; they are sentient beings, bound by duty and empowered by the silent hum of the blockchain.')
      .setThumbnail('https://i.imgur.com/p1sLqY7.png') // Replace with an actual thumbnail
      .addFields(
        { name: 'Marketplace', value: '[Magic Eden](https://magiceden.io/collections/solana/lil_gargs)', inline: true },
        { name: 'Website', value: '[lilgargs.com](https://lilgargs.com)', inline: true },
        { name: 'Twitter', value: '[@lilgargs](https://twitter.com/lilgargs)', inline: true }
      )
      .setImage('https://i.imgur.com/FwOa2iH.jpeg') // Replace with a suitable image
      .setTimestamp()
      .setFooter({ text: 'Lil Gargs - Guardians of the Blockchain', iconURL: 'https://i.imgur.com/p1sLqY7.png' }); // Replace with an actual footer icon

    await interaction.reply({ embeds: [gargInfoEmbed] });
  },
};
