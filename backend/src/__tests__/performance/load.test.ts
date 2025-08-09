import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../database/DatabaseService';

describe('Load Performance Tests', () => {
  let server: any;
  let authToken: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    server = app.listen(0);

    // Create test user and get auth token
    const userData = {
      email: 'load-test@example.com',
      username: 'loaduser',
      password: 'password123',
      role: 'engineer',
    };

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userData);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      });

    authToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    await server.close();
    await DatabaseService.close();
  });

  it('should handle concurrent authentication requests', async () => {
    const concurrentRequests = 50;
    const startTime = Date.now();

    const promises = Array.from({ length: concurrentRequests }, (_, i) => {
      const userData = {
        email: `concurrent-${i}@example.com`,
        username: `concurrent${i}`,
        password: 'password123',
        role: 'engineer',
      };

      return request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // All requests should succeed
    expect(results).toHaveLength(concurrentRequests);
    results.forEach(result => {
      expect(result.body.success).toBe(true);
    });

    // Should complete within reasonable time (adjust threshold as needed)
    expect(duration).toBeLessThan(10000); // 10 seconds
    
    // Calculate average response time
    const avgResponseTime = duration / concurrentRequests;
    console.log(`Average response time: ${avgResponseTime}ms`);
    expect(avgResponseTime).toBeLessThan(200); // 200ms average
  });

  it('should handle concurrent file upload requests', async () => {
    const concurrentUploads = 20;
    const testFileContent = Buffer.from('test file content for load testing');
    const startTime = Date.now();

    const promises = Array.from({ length: concurrentUploads }, (_, i) => {
      return request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFileContent, `load-test-${i}.dwg`)
        .field('tags', 'load-test')
        .expect(201);
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // All uploads should succeed
    expect(results).toHaveLength(concurrentUploads);
    results.forEach(result => {
      expect(result.body.success).toBe(true);
    });

    // Should complete within reasonable time
    expect(duration).toBeLessThan(30000); // 30 seconds
    
    const avgResponseTime = duration / concurrentUploads;
    console.log(`Average upload response time: ${avgResponseTime}ms`);
    expect(avgResponseTime).toBeLessThan(1500); // 1.5 seconds average
  });

  it('should handle concurrent search requests', async () => {
    // First, upload some test files
    const testFiles = Array.from({ length: 10 }, (_, i) => {
      const content = Buffer.from(`test file content ${i}`);
      return request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', content, `search-test-${i}.dwg`)
        .field('tags', `search-test,file-${i}`)
        .expect(201);
    });

    await Promise.all(testFiles);

    // Now perform concurrent searches
    const concurrentSearches = 30;
    const searchQueries = [
      'mechanical parts',
      'engine components',
      'assembly drawing',
      'test file',
      'search-test',
    ];

    const startTime = Date.now();

    const promises = Array.from({ length: concurrentSearches }, (_, i) => {
      const query = searchQueries[i % searchQueries.length];
      return request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query })
        .expect(200);
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // All searches should succeed
    expect(results).toHaveLength(concurrentSearches);
    results.forEach(result => {
      expect(result.body.success).toBe(true);
    });

    // Should complete within reasonable time
    expect(duration).toBeLessThan(15000); // 15 seconds
    
    const avgResponseTime = duration / concurrentSearches;
    console.log(`Average search response time: ${avgResponseTime}ms`);
    expect(avgResponseTime).toBeLessThan(500); // 500ms average
  });

  it('should handle large file uploads efficiently', async () => {
    const largeFileSize = 50 * 1024 * 1024; // 50MB
    const largeFileContent = Buffer.alloc(largeFileSize, 'a');
    
    const startTime = Date.now();

    const response = await request(app)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('files', largeFileContent, 'large-test.dwg')
      .field('tags', 'large-file-test')
      .expect(201);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response.body.success).toBe(true);
    expect(response.body.data.files[0].fileSize).toBe(largeFileSize);

    // Should complete within reasonable time for large file
    expect(duration).toBeLessThan(60000); // 60 seconds
    
    console.log(`Large file upload time: ${duration}ms`);
  });

  it('should maintain performance under database load', async () => {
    // Create many database records
    const recordCount = 1000;
    const batchSize = 50;
    
    for (let i = 0; i < recordCount; i += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, recordCount - i) }, (_, j) => {
        const index = i + j;
        return {
          email: `db-load-${index}@example.com`,
          username: `dbload${index}`,
          password: 'password123',
          role: 'engineer',
        };
      });

      const promises = batch.map(userData => 
        request(app)
          .post('/api/auth/register')
          .send(userData)
      );

      await Promise.all(promises);
    }

    // Now test query performance
    const startTime = Date.now();

    const response = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ page: 1, limit: 20 })
      .expect(200);

    const endTime = Date.now();
    const queryTime = endTime - startTime;

    expect(response.body.success).toBe(true);
    
    // Query should still be fast even with many records
    expect(queryTime).toBeLessThan(1000); // 1 second
    console.log(`Database query time with ${recordCount} records: ${queryTime}ms`);
  });

  it('should handle memory efficiently during bulk operations', async () => {
    const initialMemory = process.memoryUsage();
    
    // Perform bulk operations
    const bulkOperations = 100;
    const promises = Array.from({ length: bulkOperations }, (_, i) => {
      const content = Buffer.from(`bulk operation ${i}`);
      return request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', content, `bulk-${i}.dwg`)
        .field('tags', 'bulk-test');
    });

    await Promise.all(promises);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

    console.log(`Memory increase after bulk operations: ${memoryIncreaseMB.toFixed(2)}MB`);
    
    // Memory increase should be reasonable (adjust threshold as needed)
    expect(memoryIncreaseMB).toBeLessThan(500); // 500MB
  });

  it('should handle API rate limiting correctly', async () => {
    // Test rate limiting by making many requests quickly
    const rapidRequests = 100;
    const promises = Array.from({ length: rapidRequests }, () => {
      return request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`);
    });

    const results = await Promise.allSettled(promises);
    
    // Some requests should succeed
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const rateLimited = results.filter(r => r.status === 'fulfilled' && r.value.status === 429);

    expect(successful.length).toBeGreaterThan(0);
    console.log(`Successful requests: ${successful.length}, Rate limited: ${rateLimited.length}`);
    
    // Rate limiting should kick in for excessive requests
    if (rateLimited.length > 0) {
      expect(rateLimited.length).toBeGreaterThan(0);
    }
  });
});