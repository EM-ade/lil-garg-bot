/**
 * Jest Configuration for Multi-Tenant Discord Bot
 * JavaScript only - No TypeScript compilation
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // File extensions to test
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.test.js'
  ],
  
  // Transform - NONE (JavaScript only)
  transform: {},
  
  // Skip TypeScript files completely
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.d.ts',
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  resetModules: true,
  restoreMocks: true,
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  
  // Ignore these paths
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],
  
  // Watch path ignore patterns
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],
};
