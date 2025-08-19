const { EmbedBuilder: DiscordEmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * A utility class for creating standardized embeds and action rows.
 */
class EmbedBuilder {
    /**
     * Creates a base embed with a consistent style.
     * @param {object} options - The options for the embed.
     * @returns {DiscordEmbedBuilder}
     */
    static createMatricaStyleEmbed(options = {}) {
        const embed = new DiscordEmbedBuilder()
            .setColor(options.color || '#FF6B35') // Lil Gargs brand color
            .setTitle(options.title || 'Lil Gargs Bot')
            .setDescription(options.description || null)
            .setTimestamp()
            .setFooter({
                text: options.footer || 'powered by Lil Gargs • Custom Bot',
                iconURL: options.footerIcon // Add a default icon URL if you have one
            });

        if (options.thumbnail) {
            embed.setThumbnail(options.thumbnail);
        }

        if (options.image) {
            embed.setImage(options.image);
        }

        if (options.fields && options.fields.length > 0) {
            embed.addFields(options.fields);
        }

        return embed;
    }

    /**
     * Creates a specific embed for NFT verification status.
     * @param {string} walletAddress - The user's wallet address.
     * @param {number} nftCount - The number of NFTs found.
     * @param {string} status - The verification status ('verified' or 'failed').
     * @param {string|null} errorMessage - An optional error message for failed status.
     * @returns {DiscordEmbedBuilder}
     */
    static createVerificationEmbed(walletAddress, nftCount, status, errorMessage = null) {
        if (status === 'verified') {
            return this.createMatricaStyleEmbed({
                title: '✅ Verification Successful!',
                description: 'You have been successfully verified as a Lil Gargs holder.',
                color: '#00FF00', // Green for success
                fields: [
                    { name: 'Wallet Address', value: `\`${walletAddress}\``, inline: false },
                    { name: 'NFTs Found', value: nftCount.toString(), inline: true },
                    { name: 'Status', value: 'Verified ✅', inline: true }
                ]
            });
        } else {
            return this.createMatricaStyleEmbed({
                title: '❌ Verification Failed',
                description: 'We could not verify your holder status.',
                color: '#FF0000', // Red for failure
                fields: [
                    { name: 'Wallet Address', value: `\`${walletAddress}\``, inline: false },
                    { name: 'Reason', value: errorMessage || 'No Lil Gargs NFTs were found in this wallet.', inline: false }
                ]
            });
        }
    }
    
    /**
     * Creates a specific embed for welcome messages.
     * @param {import('discord.js').GuildMember} member - The member who joined.
     * @param {string|null} welcomeMessage - An optional custom welcome message.
     * @returns {DiscordEmbedBuilder}
     */
    static createWelcomeEmbed(member, welcomeMessage = null) {
        return this.createMatricaStyleEmbed({
            title: '🎉 Welcome to Lil Gargs!',
            description: welcomeMessage || `Welcome **${member.user.username}** to the Lil Gargs community! 🐲`,
            color: '#00FF00',
            thumbnail: member.user.displayAvatarURL({ dynamic: true }),
            fields: [
                {
                    name: '🚀 Getting Started',
                    value: [
                        '🐲 **/pet adopt**: Get your first Lil Garg pet!',
                        '⚔️ **/battle start**: Challenge other members.',
                        '🔐 **/verify-nft**: Verify your holder status for exclusive channels.'
                    ].join('\n'),
                    inline: false
                }
            ]
        });
    }

    /**
     * Creates a specific embed for server lockdowns.
     * @param {string} reason - The reason for the lockdown.
     * @returns {DiscordEmbedBuilder}
     */
    static createLockdownEmbed(reason = 'Emergency lockdown initiated') {
        return this.createMatricaStyleEmbed({
            title: '🚨 SERVER LOCKDOWN',
            description: 'This server is currently under emergency lockdown.',
            color: '#FF0000',
            fields: [
                { name: '⚠️ Status', value: 'All chat channels are restricted to staff only.', inline: false },
                { name: '🔒 Reason', value: reason, inline: false },
                { name: '📢 Instructions', value: 'Please wait for staff to resolve the situation.', inline: false }
            ]
        });
    }

    /**
     * Creates a row of buttons.
     * @param {Array<object>} buttons - An array of button configurations.
     * @returns {ActionRowBuilder<ButtonBuilder>}
     */
    static createButtonRow(buttons) {
        const row = new ActionRowBuilder();
        buttons.forEach(buttonConfig => {
            const button = new ButtonBuilder()
                .setCustomId(buttonConfig.customId)
                .setLabel(buttonConfig.label)
                .setStyle(buttonConfig.style || ButtonStyle.Primary);

            if (buttonConfig.emoji) {
                button.setEmoji(buttonConfig.emoji);
            }
            if (buttonConfig.url) {
                button.setURL(buttonConfig.url);
            }
            if (buttonConfig.disabled) {
                button.setDisabled(buttonConfig.disabled);
            }
            row.addComponents(button);
        });
        return row;
    }
}

module.exports = EmbedBuilder;
