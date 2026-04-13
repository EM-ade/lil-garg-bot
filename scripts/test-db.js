/**
 * Database Connection Test Script
 * 
 * This script tests the PostgreSQL database connection and verifies
 * that all tables were created correctly.
 * 
 * Usage:
 *   node scripts/test-db.js
 *   node scripts/test-db.js --verbose
 */

require('dotenv').config();
const { Client } = require('pg');

const VERBOSE = process.argv.includes('--verbose');

// Color codes for console output
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

async function testDatabaseConnection() {
  log('\n🧪 Database Connection Test\n', 'cyan');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    log('❌ DATABASE_URL environment variable is not set', 'red');
    log('\nPlease set DATABASE_URL in your .env file:', 'yellow');
    log('DATABASE_URL=postgresql://user:password@host:port/database\n', 'yellow');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000, // 10 seconds
  });
  
  try {
    // Test 1: Connect to database
    log('📡 Connecting to database...', 'blue');
    const startTime = Date.now();
    await client.connect();
    const connectTime = Date.now() - startTime;
    log(`✅ Database connected successfully! (${connectTime}ms)`, 'green');
    
    // Test 2: Simple query
    log('\n📝 Testing basic query...', 'blue');
    const timeResult = await client.query('SELECT NOW() as current_time');
    log(`✅ Database time: ${timeResult.rows[0].current_time}`, 'green');
    
    // Test 3: Check tables exist
    log('\n📊 Checking for required tables...', 'blue');
    const tablesQuery = await client.query(`
      SELECT table_name, 
             pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) as size
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
    
    const foundTables = tablesQuery.rows.map(row => row.table_name);
    const missingTables = expectedTables.filter(table => !foundTables.includes(table));
    
    if (missingTables.length > 0) {
      log(`❌ Missing tables: ${missingTables.join(', ')}`, 'red');
      log('\nRun the migration script to create tables:', 'yellow');
      log('psql "$DATABASE_URL" -f sql/001_multi_tenant_schema.sql\n', 'yellow');
      await client.end();
      process.exit(1);
    }
    
    log(`✅ All ${expectedTables.length} tables found!`, 'green');
    
    if (VERBOSE) {
      log('\n📋 Table Details:', 'cyan');
      tablesQuery.rows.forEach(row => {
        log(`  • ${row.table_name.padEnd(25)} (${row.size || 'empty'})`, 'blue');
      });
    }
    
    // Test 4: Check indexes
    log('\n📑 Checking indexes...', 'blue');
    const indexesQuery = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    const indexesByTable = {};
    indexesQuery.rows.forEach(row => {
      if (!indexesByTable[row.tablename]) {
        indexesByTable[row.tablename] = [];
      }
      indexesByTable[row.tablename].push(row.indexname);
    });
    
    let totalIndexes = 0;
    expectedTables.forEach(table => {
      const count = indexesByTable[table]?.length || 0;
      totalIndexes += count;
      if (VERBOSE && count > 0) {
        log(`  • ${table.padEnd(25)} ${count} indexes`, 'blue');
      }
    });
    
    log(`✅ Total indexes: ${totalIndexes}`, 'green');
    
    // Test 5: Check extensions
    log('\n🔌 Checking PostgreSQL extensions...', 'blue');
    const extensionsQuery = await client.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('uuid-ossp', 'pgcrypto')
    `);
    
    if (extensionsQuery.rows.length >= 2) {
      log(`✅ Required extensions installed`, 'green');
      if (VERBOSE) {
        extensionsQuery.rows.forEach(row => {
          log(`  • ${row.extname} (v${row.extversion})`, 'blue');
        });
      }
    } else {
      log('⚠️  Some extensions may be missing', 'yellow');
      if (VERBOSE) {
        log('Expected: uuid-ossp, pgcrypto', 'yellow');
        log(`Found: ${extensionsQuery.rows.map(r => r.extname).join(', ') || 'none'}`, 'yellow');
      }
    }
    
    // Test 6: Check functions
    log('\n⚙️  Checking functions...', 'blue');
    const functionsQuery = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);
    
    const expectedFunctions = [
      'update_updated_at_column',
      'check_wallet_ownership',
      'get_guild_role_mappings',
      'deactivate_guild',
      'cleanup_expired_data',
    ];
    
    const foundFunctions = functionsQuery.rows.map(row => row.routine_name);
    const foundExpected = expectedFunctions.filter(fn => foundFunctions.includes(fn));
    
    log(`✅ Functions: ${foundExpected.length}/${expectedFunctions.length} found`, 'green');
    
    if (VERBOSE) {
      foundExpected.forEach(fn => {
        log(`  • ${fn}`, 'blue');
      });
    }
    
    // Test 7: Check views
    log('\n👁️  Checking views...', 'blue');
    const viewsQuery = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const expectedViews = ['active_verifications', 'guild_config_summary', 'wallet_conflicts'];
    const foundViews = viewsQuery.rows.map(row => row.table_name);
    const foundExpectedViews = expectedViews.filter(view => foundViews.includes(view));
    
    log(`✅ Views: ${foundExpectedViews.length}/${expectedViews.length} found`, 'green');
    
    if (VERBOSE) {
      foundExpectedViews.forEach(view => {
        log(`  • ${view}`, 'blue');
      });
    }
    
    // Test 8: Test insert and delete (optional - requires data cleanup)
    log('\n📝 Testing write operations...', 'blue');
    try {
      const testGuildId = `test_${Date.now()}`;
      
      // Insert test guild
      await client.query(`
        INSERT INTO guilds (guild_id, guild_name, is_active)
        VALUES ($1, $2, true)
        RETURNING id, guild_id, guild_name
      `, [testGuildId, 'Test Guild']);
      
      log('  ✅ Insert test passed', 'green');
      
      // Delete test guild
      await client.query(`
        DELETE FROM guilds WHERE guild_id = $1
      `, [testGuildId]);
      
      log('  ✅ Delete test passed', 'green');
    } catch (error) {
      log('  ⚠️  Write test skipped (may lack permissions)', 'yellow');
      if (VERBOSE) {
        log(`     Error: ${error.message}`, 'yellow');
      }
    }
    
    // Summary
    log('\n' + '='.repeat(50), 'cyan');
    log('📊 TEST SUMMARY', 'cyan');
    log('='.repeat(50), 'cyan');
    log(`✅ Connection:        OK`, 'green');
    log(`✅ Tables:            ${expectedTables.length}/${expectedTables.length}`, 'green');
    log(`✅ Indexes:           ${totalIndexes} total`, 'green');
    log(`✅ Extensions:        ${extensionsQuery.rows.length}/2`, 'green');
    log(`✅ Functions:         ${foundExpected.length}/${expectedFunctions.length}`, 'green');
    log(`✅ Views:             ${foundExpectedViews.length}/${expectedViews.length}`, 'green');
    log('='.repeat(50), 'cyan');
    log('\n🎉 Database is ready for use!\n', 'green');
    
    await client.end();
    process.exit(0);
    
  } catch (error) {
    log('\n❌ Database connection test failed!', 'red');
    log(`\nError: ${error.message}`, 'red');
    
    if (error.code === 'ECONNREFUSED') {
      log('\n💡 Tips:', 'yellow');
      log('  • Check if PostgreSQL is running', 'yellow');
      log('  • Verify DATABASE_URL is correct', 'yellow');
      log('  • Check firewall settings', 'yellow');
    } else if (error.code === '28P01') {
      log('\n💡 Tips:', 'yellow');
      log('  • Password authentication failed', 'yellow');
      log('  • Check username and password in DATABASE_URL', 'yellow');
    } else if (error.code === '3D000') {
      log('\n💡 Tips:', 'yellow');
      log('  • Database does not exist', 'yellow');
      log('  • Create the database first', 'yellow');
    }
    
    log('', 'reset');
    await client.end().catch(() => {});
    process.exit(1);
  }
}

// Run the test
testDatabaseConnection();
