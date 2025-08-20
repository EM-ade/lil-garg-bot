const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const BotConfig = require('../database/models/BotConfig');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config-nft-role')
        .setDescription('Manages NFT role tiers (admin only).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Sets or updates an NFT role tier.')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The Discord role to configure.')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('nft_count')
                        .setDescription('The number of NFTs required for this role.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes an NFT role tier.')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The Discord role to remove from configuration.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all configured NFT role tiers.')),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        let config;

        try {
            config = await BotConfig.findOne({ guildId: interaction.guild.id }); // Fetch guild-specific config
            if (!config) {
                config = new BotConfig({ guildId: interaction.guild.id }); // Create if not exists for this guild
            }
        } catch (error) {
            logger.error(`Error fetching BotConfig for guild ${interaction.guild.id}: ${error.message}`);
            await interaction.reply({ content: 'An error occurred while accessing the bot configuration. Please try again later.', ephemeral: true });
            return;
        }

        switch (subcommand) {
            case 'set':
                const role = interaction.options.getRole('role');
                const nftCount = interaction.options.getInteger('nft_count');

                if (nftCount < 0) {
                    await interaction.reply({ content: 'NFT count cannot be negative.', ephemeral: true });
                    return;
                }

                let updated = false;
                const existingTierIndex = config.nftVerification.roleTiers.findIndex(
                    tier => tier.roleId === role.id
                );

                if (existingTierIndex > -1) {
                    config.nftVerification.roleTiers[existingTierIndex].nftCount = nftCount;
                    config.nftVerification.roleTiers[existingTierIndex].roleName = role.name;
                    updated = true;
                } else {
                    config.nftVerification.roleTiers.push({
                        nftCount: nftCount,
                        roleId: role.id,
                        roleName: role.name,
                    });
                }

                // Sort the roleTiers by nftCount in ascending order for consistent processing later
                config.nftVerification.roleTiers.sort((a, b) => a.nftCount - b.nftCount);

                try {
                    await config.save();
                    logger.info(`NFT role tier ${updated ? 'updated' : 'added'}: Role '${role.name}' (${role.id}), Required NFTs: ${nftCount} by ${interaction.user.tag}`);
                    await interaction.reply({ content: `Successfully ${updated ? 'updated' : 'added'} NFT role tier: **${role.name}** requires **${nftCount}** NFTs.`, ephemeral: true });
                } catch (error) {
                    logger.error(`Error saving BotConfig after setting NFT role tier: ${error.message}`);
                    await interaction.reply({ content: 'An error occurred while saving the configuration. Please try again later.', ephemeral: true });
                }
                break;

            case 'remove':
                const roleToRemove = interaction.options.getRole('role');

                const initialLength = config.nftVerification.roleTiers.length;
                config.nftVerification.roleTiers = config.nftVerification.roleTiers.filter(
                    tier => tier.roleId !== roleToRemove.id
                );

                if (config.nftVerification.roleTiers.length < initialLength) {
                    try {
                        await config.save();
                        logger.info(`NFT role tier removed: Role '${roleToRemove.name}' (${roleToRemove.id}) by ${interaction.user.tag}`);
                        await interaction.reply({ content: `Successfully removed NFT role tier for **${roleToRemove.name}**.`, ephemeral: true });
                    } catch (error) {
                        logger.error(`Error saving BotConfig after removing NFT role tier: ${error.message}`);
                        await interaction.reply({ content: 'An error occurred while saving the configuration. Please try again later.', ephemeral: true });
                    }
                } else {
                    await interaction.reply({ content: `No NFT role tier found for **${roleToRemove.name}**.`, ephemeral: true });
                }
                break;

            case 'list':
                if (config.nftVerification.roleTiers.length === 0) {
                    await interaction.reply({ content: 'No NFT role tiers are currently configured for this guild.', ephemeral: true });
                    return;
                }

                const tierList = config.nftVerification.roleTiers
                    .sort((a, b) => a.nftCount - b.nftCount) // Sort by NFT count for readability
                    .map(tier => `- **${tier.roleName}**: ${tier.nftCount} NFT(s)`)
                    .join('\n');

                await interaction.reply({
                    content: `**Current NFT Role Tiers for this Guild:**\n${tierList}`,
                    ephemeral: true
                });
                break;

            default:
                await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
                break;
        }
    },
};
