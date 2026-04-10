/**
 * Jest Test Setup
 * 
 * This file runs before each test file.
 * Use it for global test configuration, mocks, and setup.
 */

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.HELIUS_API_KEY = 'test-helius-api-key';
process.env.DISCORD_BOT_TOKEN = 'test-discord-bot-token';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'test-jwt-secret-key-min-32-bytes-long';
process.env.NODE_ENV = 'test';

// Mock logger to reduce noise in tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Global test utilities
global.testUtils = {
  // Generate a random Discord snowflake ID
  generateDiscordId: () => {
    return Math.floor(Date.now() / 1000).toString() + '0000000000000000';
  },
  
  // Generate a random UUID
  generateUuid: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
  
  // Generate a valid Solana address (base58 format)
  generateSolanaAddress: () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
      address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
  },
  
  // Create mock Discord user
  createMockUser: (overrides = {}) => ({
    id: global.testUtils.generateDiscordId(),
    username: 'testuser',
    discriminator: '0001',
    tag: 'testuser#0001',
    ...overrides,
  }),
  
  // Create mock Discord guild
  createMockGuild: (overrides = {}) => ({
    id: global.testUtils.generateDiscordId(),
    name: 'Test Guild',
    ownerId: global.testUtils.generateDiscordId(),
    ...overrides,
  }),
  
  // Create mock Discord member
  createMockMember: (user, guild, overrides = {}) => ({
    user,
    guild,
    roles: {
      cache: new Map(),
    },
    permissions: {
      has: () => true,
    },
    ...overrides,
  }),
};

// Hook to run before all tests
beforeAll(() => {
  console.log('🧪 Starting test suite...');
});

// Hook to run after all tests
afterAll(() => {
  console.log('✅ Test suite completed');
});

// Hook to run before each test
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Hook to run after each test
afterEach(() => {
  // Clean up after each test
  jest.resetModules();
});
