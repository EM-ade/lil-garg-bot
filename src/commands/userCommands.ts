/**
 * User Slash Commands - NFT Verification
 * 
 * Commands for regular users to verify NFT ownership and manage wallets.
 * These commands are available to all server members.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { getDatabase, closeDatabase, type Database } from '../db';
import { VerificationService } from '../services/VerificationService';
import { WalletService } from '../services/WalletService';
import { GuildConfigService } from '../services/GuildConfigService';
import logger from '../utils/logger';

/**
 * Handle /verify command
 * 
 * Initiates the verification flow by generating a unique link
 * that the user can click to verify on the web frontend.
 */
export async function handleVerifyCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const db = await getDatabase();
  const walletAddress = interaction.options.getString('wallet');

  try {
    const verificationService = new VerificationService(db);
    const guildConfigService = new GuildConfigService(db);

    // Get or create guild record
    const guild = await guildConfigService.getOrCreateGuild({
      guildId: interaction.guildId!,
      guildName: interaction.guild?.name || 'Unknown Server',
    });

    // Check if guild has verification enabled
    if (!guild.isActive) {
      await interaction.editReply({
        content: '❌ Verification is currently disabled for this server. Please contact an administrator.',
      });
      await closeDatabase();
      return;
    }

    // Check if guild has Helius API key configured (enforced - no fallback)
    if (!guild.settings?.heliusApiKey) {
      await interaction.editReply({
        content: '❌ This server has not configured a Helius API key for NFT verification.\n\n' +
          'Please ask an admin to set up the Helius configuration.',
      });
      await closeDatabase();
      return;
    }

    // Check if user already has a verification
    const existingVerification = await verificationService.getVerificationByUser(
      guild.id,
      interaction.user.id
    );

    if (existingVerification && existingVerification.status === 'verified') {
      const embed = new EmbedBuilder()
        .setColor(0x34A853)
        .setTitle('✅ Already Verified')
        .setDescription('You are already verified in this server!')
        .addFields(
          { name: 'Wallet', value: `\`${existingVerification.walletAddress}\``, inline: true },
          { name: 'NFTs', value: (existingVerification.nftsOwned as any[])?.length?.toString() || '0', inline: true },
          { name: 'Verified At', value: existingVerification.verifiedAt.toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Use /reverify to update your verification status' });

      await interaction.editReply({ embeds: [embed] });
      await closeDatabase();
      return;
    }

    // Create verification session
    const session = await verificationService.createSession({
      guildId: guild.id,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      walletAddress: walletAddress || undefined,
    });

    // Generate verification URL
    const frontendUrl = process.env.FRONTEND_URL || 'https://discord.lilgarg.xyz';
    const verificationUrl = `${frontendUrl}/verify?token=${session.token}&guild=${interaction.guildId}`;

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x4285F4)
      .setTitle('🔐 NFT Verification')
      .setDescription(
        'Click the button below to verify your NFT ownership and get your Discord role.\n\n' +
        '**Steps:**\n' +
        '1. Click "Verify Now"\n' +
        '2. Connect your Solana wallet\n' +
        '3. Sign the message (gas-free)\n' +
        '4. Return to Discord - your role will be assigned automatically!'
      )
      .addFields(
        { name: 'Server', value: interaction.guild?.name || 'Unknown', inline: true },
        { name: 'Expires In', value: '10 minutes', inline: true },
        { name: 'Collections', value: session.collections.length.toString(), inline: true }
      )
      .setFooter({ text: 'This link is unique to you and cannot be shared' })
      .setTimestamp();

    // Add collection info if available
    if (session.collections.length > 0) {
      embed.addFields({
        name: 'Required Collections',
        value: session.collections.map(c => `• ${c.name}`).join('\n'),
        inline: false
      });
    }

    // Create verify button
    const verifyButton = new ButtonBuilder()
      .setLabel('🔗 Verify Now')
      .setURL(verificationUrl)
      .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    logger.info(
      `[Commands] User ${interaction.user.username} initiated verification in guild ${interaction.guildId}`
    );
  } catch (error: any) {
    logger.error('[Commands] Error in /verify:', error);
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  } finally {
    await closeDatabase();
  }
}

/**
 * Handle /wallet command
 * 
 * Shows user's linked wallet and verification status.
 */
