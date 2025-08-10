const { EmbedBuilder: DiscordEmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class EmbedBuilder {
    static createMatricaStyleEmbed(options = {}) {
        const embed = new DiscordEmbedBuilder()
            .setColor(options.color || '#FF6B35') // Lil Gargs brand color (orange)
            .setTitle(options.title || 'Lil Gargs Bot')
            .setDescription(options.description || '')
            .setTimestamp()
            .setFooter({ 
                text: options.footer || 'powered by Lil Gargs • Custom Bot',
                iconURL: options.footerIcon || 'https://i.imgur.com/example.png' // Replace with your bot's icon
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

    static createVerificationEmbed(walletAddress, nftCount, status) {
        const embed = this.createMatricaStyleEmbed({
            title: '🔐 Lil Gargs Verification',
            description: 'Verify your NFT holder status to access exclusive channels and features.',
            color: status === 'verified' ? '#00FF00' : '#FF6B35',
            thumbnail: 'https://i.imgur.com/example.png' // Replace with your verification icon
        });

        // Add verification checklist with icons like the Matrica style
        embed.addFields(
            {
                name: '🔒 Verify Holder Status',
                value: [
                    '☐ This community uses Lil Gargs NFT Holder Verification!',
                    '☑ To access the gated holder channels, you must meet the requirements set by this community.'
                ].join('\n'),
                inline: false
            },
            {
                name: '👉 Instructions',
                value: [
                    '**Click here** to make your Lil Gargs profile and get started. If you already have a profile, you are all set!',
                    '💼 Adding a wallet to your Lil Gargs Profile will not give anyone access to your wallet and will only be used to verify your holder status.'
                ].join('\n'),
                inline: false
            }
        );

        if (status === 'verified') {
            embed.addFields({
                name: '🎉 Verification Status',
                value: `✅ **VERIFIED** - You own ${nftCount} Lil Gargs NFT${nftCount > 1 ? 's' : ''}`,
                inline: false
            });
        }

        return embed;
    }

    static createPetEmbed(pet, action = '') {
        const moodEmoji = pet.mood === 'happy' ? '😊' : pet.mood === 'sad' ? '😢' : '😐';
        const energyEmoji = pet.energy > 70 ? '⚡' : pet.energy > 30 ? '🔋' : '🪫';

        const embed = this.createMatricaStyleEmbed({
            title: `🐲 ${pet.name} - ${pet.element} ${pet.personality}`,
            description: `${moodEmoji} **Mood:** ${pet.mood} | ${energyEmoji} **Energy:** ${pet.energy}%`,
            color: this.getElementColor(pet.element),
            thumbnail: this.getPetAvatar(pet.element)
        });

        embed.addFields(
            {
                name: '📊 Stats',
                value: [
                    `⚔️ **Attack:** ${pet.attack}`,
                    `🛡️ **Defense:** ${pet.defense}`,
                    `❤️ **Health:** ${pet.health}`,
                    `⭐ **Level:** ${pet.level}`,
                    `✨ **XP:** ${pet.xp}/${pet.level * 100}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🎯 Actions',
                value: action || 'Use `/pet` commands to interact with your pet!',
                inline: true
            }
        );

        return embed;
    }

    static createBattleEmbed(battle, currentTurn) {
        const embed = this.createMatricaStyleEmbed({
            title: `⚔️ Battle Arena - ${battle.status}`,
            description: `**${battle.player1Name}** vs **${battle.player2Name}**`,
            color: '#FF0000',
            thumbnail: 'https://i.imgur.com/example.png'
        });

        embed.addFields(
            {
                name: '👤 Player 1',
                value: `${battle.player1Name}\n❤️ HP: ${battle.player1Health}\n⚔️ Attack: ${battle.player1Attack}`,
                inline: true
            },
            {
                name: '👤 Player 2',
                value: `${battle.player2Name}\n❤️ HP: ${battle.player2Health}\n⚔️ Attack: ${battle.player2Attack}`,
                inline: true
            },
            {
                name: '🎯 Current Turn',
                value: currentTurn || 'Waiting for players...',
                inline: false
            }
        );

        return embed;
    }

    static getElementColor(element) {
        const colors = {
            'Fire': '#FF4500',
            'Ice': '#87CEEB',
            'Nature': '#228B22',
            'Storm': '#4169E1',
            'Shadow': '#800080'
        };
        return colors[element] || '#FF6B35';
    }

    static getPetAvatar(element) {
        const avatars = {
            'Fire': 'https://i.imgur.com/fire-pet.png',
            'Ice': 'https://i.imgur.com/ice-pet.png',
            'Nature': 'https://i.imgur.com/nature-pet.png',
            'Storm': 'https://i.imgur.com/storm-pet.png',
            'Shadow': 'https://i.imgur.com/shadow-pet.png'
        };
        return avatars[element] || 'https://i.imgur.com/default-pet.png';
    }

    static createButtonRow(buttons) {
        const row = new ActionRowBuilder();
        
        buttons.forEach(button => {
            const buttonBuilder = new ButtonBuilder()
                .setCustomId(button.customId)
                .setLabel(button.label)
                .setStyle(button.style || ButtonStyle.Primary);

            if (button.emoji) {
                buttonBuilder.setEmoji(button.emoji);
            }

            if (button.url) {
                buttonBuilder.setURL(button.url);
            }

            row.addComponents(buttonBuilder);
        });

        return row;
    }

    static getVerificationButtons() {
        return this.createButtonRow([
            {
                customId: 'verify_wallet',
                label: 'Connect Wallet',
                style: ButtonStyle.Primary,
                emoji: '💼'
            },
            {
                customId: 'verify_check_status',
                label: 'Check Status',
                style: ButtonStyle.Secondary,
                emoji: 'ℹ️'
            },
            {
                customId: 'verify_help',
                label: 'Help',
                style: ButtonStyle.Secondary,
                emoji: '❓'
            }
        ]);
    }

    static getPetButtons() {
        return this.createButtonRow([
            {
                customId: 'pet_feed',
                label: 'Feed',
                style: ButtonStyle.Primary,
                emoji: '🍖'
            },
            {
                customId: 'pet_train',
                label: 'Train',
                style: ButtonStyle.Secondary,
                emoji: '🎯'
            },
            {
                customId: 'pet_play',
                label: 'Play',
                style: ButtonStyle.Success,
                emoji: '🎮'
            }
        ]);
    }

    static getBattleButtons() {
        return this.createButtonRow([
            {
                customId: 'battle_attack',
                label: 'Attack',
                style: ButtonStyle.Danger,
                emoji: '⚔️'
            },
            {
                customId: 'battle_defend',
                label: 'Defend',
                style: ButtonStyle.Secondary,
                emoji: '🛡️'
            },
            {
                customId: 'battle_special',
                label: 'Special',
                style: ButtonStyle.Primary,
                emoji: '✨'
            }
        ]);
    }

    static getTicketButtons() {
        return this.createButtonRow([
            {
                customId: 'ticket_create',
                label: 'Create Ticket',
                style: ButtonStyle.Primary,
                emoji: '🎫'
            },
            {
                customId: 'ticket_view',
                label: 'My Tickets',
                style: ButtonStyle.Secondary,
                emoji: '📋'
            }
        ]);
    }

    // New method for creating welcome embeds with AI-generated content
    static createWelcomeEmbed(member, welcomeMessage = null) {
        const embed = this.createMatricaStyleEmbed({
            title: '🎉 Welcome to Lil Gargs!',
            description: welcomeMessage || `Welcome **${member.user.username}** to the Lil Gargs community! 🐲`,
            color: '#00FF00',
            thumbnail: member.user.displayAvatarURL({ dynamic: true })
        });

        embed.addFields(
            {
                name: '🚀 Getting Started',
                value: [
                    '🐲 **Adopt a Pet** - Use `/pet adopt [name]` to get your first Lil Garg',
                    '⚔️ **Battle System** - Challenge other members with `/battle start @user`',
                    '🔐 **NFT Verification** - Verify your holdings to access exclusive channels',
                    '🎫 **Support Tickets** - Need help? Create a ticket in the support channel'
                ].join('\n'),
                inline: false
            },
            {
                name: '💎 NFT Mining',
                value: 'Connect your wallet to verify your Lil Gargs NFT holdings and unlock special roles and channels!',
                inline: false
            }
        );

        return embed;
    }

    // New method for creating lockdown embeds
    static createLockdownEmbed(reason = 'Emergency lockdown initiated') {
        const embed = this.createMatricaStyleEmbed({
            title: '🚨 SERVER LOCKDOWN',
            description: 'This server is currently under emergency lockdown.',
            color: '#FF0000',
            thumbnail: 'https://i.imgur.com/lockdown-icon.png'
        });

        embed.addFields(
            {
                name: '⚠️ Status',
                value: 'All chat channels are restricted to founders only.',
                inline: false
            },
            {
                name: '🔒 Reason',
                value: reason,
                inline: false
            },
            {
                name: '📢 Instructions',
                value: 'Please wait for staff to resolve the situation. Only founders can post during lockdown.',
                inline: false
            }
        );

        return embed;
    }
}

module.exports = EmbedBuilder;
