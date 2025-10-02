const express = require('express');
const router = express.Router();
const { EmbedBuilder, Routes } = require('discord.js');
const logger = require('../utils/logger');
const { assignRolesBasedOnNfts } = require('../services/nftRoleManagerService');
const {
  verificationSessionService,
  VerificationSessionError,
} = require('../services/verificationSessionService');
const { isSupabaseEnabled } = require('../services/serviceFactory');
const { consumeInteraction } = require('../services/sessionInteractionRegistry');

function ensureSupabase(res) {
  if (!isSupabaseEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'Supabase verification flow is not enabled.',
    });
  }
  return null;
}

function handleVerificationError(error, res) {
  if (error instanceof VerificationSessionError) {
    return res
      .status(error.statusCode || 400)
      .json({ success: false, error: error.message });
  }

  logger.error('[verification] Unexpected error:', error);
  return res.status(500).json({
    success: false,
    error: 'Unexpected verification error occurred.',
  });
}

router.post('/verification/session', async (req, res) => {
  if (ensureSupabase(res)) {
    return;
  }

  const { discordId, guildId, walletAddress, username } = req.body;

  try {
    const session = await verificationSessionService.createSession({
      discordId,
      guildId,
      walletAddress,
      username,
    });

    return res.status(201).json({
      success: true,
      token: session.token,
      message: session.message,
      expiresAt: session.expiresAt,
      status: session.status,
    });
  } catch (error) {
    return handleVerificationError(error, res);
  }
});

router.get('/verification/session/:token', async (req, res) => {
  if (ensureSupabase(res)) {
    return;
  }

  const { token } = req.params;

  try {
    const session = await verificationSessionService.findSessionByToken(token, {
      includeMessage: true,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Verification session not found.',
      });
    }

    return res.json({ success: true, session });
  } catch (error) {
    return handleVerificationError(error, res);
  }
});

router.post('/verification/session/verify', async (req, res) => {
  if (ensureSupabase(res)) {
    return;
  }

  const { token, signature, username, walletAddress } = req.body;

  try {
    const result = await verificationSessionService.verifySession(
      token,
      signature,
      {
        username,
        requester: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
        walletAddress,
      }
    );

    await maybeAssignRoles(req, result);
    await notifyUserVerificationResult(req, result, token);

    return res.json({
      success: true,
      session: result.session,
      verification: result.verification,
    });
  } catch (error) {
    return handleVerificationError(error, res);
  }
});

async function maybeAssignRoles(req, { session, verification }) {
  if (!verification?.isVerified) {
    return;
  }

  const client = req.app.get('discordClient');
  if (!client) {
    logger.warn('[verification] Discord client not available for role assignment.');
    return;
  }

  try {
    const guild =
      client.guilds.cache.get(session.guildId) ||
      (await client.guilds.fetch(session.guildId).catch(() => null));

    if (!guild) {
      logger.warn(
        `[verification] Guild ${session.guildId} not found while assigning roles.`
      );
      return;
    }

    const member = await guild.members
      .fetch(session.discordId)
      .catch(() => null);

    if (!member) {
      logger.warn(
        `[verification] Member ${session.discordId} not found in guild ${session.guildId}.`
      );
      return;
    }

    await assignRolesBasedOnNfts(member, verification.walletAddress);
  } catch (error) {
    logger.warn('[verification] Failed to assign roles after verification:', error);
  }
}

async function notifyUserVerificationResult(req, { session, verification }, token) {
  const client = req.app.get('discordClient');
  if (!client) {
    logger.warn('[verification] Discord client not available for verification notification.');
    return;
  }

  try {
    const embed = await buildVerificationEmbed(client, session, verification);
    const interactionMeta = token ? consumeInteraction(token) : null;

    if (interactionMeta && client.application?.id) {
      try {
        await client.rest.post(
          Routes.webhook(client.application.id, interactionMeta.interactionToken),
          {
            body: {
              embeds: [embed],
              flags: 1 << 6,
            },
          },
        );
        return;
      } catch (error) {
        logger.warn('[verification] Failed to send ephemeral follow-up, falling back to DM:', error);
      }
    }

    const user = await client.users.fetch(session.discordId);
    if (!user) {
      logger.warn(`[verification] Unable to fetch user ${session.discordId} for notification.`);
      return;
    }

    await user.send({ embeds: [embed] });
  } catch (error) {
    logger.warn('[verification] Failed to send verification DM:', error);
  }
}

async function buildVerificationEmbed(client, session, verification) {
  const guildName = await fetchGuildName(client, session.guildId);

  const success = verification.isVerified;
  return new EmbedBuilder()
    .setColor(success ? 0x34d399 : 0xfacc15)
    .setTitle(success ? '✅ Lil Gargs Verification Successful' : '🕒 Verification Submitted')
    .setDescription(
      success
        ? 'Your wallet signature has been verified and roles will update shortly.'
        : 'We received your signature. NFT ownership is being processed.'
    )
    .addFields(
      {
        name: 'Wallet',
        value: `\`${verification.walletAddress}\``,
        inline: false,
      },
      {
        name: 'NFTs Detected',
        value: verification.nftCount.toString(),
        inline: true,
      },
      {
        name: 'Server',
        value: guildName ?? session.guildId,
        inline: true,
      },
    )
    .setFooter({ text: 'Lil Gargs Verification Portal' })
    .setTimestamp(new Date(verification.verifiedAt ?? Date.now()));
}

async function fetchGuildName(client, guildId) {
  try {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    return guild?.name ?? null;
  } catch (error) {
    logger.warn(`[verification] Unable to resolve guild name for ${guildId}:`, error);
    return null;
  }
}

module.exports = router;
