# 🧪 Test Scripts Reference Guide

Complete guide to testing the multi-tenant Discord NFT verification bot.

---

## 📋 Quick Start

```bash
# Run ALL tests (database + API + unit)
npm test

# Run tests with verbose output
npm test -- --verbose
```

---

## 🗄️ Database Tests

### Setup Database

```bash
# Setup database (creates tables)
npm run db:setup

# Setup with drop (WARNING: deletes all data!)
npm run db:setup:drop

# Setup using psql directly
psql "$DATABASE_URL" -f sql/001_multi_tenant_schema.sql
```

### Test Database Connection

```bash
# Basic test
npm run db:test

# Verbose test (shows all tables, indexes, etc.)
npm run db:test:verbose

# Direct script execution
node scripts/test-db.js
node scripts/test-db.js --verbose
```

**What it tests:**
- ✅ Database connection
- ✅ All 8 tables exist
- ✅ Indexes created
- ✅ PostgreSQL extensions
- ✅ Functions and triggers
- ✅ Views
- ✅ Write operations (insert/delete)

**Expected Output:**
```
🧪 Database Connection Test

📡 Connecting to database...
✅ Database connected successfully! (123ms)

📊 Checking for required tables...
✅ All 8 tables found!

📑 Checking indexes...
✅ Total indexes: 25

📊 TEST SUMMARY
✅ Connection:        OK
✅ Tables:            8/8
✅ Indexes:           25 total
✅ Extensions:        2/2
✅ Functions:         5/5
✅ Views:             3/3

🎉 Database is ready for use!
```

---

## 🌐 API Tests

### Test API Endpoints

```bash
# Basic API test
npm run api:test

# Verbose API test
npm run api:test:verbose

# Direct script execution
node scripts/test-api.js
node scripts/test-api.js --verbose

# Test custom URL
node scripts/test-api.js --url=http://localhost:30392
```

**What it tests:**
- ✅ Health endpoint (`GET /health`)
- ✅ Error handling (404 for unknown routes)
- ✅ Verification session creation
- ✅ JWT token validation
- ✅ Guild config endpoints
- ✅ Verification completion

**Prerequisites:**
- API server must be running (`npm start`)

**Expected Output:**
```
🧪 API Endpoint Test

Testing API at: http://localhost:30391

📍 Testing Health Endpoints
  ✅ GET /health
     Status: 200 (expected: 200)

📍 Testing Error Handling
  ✅ GET /nonexistent
     Status: 404 (expected: 404)

📍 Testing Verification Endpoints
  ✅ POST /api/verify/session
     Status: 400 (expected: 400)

📊 TEST SUMMARY
Total Tests:  8
Passed:       8 (100.0%)
Failed:       0

🎉 All API tests passed!
```

---

## 🔬 Unit Tests

### Run Jest Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Watch mode (auto-rerun on changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Run specific test file
npm run test:unit -- WalletService.test.ts

# Run tests matching pattern
npm run test:unit -- --testNamePattern="should verify"
```

**What it tests:**
- ✅ Service layer functions
- ✅ Utility functions
- ✅ Validation logic
- ✅ Error handling

---

## 🎯 Combined Test Suites

### Run All Tests

```bash
# Complete test suite
npm test

# Skip database tests
npm test -- --skip-db

# Skip API tests
npm test -- --skip-api

# Skip unit tests
npm test -- --skip-unit

# Skip multiple
npm test -- --skip-db --skip-api
```

### Test Runner Options

```bash
# Show help
node scripts/test-all.js --help

# Output:
# Usage:
#   node scripts/test-all.js              # Run all tests
#   node scripts/test-all.js --skip-db    # Skip database tests
#   node scripts/test-all.js --skip-api   # Skip API tests
#   node scripts/test-all.js --skip-unit  # Skip unit tests
#   node scripts/test-all.js --help       # Show this help
```

---

## 📊 Test Coverage

### Generate Coverage Report

```bash
# Run tests with coverage
npm run test:coverage

# Open HTML report (Windows)
start coverage/lcov-report/index.html

# Open HTML report (Mac/Linux)
open coverage/lcov-report/index.html
```

**Coverage Thresholds:**
- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

---

## 🛠️ Troubleshooting

### Database Tests Fail

**Error: DATABASE_URL is not set**
```bash
# Check .env file exists
cat .env

# Add DATABASE_URL to .env
DATABASE_URL=postgresql://user:password@host:port/database
```

**Error: relation "guilds" does not exist**
```bash
# Run database setup
npm run db:setup
```

**Error: functions in index predicate must be marked IMMUTABLE**
```bash
# See sql/MIGRATION_FIX.md
# Or run with drop flag
npm run db:setup:drop
```

### API Tests Fail

**Error: connect ECONNREFUSED**
```bash
# Start API server first
npm start

# Or test with different port
node scripts/test-api.js --url=http://localhost:30392
```

**Error: Cannot find module 'axios'**
```bash
# Install dev dependencies
npm install --save-dev axios
```

### Unit Tests Fail

**Error: Cannot find module**
```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Tests running twice**
```bash
# Check jest.config.js for duplicate patterns
# Remove test patterns from package.json if present
```

---

## 📈 CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup database
        run: npm run db:setup
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      
      - name: Run all tests
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
          HELIUS_API_KEY: test-key
          JWT_SECRET: test-secret
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## 🎯 Test Workflow

### Development Workflow

```bash
# 1. Make changes to code
# 2. Run database test
npm run db:test

# 3. Start API server
npm start

# 4. In another terminal, run API tests
npm run api:test

# 5. Run unit tests in watch mode
npm run test:watch
```

### Pre-Deployment Checklist

```bash
# 1. Run all tests
npm test

# 2. Check coverage
npm run test:coverage

# 3. Verify database schema
npm run db:test:verbose

# 4. Test API endpoints
npm run api:test:verbose
```

---

## 📚 Test Files Reference

| File | Purpose | Command |
|------|---------|---------|
| `scripts/test-db.js` | Database connection test | `npm run db:test` |
| `scripts/test-api.js` | API endpoint tests | `npm run api:test` |
| `scripts/test-all.js` | Combined test runner | `npm test` |
| `scripts/setup-db.js` | Database setup | `npm run db:setup` |
| `src/__tests__/*.test.ts` | Unit tests | `npm run test:unit` |
| `jest.config.js` | Jest configuration | - |

---

## 🔧 Advanced Usage

### Custom Database URL

```bash
# Override DATABASE_URL for one command
DATABASE_URL=postgresql://test:test@localhost:5432/test_db npm run db:test
```

### Custom API URL

```bash
# Test production API (be careful!)
node scripts/test-api.js --url=https://api.production.com
```

### Selective Testing

```bash
# Only test database (skip API and unit)
npm test -- --skip-api --skip-unit

# Only test API (skip db and unit)
npm test -- --skip-db --skip-unit
```

---

## 📞 Getting Help

```bash
# Show test runner help
node scripts/test-all.js --help

# Check Node version
node --version  # Should be 18+

# Check dependencies
npm ls --depth=0

# View test logs
npm test -- --verbose 2>&1 | tee test-log.txt
```

---

**Last Updated:** 2026-01-01  
**Version:** 2.0.0
