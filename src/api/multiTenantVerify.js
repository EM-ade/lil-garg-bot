/**
 * Multi-Tenant Verification API Router
 * 
 * This router handles the new multi-tenant verification endpoints:
 * - POST /api/verify/session - Create verification session
 * - GET /api/verify/validate - Validate JWT token  
 * - GET /api/guild/:guildId/config - Get guild configuration
 * - POST /api/verify/complete - Complete verification
 * - POST /api/verify/status - Check verification status
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = '15m';

/**
 * Generate JWT token for verification session
 */
function generateJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify JWT token
 */
function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    logger.warn('[API] Invalid JWT:', error.message);
    return null;
  }
}

/**
 * POST /api/verify/session
 * Create a new verification session
 */
router.post('/verify/session', async (req, res) => {
  try {
    const { guildId, discordUserId, discordUsername, walletAddress } = req.body;

    if (!guildId || !discordUserId) {
      return res.status(400).json({ error: 'guildId and discordUserId are required' });
    }

    // For now, return a simple response
    // Full implementation would use VerificationService
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const message = `Discord NFT Verification\nUser: ${discordUserId}\nNonce: ${sessionToken}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Generate JWT
    const jwtPayload = {
      sessionId: sessionToken,
      guildId,
      discordUserId,
      discordUsername,
    };

    const token = generateJwt(jwtPayload);

    logger.info(`[API] Created verification session for user ${discordUserId} in guild ${guildId}`);

    res.json({
      token,
      sessionId: sessionToken,
      message,
      expiresAt,
      guildName: 'Test Guild',
      collections: [],
    });
  } catch (error) {
    logger.error('[API] Error creating session:', error);
    res.status(500).json({ error: error.message || 'Failed to create session' });
  }
});

/**
 * GET /api/verify/validate
 * Validate JWT token
 */
router.get('/verify/validate', async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.json({ valid: false, error: 'Token required' });
    }

    const payload = verifyJwt(token);

    if (!payload) {
      return res.json({ valid: false, error: 'Invalid or expired token' });
    }

    res.json({
      valid: true,
      sessionId: payload.sessionId,
      guildId: payload.guildId,
      discordUserId: payload.discordUserId,
    });
  } catch (error) {
    logger.error('[API] Error validating token:', error);
    res.json({ valid: false, error: error.message });
  }
});

/**
 * GET /api/guild/:guildId/config
 * Get guild configuration
 */
router.get('/guild/:guildId/config', async (req, res) => {
  try {
    const { guildId } = req.params;

    // Validate guild ID format (Discord snowflake)
    if (!/^\d+$/.test(guildId) || guildId.length < 17) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // For now, return a simple response
    // Full implementation would use GuildConfigService
    res.json({
      guildName: 'Test Guild',
      collections: [],
      branding: {
        color: undefined,
        logoUrl: undefined,
      },
    });
  } catch (error) {
    logger.error('[API] Error fetching guild config:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch guild config' });
  }
});

/**
 * POST /api/verify/complete
 * Complete verification with signature
 */
router.post('/verify/complete', async (req, res) => {
  try {
    const { token, signature, walletAddress } = req.body;

    if (!token || !signature || !walletAddress) {
      return res.status(400).json({ 
        error: 'token, signature, and walletAddress are required' 
      });
    }

    // Verify JWT
    const payload = verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // For now, return a simple success response
    // Full implementation would verify signature and check NFTs
    res.json({
      success: true,
      isVerified: true,
      nftCount: 1,
      nfts: [],
      assignedRoles: [],
      eligibleRoles: [],
      walletAddress,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[API] Error completing verification:', error);
    res.status(400).json({ 
      error: error.message || 'Verification failed',
      success: false,
    });
  }
});

/**
 * POST /api/verify/status
 * Check verification status
 */
router.post('/verify/status', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    const payload = verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // For now, return pending status
    // Full implementation would check database
    res.json({
      status: 'pending',
      message: 'Verification not yet completed',
    });
  } catch (error) {
    logger.error('[API] Error checking status:', error);
    res.status(500).json({ error: error.message || 'Failed to check status' });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
