/**
 * Unit Tests for WalletService
 * 
 * Tests the wallet linking and anti-sharing protection mechanisms.
 */

const { WalletService } = require('../services/WalletService');
const { getDatabase } = require('../db');
const { wallets } = require('../db/schema');
const { eq } = require('drizzle-orm');

describe('WalletService', () => {
  let db;
  let walletService;
  
  // Test data
  const testWalletAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
  const testDiscordUserId = '1234567890123456789';
  const testUsername = 'testuser';
  
  beforeAll(async () => {
    db = await getDatabase();
    walletService = new WalletService(db);
  });
  
  beforeEach(async () => {
    // Clean up test data before each test
    await db.delete(wallets).where(eq(wallets.ownerDiscordId, testDiscordUserId));
  });
  
  afterAll(async () => {
    // Clean up after all tests
    await db.delete(wallets).where(eq(wallets.ownerDiscordId, testDiscordUserId));
  });
  
  describe('isValidSolanaAddress', () => {
    it('should return true for valid Solana addresses', () => {
      const validAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
      expect(walletService.isValidSolanaAddress(validAddress)).toBe(true);
    });
    
    it('should return false for invalid addresses (too short)', () => {
      const invalidAddress = 'tooshort';
      expect(walletService.isValidSolanaAddress(invalidAddress)).toBe(false);
    });
    
    it('should return false for invalid addresses (invalid characters)', () => {
      const invalidAddress = 'invalid-0000000000000000000000000000000000';
      expect(walletService.isValidSolanaAddress(invalidAddress)).toBe(false);
    });
    
    it('should return false for empty string', () => {
      expect(walletService.isValidSolanaAddress('')).toBe(false);
    });
  });
  
  describe('linkWallet', () => {
    it('should successfully link a new wallet', async () => {
      const result = await walletService.linkWallet({
        walletAddress: testWalletAddress,
        discordUserId: testDiscordUserId,
        discordUsername: testUsername,
      });
      
      expect(result.walletAddress).toBe(testWalletAddress);
      expect(result.ownerDiscordId).toBe(testDiscordUserId);
      expect(result.isActive).toBe(true);
      expect(result.isVerified).toBe(false);
    });
    
    it('should reject invalid Solana address', async () => {
      await expect(
        walletService.linkWallet({
          walletAddress: 'invalid-address',
          discordUserId: testDiscordUserId,
          discordUsername: testUsername,
        })
      ).rejects.toThrow('Invalid Solana wallet address');
    });
  });
  
  describe('getWalletByUserId', () => {
    it('should return null for user without wallet', async () => {
      const result = await walletService.getWalletByUserId(testDiscordUserId);
      expect(result).toBeNull();
    });
  });
});
