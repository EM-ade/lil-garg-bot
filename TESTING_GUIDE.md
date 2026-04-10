# 🧪 Unit Testing Guide

Complete guide to testing the multi-tenant Discord NFT verification bot.

---

## 📋 Table of Contents

1. [Running Tests](#running-tests)
2. [Test Structure](#test-structure)
3. [Writing New Tests](#writing-new-tests)
4. [Test Coverage](#test-coverage)
5. [CI/CD Integration](#cicd-integration)
6. [Troubleshooting](#troubleshooting)

---

## 🏃 Running Tests

### Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run with coverage report
npm test -- --coverage
```

### Test Specific Files

```bash
# Test only WalletService
npm test -- WalletService

# Test only SolanaService
npm test -- SolanaService

# Test only API endpoints
npm test -- api.test

# Test only commands
npm test -- commands
```

### Test Patterns

```bash
# Run tests matching pattern
npm test -- --testNamePattern="should verify"

# Run tests in specific directory
npm test -- --testPathPattern=services

# Skip tests matching pattern
npm test -- --testPathIgnorePatterns=api
```

---

## 📁 Test Structure

### File Organization

```
lil-garg-bot/
├── src/
│   ├── __tests__/
│   │   ├── setup.ts              # Global test setup
│   │   ├── WalletService.test.ts # Wallet service tests
│   │   ├── SolanaService.test.ts # Solana service tests
│   │   ├── VerificationService.test.ts
│   │   ├── GuildConfigService.test.ts
│   │   ├── api.test.ts           # API endpoint tests
│   │   └── commands.test.ts      # Discord command tests
│   ├── services/
│   │   ├── WalletService.ts      # Code being tested
│   │   └── ...
│   └── ...
├── jest.config.js                # Jest configuration
└── package.json
```

### Test File Naming

- **Pattern:** `*.test.ts` or `*.test.js`
- **Location:** Same directory as code OR in `__tests__/` folder
- **Example:** `WalletService.test.ts` tests `WalletService.ts`

---

## ✍️ Writing New Tests

### Basic Test Structure

```typescript
// Example: src/__tests__/MyService.test.ts

import { MyService } from '../services/MyService';
import { getDatabase } from '../db';

describe('MyService', () => {
  let service: MyService;
  let db: any;
  
  // Test data
  const testData = {
    id: 'test-123',
    name: 'Test Item',
  };
  
  // Run once before all tests
  beforeAll(async () => {
    db = await getDatabase();
    service = new MyService(db);
  });
  
  // Run before each test
  beforeEach(async () => {
    // Clean up database
    await db.delete(myTable);
  });
  
  // Run after all tests
  afterAll(async () => {
    // Close database connection
    await db.$client.end();
  });
  
  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = await service.methodName(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result).toEqual('expected value');
    });
    
    it('should handle error case', async () => {
      // Arrange
      const invalidInput = '';
      
      // Act & Assert
      await expect(service.methodName(invalidInput))
        .rejects
        .toThrow('Invalid input');
    });
  });
});
```

### Testing Async Code

```typescript
describe('asyncFunction', () => {
  it('should resolve with correct value', async () => {
    const result = await asyncFunction();
    expect(result).toBe('success');
  });
  
  it('should reject on error', async () => {
    await expect(asyncFunction('invalid'))
      .rejects
      .toThrow('Error message');
  });
});
```

### Testing with Mocks

```typescript
// Mock external dependencies
jest.mock('../services/SolanaService', () => ({
  SolanaService: jest.fn().mockImplementation(() => ({
    verifySignedMessage: jest.fn().mockResolvedValue(true),
    isValidSolanaAddress: jest.fn().mockReturnValue(true),
  })),
}));

describe('ServiceWithMocks', () => {
  it('should call mocked method', async () => {
    const mockService = new SolanaService();
    await mockService.verifySignedMessage('msg', 'sig', 'wallet');
    
    // Verify mock was called
    expect(mockService.verifySignedMessage).toHaveBeenCalledWith(
      'msg',
      'sig',
      'wallet'
    );
  });
});
```

### Testing Database Operations

```typescript
describe('DatabaseOperations', () => {
  beforeEach(async () => {
    // Clean database before each test
    await db.delete(wallets);
    await db.delete(verifications);
  });
  
  it('should save to database', async () => {
    // Arrange
    const walletData = {
      walletAddress: 'test-address',
      ownerDiscordId: '123456789',
    };
    
    // Act
    const result = await walletService.linkWallet(walletData);
    
    // Assert
    expect(result.walletAddress).toBe(walletData.walletAddress);
    
    // Verify in database
    const fromDb = await walletService.getWalletByAddress(walletData.walletAddress);
    expect(fromDb).toBeDefined();
    expect(fromDb?.ownerDiscordId).toBe(walletData.ownerDiscordId);
  });
});
```

---

## 📊 Test Coverage

### View Coverage Report

```bash
# Generate HTML report
npm test -- --coverage

# Open in browser
start coverage/lcov-report/index.html  # Windows
open coverage/lcov-report/index.html   # Mac/Linux
```

### Coverage Thresholds

Current thresholds in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50,
  },
}
```

### Increase Coverage

Focus on:
1. **Edge cases** (error handling, invalid inputs)
2. **Branch coverage** (if/else, switch statements)
3. **Integration points** (database, API calls)

---

## 🔄 CI/CD Integration

### GitHub Actions

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
      
      - name: Run migrations
        run: |
          npm run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      
      - name: Run tests
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
          HELIUS_API_KEY: test-key
          JWT_SECRET: test-secret
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Running Tests in Production

```bash
# Pre-deployment check
npm test -- --ci --coverage --maxWorkers=2

# Smoke tests after deployment
npm run test:smoke
```

---

## 🐛 Troubleshooting

### Common Test Errors

#### Error: "Cannot find module"

**Solution:**
```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Error: "Timeout exceeded"

**Solution:** Increase timeout in test:
```typescript
it('should complete within 30s', async () => {
  // Test code
}, 30000); // 30 second timeout
```

#### Error: "Database connection failed"

**Solution:** Use test database:
```typescript
// In setup.ts
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
```

#### Tests Running Twice

**Cause:** Both Jest config and package.json might have test patterns

**Solution:** Check `jest.config.js` and `package.json` for duplicate configurations

### Mocking Best Practices

```typescript
// ❌ Bad: Mocking everything
jest.mock('../services/Everything', () => ({
  everything: jest.fn(),
}));

// ✅ Good: Mock only external dependencies
jest.mock('../services/ExternalAPI', () => ({
  ExternalAPI: jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue({ data: 'mocked' }),
  })),
}));

