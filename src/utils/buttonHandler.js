const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { User, Pet, Battle, Ticket, BotConfig } = require('../database/models');
const NFTVerificationService = require('../services/nftVerification');
const RoleManager = require('./roleManager');
const EmbedBuilderUtil = require('./embedBuilder');
const logger = require('./logger');

class ButtonHandler {
    constructor(client) {
        this.client = client;
        this.nftService = new NFTVerificationService();
        this.roleManager = new RoleManager(client);
        this.setupButtonHandlers();
    }

    setupButtonHandlers() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;

            try {
                const customId = interaction.customId;
                
                if (customId.startsWith('verify_')) {
                    await this.handleVerificationButtons(interaction);
                } else if (customId.startsWith('pet_')) {
                    await this.handlePetButtons(interaction);
                } else if (customId.startsWith('battle_')) {
                    await this.handleBattleButtons(interaction);
                } else if (customId.startsWith('ticket_')) {
                    await this.handleTicketButtons(interaction);
                } else if (customId.startsWith('admin_')) {
                    await this.handleAdminButtons(interaction);
                } else if (customId.startsWith('welcome_')) {
                    await this.handleWelcomeButtons(interaction);
                } else if (customId.startsWith('feature_')) {
                    await this.handleFeatureButtons(interaction);
                }
            } catch (error) {
                logger.error('Error handling button interaction:', error);
                await this.handleError(interaction, error);
            }
        });
    }

    async handleVerificationButtons(interaction) {
        const customId = interaction.customId;

        switch (customId) {
            case 'verify_wallet':
                await this.handleVerifyWallet(interaction);
                break;
            case 'check_status':
                await this.handleCheckStatus(interaction);
                break;
            case 'manage_wallets':
                await this.handleManageWallets(interaction);
                break;
            default:
                await interaction.reply({ content: 'Unknown verification button.', ephemeral: true });
        }
    }

    async handleVerifyWallet(interaction) {
        try {
            // Check if user is already verified
            const existingUser = await User.findOne({ discordId: interaction.user.id });
            if (existingUser && existingUser.isVerified) {
                const embed = EmbedBuilderUtil.createVerificationEmbed(
                    existingUser.walletAddress, 
                    existingUser.nftTokens?.length || 0, 
                    'verified'
                );
                
                return await interaction.reply({
                    content: 'You are already verified!',
                    embeds: [embed],
                    components: [EmbedBuilderUtil.getVerificationButtons()],
                    ephemeral: true
                });
            }

            // Create verification modal for wallet address input
            const modal = new ModalBuilder()
                .setCustomId('verify_wallet_modal')
                .setTitle('🔐 NFT Verification');

            const walletInput = new TextInputBuilder()
                .setCustomId('wallet_address')
                .setLabel('Enter your Solana wallet address')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
                .setRequired(true)
                .setMaxLength(44);

            const firstActionRow = new ActionRowBuilder().addComponents(walletInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        } catch (error) {
            logger.error('Error in verify wallet button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleCheckStatus(interaction) {
        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user || !user.isVerified) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B35')
                    .setTitle('❌ Not Verified')
                    .setDescription('You are not currently verified. Use the Verify button to get started!')
                    .setTimestamp();
                
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const embed = EmbedBuilderUtil.createVerificationEmbed(
                user.walletAddress,
                user.nftTokens?.length || 0,
                'verified'
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            logger.error('Error in check status button:', error);
            await interaction.reply({
                content: '❌ An error occurred while checking your status.',
                ephemeral: true
            });
        }
    }

    async handleManageWallets(interaction) {
        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user || !user.isVerified) {
                return await interaction.reply({
                    content: '❌ You need to be verified first to manage wallets.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setTitle('🔑 Wallet Management')
                .setDescription('Currently verified wallets:')
                .addFields({
                    name: 'Primary Wallet',
                    value: user.walletAddress || 'None',
                    inline: false
                })
                .setFooter({ text: 'Contact staff to update wallet information' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            logger.error('Error in manage wallets button:', error);
            await interaction.reply({
                content: '❌ An error occurred while managing wallets.',
                ephemeral: true
            });
        }
    }

    async handlePetButtons(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            switch (customId) {
                case 'pet_feed':
                    await this.handlePetAction(interaction, 'feed', userId, guildId);
                    break;
                case 'pet_train':
                    await this.handlePetAction(interaction, 'train', userId, guildId);
                    break;
                case 'pet_play':
                    await this.handlePetAction(interaction, 'play', userId, guildId);
                    break;
                case 'pet_status':
                    await this.handlePetStatus(interaction, userId, guildId);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown pet button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling pet button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handlePetAction(interaction, action, userId, guildId) {
        const pet = await Pet.findOne({ ownerId: userId, guildId, isActive: true });
        
        if (!pet) {
            return await interaction.reply({
                content: '❌ You don\'t have an active pet. Use `/pet adopt` to get one!',
                ephemeral: true
            });
        }

        let canPerform = false;
        let cooldownMessage = '';

        switch (action) {
            case 'feed':
                canPerform = pet.canFeed();
                if (!canPerform) {
                    cooldownMessage = `❌ Your pet was fed recently. Wait ${this.formatTimeUntilAction(pet.cooldowns.lastFed, 4 * 60 * 60 * 1000)} before feeding again.`;
                }
                break;
            case 'train':
                canPerform = pet.canTrain();
                if (!canPerform) {
                    cooldownMessage = `❌ Your pet was trained recently. Wait ${this.formatTimeUntilAction(pet.cooldowns.lastTrained, 6 * 60 * 60 * 1000)} before training again.`;
                }
                break;
            case 'play':
                canPerform = pet.canPlay();
                if (!canPerform) {
                    cooldownMessage = `❌ You played with your pet recently. Wait ${this.formatTimeUntilAction(pet.cooldowns.lastPlayed, 2 * 60 * 60 * 1000)} before playing again.`;
                }
                break;
        }

        if (!canPerform) {
            return await interaction.reply({ content: cooldownMessage, ephemeral: true });
        }

        // Perform the action
        let message = '';
        switch (action) {
            case 'feed':
                pet.stats.energy = Math.min(100, pet.stats.energy + 30);
                pet.stats.mood = Math.min(100, pet.stats.mood + 20);
                pet.cooldowns.lastFed = new Date();
                message = '🍖 Your pet enjoyed the meal! Energy +30, Mood +20';
                break;
            case 'train':
                pet.stats.attack += Math.floor(Math.random() * 3) + 1;
                pet.stats.defense += Math.floor(Math.random() * 3) + 1;
                pet.stats.attack = Math.min(100, pet.stats.attack);
                pet.stats.defense = Math.min(100, pet.stats.defense);
                pet.cooldowns.lastTrained = new Date();
                message = `⚔️ Training complete! Attack +${pet.stats.attack}, Defense +${pet.stats.defense}`;
                break;
            case 'play':
                pet.stats.mood = Math.min(100, pet.stats.mood + 40);
                pet.stats.energy = Math.max(0, pet.stats.energy - 10);
                pet.cooldowns.lastPlayed = new Date();
                message = '🎾 Playtime was fun! Mood +40, Energy -10';
                break;
        }

        await pet.save();
        await interaction.reply({ content: message, ephemeral: true });
    }

    async handlePetStatus(interaction, userId, guildId) {
        const pet = await Pet.findOne({ ownerId: userId, guildId, isActive: true });
        
        if (!pet) {
            return await interaction.reply({
                content: '❌ You don\'t have an active pet. Use `/pet adopt` to get one!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle(`🐲 ${pet.name} - ${pet.element} ${pet.personality}`)
            .addFields(
                { name: 'Level', value: pet.level.toString(), inline: true },
                { name: 'Experience', value: `${pet.experience}/${pet.experienceToNext}`, inline: true },
                { name: 'Health', value: pet.stats.health.toString(), inline: true },
                { name: 'Attack', value: pet.stats.attack.toString(), inline: true },
                { name: 'Defense', value: pet.stats.defense.toString(), inline: true },
                { name: 'Mood', value: pet.stats.mood.toString(), inline: true },
                { name: 'Energy', value: pet.stats.energy.toString(), inline: true }
            )
            .setFooter({ text: `Created on ${pet.createdAt.toLocaleDateString()}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleBattleButtons(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            switch (customId) {
                case 'battle_attack':
                    await this.handleBattleAction(interaction, 'attack', userId, guildId);
                    break;
                case 'battle_defend':
                    await this.handleBattleAction(interaction, 'defend', userId, guildId);
                    break;
                case 'battle_special':
                    await this.handleBattleAction(interaction, 'special', userId, guildId);
                    break;
                case 'battle_forfeit':
                    await this.handleBattleForfeit(interaction, userId, guildId);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown battle button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling battle button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleBattleAction(interaction, action, userId, guildId) {
        const battle = await Battle.findActiveBattle(userId, guildId);
        
        if (!battle) {
            return await interaction.reply({
                content: '❌ You are not currently in a battle.',
                ephemeral: true
            });
        }

        if (!battle.isPlayerTurn(userId)) {
            return await interaction.reply({
                content: '❌ It\'s not your turn yet.',
                ephemeral: true
            });
        }

        // Process the battle action
        const player = battle.currentTurn === 'challenger' ? 'challenger' : 'opponent';
        const opponent = battle.currentTurn === 'challenger' ? 'opponent' : 'challenger';
        
        let damage = 0;
        let message = '';

        switch (action) {
            case 'attack':
                damage = battle.calculateDamage(battle[`${player}Stats`], battle[`${opponent}Stats`], 'attack');
                battle[`${opponent}Stats`].currentHealth = Math.max(0, battle[`${opponent}Stats`].currentHealth - damage);
                message = `⚔️ ${interaction.user.username} attacks for ${damage} damage!`;
                break;
            case 'defend':
                battle[`${player}Stats`].defense += 20;
                battle[`${player}Stats`].defense = Math.min(100, battle[`${player}Stats`].defense);
                message = `🛡️ ${interaction.user.username} takes a defensive stance!`;
                break;
            case 'special':
                damage = battle.calculateDamage(battle[`${player}Stats`], battle[`${opponent}Stats`], 'special');
                battle[`${opponent}Stats`].currentHealth = Math.max(0, battle[`${opponent}Stats`].currentHealth - damage);
                message = `💥 ${interaction.user.username} uses special attack for ${damage} damage!`;
                break;
        }

        // Add turn to battle history
        battle.addTurn({
            player: interaction.user.username,
            action: action,
            damage: damage,
            message: message
        });

        // Check if battle is over
        if (battle.isBattleOver()) {
            battle.status = 'completed';
            battle.completedAt = new Date();
            battle.winner = battle.getWinner();
            battle.calculateRewards();
            
            // Update pet experience
            const winnerPet = await Pet.findById(battle.winner === 'challenger' ? battle.challenger.petId : battle.opponent.petId);
            if (winnerPet) {
                await winnerPet.addExperience(battle.rewards.experience);
            }
            
            await battle.save();
            
            // Send battle result
            const resultEmbed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setTitle('🏆 Battle Complete!')
                .setDescription(`Winner: ${battle.winner === 'challenger' ? battle.challenger.username : battle.opponent.username}`)
                .addFields({
                    name: 'Rewards',
                    value: `Experience: ${battle.rewards.experience}\nCoins: ${battle.rewards.coins}`,
                    inline: false
                })
                .setTimestamp();

            await interaction.reply({ embeds: [resultEmbed] });
            
            // Auto-delete battle channel after 5 minutes
            setTimeout(async () => {
                try {
                    const channel = interaction.guild.channels.cache.get(battle.channelId);
                    if (channel) {
                        await channel.delete('Battle completed - auto-cleanup');
                    }
                } catch (error) {
                    logger.error('Error deleting battle channel:', error);
                }
            }, 5 * 60 * 1000);
            
            return;
        }

        // Switch turns
        battle.switchTurn();
        await battle.save();

        // Update battle message with new buttons
        const battleEmbed = this.createBattleEmbed(battle);
        const battleButtons = this.createBattleButtons(battle._id, battle.currentTurn === 'challenger' ? 'challenger' : 'opponent');
        
        try {
            const battleMessage = await interaction.channel.messages.fetch(battle.messageId);
            await battleMessage.edit({ embeds: [battleEmbed], components: [battleButtons] });
        } catch (error) {
            logger.error('Error updating battle message:', error);
        }

        await interaction.reply({ content: message, ephemeral: true });
    }

    async handleBattleForfeit(interaction, userId, guildId) {
        const battle = await Battle.findActiveBattle(userId, guildId);
        
        if (!battle) {
            return await interaction.reply({
                content: '❌ You are not currently in a battle.',
                ephemeral: true
            });
        }

        battle.status = 'cancelled';
        battle.completedAt = new Date();
        battle.winner = battle.currentTurn === 'challenger' ? 'opponent' : 'challenger';
        await battle.save();

        await interaction.reply({ content: '🏳️ You have forfeited the battle.', ephemeral: true });
        
        // Auto-delete battle channel after 2 minutes
        setTimeout(async () => {
            try {
                const channel = interaction.guild.channels.cache.get(battle.channelId);
                if (channel) {
                    await channel.delete('Battle forfeited - auto-cleanup');
                }
            } catch (error) {
                logger.error('Error deleting battle channel:', error);
            }
        }, 2 * 60 * 1000);
    }

    async handleTicketButtons(interaction) {
        const customId = interaction.customId;

        try {
            switch (customId) {
                case 'ticket_create':
                    await this.createTicket(interaction);
                    break;
                case 'ticket_list':
                    await this.viewTickets(interaction);
                    break;
                case 'ticket_close':
                    await this.closeTicket(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown ticket button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling ticket button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async createTicket(interaction) {
        // Create ticket creation modal
        const modal = new ModalBuilder()
            .setCustomId('ticket_create_modal')
            .setTitle('🎫 Create Support Ticket');

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Subject')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Brief description of your issue')
            .setRequired(true)
            .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('ticket_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Detailed description of your issue')
            .setRequired(true)
            .setMaxLength(1000);

        const categoryInput = new TextInputBuilder()
            .setCustomId('ticket_category')
            .setLabel('Category (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('general, support, bug, feature, billing, other')
            .setRequired(false)
            .setMaxLength(50);

        const firstActionRow = new ActionRowBuilder().addComponents(subjectInput);
        const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(categoryInput);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
        await interaction.showModal(modal);
    }

    async viewTickets(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        const tickets = await Ticket.find({ 
            userId: userId, 
            guildId: guildId, 
            status: { $ne: 'closed' } 
        }).sort({ createdAt: -1 });

        if (tickets.length === 0) {
            return await interaction.reply({
                content: '❌ You don\'t have any open tickets.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle('🎫 Your Open Tickets')
            .setDescription(`You have ${tickets.length} open ticket(s):`);

        tickets.forEach((ticket, index) => {
            embed.addFields({
                name: `Ticket #${ticket._id.toString().slice(-6)}`,
                value: `**Subject:** ${ticket.subject}\n**Status:** ${ticket.status}\n**Created:** ${ticket.createdAt.toLocaleDateString()}`,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async closeTicket(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        const openTicket = await Ticket.findOne({ 
            userId: userId, 
            guildId: guildId, 
            status: { $ne: 'closed' } 
        });

        if (!openTicket) {
            return await interaction.reply({
                content: '❌ You don\'t have any open tickets to close.',
                ephemeral: true
            });
        }

        openTicket.status = 'closed';
        openTicket.closedAt = new Date();
        await openTicket.save();

        await interaction.reply({
            content: `✅ Ticket #${openTicket._id.toString().slice(-6)} has been closed.`,
            ephemeral: true
        });

        // Auto-delete ticket channel after 1 minute
        setTimeout(async () => {
            try {
                const channel = interaction.guild.channels.cache.get(openTicket.channelId);
                if (channel) {
                    await channel.delete('Ticket closed - auto-cleanup');
                }
            } catch (error) {
                logger.error('Error deleting ticket channel:', error);
            }
        }, 60 * 1000);
    }

    async handleAdminButtons(interaction) {
        const customId = interaction.customId;

        try {
            switch (customId) {
                case 'admin_ban':
                    await this.handleAdminAction(interaction, 'ban');
                    break;
                case 'admin_kick':
                    await this.handleAdminAction(interaction, 'kick');
                    break;
                case 'admin_timeout':
                    await this.handleAdminAction(interaction, 'timeout');
                    break;
                case 'admin_purge':
                    await this.handleAdminAction(interaction, 'purge');
                    break;
                default:
                    await interaction.reply({ content: 'Unknown admin button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling admin button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleAdminAction(interaction, action) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this feature.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle(`🔧 Admin Action: ${action.toUpperCase()}`)
            .setDescription(`Please use the appropriate slash command for ${action} actions.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleWelcomeButtons(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            switch (customId) {
                case 'welcome_pet_adopt':
                    await this.handleWelcomePetAdopt(interaction, userId, guildId);
                    break;
                case 'welcome_nft_verify':
                    await this.handleWelcomeNFTVerify(interaction, userId, guildId);
                    break;
                case 'welcome_battle_start':
                    await this.handleWelcomeBattleStart(interaction, userId, guildId);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown welcome button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling welcome button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleWelcomePetAdopt(interaction, userId, guildId) {
        try {
            // Check if user already has a pet
            const existingPet = await Pet.findOne({ ownerId: userId, guildId });
            if (existingPet) {
                return await interaction.reply({
                    content: `❌ You already have a pet named **${existingPet.name}**! Use \`/pet status\` to check on them.`,
                    ephemeral: true
                });
            }

            // Create pet adoption modal
            const modal = new ModalBuilder()
                .setCustomId('pet_adopt_modal')
                .setTitle('🐲 Adopt Your Lil Garg');

            const nameInput = new TextInputBuilder()
                .setCustomId('pet_name')
                .setLabel('What would you like to name your pet?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter a name for your new companion')
                .setRequired(true)
                .setMaxLength(32);

            const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        } catch (error) {
            logger.error('Error in welcome pet adopt button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleWelcomeNFTVerify(interaction, userId, guildId) {
        try {
            // Check if user is already verified
            const existingUser = await User.findOne({ discordId: userId });
            if (existingUser && existingUser.isVerified) {
                const embed = EmbedBuilderUtil.createVerificationEmbed(
                    existingUser.walletAddress, 
                    existingUser.nftTokens?.length || 0, 
                    'verified'
                );
                
                return await interaction.reply({
                    content: '✅ You are already verified!',
                    embeds: [embed],
                    ephemeral: true
                });
            }

            // Create verification modal
            const modal = new ModalBuilder()
                .setCustomId('verify_wallet_modal')
                .setTitle('🔐 NFT Verification');

            const walletInput = new TextInputBuilder()
                .setCustomId('wallet_address')
                .setLabel('Enter your Solana wallet address')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
                .setRequired(true)
                .setMaxLength(44);

            const firstActionRow = new ActionRowBuilder().addComponents(walletInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        } catch (error) {
            logger.error('Error in welcome NFT verify button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleWelcomeBattleStart(interaction, userId, guildId) {
        try {
            // Check if user has a pet
            const userPet = await Pet.findOne({ ownerId: userId, guildId });
            if (!userPet) {
                return await interaction.reply({
                    content: '❌ You need to adopt a pet first before you can battle! Use the "Adopt Pet" button above.',
                    ephemeral: true
                });
            }

            // Check if user is already in a battle
            const existingBattle = await Battle.findActiveBattle(userId, guildId);
            if (existingBattle) {
                return await interaction.reply({
                    content: '❌ You are already in a battle! Please finish your current battle first.',
                    ephemeral: true
                });
            }

            // Show battle instructions
            const embed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setTitle('⚔️ Ready to Battle?')
                .setDescription(`Great! You have **${userPet.name}** ready for battle. Here's how to get started:`)
                .addFields(
                    { name: '🎯 Challenge Someone', value: 'Use `/battle start @username` to challenge another member', inline: false },
                    { name: '🏆 View Arena', value: 'Use `/battle arena` to see ongoing battles', inline: false },
                    { name: '📊 Check Profile', value: 'Use `/battle profile` to view your battle stats', inline: false }
                )
                .setFooter({ text: 'May the best garg win! 🐲' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error in welcome battle start button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleFeatureButtons(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            switch (customId) {
                case 'feature_pet_adopt':
                    await this.handleWelcomePetAdopt(interaction, userId, guildId);
                    break;
                case 'feature_nft_verify':
                    await this.handleWelcomeNFTVerify(interaction, userId, guildId);
                    break;
                case 'feature_battle_start':
                    await this.handleWelcomeBattleStart(interaction, userId, guildId);
                    break;
                case 'feature_create_ticket':
                    await this.createTicket(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown feature button.', ephemeral: true });
            }
        } catch (error) {
            logger.error('Error handling feature button:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }

    async handleError(interaction, error) {
        logger.error('Button interaction error:', error);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request. Please try again.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request. Please try again.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            logger.error('Error sending error message:', replyError);
        }
    }

    createBattleEmbed(battle) {
        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle('⚔️ Battle Arena')
            .setDescription(`**${battle.challenger.username}** vs **${battle.opponent.username}**`)
            .addFields(
                {
                    name: 'Challenger',
                    value: `Health: ${battle.challengerStats.currentHealth}/${battle.challengerStats.maxHealth}\nAttack: ${battle.challengerStats.attack}\nDefense: ${battle.challengerStats.defense}`,
                    inline: true
                },
                {
                    name: 'Opponent',
                    value: `Health: ${battle.opponentStats.currentHealth}/${battle.opponentStats.maxHealth}\nAttack: ${battle.opponentStats.attack}\nDefense: ${battle.opponentStats.defense}`,
                    inline: true
                },
                {
                    name: 'Turn',
                    value: `Current turn: ${battle.currentTurn === 'challenger' ? battle.challenger.username : battle.opponent.username}`,
                    inline: false
                }
            )
            .setFooter({ text: `Turn ${battle.turnNumber}` })
            .setTimestamp();

        return embed;
    }

    createBattleButtons(battleId, currentTurn) {
        const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
        
        const attackButton = new ButtonBuilder()
            .setCustomId('battle_attack')
            .setLabel('⚔️ Attack')
            .setStyle(ButtonStyle.Danger);

        const defendButton = new ButtonBuilder()
            .setCustomId('battle_defend')
            .setLabel('🛡️ Defend')
            .setStyle(ButtonStyle.Primary);

        const specialButton = new ButtonBuilder()
            .setCustomId('battle_special')
            .setLabel('💥 Special')
            .setStyle(ButtonStyle.Secondary);

        const forfeitButton = new ButtonBuilder()
            .setCustomId('battle_forfeit')
            .setLabel('🏳️ Forfeit')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(attackButton, defendButton, specialButton, forfeitButton);

        return row;
    }

    formatTimeUntilAction(lastAction, cooldown) {
        if (!lastAction) return 'now';
        
        const now = new Date();
        const timeUntil = cooldown - (now - lastAction);
        
        if (timeUntil <= 0) return 'now';
        
        const minutes = Math.floor(timeUntil / (1000 * 60));
        const seconds = Math.floor((timeUntil % (1000 * 60)) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }
}

module.exports = ButtonHandler;
