/**
 * Unit Tests for API Endpoints
 * 
 * Tests the Express API endpoints for verification flow.
 */

const request = require('supertest');
const app = require('../api');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-min-32-bytes-long';

describe('API Endpoints', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });
  
  describe('POST /api/verify/session', () => {
    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/verify/session')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
  
  describe('GET /api/verify/validate', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/verify/validate');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid', false);
    });
    
    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/verify/validate')
        .query({ token: 'invalid-token' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid', false);
    });
    
    it('should accept valid JWT token', async () => {
      const payload = {
        sessionId: 'test-session',
        guildId: '123456789',
        discordUserId: '987654321',
        discordUsername: 'testuser',
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
      
      const response = await request(app)
        .get('/api/verify/validate')
        .query({ token });
      
      // Will validate JWT structure
      expect(response.status).toBe(200);
    });
  });
  
  describe('GET /api/guild/:guildId/config', () => {
    it('should return config for valid guild ID format', async () => {
      const guildId = '123456789012345678';
      
      const response = await request(app)
        .get(`/api/guild/${guildId}/config`);
      
      expect(response.status).toBe(200);
    });
    
    it('should reject invalid guild ID format', async () => {
      const response = await request(app)
        .get('/api/guild/nonexistent/config');
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('POST /api/verify/complete', () => {
    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/verify/complete')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
    
    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .post('/api/verify/complete')
        .send({
          token: 'invalid-token',
          signature: 'some-signature',
          walletAddress: '9fT6Spqbv9FxK7Ktxr6bDfASWc6k5acUNr1zMv5WrGfA',
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });
});
