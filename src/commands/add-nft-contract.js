const { SlashCommandBuilder } = require('discord.js');
const nftConfig = require('../config/nftConfig');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-nft-contract')
        .setDescription('Add a new NFT contract address for verification (Admin only)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the NFT collection')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('contract_address')
                .setDescription('Contract address of the NFT collection')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role_name')
                .setDescription('Role name to assign for holding this NFT')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('min_holding')
                .setDescription('Minimum number of NFTs required for the role')
                .setRequired(true)),

    async execute(interaction) {
        // Check if the user has admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const name = interaction.options.getString('name');
        const contractAddress = interaction.options.getString('contract_address');
        const roleName = interaction.options.getString('role_name');
        const minHolding = interaction.options.getInteger('min_holding');

        // Validate contract address (basic check)
        if (!contractAddress.startsWith('0x') || contractAddress.length !== 42) {
            return await interaction.reply({
                content: '❌ Invalid contract address format. Must be a valid Ethereum address.',
                ephemeral: true
            });
        }

        // Add the new NFT collection to the config
        const newCollection = {
            name: name,
            contractAddress: contractAddress,
            rules: [
                {
                    minHolding: minHolding,
                    roleName: roleName
                }
            ]
        };

        nftConfig.nftCollections.push(newCollection);

        // Save the updated config to the file
        const configPath = path.join(__dirname, '../config/nftConfig.js');
        const configContent = `module.exports = ${JSON.stringify(nftConfig, null, 2)};\n`;

        try {
            await fs.writeFile(configPath, configContent, 'utf8');
            await interaction.reply({
                content: `✅ Successfully added NFT collection: **${name}**\n` +
                         `Contract: \`${contractAddress}\`\n` +
                         `Role: ${roleName}\n` +
                         `Min Holding: ${minHolding}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error writing to nftConfig.js:', error);
            await interaction.reply({
                content: '❌ Failed to update NFT configuration. Please try again.',
                ephemeral: true
            });
        }
    }
};