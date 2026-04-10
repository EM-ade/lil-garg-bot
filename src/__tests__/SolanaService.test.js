/**
 * Unit Tests for SolanaService
 * 
 * Tests the Solana blockchain interaction and NFT verification logic.
 */

const { SolanaService } = require('../services/SolanaService');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

describe('SolanaService', () => {
  let solanaService;
  
  beforeAll(() => {
    solanaService = new SolanaService();
  });
  
  describe('isValidSolanaAddress', () => {
    it('should return true for valid Solana addresses', () => {
      const validAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
      expect(solanaService.isValidSolanaAddress(validAddress)).toBe(true);
    });
    
    it('should return true for another valid address', () => {
      const validAddress = 'FP2bGBGHWrW4w82hsSDGc5zNLQ83CvEmW2shGkttS7aZ';
      expect(solanaService.isValidSolanaAddress(validAddress)).toBe(true);
    });
    
    it('should return false for invalid addresses', () => {
      expect(solanaService.isValidSolanaAddress('invalid')).toBe(false);
      expect(solanaService.isValidSolanaAddress('')).toBe(false);
      expect(solanaService.isValidSolanaAddress('too-short')).toBe(false);
    });
  });
  
  describe('generateVerificationMessage', () => {
    it('should generate a message with required fields', () => {
      const discordUserId = '123456789';
      const walletAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
      
      const message = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress
      );
      
      expect(message).toContain('Discord NFT Verification');
      expect(message).toContain(`Discord User ID: ${discordUserId}`);
      expect(message).toContain(`Wallet Address: ${walletAddress}`);
      expect(message).toContain('Timestamp:');
      expect(message).toContain('Nonce:');
      expect(message).toContain('Sign this message');
    });
    
    it('should generate different messages for same inputs (random nonce)', () => {
      const discordUserId = '123456789';
      const walletAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
      
      const message1 = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress
      );
      const message2 = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress
      );
      
      // Messages should be different due to random nonce
      expect(message1).not.toBe(message2);
    });
    
    it('should use provided nonce when specified', () => {
      const discordUserId = '123456789';
      const walletAddress = '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA';
      const customNonce = 'custom-nonce-123';
      
      const message = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress,
        customNonce
      );
      
      expect(message).toContain(`Nonce: ${customNonce}`);
    });
  });
  
  describe('verifySignedMessage', () => {
    it('should verify a correctly signed message', async () => {
      // Generate keypair for testing
      const keypair = nacl.sign.keyPair();
      const walletAddress = bs58.encode(keypair.publicKey);
      const discordUserId = '123456789';
      
      // Generate message
      const message = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress
      );
      
      // Sign message
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signature);
      
      // Verify signature
      const isValid = await solanaService.verifySignedMessage(
        message,
        signatureBase58,
        walletAddress
      );
      
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid signature', async () => {
      const keypair = nacl.sign.keyPair();
      const walletAddress = bs58.encode(keypair.publicKey);
      const discordUserId = '123456789';
      
      const message = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress
      );
      
      // Create fake signature
      const fakeSignature = bs58.encode(Buffer.alloc(64, 0));
      
      const isValid = await solanaService.verifySignedMessage(
        message,
        fakeSignature,
        walletAddress
      );
      
      expect(isValid).toBe(false);
    });
    
    it('should reject signature for different wallet', async () => {
      const keypair1 = nacl.sign.keyPair();
      const keypair2 = nacl.sign.keyPair();
      
      const walletAddress1 = bs58.encode(keypair1.publicKey);
      const walletAddress2 = bs58.encode(keypair2.publicKey);
      
      const discordUserId = '123456789';
      const message = solanaService.generateVerificationMessage(
        discordUserId,
        walletAddress1
      );
      
      // Sign with keypair2 but claim wallet1
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair2.secretKey);
      const signatureBase58 = bs58.encode(signature);
      
      const isValid = await solanaService.verifySignedMessage(
        message,
        signatureBase58,
        walletAddress1  // Different from signing key
      );
      
      expect(isValid).toBe(false);
    });
  });
});
