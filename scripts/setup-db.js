/**
 * Database Setup Script
 * 
 * Automatically sets up the PostgreSQL database by:
 * 1. Checking database connection
 * 2. Creating extensions
 * 3. Running migration SQL file
 * 4. Verifying tables were created
 * 
 * Usage:
 *   node scripts/setup-db.js
 *   node scripts/setup-db.js --drop  # Drop existing tables first
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setupDatabase() {
  log('\n🚀 Database Setup Script\n', 'cyan');
  
  const DROP_EXISTING = process.argv.includes('--drop');
  
  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    log('❌ DATABASE_URL environment variable is not set', 'red');
    log('\nPlease add it to your .env file:', 'yellow');
    log('DATABASE_URL=postgresql://user:password@host:port/database', 'yellow');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  
  try {
    // Connect
    log('📡 Connecting to database...', 'blue');
    await client.connect();
    log('✅ Connected to database', 'green');
    
    // Check if tables already exist
    log('\n🔍 Checking existing tables...', 'blue');
    const existingTables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (existingTables.rows.length > 0) {
      log(`⚠️  Found ${existingTables.rows.length} existing table(s):`, 'yellow');
      existingTables.rows.forEach(row => {
        log(`   • ${row.table_name}`, 'yellow');
      });
      
      if (DROP_EXISTING) {
        log('\n🗑️  Dropping existing tables...', 'yellow');
        
        // Drop all tables in correct order (respecting foreign keys)
        const dropOrder = [
          'rate_limits',
          'audit_logs',
          'verification_sessions',
          'verifications',
          'role_mappings',
          'collections',
          'wallets',
          'guilds',
        ];
        
        for (const table of dropOrder) {
          try {
            await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            log(`   ✅ Dropped ${table}`, 'green');
          } catch (error) {
            log(`   ⚠️  Could not drop ${table}: ${error.message}`, 'yellow');
          }
        }
        
        // Drop views
        await client.query('DROP VIEW IF EXISTS active_verifications CASCADE');
        await client.query('DROP VIEW IF EXISTS guild_config_summary CASCADE');
        await client.query('DROP VIEW IF EXISTS wallet_conflicts CASCADE');
        
        // Drop functions
        await client.query('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE');
        await client.query('DROP FUNCTION IF EXISTS check_wallet_ownership CASCADE');
        await client.query('DROP FUNCTION IF EXISTS get_guild_role_mappings CASCADE');
        await client.query('DROP FUNCTION IF EXISTS deactivate_guild CASCADE');
        await client.query('DROP FUNCTION IF EXISTS cleanup_expired_data CASCADE');
        await client.query('DROP FUNCTION IF EXISTS expire_old_verification_sessions CASCADE');
        
        log('✅ All tables dropped', 'green');
      } else {
        log('\n💡 Use --drop flag to remove existing tables first', 'yellow');
        log('   node scripts/setup-db.js --drop', 'yellow');
        await client.end();
        process.exit(1);
      }
    }
    
    // Read SQL file
    log('\n📖 Reading migration SQL file...', 'blue');
    const sqlPath = path.join(__dirname, '..', 'sql', '001_multi_tenant_schema.sql');
    
    if (!fs.existsSync(sqlPath)) {
      log(`❌ SQL file not found: ${sqlPath}`, 'red');
      await client.end();
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    log(`✅ Loaded SQL file (${(sql.length / 1024).toFixed(2)} KB)`, 'green');
    
    // Execute SQL
    log('\n⚙️  Running migration...', 'blue');
    const startTime = Date.now();
    
    await client.query(sql);
    
    const duration = Date.now() - startTime;
    log(`✅ Migration completed in ${duration}ms`, 'green');
    
    // Verify tables
    log('\n🔍 Verifying tables...', 'blue');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const expectedTables = [
      'guilds',
      'collections',
      'role_mappings',
      'wallets',
      'verifications',
      'verification_sessions',
      'audit_logs',
      'rate_limits',
    ];
    
    const foundTables = tables.rows.map(row => row.table_name);
    const missingTables = expectedTables.filter(table => !foundTables.includes(table));
    
    if (missingTables.length > 0) {
      log(`❌ Missing tables: ${missingTables.join(', ')}`, 'red');
      await client.end();
      process.exit(1);
    }
    
    log(`✅ All ${expectedTables.length} tables created successfully!`, 'green');
    
    // Verify extensions
    log('\n🔌 Checking extensions...', 'blue');
    const extensions = await client.query(`
      SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto')
    `);
    
    if (extensions.rows.length >= 2) {
      log('✅ Required extensions available', 'green');
    } else {
      log('⚠️  Some extensions may be missing (uuid-ossp, pgcrypto)', 'yellow');
      log('   Run: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', 'yellow');
      log('   Run: CREATE EXTENSION IF NOT EXISTS "pgcrypto";', 'yellow');
    }
    
    // Verify indexes
    log('\n📑 Counting indexes...', 'blue');
    const indexes = await client.query(`
      SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public'
    `);
    
    log(`✅ Created ${indexes.rows[0].count} indexes`, 'green');
    
    // Summary
    log('\n' + '='.repeat(50), 'cyan');
    log('📊 SETUP COMPLETE', 'cyan');
    log('='.repeat(50), 'cyan');
    log(`✅ Tables:    ${expectedTables.length}`, 'green');
    log(`✅ Indexes:   ${indexes.rows[0].count}`, 'green');
    log(`✅ Duration:  ${duration}ms`, 'green');
    log('='.repeat(50), 'cyan');
    log('\n🎉 Database is ready!\n', 'green');
    log('Next steps:', 'yellow');
    log('  1. Run: node scripts/test-db.js', 'white');
    log('  2. Run: npm start', 'white');
    log('', 'reset');
    
    await client.end();
    process.exit(0);
    
  } catch (error) {
    log('\n❌ Database setup failed!', 'red');
    log(`\nError: ${error.message}`, 'red');
    
    if (error.code === '42P17') {
      log('\n💡 Index predicate error detected!', 'yellow');
      log('   See sql/MIGRATION_FIX.md for solution', 'yellow');
    } else if (error.code === '28P01') {
      log('\n💡 Authentication failed', 'yellow');
      log('   Check username and password in DATABASE_URL', 'yellow');
    } else if (error.code === '3D000') {
      log('\n💡 Database does not exist', 'yellow');
      log('   Create it first or check DATABASE_URL', 'yellow');
    } else if (error.code === 'ECONNREFUSED') {
      log('\n💡 Connection refused', 'yellow');
      log('   Make sure PostgreSQL is running', 'yellow');
    }
    
    log('', 'reset');
    await client.end().catch(() => {});
    process.exit(1);
  }
}

// Run setup
setupDatabase();
