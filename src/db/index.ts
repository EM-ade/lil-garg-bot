/**
 * Database Connection Module with Retry Logic
 * 
 * This module provides a robust PostgreSQL connection using Drizzle ORM
 * with postgres.js driver, specifically configured for Supabase free tier.
 * 
 * Key Features:
 * - Connection retry with exponential backoff
 * - Configurable connection pooling
 * - Health check on connection
 * - Global connection caching to prevent connection storms
 * 
 * Connection Pool Settings (optimized for Supabase free tier):
 * - max: 10 connections (conservative for free tier limits)
 * - idle_timeout: 30 seconds (close idle connections)
 * - connect_timeout: 15 seconds (allow for slow starts)
 * - prepare: true (use prepared statements for better performance)
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';
import { config } from '../config/environment';
import logger from '../utils/logger';

// Type for our database instance
export type Database = PostgresJsDatabase<typeof schema>;

// Global connection cache (prevents connection storms in development)
declare global {
  var __db: Database | undefined;
  var __client: Sql | undefined;
}

// Connection configuration optimized for Supabase free tier
const CONNECTION_CONFIG = {
  // Pool size - conservative for free tier (max 60 connections on free tier)
  max: 10,
  
  // Close idle connections after 30 seconds
  idle_timeout: 30,
  
  // Fail after 15 seconds if can't connect
  connect_timeout: 15,
  
  // Use prepared statements for better performance
  // Set to false if using Supabase transaction pooler (port 6543)
  prepare: true,
  
  // Require SSL in production
  ssl: process.env.NODE_ENV === 'production' ? 'require' as const : undefined,
};

/**
 * Check if a connection string is valid
 */
function isValidConnectionString(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
  } catch {
    return false;
  }
}

/**
 * Fix connection string for local Supabase Docker
 * (handles hostname resolution issues)
 */
function fixLocalConnectionString(connectionString: string): string {
  if (connectionString.includes('supabase_db_')) {
    try {
      const url = new URL(connectionString);
      // Replace supabase_db_postgres with just postgres
      url.hostname = url.hostname.replace('supabase_db_', '');
      return url.toString();
    } catch (error) {
      logger.warn('Failed to fix local connection string:', error);
    }
  }
  return connectionString;
}

/**
 * Test database connection with a simple query
 */
async function testConnection(client: Sql): Promise<boolean> {
  try {
    const result = await client`SELECT 1`;
    return result.length > 0;
  } catch (error) {
    logger.error('Connection test failed:', error);
    return false;
  }
}

/**
 * Create database connection with retry logic
 * 
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Database instance
 * @throws Error if connection fails after all retries
 */
export async function connectWithRetry(
  maxRetries: number = 3
): Promise<Database> {
  const connectionString = fixLocalConnectionString(config.database.url);
  
  // Validate connection string
  if (!isValidConnectionString(connectionString)) {
    throw new Error(
      `Invalid PostgreSQL connection string. Check DATABASE_URL environment variable.`
    );
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `[DB Connection] Attempt ${attempt}/${maxRetries} - Connecting to PostgreSQL...`
      );
      logger.info(`[DB Connection] Host: ${new URL(connectionString).hostname}`);
      
      const startTime = Date.now();
      
      // Create postgres client
      const client = postgres(connectionString, CONNECTION_CONFIG);
      
      // Test connection
      const isConnected = await testConnection(client);
      
      if (!isConnected) {
        throw new Error('Connection test failed');
      }
      
      // Create Drizzle ORM instance
      const db = drizzle(client, { schema });
      
      const duration = Date.now() - startTime;
      logger.info(
        `[DB Connection] PostgreSQL connected successfully! (took ${duration.toFixed(2)}ms)`
      );
      
      // Cache connection globally (development only)
      if (process.env.NODE_ENV !== 'production') {
        global.__db = db;
        global.__client = client;
      }
      
      return db;
    } catch (error) {
      lastError = error as Error;
      
      logger.warn(
        `[DB Connection] Attempt ${attempt} failed:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1);
        logger.info(`[DB Connection] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  const errorMessage = `Failed to connect to PostgreSQL after ${maxRetries} attempts. Last error: ${lastError?.message}`;
  logger.error('[DB Connection]', errorMessage);
  throw new Error(errorMessage);
}

/**
 * Get or create database connection
 * 
 * In development: Returns cached connection if available
 * In production: Always creates new connection
 */
export async function getDatabase(): Promise<Database> {
  // Return cached connection in development
  if (process.env.NODE_ENV !== 'production' && global.__db) {
    return global.__db;
  }
  
  return connectWithRetry();
}

/**
 * Close database connection gracefully
 * 
 * Call this when shutting down the application
 */
export async function closeDatabase(): Promise<void> {
  try {
    if (global.__client) {
      await global.__client.end();
      global.__client = undefined;
      global.__db = undefined;
      logger.info('[DB Connection] Database connection closed');
    }
  } catch (error) {
    logger.error('[DB Connection] Error closing connection:', error);
  }
}

/**
 * Get database connection statistics
 * 
 * Useful for monitoring and debugging
 */
export async function getConnectionStats(db: Database): Promise<{
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  idleInTransaction: number;
}> {
  try {
    const result = await db`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    return {
      totalConnections: parseInt(result[0].total_connections as string),
      activeConnections: parseInt(result[0].active as string),
      idleConnections: parseInt(result[0].idle as string),
      idleInTransaction: parseInt(result[0].idle_in_transaction as string),
    };
  } catch (error) {
    logger.error('[DB Connection] Failed to get connection stats:', error);
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      idleInTransaction: 0,
    };
  }
}

/**
 * Check if database is healthy and responsive
 */
export async function isDatabaseHealthy(db: Database): Promise<boolean> {
  try {
    const result = await db`SELECT 1`;
    return result.length > 0;
  } catch {
    return false;
  }
}

// Export schema for use in services
export { schema };
export * from './schema';
