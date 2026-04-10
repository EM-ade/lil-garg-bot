/**
 * API Endpoint Test Script
 * 
 * Tests the Express API endpoints to ensure they're working correctly.
 * 
 * Usage:
 *   node scripts/test-api.js
 *   node scripts/test-api.js --url=http://localhost:30391
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.argv
  .find(arg => arg.startsWith('--url='))
  ?.split('=')[1] || 'http://localhost:30391';

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

async function testEndpoint(method, url, expectedStatus = 200, data = null) {
  try {
    const config = {
      method,
      url,
      validateStatus: () => true, // Don't throw on any status
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    const passed = response.status === expectedStatus;
    
    log(`  ${passed ? '✅' : '❌'} ${method.toUpperCase()} ${url}`, passed ? 'green' : 'red');
    log(`     Status: ${response.status} (expected: ${expectedStatus})`, passed ? 'green' : 'yellow');
    
    if (!passed && VERBOSE) {
      log(`     Response: ${JSON.stringify(response.data).substring(0, 200)}`, 'yellow');
    }
    
    return { passed, response };
  } catch (error) {
    log(`  ❌ ${method.toUpperCase()} ${url}`, 'red');
    log(`     Error: ${error.message}`, 'yellow');
    return { passed: false, error };
  }
}

const VERBOSE = process.argv.includes('--verbose');

async function testAPI() {
  log('\n🧪 API Endpoint Test\n', 'cyan');
  log(`Testing API at: ${API_URL}`, 'blue');
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };
  
  // Test 1: Health endpoint
  log('\n📍 Testing Health Endpoints', 'cyan');
  const healthResult = await testEndpoint('get', `${API_URL}/health`, 200);
  if (healthResult.passed) {
    results.passed++;
    log(`     Response: ${JSON.stringify(healthResult.response.data)}`, 'green');
  } else {
    results.failed++;
    log('\n💡 API server may not be running', 'yellow');
    log('   Start it with: npm start', 'yellow');
  }
  results.total++;
  
  // Test 2: Invalid endpoints (should return 404)
  log('\n📍 Testing Error Handling', 'cyan');
  
  const notFoundResult = await testEndpoint('get', `${API_URL}/nonexistent`, 404);
  if (notFoundResult.passed) results.passed++;
  else results.failed++;
  results.total++;
  
  // Test 3: Verification session creation (should fail without proper data)
  log('\n📍 Testing Verification Endpoints', 'cyan');
  
  const missingDataResult = await testEndpoint(
    'post',
    `${API_URL}/api/verify/session`,
    400,
    {}
  );
  if (missingDataResult.passed) results.passed++;
  else results.failed++;
  results.total++;
  
  // Test 4: Verification validate without token
  const validateNoToken = await testEndpoint(
    'get',
    `${API_URL}/api/verify/validate`,
    200
  );
  if (validateNoToken.passed && validateNoToken.response.data.valid === false) {
    results.passed++;
    log(`     Correctly rejected missing token`, 'green');
  } else {
    results.failed++;
  }
  results.total++;
  
  // Test 5: Invalid JWT token
  const invalidToken = await testEndpoint(
    'get',
    `${API_URL}/api/verify/validate?token=invalid-token`,
    200
  );
  if (invalidToken.passed && invalidToken.response.data.valid === false) {
    results.passed++;
    log(`     Correctly rejected invalid token`, 'green');
  } else {
    results.failed++;
  }
  results.total++;
  
  // Test 6: Guild config for non-existent guild (use valid Discord ID format)
  const guildConfig = await testEndpoint(
    'get',
    `${API_URL}/api/guild/123456789012345678/config`,  // Valid Discord ID format
    200  // Returns placeholder data for valid format
  );
  if (guildConfig.passed) results.passed++;
  else results.failed++;
  results.total++;
  
  // Test 7: Verify complete with missing data
  const verifyComplete = await testEndpoint(
    'post',
    `${API_URL}/api/verify/complete`,
    400,
    {}
  );
  if (verifyComplete.passed) results.passed++;
  else results.failed++;
  results.total++;
  
  // Test 8: Verify complete with invalid token
  const verifyInvalidToken = await testEndpoint(
    'post',
    `${API_URL}/api/verify/complete`,
    401,
    {
      token: 'invalid-token',
      signature: 'some-signature',
      walletAddress: '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA',
    }
  );
  if (verifyInvalidToken.passed) results.passed++;
  else results.failed++;
  results.total++;
  
  // Summary
  log('\n' + '='.repeat(50), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(50), 'cyan');
  
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  log(`Total Tests:  ${results.total}`, 'blue');
  log(`Passed:       ${results.passed} (${passRate}%)`, 'green');
  log(`Failed:       ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log('='.repeat(50), 'cyan');
  
  if (results.failed === 0) {
    log('\n🎉 All API tests passed!\n', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Check the output above.\n', 'yellow');
    log('💡 Tips:', 'yellow');
    log('  • Make sure API server is running: npm start', 'yellow');
    log('  • Check environment variables are set correctly', 'yellow');
    log('  • Run with --verbose for detailed error messages', 'yellow');
    log('', 'reset');
    process.exit(1);
  }
}

// Run the test
testAPI().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}\n`, 'red');
  process.exit(1);
});