// ✅ Better: Use real services with test database
const service = new RealService(testDb);
```

### Testing Rate-Limited Code

```typescript
jest.useFakeTimers();

it('should respect rate limits', async () => {
  // First call
  await service.rateLimitedFunction();
  
  // Second call should fail
  await expect(service.rateLimitedFunction())
    .rejects
    .toThrow('Rate limit exceeded');
  
  // Fast-forward time
  jest.advanceTimersByTime(60000);
  
  // Should work again
  await expect(service.rateLimitedFunction())
    .resolves
    .toBeDefined();
});

jest.useRealTimers();
```

---

## 📝 Test Checklist

Before submitting code:

- [ ] All new features have tests
- [ ] All bug fixes have regression tests
- [ ] Tests pass locally (`npm test`)
- [ ] Coverage hasn't decreased significantly
- [ ] No console warnings in test output
- [ ] Mocks are used appropriately
- [ ] Test descriptions are clear
- [ ] Tests are independent (no order dependency)

---

## 🎯 Example Test Suite

Complete example for a service:

```typescript
// src/__tests__/CollectionService.test.ts

import { CollectionService } from '../services/CollectionService';
import { getDatabase } from '../db';
import { collections } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('CollectionService', () => {
  let db: any;
  let service: CollectionService;
  
  const testGuildId = 'test-guild-uuid';
  const testCollectionAddress = 'FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ';
  
  beforeAll(async () => {
    db = await getDatabase();
    service = new CollectionService(db);
  });
  
  beforeEach(async () => {
    await db.delete(collections);
  });
  
  afterAll(async () => {
    await db.$client.end();
  });
  
  describe('isValidSolanaAddress', () => {
    it('validates correct addresses', () => {
      expect(service.isValidSolanaAddress(testCollectionAddress)).toBe(true);
    });
    
    it('rejects invalid addresses', () => {
      expect(service.isValidSolanaAddress('invalid')).toBe(false);
      expect(service.isValidSolanaAddress('')).toBe(false);
    });
  });
  
  describe('addCollection', () => {
    it('adds a new collection', async () => {
      const result = await service.addCollection(testGuildId, {
        collectionAddress: testCollectionAddress,
        collectionName: 'Test Collection',
        requiredNftCount: 1,
      });
      
      expect(result.collectionAddress).toBe(testCollectionAddress);
      expect(result.isActive).toBe(true);
    });
    
    it('prevents duplicate collections', async () => {
      await service.addCollection(testGuildId, {
        collectionAddress: testCollectionAddress,
        collectionName: 'Test',
      });
      
      await expect(
        service.addCollection(testGuildId, {
          collectionAddress: testCollectionAddress,
          collectionName: 'Duplicate',
        })
      ).rejects.toThrow('already registered');
    });
  });
  
  describe('getCollectionsByGuild', () => {
    it('returns collections for guild', async () => {
      await service.addCollection(testGuildId, {
        collectionAddress: testCollectionAddress,
        collectionName: 'Test',
      });
      
      const result = await service.getCollectionsByGuild(testGuildId);
      
      expect(result).toHaveLength(1);
      expect(result[0].collectionAddress).toBe(testCollectionAddress);
    });
    
    it('returns empty array for guild without collections', async () => {
      const result = await service.getCollectionsByGuild('other-guild');
      expect(result).toHaveLength(0);
    });
  });
});
```

---

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/testing.html)

---

**Last Updated:** 2026-01-01  
**Maintainer:** Development Team
