import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../database/DatabaseService';
import { AuthService } from '../../services/AuthService';
import { FileUploadService } from '../../services/FileUploadService';
import { SearchService } from '../../services/SearchService';
import { AIService } from '../../services/AIService';
import { AdminService } from '../../services/AdminService';
import path from 'path';
import fs from 'fs';

describe('System Integration Tests', () => {
  let authToken: string;
  let adminToken: string;
  let testUserId: string;
  let testFileId: string;
  let testDatasetId: string;
  let testModelId: string;

  beforeAll(async () => {
    // Initialize database connection
    await DatabaseService.initialize();
    
    // Create test users
    const testUser = await AuthService.register({
      email: 'test@example.com',
      username: 'testuser',
      password: 'TestPassword123!',
      role: 'engineer'
    });
    testUserId = testUser.id;

    const adminUser = await AuthService.register({
      email: 'admin@example.com',
      username: 'admin',
      password: 'AdminPassword123!',
      role: 'admin'
    });

    // Get auth tokens
    const userLogin = await AuthService.login('test@example.com', 'TestPassword123!');
    authToken = userLogin.token;

    const adminLogin = await AuthService.login('admin@example.com', 'AdminPassword123!');
    adminToken = adminLogin.token;
  });

  afterAll(async () => {
    // Cleanup test data
    await DatabaseService.cleanup();
  });

  describe('End-to-End Component Integration', () => {
    test('Complete file upload and management workflow', async () => {
      // Test file upload
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFilePath)
        .field('tags', 'test,integration')
        .field('projectName', 'Integration Test Project')
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.files).toHaveLength(1);
      testFileId = uploadResponse.body.files[0].id;

      // Test file retrieval
      const fileResponse = await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(fileResponse.body.file.id).toBe(testFileId);
      expect(fileResponse.body.file.tags).toContain('test');

      // Test file versioning
      const versionResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFilePath)
        .field('fileId', testFileId)
        .field('changeDescription', 'Updated version for integration test')
        .expect(200);

      expect(versionResponse.body.success).toBe(true);

      // Test version history
      const versionsResponse = await request(app)
        .get(`/api/files/${testFileId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(versionsResponse.body.versions).toHaveLength(2);
    });

    test('Complete authentication and authorization workflow', async () => {
      // Test protected route access
      const protectedResponse = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(protectedResponse.body.files).toBeDefined();

      // Test unauthorized access
      await request(app)
        .get('/api/files')
        .expect(401);

      // Test role-based access control
      const adminResponse = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(adminResponse.body.users).toBeDefined();

      // Test non-admin access to admin routes
      await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });

    test('Complete search functionality workflow', async () => {
      // Test basic search
      const searchResponse = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test integration',
          filters: {
            tags: ['test']
          }
        })
        .expect(200);

      expect(searchResponse.body.results).toBeDefined();
      expect(Array.isArray(searchResponse.body.results)).toBe(true);

      // Test search suggestions
      const suggestionsResponse = await request(app)
        .get('/api/search/suggestions?partial=test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(suggestionsResponse.body.suggestions).toBeDefined();

      // Test search feedback
      if (searchResponse.body.results.length > 0) {
        const feedbackResponse = await request(app)
          .post('/api/search/feedback')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            queryId: searchResponse.body.queryId,
            resultId: searchResponse.body.results[0].id,
            rating: 5,
            comment: 'Very relevant result'
          })
          .expect(200);

        expect(feedbackResponse.body.success).toBe(true);
      }
    });
  });

  describe('AI Model Training and Inference Workflows', () => {
    test('Complete dataset creation and model training workflow', async () => {
      // Create dataset
      const datasetResponse = await request(app)
        .post('/api/ai/datasets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Dataset',
          description: 'Dataset for integration testing',
          files: [testFileId]
        })
        .expect(200);

      expect(datasetResponse.body.dataset).toBeDefined();
      testDatasetId = datasetResponse.body.dataset.id;

      // Start model training
      const trainingResponse = await request(app)
        .post('/api/ai/train')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          datasetId: testDatasetId,
          modelConfig: {
            architecture: 'cnn',
            hyperparameters: {
              learningRate: 0.001,
              batchSize: 32,
              epochs: 5
            }
          }
        })
        .expect(200);

      expect(trainingResponse.body.trainingJob).toBeDefined();
      const jobId = trainingResponse.body.trainingJob.id;

      // Monitor training progress
      const progressResponse = await request(app)
        .get(`/api/ai/training/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(progressResponse.body.job).toBeDefined();
      expect(progressResponse.body.metrics).toBeDefined();

      // Wait for training completion (mock for integration test)
      // In real scenario, this would poll until completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get trained models
      const modelsResponse = await request(app)
        .get('/api/ai/models')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(modelsResponse.body.models).toBeDefined();
      if (modelsResponse.body.models.length > 0) {
        testModelId = modelsResponse.body.models[0].id;
      }
    });

    test('AI inference workflow', async () => {
      if (testModelId) {
        const inferenceResponse = await request(app)
          .post('/api/ai/inference')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            modelId: testModelId,
            query: 'Find similar CAD files'
          })
          .expect(200);

        expect(inferenceResponse.body.results).toBeDefined();
        expect(Array.isArray(inferenceResponse.body.results)).toBe(true);
      }
    });
  });

  describe('System Performance Under Load', () => {
    test('Multiple concurrent file uploads', async () => {
      const uploadPromises = [];
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');

      // Simulate 10 concurrent uploads
      for (let i = 0; i < 10; i++) {
        const uploadPromise = request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('files', testFilePath)
          .field('tags', `load-test-${i}`)
          .field('projectName', `Load Test Project ${i}`);
        
        uploadPromises.push(uploadPromise);
      }

      const results = await Promise.all(uploadPromises);
      
      // All uploads should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });
    });

    test('Multiple concurrent search queries', async () => {
      const searchPromises = [];

      // Simulate 20 concurrent searches
      for (let i = 0; i < 20; i++) {
        const searchPromise = request(app)
          .post('/api/search/query')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            query: `search query ${i}`,
            filters: {
              tags: ['load-test']
            }
          });
        
        searchPromises.push(searchPromise);
      }

      const results = await Promise.all(searchPromises);
      
      // All searches should complete successfully
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.results).toBeDefined();
      });
    });

    test('Database connection pool under load', async () => {
      const dbPromises = [];

      // Simulate 50 concurrent database operations
      for (let i = 0; i < 50; i++) {
        const dbPromise = request(app)
          .get('/api/files')
          .set('Authorization', `Bearer ${authToken}`);
        
        dbPromises.push(dbPromise);
      }

      const results = await Promise.all(dbPromises);
      
      // All database operations should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });
    });
  });

  describe('Security Measures and Access Controls', () => {
    test('JWT token validation and expiration', async () => {
      // Test with invalid token
      await request(app)
        .get('/api/files')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      // Test with expired token (mock)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      
      await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    test('Input validation and sanitization', async () => {
      // Test SQL injection attempt
      await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: "'; DROP TABLE users; --",
          filters: {}
        })
        .expect(400);

      // Test XSS attempt
      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tags', '<script>alert("xss")</script>')
        .expect(400);
    });

    test('File upload security validation', async () => {
      // Test malicious file upload
      const maliciousContent = '<?php system($_GET["cmd"]); ?>';
      const maliciousFilePath = path.join(__dirname, '../fixtures/malicious.php');
      
      fs.writeFileSync(maliciousFilePath, maliciousContent);

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', maliciousFilePath)
        .expect(400);

      // Cleanup
      fs.unlinkSync(maliciousFilePath);
    });

    test('Rate limiting enforcement', async () => {
      const requests = [];
      
      // Make rapid requests to trigger rate limiting
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app)
            .get('/api/files')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const results = await Promise.allSettled(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimitedRequests = results.filter(
        result => result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('User Acceptance Testing Workflows', () => {
    test('Complete user registration and onboarding workflow', async () => {
      // User registration
      const registrationResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          username: 'newuser',
          password: 'NewUserPassword123!',
          role: 'engineer'
        })
        .expect(201);

      expect(registrationResponse.body.user).toBeDefined();
      expect(registrationResponse.body.user.email).toBe('newuser@example.com');

      // User login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'newuser@example.com',
          password: 'NewUserPassword123!'
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      const newUserToken = loginResponse.body.token;

      // First file upload
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      const firstUploadResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${newUserToken}`)
        .attach('files', testFilePath)
        .field('tags', 'first-upload')
        .field('projectName', 'My First Project')
        .expect(200);

      expect(firstUploadResponse.body.success).toBe(true);

      // First search
      const firstSearchResponse = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${newUserToken}`)
        .send({
          query: 'my first project',
          filters: {}
        })
        .expect(200);

      expect(firstSearchResponse.body.results).toBeDefined();
    });

    test('Complete project collaboration workflow', async () => {
      // Create shared project files
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      
      const projectUploadResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFilePath)
        .field('tags', 'shared,collaboration')
        .field('projectName', 'Shared Project')
        .expect(200);

      const sharedFileId = projectUploadResponse.body.files[0].id;

      // Search for shared files
      const sharedSearchResponse = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'shared project',
          filters: {
            projectName: 'Shared Project'
          }
        })
        .expect(200);

      expect(sharedSearchResponse.body.results.length).toBeGreaterThan(0);

      // Provide feedback on shared content
      if (sharedSearchResponse.body.results.length > 0) {
        await request(app)
          .post('/api/search/feedback')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            queryId: sharedSearchResponse.body.queryId,
            resultId: sharedSearchResponse.body.results[0].id,
            rating: 4,
            comment: 'Good collaboration file'
          })
          .expect(200);
      }
    });

    test('Admin management workflow', async () => {
      // View system metrics
      const metricsResponse = await request(app)
        .get('/api/admin/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(metricsResponse.body.metrics).toBeDefined();

      // Manage user accounts
      const usersResponse = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(usersResponse.body.users).toBeDefined();
      expect(usersResponse.body.users.length).toBeGreaterThan(0);

      // View audit logs
      const auditResponse = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditResponse.body.logs).toBeDefined();

      // Generate usage report
      const reportResponse = await request(app)
        .get('/api/reports/usage')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(200);

      expect(reportResponse.body.report).toBeDefined();
    });
  });

  describe('System Health and Monitoring', () => {
    test('Health check endpoints', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.services).toBeDefined();
    });

    test('Metrics collection', async () => {
      const metricsResponse = await request(app)
        .get('/metrics')
        .expect(200);

      expect(metricsResponse.text).toContain('http_requests_total');
    });

    test('Error handling and recovery', async () => {
      // Test graceful degradation when AI service is unavailable
      const searchResponse = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test query with ai unavailable',
          useAI: true
        })
        .expect(200);

      // Should fallback to basic search
      expect(searchResponse.body.results).toBeDefined();
      expect(searchResponse.body.fallbackUsed).toBe(true);
    });
  });
});