export async function handleWalletCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const db = await getDatabase();
  const subcommand = interaction.options.getSubcommand();

  try {
    const walletService = new WalletService(db);
    const verificationService = new VerificationService(db);
    const guildConfigService = new GuildConfigService(db);

    if (subcommand === 'show') {
      // Show wallet info
      const wallet = await walletService.getWalletByUserId(interaction.user.id);

      if (!wallet) {
        const embed = new EmbedBuilder()
          .setColor(0xFBBC04)
          .setTitle('👛 No Wallet Linked')
          .setDescription(
            'You have not linked a wallet yet.\n\n' +
            'Use `/verify` to start the verification process and link your wallet.'
          );

        await interaction.editReply({ embeds: [embed] });
        await closeDatabase();
        return;
      }

      // Get verification status for this guild
      const guild = await guildConfigService.getGuildByDiscordId(interaction.guildId!);
      let verification = null;
      
      if (guild) {
        verification = await verificationService.getVerificationByUser(guild.id, interaction.user.id);
      }

      const embed = new EmbedBuilder()
        .setColor(0x34A853)
        .setTitle('👛 Your Linked Wallet')
        .addFields(
          { name: 'Wallet Address', value: `\`${wallet.walletAddress}\``, inline: false },
          { name: 'Linked Since', value: wallet.linkedAt.toLocaleString(), inline: true },
          { name: 'Status', value: wallet.isVerified ? '✅ Verified' : '⏳ Pending', inline: true }
        );

      if (verification) {
        embed.addFields({
          name: 'Verification Status',
          value: verification.status === 'verified' ? '✅ Verified' : `⚠️ ${verification.status}`,
          inline: true
        });

        if (verification.status === 'verified') {
          embed.addFields({
            name: 'NFTs Owned',
            value: (verification.nftsOwned as any[])?.length?.toString() || '0',
            inline: true
          });

          embed.addFields({
            name: 'Expires',
            value: verification.expiresAt ? verification.expiresAt.toLocaleString() : 'Never',
            inline: true
          });
        }
      }

      embed.setFooter({ text: 'Use /wallet unlink to remove this wallet' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'unlink') {
      // Unlink wallet
      const wallet = await walletService.getWalletByUserId(interaction.user.id);

      if (!wallet) {
        await interaction.editReply({
          content: '❌ You do not have a linked wallet to unlink.',
        });
        await closeDatabase();
        return;
      }

      try {
        await walletService.unlinkWallet(wallet.walletAddress, interaction.user.id);

        const embed = new EmbedBuilder()
          .setColor(0xEA4335)
          .setTitle('👛 Wallet Unlinked')
          .setDescription(
            `Successfully unlinked wallet \`${wallet.walletAddress}\`.\n\n` +
            '⚠️ Note: Your verification roles may be removed if the server requires NFT ownership.'
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error: any) {
        await interaction.editReply({
          content: `❌ Error unlinking wallet: ${error.message}`,
        });
      }
    }
  } catch (error: any) {
    logger.error('[Commands] Error in /wallet:', error);
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  } finally {
    await closeDatabase();
  }
}

/**
 * Handle /reverify command
 * 
 * Re-checks user's NFT ownership and updates roles.
 */
export async function handleReverifyCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const db = await getDatabase();

  try {
    const verificationService = new VerificationService(db);
    const guildConfigService = new GuildConfigService(db);

    const guild = await guildConfigService.getGuildByDiscordId(interaction.guildId!);

    if (!guild) {
      await interaction.editReply({
        content: '❌ This server is not configured for verification. Please contact an administrator.',
      });
      await closeDatabase();
      return;
    }

    // Check if user is verified
    const verification = await verificationService.getVerificationByUser(
      guild.id,
      interaction.user.id
    );

    if (!verification) {
      const embed = new EmbedBuilder()
        .setColor(0xFBBC04)
        .setTitle('⚠️ Not Verified')
        .setDescription(
          'You are not verified in this server.\n\n' +
          'Use `/verify` to start the verification process.'
        );

      await interaction.editReply({ embeds: [embed] });
      await closeDatabase();
      return;
    }

    if (verification.status !== 'verified') {
      await interaction.editReply({
        content: `❌ Your verification status is "${verification.status}". Please use /verify to verify again.`,
      });
      await closeDatabase();
      return;
    }

    // Perform re-verification
    const result = await verificationService.reverifyUser(guild.id, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(result.isStillVerified ? 0x34A853 : 0xEA4335)
      .setTitle(result.isStillVerified ? '✅ Re-verification Complete' : '⚠️ Verification Expired')
      .setDescription(
        result.isStillVerified
          ? 'Your NFT ownership has been confirmed. Your roles have been updated.'
          : 'You no longer meet the NFT ownership requirements for this server. Your roles have been removed.'
      )
      .addFields(
        { name: 'NFTs Owned', value: result.nftCount.toString(), inline: true },
        { name: 'Roles Changed', value: result.rolesChanged ? 'Yes' : 'No', inline: true }
      );

    if (result.rolesChanged) {
      if (result.addedRoles.length > 0) {
        embed.addFields({
          name: 'Roles Added',
          value: result.addedRoles.map(r => `<@&${r}>`).join('\n') || 'None',
          inline: false
        });
      }

      if (result.removedRoles.length > 0) {
        embed.addFields({
          name: 'Roles Removed',
          value: result.removedRoles.map(r => `<@&${r}>`).join('\n') || 'None',
          inline: false
        });
      }
    }

    embed.setFooter({ text: 'You can re-verify again in 5 minutes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `[Commands] User ${interaction.user.username} re-verified in guild ${interaction.guildId}: ${result.isStillVerified ? 'VERIFIED' : 'NOT VERIFIED'}`
    );
  } catch (error: any) {
    logger.error('[Commands] Error in /reverify:', error);
    await interaction.editReply({
      content: `❌ Error during re-verification: ${error.message}`,
    });
  } finally {
    await closeDatabase();
  }
}
