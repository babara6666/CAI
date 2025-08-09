import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '../../services/CacheService';
import { CacheMiddleware, cacheConfigs } from '../../middleware/caching';
import { Request, Response } from 'express';

// Mock Redis for testing
vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    mget: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
    incrby: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    pipeline: vi.fn().mockReturnValue({
      setex: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  }));
  return { default: Redis };
});

describe('CacheService Performance Tests', () => {
  let cacheService: CacheService;
  let cacheMiddleware: CacheMiddleware;

  beforeEach(() => {
    const config = {
      host: 'localhost',
      port: 6379,
      ttl: 3600,
    };
    cacheService = new CacheService(config);
    cacheMiddleware = new CacheMiddleware(cacheService);
  });

  afterEach(async () => {
    await cacheService.disconnect();
  });

  describe('Cache Operations Performance', () => {
    it('should handle high-volume cache operations efficiently', async () => {
      const startTime = Date.now();
      const operations = 1000;
      const promises: Promise<any>[] = [];

      // Test concurrent cache operations
      for (let i = 0; i < operations; i++) {
        promises.push(cacheService.set(`test-key-${i}`, { data: `value-${i}` }));
      }

      await Promise.all(promises);
      const setTime = Date.now() - startTime;

      // Test concurrent cache reads
      const readStartTime = Date.now();
      const readPromises: Promise<any>[] = [];

      for (let i = 0; i < operations; i++) {
        readPromises.push(cacheService.get(`test-key-${i}`));
      }

      const results = await Promise.all(readPromises);
      const readTime = Date.now() - readStartTime;

      expect(setTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(readTime).toBeLessThan(2000); // Reads should be faster
      expect(results).toHaveLength(operations);
      expect(results.every(result => result !== null)).toBe(true);
    });

    it('should efficiently handle batch operations', async () => {
      const batchSize = 100;
      const batches = 10;
      const totalOperations = batchSize * batches;

      const startTime = Date.now();

      // Test batch set operations
      for (let batch = 0; batch < batches; batch++) {
        const keyValuePairs: Record<string, any> = {};
        
        for (let i = 0; i < batchSize; i++) {
          const key = `batch-${batch}-key-${i}`;
          keyValuePairs[key] = { batch, index: i, data: `value-${batch}-${i}` };
        }

        await cacheService.mset(keyValuePairs);
      }

      const batchSetTime = Date.now() - startTime;

      // Test batch get operations
      const batchReadStartTime = Date.now();
      
      for (let batch = 0; batch < batches; batch++) {
        const keys: string[] = [];
        
        for (let i = 0; i < batchSize; i++) {
          keys.push(`batch-${batch}-key-${i}`);
        }

        const results = await cacheService.mget(keys);
        expect(results).toHaveLength(batchSize);
      }

      const batchReadTime = Date.now() - batchReadStartTime;

      expect(batchSetTime).toBeLessThan(3000);
      expect(batchReadTime).toBeLessThan(1500);
    });

    it('should handle cache invalidation patterns efficiently', async () => {
      // Set up test data
      const patterns = ['user:*', 'file:*', 'search:*'];
      const keysPerPattern = 50;

      // Create test keys
      for (const pattern of patterns) {
        const baseKey = pattern.replace('*', '');
        for (let i = 0; i < keysPerPattern; i++) {
          await cacheService.set(`${baseKey}${i}`, { data: `value-${i}` });
        }
      }

      // Test invalidation performance
      const startTime = Date.now();
      
      for (const pattern of patterns) {
        await cacheService.invalidatePattern(pattern);
      }

      const invalidationTime = Date.now() - startTime;

      expect(invalidationTime).toBeLessThan(2000);

      // Verify keys are invalidated
      for (const pattern of patterns) {
        const baseKey = pattern.replace('*', '');
        const exists = await cacheService.exists(`${baseKey}0`);
        expect(exists).toBe(false);
      }
    });
  });

  describe('Cache Middleware Performance', () => {
    it('should add minimal overhead to request processing', async () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: {},
        user: { id: 'user-123' },
      } as Request;

      const mockRes = {
        json: vi.fn(),
        statusCode: 200,
      } as unknown as Response;

      const mockNext = vi.fn();

      // Test cache miss scenario
      const startTime = Date.now();
      const middleware = cacheMiddleware.cache(cacheConfigs.userData);
      
      await new Promise<void>((resolve) => {
        mockNext.mockImplementation(() => {
          const processingTime = Date.now() - startTime;
          expect(processingTime).toBeLessThan(100); // Should add less than 100ms overhead
          resolve();
        });

        middleware(mockReq, mockRes, mockNext);
      });

      expect(mockNext).toHaveBeenCalled();
    });

    it('should provide fast cache hits', async () => {
      const cacheKey = 'test-cache-hit';
      const testData = { message: 'cached data', timestamp: Date.now() };

      // Pre-populate cache
      await cacheService.set(cacheKey, testData);

      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: {},
        user: { id: 'user-123' },
      } as Request;

      const mockRes = {
        json: jest.fn(),
        statusCode: 200,
      } as unknown as Response;

      const mockNext = vi.fn();

      const middleware = cacheMiddleware.cache({
        keyGenerator: () => cacheKey,
      });

      const startTime = Date.now();
      
      await new Promise<void>((resolve) => {
        (mockRes.json as any).mockImplementation((data) => {
          const responseTime = Date.now() - startTime;
          expect(responseTime).toBeLessThan(50); // Cache hits should be very fast
          expect(data).toEqual(testData);
          resolve();
        });

        middleware(mockReq, mockRes, mockNext);
      });

      expect(mockRes.json).toHaveBeenCalledWith(testData);
      expect(mockNext).not.toHaveBeenCalled(); // Should not call next on cache hit
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not cause memory leaks with large datasets', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 1000;

      // Simulate heavy cache usage
      for (let i = 0; i < iterations; i++) {
        const largeData = {
          id: i,
          data: new Array(1000).fill(`data-${i}`),
          metadata: {
            created: new Date(),
            size: 1000,
            type: 'test',
          },
        };

        await cacheService.set(`memory-test-${i}`, largeData, 60);
        
        // Periodically clean up to simulate real usage
        if (i % 100 === 0) {
          await cacheService.del(`memory-test-${i - 50}`);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseInMB = memoryIncrease / 1024 / 1024;

      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncreaseInMB).toBeLessThan(100);
    });
  });

  describe('Concurrent Access Tests', () => {
    it('should handle concurrent read/write operations safely', async () => {
      const concurrentOperations = 100;
      const testKey = 'concurrent-test';
      
      // Start concurrent operations
      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        if (i % 2 === 0) {
          // Write operation
          return cacheService.set(`${testKey}-${i}`, { value: i, timestamp: Date.now() });
        } else {
          // Read operation
          return cacheService.get(`${testKey}-${Math.floor(i / 2) * 2}`);
        }
      });

      const startTime = Date.now();
      const results = await Promise.allSettled(operations);
      const totalTime = Date.now() - startTime;

      // All operations should complete successfully
      const failedOperations = results.filter(result => result.status === 'rejected');
      expect(failedOperations).toHaveLength(0);

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000);
    });
  });
});

// Benchmark utility for performance testing
export class CacheBenchmark {
  static async runBenchmark(
    cacheService: CacheService,
    operations: number = 1000
  ): Promise<{
    setOpsPerSecond: number;
    getOpsPerSecond: number;
    averageSetTime: number;
    averageGetTime: number;
  }> {
    // Benchmark SET operations
    const setStartTime = Date.now();
    const setPromises: Promise<boolean>[] = [];

    for (let i = 0; i < operations; i++) {
      setPromises.push(cacheService.set(`benchmark-${i}`, { data: `value-${i}` }));
    }

    await Promise.all(setPromises);
    const setTotalTime = Date.now() - setStartTime;

    // Benchmark GET operations
    const getStartTime = Date.now();
    const getPromises: Promise<any>[] = [];

    for (let i = 0; i < operations; i++) {
      getPromises.push(cacheService.get(`benchmark-${i}`));
    }

    await Promise.all(getPromises);
    const getTotalTime = Date.now() - getStartTime;

    return {
      setOpsPerSecond: Math.round((operations / setTotalTime) * 1000),
      getOpsPerSecond: Math.round((operations / getTotalTime) * 1000),
      averageSetTime: setTotalTime / operations,
      averageGetTime: getTotalTime / operations,
    };
  }
}