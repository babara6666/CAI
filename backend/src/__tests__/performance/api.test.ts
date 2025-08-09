import request from 'supertest';
import { app } from '../../app';
import { CompressionService } from '../../middleware/compression';
import { performance } from 'perf_hooks';

describe('API Performance Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Get authentication token for tests
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123',
      });

    authToken = loginResponse.body.token;
  });

  describe('Response Time Tests', () => {
    it('should respond to health check quickly', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const responseTime = performance.now() - startTime;
      
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
      expect(response.headers['x-response-time']).toBeDefined();
    });

    it('should handle file listing requests efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          page: 1,
          limit: 20,
        })
        .expect(200);

      const responseTime = performance.now() - startTime;
      
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.headers['x-response-time']).toBeDefined();
    });

    it('should handle search requests with acceptable performance', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'mechanical parts',
          filters: {
            projectName: 'Test Project',
            tags: ['mechanical'],
          },
        })
        .expect(200);

      const responseTime = performance.now() - startTime;
      
      expect(responseTime).toBeLessThan(2000); // Search should complete within 2 seconds
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should handle user management requests efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          page: 1,
          limit: 10,
        })
        .expect(200);

      const responseTime = performance.now() - startTime;
      
      expect(responseTime).toBeLessThan(500); // User listing should be fast
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('Compression Tests', () => {
    it('should compress large JSON responses', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Accept-Encoding', 'gzip')
        .query({
          page: 1,
          limit: 100, // Request larger dataset
        })
        .expect(200);

      // Check if response is compressed
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.headers['x-response-size']).toBeDefined();
      
      const responseSize = parseInt(response.headers['x-response-size']);
      expect(responseSize).toBeGreaterThan(0);
    });

    it('should not compress small responses', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Small responses should not be compressed
      expect(response.headers['content-encoding']).toBeUndefined();
    });

    it('should optimize JSON responses by removing null values', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          page: 1,
          limit: 5,
        })
        .expect(200);

      // Check that response doesn't contain null values
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain(':null');
      expect(responseString).not.toContain('null,');
    });
  });

  describe('Caching Tests', () => {
    it('should cache GET requests appropriately', async () => {
      const endpoint = '/api/files/test-file-1';
      
      // First request (cache miss)
      const firstResponse = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const firstResponseTime = parseFloat(firstResponse.headers['x-response-time']);

      // Second request (should be cached)
      const secondResponse = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const secondResponseTime = parseFloat(secondResponse.headers['x-response-time']);

      // Cached response should be faster
      expect(secondResponseTime).toBeLessThan(firstResponseTime);
      expect(firstResponse.body).toEqual(secondResponse.body);
    });

    it('should set appropriate cache headers', async () => {
      const response = await request(app)
        .get('/api/files/test-file-1/thumbnail')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Thumbnails should have cache headers
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age');
    });

    it('should not cache POST/PUT/DELETE requests', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test query',
        })
        .expect(200);

      expect(response.headers['cache-control']).toContain('no-cache');
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = performance.now();

      const requestPromises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .get('/api/files')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: Math.floor(i / 5) + 1,
            limit: 10,
          })
      );

      const responses = await Promise.all(requestPromises);
      const totalTime = performance.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(5000); // Within 5 seconds
      
      const averageResponseTime = totalTime / concurrentRequests;
      expect(averageResponseTime).toBeLessThan(1000); // Average under 1 second
    });

    it('should maintain performance under load', async () => {
      const loadTestRequests = 50;
      const batchSize = 10;
      const batches = Math.ceil(loadTestRequests / batchSize);

      const allResponseTimes: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = Array.from({ length: batchSize }, () => {
          const startTime = performance.now();
          return request(app)
            .get('/api/health')
            .then(response => {
              const responseTime = performance.now() - startTime;
              allResponseTimes.push(responseTime);
              return response;
            });
        });

        await Promise.all(batchPromises);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const averageResponseTime = allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length;
      const maxResponseTime = Math.max(...allResponseTimes);
      const minResponseTime = Math.min(...allResponseTimes);

      expect(averageResponseTime).toBeLessThan(200);
      expect(maxResponseTime).toBeLessThan(1000);
      expect(minResponseTime).toBeGreaterThan(0);

      // Response times should be consistent (standard deviation check)
      const variance = allResponseTimes.reduce((sum, time) => sum + Math.pow(time - averageResponseTime, 2), 0) / allResponseTimes.length;
      const standardDeviation = Math.sqrt(variance);
      
      expect(standardDeviation).toBeLessThan(averageResponseTime); // SD should be less than average
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not cause memory leaks during extended usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      // Simulate extended API usage
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/files')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: (i % 10) + 1,
            limit: 20,
          });

        // Periodically check memory usage
        if (i % 20 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          const memoryIncreaseInMB = memoryIncrease / 1024 / 1024;
          
          // Memory increase should be reasonable
          expect(memoryIncreaseInMB).toBeLessThan(50); // Less than 50MB increase
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const totalMemoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      expect(totalMemoryIncrease).toBeLessThan(100); // Total increase should be reasonable
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limits appropriately', async () => {
      const rateLimitEndpoint = '/api/search/query';
      const requestsToMake = 15; // Assuming rate limit is 10 requests per minute

      const responses = await Promise.allSettled(
        Array.from({ length: requestsToMake }, () =>
          request(app)
            .post(rateLimitEndpoint)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ query: 'test' })
        )
      );

      const successfulRequests = responses.filter(r => r.status === 'fulfilled' && (r.value as any).status === 200);
      const rateLimitedRequests = responses.filter(r => r.status === 'fulfilled' && (r.value as any).status === 429);

      expect(successfulRequests.length).toBeLessThanOrEqual(10);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });
});

