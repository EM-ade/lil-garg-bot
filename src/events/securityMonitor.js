const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { getGuildConfig } = require('../utils/dbUtils');
const { createErrorEmbed, createWarningEmbed } = require('../utils/embedBuilder');
const SecurityManager = require('../utils/securityManager'); // Import SecurityManager

let securityManagerInstance = null; // To hold the singleton instance

/**
 * Helper to get or create SecurityManager instance
 */
function getSecurityManager(client) {
  if (!securityManagerInstance) {
    securityManagerInstance = new SecurityManager(client);
  }
  return securityManagerInstance;
}

/**
 * Security monitoring for messages
 */
const messageSecurityHandler = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    const securityManager = getSecurityManager(client);

    try {
      const config = await getGuildConfig(message.guild.id);
      if (!config?.security) return;

      const linkFilterEnabled = config.security.linkFilter?.enabled;
      const linkFilterAction = config.security.linkFilter?.action || 'delete';

      const inviteRegex = /(https?://)?(www\\.)?(discord\\.(gg|io|me|li)|discordapp\\.com/invite)/gi;
      const urlRegex = /https?:\\/\\/[^\\s]+/g; // General URL regex
      
      // 1. Check for spam
      if (config.security.antiSpam?.enabled) {
        await handleAntiSpam(message, config.security.antiSpam);
      }

      // 2. Check for unauthorized links
      if (linkFilterEnabled && urlRegex.test(message.content)) {
        const isWhitelisted = await securityManager.isAuthorizedToPostLinks(message.member);
        if (!isWhitelisted) {
          await handleUnauthorizedLink(message, linkFilterAction, securityManager);
          return; // Stop further processing if link is restricted
        }
      }

      // 3. Check for invite links (always restricted unless whitelisted for all links via the above check)
      if (inviteRegex.test(message.content)) {
        const isWhitelisted = await securityManager.isAuthorizedToPostLinks(message.member);
        if (!isWhitelisted) {
          await handleInviteLink(message, securityManager);
          return; // Stop further processing if invite link is restricted
        }
      }

      // 4. Check for mass mentions (always restricted)
      if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
          await handleMassMention(message, securityManager);
          return; // Stop further processing if mass mention is restricted
      }

      // 5. Check for scam URLs (always restricted)
      if (securityManager.isScamURL(message.content)) {
          await handleScamURL(message, securityManager);
          return; // Stop further processing if scam URL is restricted
      }

      // Removed checkMessageRestrictions as its logic is now inline or moved to specific handlers

    } catch (error) {
      logger.error('Error in security message monitoring:', error);
    }
  }
};

/**
 * Security monitoring for member joins
 */
const memberJoinSecurityHandler = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const securityManager = getSecurityManager(client);

    try {
      const config = await getGuildConfig(member.guild.id);
      if (!config?.security) return;

      // Check for raid protection
      if (config.security.antiRaid?.enabled) {
        await handleAntiRaid(member, config.security.antiRaid, securityManager);
      }

      // Check for username impersonation
      if (config.security.impersonationProtection?.enabled) {
        await handleImpersonationCheck(member, config.security.impersonationProtection, securityManager);
      }

    } catch (error) {
      logger.error('Error in security member join monitoring:', error);
    }
  }
};

/**
 * Handle anti-spam detection
 */
