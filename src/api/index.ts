/**
 * Backend API Server for Frontend Integration
 * 
 * This Express server provides REST API endpoints for the frontend:
 * - POST /api/verify/session - Create verification session
 * - GET /api/verify/validate - Validate JWT token
 * - GET /api/guild/:guildId/config - Get guild configuration
 * - POST /api/verify/complete - Complete verification with signature
 * - POST /api/webhook/discord - Discord bot events
 * 
 * The server uses JWT tokens for secure session management between
 * the Discord bot and the frontend.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase, closeDatabase } from '../db';
import { VerificationService } from '../services/VerificationService';
import { GuildConfigService } from '../services/GuildConfigService';
import { CollectionService } from '../services/CollectionService';
import logger from '../utils/logger';

const app = express();
const PORT = process.env.API_PORT || 30391;
const HTTPS_PORT = process.env.API_HTTPS_PORT || 30392;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = '15m';  // JWT tokens expire in 15 minutes

// Middleware
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`[API] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ============================================================================
// JWT HELPERS
// ============================================================================

interface JwtPayload {
  sessionId: string;
  guildId: string;
  discordUserId: string;
  discordUsername: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate JWT token for a verification session
 */
function generateJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode JWT token
 */
function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    logger.warn('[API] Invalid JWT:', error);
    return null;
  }
}

/**
 * Middleware to validate JWT token from request
 */
function validateJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = req.query.token as string || authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyJwt(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach payload to request for use in handlers
  (req as any).jwtPayload = payload;
  next();
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * POST /api/verify/session
 * Create a new verification session
 * 
 * Request body:
 * {
 *   guildId: string;       // Discord guild ID
 *   discordUserId: string; // Discord user ID
 *   discordUsername: string;
 *   walletAddress?: string;
 * }
 * 
 * Response:
 * {
 *   token: string;         // JWT token for frontend
 *   sessionId: string;     // Internal session ID
 *   message: string;       // Message to sign
 *   expiresAt: string;     // Session expiration
 *   guildName: string;
 *   collections: Array<...>;
 * }
 */
app.post('/api/verify/session', async (req: Request, res: Response) => {
  const db = await getDatabase();

  try {
    const { guildId, discordUserId, discordUsername, walletAddress } = req.body;

    if (!guildId || !discordUserId) {
      res.status(400).json({ error: 'guildId and discordUserId are required' });
      await closeDatabase();
      return;
    }

    const verificationService = new VerificationService(db);
    const guildConfigService = new GuildConfigService(db);

    // Get or create guild
    const guild = await guildConfigService.getOrCreateGuild({
      guildId,
      guildName: 'Unknown Server',  // Will be updated by bot
    });

    // Create session
    const session = await verificationService.createSession({
      guildId: guild.id,
      discordUserId,
      discordUsername,
      walletAddress,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Generate JWT token
    const jwtPayload: JwtPayload = {
      sessionId: session.token,  // Use the session token as session ID
      guildId: guild.id,
      discordUserId,
      discordUsername,
    };

    const token = generateJwt(jwtPayload);

    res.json({
      token,
      sessionId: session.token,
      message: session.message,
      expiresAt: session.expiresAt,
      guildName: guild.guildName,
      collections: session.collections,
    });
  } catch (error: any) {
    logger.error('[API] Error creating session:', error);
    res.status(500).json({ error: error.message || 'Failed to create session' });
  } finally {
    await closeDatabase();
  }
});

/**
 * GET /api/verify/validate
 * Validate a JWT token and get session info
 * 
 * Query params:
 *   token: string  // JWT token
 * 
 * Response:
 * {
 *   valid: boolean;
 *   sessionId?: string;
 *   guildId?: string;
 *   discordUserId?: string;
 *   guildName?: string;
 *   collections?: Array<...>;
 * }
 */
app.get('/api/verify/validate', async (req: Request, res: Response) => {
  const db = await getDatabase();

  try {
    const token = req.query.token as string;

    if (!token) {
      res.json({ valid: false, error: 'Token required' });
      await closeDatabase();
      return;
    }

    const payload = verifyJwt(token);

    if (!payload) {
      res.json({ valid: false, error: 'Invalid or expired token' });
      await closeDatabase();
      return;
    }

    const guildConfigService = new GuildConfigService(db);
    const guild = await guildConfigService.getGuildById(payload.guildId);

    if (!guild) {
      res.json({ valid: false, error: 'Guild not found' });
      await closeDatabase();
      return;
    }

    res.json({
      valid: true,
      sessionId: payload.sessionId,
      guildId: payload.guildId,
      discordUserId: payload.discordUserId,
      guildName: guild.guildName,
    });
  } catch (error: any) {
    logger.error('[API] Error validating token:', error);
    res.status(500).json({ valid: false, error: error.message });
  } finally {
    await closeDatabase();
  }
});

/**
 * GET /api/guild/:guildId/config
 * Get public guild configuration for frontend display
 * 
 * Response:
 * {
 *   guildName: string;
 *   collections: Array<{
 *     address: string;
 *     name: string;
 *     requiredCount: number;
 *     metadata?: {...};
 *   }>;
 *   branding?: {
 *     color?: string;
 *     logoUrl?: string;
 *   };
 * }
 */
app.get('/api/guild/:guildId/config', async (req: Request, res: Response) => {
  const db = await getDatabase();

  try {
    const { guildId } = req.params;

    const guildConfigService = new GuildConfigService(db);
    const collectionService = new CollectionService(db);

    // Get guild by Discord ID
    const guild = await guildConfigService.getGuildByDiscordId(guildId);

    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      await closeDatabase();
      return;
    }

    if (!guild.isActive) {
      res.status(400).json({ error: 'Verification is not active for this guild' });
      await closeDatabase();
      return;
    }

    // Get collections
    const collections = await collectionService.getCollectionsByGuild(guild.id);

    res.json({
      guildName: guild.guildName,
      collections: collections.map(c => ({
        address: c.collectionAddress,
        name: c.collectionName,
        requiredCount: c.requiredNftCount,
        metadata: c.metadata,
      })),
      branding: {
        color: guild.settings?.customBrandColor,
        logoUrl: guild.settings?.customLogoUrl,
      },
    });
  } catch (error: any) {
    logger.error('[API] Error fetching guild config:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch guild config' });
  } finally {
    await closeDatabase();
  }
});

/**
 * POST /api/verify/complete
 * Complete verification with signed message
 * 
 * Request body:
 * {
 *   token: string;         // JWT token
 *   signature: string;     // Signed message
 *   walletAddress: string; // Wallet that signed
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   isVerified: boolean;
 *   nftCount: number;
 *   nfts: Array<{...}>;
 *   assignedRoles: string[];
 *   eligibleRoles: Array<{...}>;
 * }
 */
app.post('/api/verify/complete', async (req: Request, res: Response) => {
  const db = await getDatabase();

  try {
    const { token, signature, walletAddress } = req.body;

    if (!token || !signature || !walletAddress) {
      res.status(400).json({ 
        error: 'token, signature, and walletAddress are required' 
      });
      await closeDatabase();
      return;
    }

    // Verify JWT
    const payload = verifyJwt(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      await closeDatabase();
      return;
    }

    const verificationService = new VerificationService(db);

    // Complete verification
    const result = await verificationService.completeVerification({
      token: payload.sessionId,  // Use session ID from JWT
      signature,
      walletAddress,
      discordUsername: payload.discordUsername,
    }, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      isVerified: result.isVerified,
      nftCount: result.nftCount,
      nfts: result.nfts,
      assignedRoles: result.assignedRoles,
      eligibleRoles: result.eligibleRoles,
      walletAddress: result.walletAddress,
      verifiedAt: result.verifiedAt.toISOString(),
    });
  } catch (error: any) {
    logger.error('[API] Error completing verification:', error);
    res.status(400).json({ 
      error: error.message || 'Verification failed',
      success: false,
    });
  } finally {
    await closeDatabase();
  }
});