// API benchmark utility
export class APIBenchmark {
  static async runEndpointBenchmark(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    iterations: number = 100,
    authToken?: string,
    payload?: any
  ): Promise<{
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    successRate: number;
    requestsPerSecond: number;
    totalTime: number;
  }> {
    const responseTimes: number[] = [];
    const startTime = performance.now();
    let successfulRequests = 0;

    for (let i = 0; i < iterations; i++) {
      const requestStart = performance.now();
      
      try {
        let requestBuilder = request(app)[method.toLowerCase() as keyof typeof request];
        
        if (authToken) {
          requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
        }
        
        if (payload && (method === 'POST' || method === 'PUT')) {
          requestBuilder = requestBuilder.send(payload);
        }
        
        const response = await requestBuilder;
        const responseTime = performance.now() - requestStart;
        
        if (response.status >= 200 && response.status < 300) {
          successfulRequests++;
          responseTimes.push(responseTime);
        }
      } catch (error) {
        // Request failed, don't count response time
      }
    }

    const totalTime = performance.now() - startTime;
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    const successRate = (successfulRequests / iterations) * 100;
    const requestsPerSecond = Math.round((successfulRequests / totalTime) * 1000);

    return {
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      successRate,
      requestsPerSecond,
      totalTime,
    };
  }

  static async runLoadTest(
    endpoint: string,
    concurrentUsers: number = 10,
    requestsPerUser: number = 10,
    authToken?: string
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsPerSecond: number;
    totalTime: number;
  }> {
    const totalRequests = concurrentUsers * requestsPerUser;
    const startTime = performance.now();

    const userPromises = Array.from({ length: concurrentUsers }, async () => {
      const userRequests = Array.from({ length: requestsPerUser }, () => {
        let requestBuilder = request(app).get(endpoint);
        
        if (authToken) {
          requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
        }
        
        return requestBuilder;
      });

      return Promise.allSettled(userRequests);
    });

    const results = await Promise.all(userPromises);
    const totalTime = performance.now() - startTime;

    const allResults = results.flat();
    const successfulRequests = allResults.filter(r => 
      r.status === 'fulfilled' && (r.value as any).status >= 200 && (r.value as any).status < 300
    ).length;
    const failedRequests = totalRequests - successfulRequests;

    const averageResponseTime = totalTime / totalRequests;
    const requestsPerSecond = Math.round((successfulRequests / totalTime) * 1000);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      requestsPerSecond,
      totalTime,
    };
  }
}