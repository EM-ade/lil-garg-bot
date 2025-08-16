const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { getGuildConfig } = require('../utils/dbUtils');
const { checkMessageRestrictions, isSimilarUsername } = require('../utils/securityManager');
const { createErrorEmbed, createWarningEmbed } = require('../utils/embedBuilder');

/**
 * Security monitoring for messages
 */
const messageSecurityHandler = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    try {
      const config = await getGuildConfig(message.guild.id);
      if (!config?.security) return;

      // Check for spam
      if (config.security.antiSpam?.enabled) {
        await handleAntiSpam(message, config.security.antiSpam);
      }

      // Check for suspicious links
      if (config.security.linkFilter?.enabled) {
        await handleLinkFilter(message, config.security.linkFilter);
      }

      // Check message restrictions
      const restriction = checkMessageRestrictions(message, config);
      if (restriction.restricted) {
        await handleRestrictedMessage(message, restriction);
      }

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
    try {
      const config = await getGuildConfig(member.guild.id);
      if (!config?.security) return;

      // Check for raid protection
      if (config.security.antiRaid?.enabled) {
        await handleAntiRaid(member, config.security.antiRaid);
      }

      // Check for username impersonation
      if (config.security.impersonationProtection?.enabled) {
        await handleImpersonationCheck(member, config.security.impersonationProtection);
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
 * Handle link filtering
 */
async function handleLinkFilter(message, config) {
  const suspiciousPatterns = [
    /discord\.gg\/[a-zA-Z0-9]+/gi,
    /discordapp\.com\/invite\/[a-zA-Z0-9]+/gi,
    /discord\.com\/invite\/[a-zA-Z0-9]+/gi,
    /bit\.ly\/[a-zA-Z0-9]+/gi,
    /tinyurl\.com\/[a-zA-Z0-9]+/gi,
    /grabify\.link/gi,
    /iplogger\.org/gi
  ];
  
  const content = message.content.toLowerCase();
  const hasSuspiciousLink = suspiciousPatterns.some(pattern => pattern.test(content));
  
  if (hasSuspiciousLink) {
    try {
      await message.delete();
      
      const action = config.action || 'delete';
      
      if (action === 'warn' || action === 'timeout') {
        const embed = createWarningEmbed(
          '🔗 Suspicious Link Detected',
          `${message.author}, your message contained a suspicious link and was removed.`,
          [
            {
              name: '⚠️ Warning',
              value: 'Please avoid posting suspicious or unauthorized links.',
              inline: false
            }
          ]
        );
        
        const warningMsg = await message.channel.send({ embeds: [embed] });
        
        // Delete warning after 10 seconds
        setTimeout(async () => {
          try {
            await warningMsg.delete();
          } catch (error) {
            // Ignore deletion errors
          }
        }, 10000);
      }
      
      if (action === 'timeout') {
        try {
          await message.member.timeout(2 * 60 * 1000, 'Posted suspicious link'); // 2 minutes
        } catch (error) {
          logger.error('Failed to timeout user for suspicious link:', error);
        }
      }
      
      logger.warn(`Suspicious link removed from ${message.author.tag} in ${message.guild.name}`);
      
    } catch (error) {
      logger.error('Failed to handle suspicious link:', error);
    }
  }
}

/**
 * Handle restricted message
 */
async function handleRestrictedMessage(message, restriction) {
  try {
    await message.delete();
    
    const embed = createErrorEmbed(
      '🚫 Message Restricted',
      restriction.description,
      [
        {
          name: '📝 Reason',
          value: restriction.reason,
          inline: true
        }
      ]
    );
    
    const warningMsg = await message.channel.send({ 
      content: `${message.author}`,
      embeds: [embed] 
    });
    
    // Delete warning after 10 seconds
    setTimeout(async () => {
      try {
        await warningMsg.delete();
      } catch (error) {
        // Ignore deletion errors
      }
    }, 10000);
    
    logger.warn(`Restricted message from ${message.author.tag}: ${restriction.reason}`);
    
  } catch (error) {
    logger.error('Failed to handle restricted message:', error);
  }
}

/**
 * Handle anti-raid protection
 */
async function handleAntiRaid(member, config) {
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
          const { enableLockdown } = require('../utils/securityManager');
          await enableLockdown(guildId, member.client.user.id, 'Raid detected - automatic lockdown');
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
async function handleImpersonationCheck(member, config) {
  const threshold = (config.similarityThreshold || 80) / 100; // Convert to 0-1 scale
  const newUsername = member.user.username;
  
  // Check against existing members
  const existingMembers = member.guild.members.cache;
  
  for (const [memberId, existingMember] of existingMembers) {
    if (memberId === member.id) continue; // Skip self
    
    const existingUsername = existingMember.displayName || existingMember.user.username;
    
    if (isSimilarUsername(newUsername, existingUsername, threshold)) {
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