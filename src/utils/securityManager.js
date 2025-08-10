const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const logger = require('./logger');

class SecurityManager {
    constructor(client) {
        this.client = client;
        this.suspiciousUsernames = [
            'lilgargs88', 'lilgargs', 'lilgarg', 'lilgargs88_', '_lilgargs88',
            'lilgargs88_', 'lilgargs88.', '.lilgargs88', 'lilgargs88-', '-lilgargs88'
        ];
        this.founderRoleIds = new Set();
        this.ownerId = 'lilgargs88'; // Replace with actual owner ID
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Monitor member joins for username impersonation
        this.client.on('guildMemberAdd', async (member) => {
            await this.checkUsernameImpersonation(member);
        });

        // Monitor role changes
        this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
            await this.checkRoleChanges(oldMember, newMember);
        });

        // Monitor role creation
        this.client.on('roleCreate', async (role) => {
            await this.checkRoleCreation(role);
        });

        // Monitor bans and kicks
        this.client.on('guildBanAdd', async (ban) => {
            await this.logBan(ban);
        });

        this.client.on('guildMemberRemove', async (member) => {
            await this.checkMemberRemoval(member);
        });

        // Monitor message content for links and spam
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.checkMessageContent(message);
        });
    }

    async checkUsernameImpersonation(member) {
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();

        // Check for suspicious username patterns
        const isSuspicious = this.suspiciousUsernames.some(suspicious => {
            const suspiciousLower = suspicious.toLowerCase();
            return username.includes(suspiciousLower) || 
                   displayName.includes(suspiciousLower) ||
                   this.calculateSimilarity(username, suspiciousLower) > 0.8;
        });

        if (isSuspicious) {
            logger.warn(`Potential username impersonation detected: ${member.user.tag}`);
            
            try {
                // Kick the user
                await member.kick('Username impersonation detected');
                
                // Log the action
                await this.logSecurityAction(member.guild, 'Username Impersonation', {
                    user: member.user.tag,
                    userId: member.user.id,
                    action: 'Kicked',
                    reason: 'Username impersonation detected'
                });

                // Notify staff
                await this.notifyStaff(member.guild, '🚨 Username Impersonation Detected', 
                    `User **${member.user.tag}** was kicked for username impersonation.`);
            } catch (error) {
                logger.error('Failed to kick impersonator:', error);
            }
        }
    }

    async checkRoleChanges(oldMember, newMember) {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        // Check for admin role assignment
        for (const [roleId, role] of addedRoles) {
            if (role.permissions.has('Administrator')) {
                await this.handleAdminRoleAssignment(newMember, role);
            }
        }

        // Check for founder role protection
        for (const [roleId, role] of addedRoles) {
            if (role.name.toLowerCase().includes('founder') || role.name.toLowerCase().includes('owner')) {
                await this.handleFounderRoleAssignment(newMember, role);
            }
        }

        // Log role changes
        if (addedRoles.size > 0 || removedRoles.size > 0) {
            await this.logRoleChanges(newMember, addedRoles, removedRoles);
        }
    }

    async handleAdminRoleAssignment(member, role) {
        try {
            // Get audit log to see who assigned the role
            const auditLogs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberRoleUpdate,
                limit: 1
            });

            const auditEntry = auditLogs.entries.first();
            if (auditEntry && auditEntry.executor.id !== this.ownerId) {
                // Remove the admin role
                await member.roles.remove(role, 'Admin role assignment requires owner approval');
                
                // Notify owner
                await this.notifyOwner(member.guild, '🚨 Unauthorized Admin Role Assignment', 
                    `User **${member.user.tag}** was given admin role by **${auditEntry.executor.tag}** without approval. Role has been removed.`);
                
                // Log the action
                await this.logSecurityAction(member.guild, 'Unauthorized Admin Role Assignment', {
                    user: member.user.tag,
                    userId: member.user.id,
                    assignedBy: auditEntry.executor.tag,
                    action: 'Role removed'
                });
            }
        } catch (error) {
            logger.error('Failed to handle admin role assignment:', error);
        }
    }

    async handleFounderRoleAssignment(member, role) {
        logger.warn(`Founder role assignment detected: ${member.user.tag} -> ${role.name}`);
        
        // Check if this is a new founder role being created
        if (role.createdAt && (Date.now() - role.createdAt.getTime()) < 60000) { // Within 1 minute
            logger.warn(`New founder role detected: ${role.name} - will be deleted`);
            
            // Delete the new founder role immediately
            try {
                await role.delete('Unauthorized founder role creation');
                logger.info(`Deleted unauthorized founder role: ${role.name}`);
                
                // Notify staff
                await this.notifyStaff(member.guild, '🚨 Unauthorized Founder Role Deleted', 
                    `A new founder role **${role.name}** was created without authorization and has been automatically deleted.`);
            } catch (error) {
                logger.error('Failed to delete unauthorized founder role:', error);
            }
        }
    }

    async checkRoleCreation(role) {
        // Check if the new role has founder-like permissions
        if (role.permissions.has('Administrator') || role.permissions.has('ManageGuild')) {
            try {
                // Delete the role
                await role.delete('Founder role creation requires approval');
                
                // Log the action
                await this.logSecurityAction(role.guild, 'Unauthorized Founder Role Creation', {
                    roleName: role.name,
                    roleId: role.id,
                    action: 'Role deleted'
                });

                // Notify staff
                await this.notifyStaff(role.guild, '🚨 Unauthorized Founder Role Creation', 
                    `Role **${role.name}** was created and immediately deleted for security reasons.`);
            } catch (error) {
                logger.error('Failed to delete unauthorized role:', error);
            }
        }
    }

    async checkMessageContent(message) {
        // Check for unauthorized links
        if (!this.isAuthorizedToPostLinks(message.member)) {
            const linkRegex = /https?:\/\/[^\s]+/g;
            if (linkRegex.test(message.content)) {
                await this.handleUnauthorizedLink(message);
                return;
            }
        }

        // Check for mass mentions
        if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
            await this.handleMassMention(message);
            return;
        }

        // Check for invite links
        const inviteRegex = /discord\.gg\/[a-zA-Z0-9]+/g;
        if (inviteRegex.test(message.content)) {
            await this.handleInviteLink(message);
            return;
        }

        // Check for scam URLs
        if (this.isScamURL(message.content)) {
            await this.handleScamURL(message);
            return;
        }
    }

    isAuthorizedToPostLinks(member) {
        // Only founders can post links
        return member.roles.cache.some(role => 
            this.founderRoleIds.has(role.id) || 
            role.permissions.has('Administrator')
        );
    }

    async handleUnauthorizedLink(message) {
        try {
            // Delete the message
            await message.delete();
            
            // Warn the user
            const warning = await message.channel.send({
                content: `${message.author}, you are not authorized to post links in this channel.`,
                ephemeral: true
            });

            // Log the action
            await this.logSecurityAction(message.guild, 'Unauthorized Link Posted', {
                user: message.author.tag,
                userId: message.author.id,
                channel: message.channel.name,
                action: 'Message deleted, user warned'
            });

            // Auto-delete warning after 10 seconds
            setTimeout(() => {
                warning.delete().catch(() => {});
            }, 10000);
        } catch (error) {
            logger.error('Failed to handle unauthorized link:', error);
        }
    }

    async handleMassMention(message) {
        try {
            // Delete the message
            await message.delete();
            
            // Timeout the user for 10 minutes
            await message.member.timeout(10 * 60 * 1000, 'Mass mention detected');
            
            // Log the action
            await this.logSecurityAction(message.guild, 'Mass Mention Detected', {
                user: message.author.tag,
                userId: message.author.id,
                channel: message.channel.name,
                action: 'Message deleted, user timed out for 10 minutes'
            });
        } catch (error) {
            logger.error('Failed to handle mass mention:', error);
        }
    }

    async handleInviteLink(message) {
        try {
            // Delete the message
            await message.delete();
            
            // Kick the user
            await message.member.kick('Posting Discord invite links');
            
            // Log the action
            await this.logSecurityAction(message.guild, 'Discord Invite Link Posted', {
                user: message.author.tag,
                userId: message.author.id,
                channel: message.channel.name,
                action: 'User kicked'
            });
        } catch (error) {
            logger.error('Failed to handle invite link:', error);
        }
    }

    isScamURL(content) {
        const scamPatterns = [
            /free.*nitro/i,
            /discord.*gift/i,
            /steam.*gift/i,
            /free.*robux/i,
            /free.*vbucks/i
        ];
        
        return scamPatterns.some(pattern => pattern.test(content));
    }

    async handleScamURL(message) {
        try {
            // Delete the message
            await message.delete();
            
            // Ban the user
            await message.member.ban({ reason: 'Scam URL detected' });
            
            // Log the action
            await this.logSecurityAction(message.guild, 'Scam URL Detected', {
                user: message.author.tag,
                userId: message.author.id,
                channel: message.channel.name,
                action: 'User banned'
            });
        } catch (error) {
            logger.error('Failed to handle scam URL:', error);
        }
    }

    async logBan(ban) {
        try {
            const auditLogs = await ban.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBan,
                limit: 1
            });

            const auditEntry = auditLogs.entries.first();
            if (auditEntry) {
                await this.logSecurityAction(ban.guild, 'Member Banned', {
                    user: ban.user.tag,
                    userId: ban.user.id,
                    bannedBy: auditEntry.executor.tag,
                    reason: auditEntry.reason || 'No reason provided'
                });
            }
        } catch (error) {
            logger.error('Failed to log ban:', error);
        }
    }

    async checkMemberRemoval(member) {
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberKick,
                limit: 1
            });

            const auditEntry = auditLogs.entries.first();
            if (auditEntry && auditEntry.createdTimestamp > (Date.now() - 5000)) {
                await this.logSecurityAction(member.guild, 'Member Kicked', {
                    user: member.user.tag,
                    userId: member.user.id,
                    kickedBy: auditEntry.executor.tag,
                    reason: auditEntry.reason || 'No reason provided'
                });
            }
        } catch (error) {
            logger.error('Failed to check member removal:', error);
        }
    }

    async logRoleChanges(member, addedRoles, removedRoles) {
        try {
            const changes = [];
            
            if (addedRoles.size > 0) {
                changes.push(`Added: ${addedRoles.map(r => r.name).join(', ')}`);
            }
            
            if (removedRoles.size > 0) {
                changes.push(`Removed: ${removedRoles.map(r => r.name).join(', ')}`);
            }

            await this.logSecurityAction(member.guild, 'Role Changes', {
                user: member.user.tag,
                userId: member.user.id,
                changes: changes.join(' | ')
            });
        } catch (error) {
            logger.error('Failed to log role changes:', error);
        }
    }

    async logSecurityAction(guild, action, details) {
        try {
            // Find mod-log channel
            const modLogChannel = guild.channels.cache.find(channel => 
                channel.name === 'mod-log' || channel.name === 'security-log'
            );

            if (modLogChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`🚨 Security Alert: ${action}`)
                    .setTimestamp()
                    .addFields(
                        Object.entries(details).map(([key, value]) => ({
                            name: key.charAt(0).toUpperCase() + key.slice(1),
                            value: value.toString(),
                            inline: true
                        }))
                    );

                await modLogChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Failed to log security action:', error);
        }
    }

    async notifyStaff(guild, title, message) {
        try {
            const staffChannel = guild.channels.cache.find(channel => 
                channel.name === 'staff' || channel.name === 'admin'
            );

            if (staffChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B35')
                    .setTitle(title)
                    .setDescription(message)
                    .setTimestamp();

                await staffChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Failed to notify staff:', error);
        }
    }

    async notifyOwner(guild, title, message) {
        try {
            // Try to DM the owner
            const owner = await this.client.users.fetch(this.ownerId);
            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(title)
                    .setDescription(message)
                    .setTimestamp();

                await owner.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Failed to notify owner:', error);
        }
    }

    calculateSimilarity(str1, str2) {
        // Simple Levenshtein distance-based similarity
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const distance = matrix[str2.length][str1.length];
        const maxLength = Math.max(str1.length, str2.length);
        return 1 - (distance / maxLength);
    }

    // Emergency lockdown functionality
    async lockdown(guild, reason = 'Emergency lockdown initiated') {
        try {
            // Restrict all channels except founder channels
            const channels = guild.channels.cache.filter(channel => 
                channel.type === 0 && // Text channels only
                !channel.name.includes('founder') &&
                !channel.name.includes('admin')
            );

            for (const [channelId, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    AddReactions: false
                });
            }

            // Post warning in general channel
            const generalChannel = guild.channels.cache.find(channel => 
                channel.name === 'general'
            );

            if (generalChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 EMERGENCY LOCKDOWN')
                    .setDescription(`**${reason}**\n\nAll chat has been restricted. Only founders can post.\nUse \`/unlock\` to restore normal permissions.`)
                    .setTimestamp();

                await generalChannel.send({ embeds: [embed] });
            }

            // Log the action
            await this.logSecurityAction(guild, 'Emergency Lockdown', {
                reason: reason,
                action: 'All channels restricted'
            });

            return true;
        } catch (error) {
            logger.error('Failed to initiate lockdown:', error);
            return false;
        }
    }

    async unlock(guild) {
        try {
            // Restore normal permissions
            const channels = guild.channels.cache.filter(channel => 
                channel.type === 0
            );

            for (const [channelId, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: null,
                    AddReactions: null
                });
            }

            // Post unlock message
            const generalChannel = guild.channels.cache.find(channel => 
                channel.name === 'general'
            );

            if (generalChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Lockdown Lifted')
                    .setDescription('Normal permissions have been restored.')
                    .setTimestamp();

                await generalChannel.send({ embeds: [embed] });
            }

            // Log the action
            await this.logSecurityAction(guild, 'Lockdown Lifted', {
                action: 'All permissions restored'
            });

            return true;
        } catch (error) {
            logger.error('Failed to lift lockdown:', error);
            return false;
        }
    }

    // Set founder role IDs
    setFounderRoles(roleIds) {
        this.founderRoleIds = new Set(roleIds);
    }
}

module.exports = SecurityManager;