async function handleAntiSpam(message, config) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  
  // Simple spam detection - track message timestamps
  if (!global.spamTracker) {
    global.spamTracker = new Map();
  }
  
  const userKey = `${guildId}-${userId}`;
  const now = Date.now();
  const timeWindow = (config.timeWindow || 10) * 1000;
  const maxMessages = config.maxMessages || 5;
  
  const userData = global.spamTracker.get(userKey) || { messages: [], violations: 0 };
  
  // Remove old messages
  userData.messages = userData.messages.filter(timestamp => now - timestamp < timeWindow);
  userData.messages.push(now);
  
  if (userData.messages.length > maxMessages) {
    userData.violations++;
    global.spamTracker.set(userKey, userData);
    
    // Delete the spam message
    try {
      await message.delete();
    } catch (error) {
      logger.error('Failed to delete spam message:', error);
    }
    
    // Timeout user for repeat violations
    if (userData.violations >= 3) {
      try {
        await message.member.timeout(5 * 60 * 1000, 'Spam violation'); // 5 minutes
        
        const embed = createWarningEmbed(
          '🛡️ Anti-Spam Action',
          `${message.author} has been timed out for spam violations.`,
          [
            {
              name: '📊 Violations',
              value: userData.violations.toString(),
              inline: true
            }
          ]
        );
        
        await message.channel.send({ embeds: [embed] });
        
      } catch (error) {
        logger.error('Failed to timeout spam user:', error);
      }
    } else {
      // Just warn for first few violations
      const embed = createWarningEmbed(
        '⚠️ Spam Detected',
        `${message.author}, please slow down your messages.`,
        [
          {
            name: '📊 Warning',
            value: `${userData.violations}/3 violations`,
            inline: true
          }
        ]
      );
      
      const warningMsg = await message.channel.send({ embeds: [embed] });
      
      // Delete warning after 5 seconds
      setTimeout(async () => {
        try {
          await warningMsg.delete();
        } catch (error) {
          // Ignore deletion errors
        }
      }, 5000);
    }
    
    logger.warn(`Spam detected from ${message.author.tag} in ${message.guild.name}`);
  } else {
    global.spamTracker.set(userKey, userData);
  }
}

/**
 * Handle unauthorized links
 */
async function handleUnauthorizedLink(message, action, securityManager) {
  try {
    await message.delete();
    let warningMessageContent = `${message.author}, your message was removed because you are not authorized to post links here.`;
    
    if (action === 'warn') {
      const warning = await message.channel.send({
          content: warningMessageContent,
          ephemeral: true
      });
      setTimeout(() => { warning.delete().catch(() => {}); }, 10000); // Auto-delete warning
    } else if (action === 'timeout') {
      await message.member.timeout(10 * 60 * 1000, 'Posting unauthorized links'); // 10 minutes timeout
      warningMessageContent += ' You have been timed out for 10 minutes.';
        const warning = await message.channel.send({
          content: warningMessageContent,
          ephemeral: true
      });
      setTimeout(() => { warning.delete().catch(() => {}); }, 10000); // Auto-delete warning
    }

    await securityManager.logSecurityAction(message.guild, 'Unauthorized Link Posted', {
        user: message.author.tag,
        userId: message.author.id,
        channel: message.channel.name,
        action: `Message deleted, user ${action === 'delete' ? 'warned' : 'timed out'}`
    });
  } catch (error) {
      logger.error('Failed to handle unauthorized link:', error);
  }
}

/**
 * Handle mass mention
 */
async function handleMassMention(message, securityManager) {
  try {
      // Delete the message
      await message.delete();
      
      // Timeout the user for 10 minutes
      await message.member.timeout(10 * 60 * 1000, 'Mass mention detected');
      
      // Log the action
      await securityManager.logSecurityAction(message.guild, 'Mass Mention Detected', {
          user: message.author.tag,
          userId: message.author.id,
          channel: message.channel.name,
          action: 'Message deleted, user timed out for 10 minutes'
      });
  } catch (error) {
      logger.error('Failed to handle mass mention:', error);
  }
}

/**
 * Handle invite link
 */
async function handleInviteLink(message, securityManager) {
  try {
      // Delete the message
      await message.delete();
      
      // Kick the user
      await message.member.kick('Posting Discord invite links');
      
      // Log the action
      await securityManager.logSecurityAction(message.guild, 'Discord Invite Link Posted', {
          user: message.author.tag,
          userId: message.author.id,
          channel: message.channel.name,
          action: 'User kicked'
      });
  } catch (error) {
      logger.error('Failed to handle invite link:', error);
  }
}

/**
 * Handle scam URL
 */
