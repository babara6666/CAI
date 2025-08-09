import request from 'supertest';
import app from '../../app.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

describe('API Integration Tests', () => {
  let authToken: string;
  let adminToken: string;
  let testUserId: string;
  let testFileId: string;
  let testDatasetId: string;
  let testModelId: string;

  beforeAll(async () => {
    // Setup test data and authentication tokens
    // This would typically involve creating test users and getting JWT tokens
    
    // Create test admin user
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'admin@test.com',
        username: 'testadmin',
        password: 'TestPassword123!',
        role: 'admin'
      });
    
    if (adminResponse.status === 201) {
      const adminLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'TestPassword123!'
        });
      
      adminToken = adminLoginResponse.body.data.token;
    }
    
    // Create test regular user
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@test.com',
        username: 'testuser',
        password: 'TestPassword123!',
        role: 'engineer'
      });
    
    if (userResponse.status === 201) {
      testUserId = userResponse.body.data.user.id;
      
      const userLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'TestPassword123!'
        });
      
      authToken = userLoginResponse.body.data.token;
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (adminToken) {
      // Delete test users and associated data
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  describe('API Versioning', () => {
    it('should handle version in URL path', async () => {
      const response = await request(app)
        .get('/api/v1.0/health')
        .expect(200);
      
      expect(response.headers['api-version']).toBe('1.0');
      expect(response.body.success).toBe(true);
      expect(response.body.data.apiVersion).toBe('1.0');
    });

    it('should handle version in Accept header', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Accept', 'application/vnd.api+json;version=1.0')
        .expect(200);
      
      expect(response.headers['api-version']).toBe('1.0');
      expect(response.body.data.apiVersion).toBe('1.0');
    });

    it('should handle version in query parameter', async () => {
      const response = await request(app)
        .get('/api/health?version=1.0')
        .expect(200);
      
      expect(response.headers['api-version']).toBe('1.0');
      expect(response.body.data.apiVersion).toBe('1.0');
    });

    it('should reject invalid version format', async () => {
      const response = await request(app)
        .get('/api/health?version=invalid')
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_VERSION');
    });

    it('should reject unsupported version', async () => {
      const response = await request(app)
        .get('/api/health?version=99.0')
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNSUPPORTED_API_VERSION');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply general rate limiting', async () => {
      // This test would need to be adjusted based on actual rate limits
      // For testing purposes, we'll just verify the headers are present
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should apply stricter rate limiting to auth endpoints', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrongpassword'
        })
        .expect(401);
      
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(parseInt(response.headers['ratelimit-limit'])).toBeLessThan(1000);
    });
  });

  describe('Authentication API', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@test.com',
          username: 'newuser',
          password: 'TestPassword123!',
          role: 'viewer'
        })
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('newuser@test.com');
      expect(response.body.data.user.role).toBe('viewer');
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'TestPassword123!'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe('user@test.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'wrongpassword'
        })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('File Management API', () => {
    it('should require authentication for file operations', async () => {
      const response = await request(app)
        .get('/api/files')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should list files for authenticated user', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/files?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });
  });

  describe('Search API', () => {
    it('should perform search with authentication', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test search',
          queryType: 'natural_language'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeInstanceOf(Array);
    });

    it('should validate search request', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required query field
          queryType: 'natural_language'
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('User Management API', () => {
    it('should allow admin to list users', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should prevent non-admin from listing users', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow user to view own profile', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
    });
  });

  describe('AI Model API', () => {
    it('should list available AI models', async () => {
      const response = await request(app)
        .get('/api/ai/models')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should validate model training request', async () => {
      const response = await request(app)
        .post('/api/ai/train')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Invalid training request
          datasetId: 'invalid-uuid',
          modelConfig: {}
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Reports API', () => {
    it('should require admin role for reports', async () => {
      const response = await request(app)
        .get('/api/reports/usage?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should generate usage report for admin', async () => {
      const response = await request(app)
        .get('/api/reports/usage?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalUsers).toBeDefined();
      expect(response.body.data.period).toBeDefined();
    });

    it('should validate report date parameters', async () => {
      const response = await request(app)
        .get('/api/reports/usage?startDate=invalid-date&endDate=2024-01-31T23:59:59Z')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Error Handling', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBeDefined();
      expect(response.body.error.timestamp).toBeDefined();
      expect(response.body.error.requestId).toBeDefined();
    });

    it('should include request ID in error responses', async () => {
      const requestId = 'test-request-123';
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .set('x-request-id', requestId)
        .expect(404);
      
      expect(response.body.error.requestId).toBe(requestId);
      expect(response.headers['x-request-id']).toBe(requestId);
    });
  });

  describe('API Documentation', () => {
    it('should serve Swagger UI', async () => {
      const response = await request(app)
        .get('/api-docs/')
        .expect(200);
      
      expect(response.text).toContain('swagger-ui');
    });

    it('should serve OpenAPI JSON spec', async () => {
      const response = await request(app)
        .get('/api-docs.json')
        .expect(200);
      
      expect(response.body.openapi).toBe('3.0.0');
      expect(response.body.info.title).toBe('CAD AI Platform API');
    });
  });

  describe('Health and Info Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.version).toBeDefined();
    });

    it('should return API information', async () => {
      const response = await request(app)
        .get('/api/info')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('CAD AI Platform API');
      expect(response.body.data.supportedVersions).toBeInstanceOf(Array);
      expect(response.body.data.features).toBeInstanceOf(Array);
    });
  });

  describe('Response Format Consistency', () => {
    it('should return consistent success response format', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).not.toHaveProperty('error');
    });

    it('should return consistent error response format', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).not.toHaveProperty('data');
      
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('requestId');
    });
  });
});