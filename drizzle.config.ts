/**
 * Drizzle Kit Configuration
 * 
 * This configuration is used for:
 * - Generating migrations from schema changes
 * - Pushing schema changes to database (development only)
 * - Studying database schema
 * 
 * Usage:
 *   npx drizzle-kit generate    - Generate migration files
 *   npx drizzle-kit migrate     - Apply migrations to database
 *   npx drizzle-kit push        - Push schema directly (dev only)
 *   npx drizzle-kit studio      - Open Drizzle Studio (database GUI)
 * 
 * Environment Variables Required:
 *   DATABASE_URL - PostgreSQL connection string
 * 
 * Connection String Format:
 *   postgresql://user:password@host:port/database
 * 
 * For Supabase:
 *   - Session Pooler (port 5432): Use for long-running connections (bots)
 *   - Transaction Pooler (port 6543): Use for serverless/short-lived connections
 * 
 * Important Notes:
 * - In production, use migrations (not push) for schema changes
 * - Always backup before running migrations in production
 * - Test migrations in development first
 */

import { defineConfig } from 'drizzle-kit';

// Validate environment
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

export default defineConfig({
  // Schema location
  schema: './src/db/schema.ts',
  
  // Migrations output directory
  out: './supabase/migrations',
  
  // Database dialect
  dialect: 'postgresql',
  
  // Database credentials
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  
  // Migration table configuration
  migrations: {
    table: 'drizzle_migrations',
    schema: 'public',
  },
  
  // Enable strict mode (fail on warnings)
  strict: true,
  
  // Verbose output for debugging
  verbose: true,
  
  // Eager mode for faster development
  // eager: true,
});