async function handleScamURL(message, securityManager) {
  try {
      // Delete the message
      await message.delete();
      
      // Ban the user
      await message.member.ban({ reason: 'Scam URL detected' });
      
      // Log the action
      await securityManager.logSecurityAction(message.guild, 'Scam URL Detected', {
          user: message.author.tag,
          userId: message.author.id,
          channel: message.channel.name,
          action: 'User banned'
      });
  } catch (error) {
      logger.error('Failed to handle scam URL:', error);
  }
}

/**
 * Handle anti-raid protection
 */
async function handleAntiRaid(member, config, securityManager) {
  const guildId = member.guild.id;
  const now = Date.now();
  const threshold = config.joinThreshold || 10;
  const timeWindow = 60 * 1000; // 1 minute
  
  if (!global.raidTracker) {
    global.raidTracker = new Map();
  }
  
  const guildData = global.raidTracker.get(guildId) || { joins: [] };
  
  // Remove old joins
  guildData.joins = guildData.joins.filter(timestamp => now - timestamp < timeWindow);
  guildData.joins.push(now);
  
  global.raidTracker.set(guildId, guildData);
  
  if (guildData.joins.length >= threshold) {
    const action = config.action || 'kick';
    
    try {
      switch (action) {
        case 'kick':
          await member.kick('Anti-raid protection triggered');
          break;
        case 'ban':
          await member.ban({ reason: 'Anti-raid protection triggered' });
          break;
        case 'lockdown':
          // Use the lockdown function from the securityManager instance
          await securityManager.lockdown(member.guild, 'Raid detected - automatic lockdown');
          break;
      }
      
      logger.warn(`Anti-raid action (${action}) taken against ${member.user.tag} in ${member.guild.name}`);
      
      // Send alert to log channel
      const logChannel = member.guild.channels.cache.find(ch => 
        ch.name.includes('log') || ch.name.includes('mod')
      );
      
      if (logChannel) {
        const embed = createWarningEmbed(
          '🛡️ Anti-Raid Protection',
          `Raid detected! Action taken: ${action}`,
          [
            {
              name: '📊 Join Rate',
              value: `${guildData.joins.length} joins in the last minute`,
              inline: true
            },
            {
              name: '👤 Latest Member',
              value: `${member.user.tag} (${member.user.id})`,
              inline: true
            }
          ]
        );
        
        await logChannel.send({ embeds: [embed] });
      }
      
    } catch (error) {
      logger.error('Failed to execute anti-raid action:', error);
    }
  }
}

/**
 * Handle username impersonation check
 */
async function handleImpersonationCheck(member, config, securityManager) {
  const threshold = (config.similarityThreshold || 80) / 100; // Convert to 0-1 scale
  const newUsername = member.user.username;
  
  // Check against existing members
  const existingMembers = member.guild.members.cache;
  
  for (const [memberId, existingMember] of existingMembers) {
    if (memberId === member.id) continue; // Skip self
    
    const existingUsername = existingMember.displayName || existingMember.user.username;
    
    if (securityManager.calculateSimilarity(newUsername, existingUsername) > threshold) {
      try {
        // Send alert to log channel
        const logChannel = member.guild.channels.cache.find(ch => 
          ch.name.includes('log') || ch.name.includes('mod')
        );
        
        if (logChannel) {
          const embed = createWarningEmbed(
            '👤 Potential Impersonation Detected',
            'A new member has a username similar to an existing member.',
            [
              {
                name: '🆕 New Member',
                value: `${member.user.tag} (${member.user.id})`,
                inline: true
              },
              {
                name: '👥 Similar To',
                value: `${existingMember.user.tag} (${existingMember.user.id})`,
                inline: true
              },
              {
                name: '📊 Similarity',
                value: `High (threshold: ${config.similarityThreshold || 80}%)`,
                inline: true
              }
            ]
          );
          
          await logChannel.send({ embeds: [embed] });
        }
        
        logger.warn(`Potential impersonation: ${newUsername} similar to ${existingUsername} in ${member.guild.name}`);
        break; // Only alert for first match
        
      } catch (error) {
        logger.error('Failed to handle impersonation check:', error);
      }
    }
  }
}

module.exports = [messageSecurityHandler, memberJoinSecurityHandler];