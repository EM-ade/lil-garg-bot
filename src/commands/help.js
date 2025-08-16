const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows information about bot commands')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The category of commands to show')
        .setRequired(false)
        .addChoices(
          { name: 'General', value: 'general' },
          { name: 'Configuration', value: 'config' },
          { name: 'Pet System', value: 'pet' },
          { name: 'Battle System', value: 'battle' },
          { name: 'NFT Verification', value: 'nft' },
          { name: 'Ticket System', value: 'ticket' },
          { name: 'Security', value: 'security' },
          { name: 'Admin', value: 'admin' }
        )),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction, client) {
    const category = interaction.options.getString('category');
    
    if (category) {
      // Show commands for specific category
      await showCategoryHelp(interaction, category);
    } else {
      // Show general help with categories
      await showGeneralHelp(interaction, client);
    }
  }
};

/**
 * Shows general help with command categories
 * @param {CommandInteraction} interaction - The interaction
 * @param {Client} client - The Discord client
 */
async function showGeneralHelp(interaction, client) {
  const embed = createEmbed({
    title: 'Lil\' Gargs Bot Help',
    description: 'Here are the available command categories. Use `/help [category]` to see specific commands.',
    color: 'primary',
    thumbnail: client.user.displayAvatarURL(),
    fields: [
      {
        name: '📋 General Commands',
        value: '`/help`, `/status`, `/about`',
        inline: false
      },
      {
        name: '⚙️ Configuration',
        value: '`/config`, `/place-buttons`',
        inline: false
      },
      {
        name: '🐾 Pet System',
        value: '`/pet adopt`, `/pet feed`, `/pet train`, `/pet play`, `/pet status`, `/pet rename`',
        inline: false
      },
      {
        name: '⚔️ Battle System',
        value: '`/battle start`, `/battle accept`, `/battle arena`, `/battle profile`',
        inline: false
      },
      {
        name: '🖼️ NFT Verification',
        value: '`/verify`, `/nft-monitor`',
        inline: false
      },
      {
        name: '🎫 Ticket System',
        value: '`/ticket`, `/ticket close`',
        inline: false
      },
      {
        name: '🔒 Security & Anti-Raid',
        value: '`/lockdown`, `/unlock`, `/whitelist`',
        inline: false
      },
      {
        name: '🛡️ Admin Tools',
        value: '`/ban`, `/kick`, `/timeout`, `/purge`, `/slowmode`',
        inline: false
      },
      {
        name: '🤖 AI Chat',
        value: '`/askgarg`, `/gargoracle` or mention the bot in a message',
        inline: false
      }
    ],
    footer: { text: `${client.user.username} • Type /help [category] for more info` }
  });
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Shows help for a specific command category
 * @param {CommandInteraction} interaction - The interaction
 * @param {string} category - The command category
 */
async function showCategoryHelp(interaction, category) {
  let title, description, fields;
  
  switch (category) {
    case 'general':
      title = '📋 General Commands';
      description = 'Basic commands for interacting with the bot';
      fields = [
        {
          name: '/help [category]',
          value: 'Shows information about bot commands. Optionally specify a category.',
          inline: false
        },
        {
          name: '/status',
          value: 'Shows the current status of the bot and its features.',
          inline: false
        },
        {
          name: '/about',
          value: 'Shows information about the bot and its creators.',
          inline: false
        }
      ];
      break;
      
    case 'config':
      title = '⚙️ Configuration Commands';
      description = 'Commands for configuring the bot for your server';
      fields = [
        {
          name: '/config',
          value: 'Configure bot settings including channels, roles, and features.',
          inline: false
        },
        {
          name: '/place-buttons',
          value: 'Places interactive buttons in the specified channel for pet, battle, NFT verification, or tickets.',
          inline: false
        }
      ];
      break;
      
    case 'pet':
      title = '🐾 Pet System Commands';
      description = 'Commands for the virtual pet system';
      fields = [
        {
          name: '/pet adopt [name]',
          value: 'Adopt a pet with the specified name and random element/personality.',
          inline: false
        },
        {
          name: '/pet feed',
          value: 'Feed your pet to restore energy and improve mood.',
          inline: false
        },
        {
          name: '/pet train',
          value: 'Train your pet to increase its stats and gain XP.',
          inline: false
        },
        {
          name: '/pet play',
          value: 'Play with your pet to improve its mood and gain XP.',
          inline: false
        },
        {
          name: '/pet status',
          value: 'Check your pet\'s current status, stats, and mood.',
          inline: false
        },
        {
          name: '/pet rename [name]',
          value: 'Change your pet\'s name.',
          inline: false
        }
      ];
      break;
      
    case 'battle':
      title = '⚔️ Battle System Commands';
      description = 'Commands for the pet battle system';
      fields = [
        {
          name: '/battle start [@user]',
          value: 'Challenge another user to a pet battle.',
          inline: false
        },
        {
          name: '/battle accept',
          value: 'Accept a battle challenge.',
          inline: false
        },
        {
          name: '/battle arena',
          value: 'View active battles in the server.',
          inline: false
        },
        {
          name: '/battle profile',
          value: 'View your battle statistics and history.',
          inline: false
        }
      ];
      break;
      
    case 'nft':
      title = '🖼️ NFT Verification Commands';
      description = 'Commands for NFT verification and monitoring';
      fields = [
        {
          name: '/verify',
          value: 'Verify your NFT ownership to receive roles.',
          inline: false
        },
        {
          name: '/nft-monitor',
          value: 'Monitor NFT ownership changes for role updates (admin only).',
          inline: false
        }
      ];
      break;
      
    case 'ticket':
      title = '🎫 Ticket System Commands';
      description = 'Commands for the support ticket system';
      fields = [
        {
          name: '/ticket',
          value: 'Create a new support ticket.',
          inline: false
        },
        {
          name: '/ticket close',
          value: 'Close an active ticket.',
          inline: false
        }
      ];
      break;
      
    case 'security':
      title = '🔒 Security & Anti-Raid Commands';
      description = 'Commands for server security and anti-raid protection';
      fields = [
        {
          name: '/lockdown',
          value: 'Restricts all chat except founders, posts warning in #general.',
          inline: false
        },
        {
          name: '/unlock',
          value: 'Restores permissions after a lockdown.',
          inline: false
        },
        {
          name: '/whitelist [add/remove] [@user]',
          value: 'Add or remove a user from the link posting whitelist.',
          inline: false
        }
      ];
      break;
      
    case 'admin':
      title = '🛡️ Admin Commands';
      description = 'Commands for server administration';
      fields = [
        {
          name: '/ban [@user] [reason]',
          value: 'Bans a user from the server.',
          inline: false
        },
        {
          name: '/kick [@user] [reason]',
          value: 'Kicks a user from the server.',
          inline: false
        },
        {
          name: '/timeout [@user] [duration] [reason]',
          value: 'Timeouts a user for the specified duration.',
          inline: false
        },
        {
          name: '/purge [amount]',
          value: 'Deletes the specified number of messages from the current channel.',
          inline: false
        },
        {
          name: '/slowmode [seconds]',
          value: 'Sets slowmode for the current channel.',
          inline: false
        }
      ];
      break;
      
    default:
      // This shouldn't happen due to the choices in the command options
      title = 'Unknown Category';
      description = 'This command category does not exist.';
      fields = [
        {
          name: 'Available Categories',
          value: 'general, config, pet, battle, nft, ticket, security, admin',
          inline: false
        }
      ];
  }
  
  const embed = createEmbed({
    title,
    description,
    color: 'primary',
    fields,
    footer: { text: 'Use /help for a list of all categories' }
  });
  
  await interaction.reply({ embeds: [embed] });
}