/**
 * POST /api/verify/status
 * Check verification status for a user
 * 
 * Request body:
 * {
 *   token: string;  // JWT token
 * }
 * 
 * Response:
 * {
 *   status: 'pending' | 'verified' | 'failed' | 'expired';
 *   isVerified?: boolean;
 *   nftCount?: number;
 *   assignedRoles?: string[];
 * }
 */
app.post('/api/verify/status', async (req: Request, res: Response) => {
  const db = await getDatabase();

  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'token required' });
      await closeDatabase();
      return;
    }

    // Verify JWT
    const payload = verifyJwt(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      await closeDatabase();
      return;
    }

    const verificationService = new VerificationService(db);

    // Get verification status
    const verification = await verificationService.getVerificationByUser(
      payload.guildId,
      payload.discordUserId
    );

    if (!verification) {
      res.json({
        status: 'pending',
        message: 'Verification not yet completed',
      });
      await closeDatabase();
      return;
    }

    res.json({
      status: verification.status,
      isVerified: verification.status === 'verified',
      nftCount: (verification.nftsOwned as any[])?.length || 0,
      assignedRoles: verification.assignedRoleIds,
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
    });
  } catch (error: any) {
    logger.error('[API] Error checking verification status:', error);
    res.status(500).json({ error: error.message || 'Failed to check status' });
  } finally {
    await closeDatabase();
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('[API] Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the API server
 */
export function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // HTTP server
    const httpServer = app.listen(PORT, () => {
      logger.info(`[API] HTTP server listening on port ${PORT}`);
      resolve();
    });

    httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.warn(`[API] Port ${PORT} is already in use`);
      } else {
        logger.error('[API] HTTP server error:', error);
        reject(error);
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('[API] Received SIGTERM, shutting down gracefully...');
      httpServer.close(() => {
        logger.info('[API] HTTP server closed');
      });
    });

    process.on('SIGINT', () => {
      logger.info('[API] Received SIGINT, shutting down gracefully...');
      httpServer.close(() => {
        logger.info('[API] HTTP server closed');
      });
    });
  });
}

export default app;
