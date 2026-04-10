/**
 * Complete Test Suite Runner
 * 
 * Runs all tests in sequence:
 * 1. Database connection test
 * 2. API endpoint test
 * 3. Unit tests (Jest)
 * 
 * Usage:
 *   node scripts/test-all.js
 *   node scripts/test-all.js --skip-db
 *   node scripts/test-all.js --skip-api
 *   node scripts/test-all.js --skip-unit
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset', bold = false) {
  const prefix = bold ? colors.bold : '';
  console.log(`${prefix}${colors[color]}${message}${colors.reset}`);
}

function runScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  
  try {
    execSync(`node "${scriptPath}"`, {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    return true;
  } catch (error) {
    return false;
  }
}

function runJestTests() {
  try {
    log('\n🧪 Running Unit Tests (Jest)\n', 'cyan', true);
    execSync('npx jest', {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function runAllTests() {
  const args = process.argv.slice(2);
  
  const skipDb = args.includes('--skip-db');
  const skipApi = args.includes('--skip-api');
  const skipUnit = args.includes('--skip-unit');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    log('\n📖 Test Suite Runner\n', 'cyan', true);
    log('Usage:', 'yellow');
    log('  node scripts/test-all.js              # Run all tests', 'white');
    log('  node scripts/test-all.js --skip-db    # Skip database tests', 'white');
    log('  node scripts/test-all.js --skip-api   # Skip API tests', 'white');
    log('  node scripts/test-all.js --skip-unit  # Skip unit tests', 'white');
    log('  node scripts/test-all.js --help       # Show this help', 'white');
    log('', 'reset');
    process.exit(0);
  }
  
  log('\n' + '='.repeat(60), 'cyan', true);
  log('🚀 Multi-Tenant Bot - Complete Test Suite', 'cyan', true);
  log('='.repeat(60), 'cyan', true);
  
  const results = {
    database: { skipped: skipDb, passed: false },
    api: { skipped: skipApi, passed: false },
    unit: { skipped: skipUnit, passed: false },
  };
  
  // Test 1: Database
  if (!skipDb) {
    log('\n📍 Test 1: Database Connection', 'blue', true);
    log('-'.repeat(60), 'blue');
    results.database.passed = runScript('test-db.js');
  } else {
    log('\n⏭️  Skipping database tests', 'yellow');
  }
  
  // Test 2: API
  if (!skipApi) {
    log('\n📍 Test 2: API Endpoints', 'blue', true);
    log('-'.repeat(60), 'blue');
    results.api.passed = runScript('test-api.js');
  } else {
    log('\n⏭️  Skipping API tests', 'yellow');
  }
  
  // Test 3: Unit Tests
  if (!skipUnit) {
    log('\n📍 Test 3: Unit Tests (Jest)', 'blue', true);
    log('-'.repeat(60), 'blue');
    results.unit.passed = runJestTests();
  } else {
    log('\n⏭️  Skipping unit tests', 'yellow');
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan', true);
  log('📊 FINAL RESULTS', 'cyan', true);
  log('='.repeat(60), 'cyan', true);
  
  const totalTests = 3 - [skipDb, skipApi, skipUnit].filter(Boolean).length;
  const passedTests = Object.values(results).filter(r => r.passed).length;
  const skippedTests = Object.values(results).filter(r => r.skipped).length;
  
  log('\nTest Results:', 'white', true);
  
  // Database
  if (results.database.skipped) {
    log('  ⏭️  Database Tests      [SKIPPED]', 'yellow');
  } else if (results.database.passed) {
    log('  ✅ Database Tests      [PASSED]', 'green', true);
  } else {
    log('  ❌ Database Tests      [FAILED]', 'red', true);
  }
  
  // API
  if (results.api.skipped) {
    log('  ⏭️  API Tests           [SKIPPED]', 'yellow');
  } else if (results.api.passed) {
    log('  ✅ API Tests           [PASSED]', 'green', true);
  } else {
    log('  ❌ API Tests           [FAILED]', 'red', true);
  }
  
  // Unit
  if (results.unit.skipped) {
    log('  ⏭️  Unit Tests          [SKIPPED]', 'yellow');
  } else if (results.unit.passed) {
    log('  ✅ Unit Tests          [PASSED]', 'green', true);
  } else {
    log('  ❌ Unit Tests          [FAILED]', 'red', true);
  }
  
  log('\n' + '-'.repeat(60), 'cyan');
  log(`Total: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'yellow', true);
  if (skippedTests > 0) {
    log(`${skippedTests} test(s) skipped`, 'yellow');
  }
  log('='.repeat(60), 'cyan', true);
  
  // Exit with appropriate code
  if (passedTests === totalTests) {
    log('\n🎉 All tests passed! Ready for deployment.\n', 'green', true);
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Please fix the issues above.\n', 'red', true);
    log('💡 Troubleshooting:', 'yellow', true);
    if (!results.database.passed && !results.database.skipped) {
      log('  • Check DATABASE_URL in .env', 'yellow');
      log('  • Run: psql "$DATABASE_URL" -f sql/001_multi_tenant_schema.sql', 'yellow');
    }
    if (!results.api.passed && !results.api.skipped) {
      log('  • Make sure API server is running: npm start', 'yellow');
      log('  • Check API_PORT in .env', 'yellow');
    }
    if (!results.unit.passed && !results.unit.skipped) {
      log('  • Run: npm test -- --verbose for details', 'yellow');
      log('  • Check that dependencies are installed: npm install', 'yellow');
    }
    log('', 'reset');
    process.exit(1);
  }
}

// Run the test suite
runAllTests().catch(error => {
  log(`\n❌ Test suite error: ${error.message}\n`, 'red', true);
  process.exit(1);
});
