#!/usr/bin/env node

import { Pool } from 'pg';
import { CacheService } from '../services/CacheService';
import { QueryOptimizationService } from '../services/QueryOptimizationService';
import { JobQueueService } from '../services/JobQueueService';
import { PerformanceMonitoringService } from '../services/PerformanceMonitoringService';
import { logger } from '../utils/logger';

interface BenchmarkResult {
  name: string;
  duration: number;
  operations: number;
  opsPerSecond: number;
  success: boolean;
  error?: string;
}

class PerformanceBenchmark {
  private pool: Pool;
  private cacheService: CacheService;
  private queryOptimizer: QueryOptimizationService;
  private jobQueue: JobQueueService;
  private performanceMonitor: PerformanceMonitoringService;

  constructor() {
    // Initialize services
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cad_ai_platform',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 20,
    });

    this.cacheService = new CacheService({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      ttl: 3600,
    });

    this.queryOptimizer = new QueryOptimizationService(this.pool);

    this.jobQueue = new JobQueueService({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    this.performanceMonitor = new PerformanceMonitoringService();
  }

  async runAllBenchmarks(): Promise<BenchmarkResult[]> {
    console.log('🚀 Starting performance benchmarks...\n');

    const results: BenchmarkResult[] = [];

    // Cache benchmarks
    results.push(await this.benchmarkCacheOperations());
    results.push(await this.benchmarkCacheBatchOperations());

    // Database benchmarks
    results.push(await this.benchmarkDatabaseQueries());
    results.push(await this.benchmarkDatabaseConnections());

    // Job queue benchmarks
    results.push(await this.benchmarkJobProcessing());

    // System benchmarks
    results.push(await this.benchmarkMemoryUsage());

    console.log('\n📊 Benchmark Results Summary:');
    console.log('================================');
    
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.opsPerSecond.toFixed(2)} ops/sec (${result.duration.toFixed(2)}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    return results;
  }

  private async benchmarkCacheOperations(): Promise<BenchmarkResult> {
    const operations = 1000;
    const startTime = Date.now();

    try {
      // Benchmark SET operations
      const setPromises = Array.from({ length: operations }, (_, i) =>
        this.cacheService.set(`benchmark-${i}`, { data: `value-${i}` })
      );
      await Promise.all(setPromises);

      // Benchmark GET operations
      const getPromises = Array.from({ length: operations }, (_, i) =>
        this.cacheService.get(`benchmark-${i}`)
      );
      await Promise.all(getPromises);

      const duration = Date.now() - startTime;
      const totalOps = operations * 2; // SET + GET operations

      return {
        name: 'Cache Operations',
        duration,
        operations: totalOps,
        opsPerSecond: (totalOps / duration) * 1000,
        success: true,
      };
    } catch (error) {
      return {
        name: 'Cache Operations',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async benchmarkCacheBatchOperations(): Promise<BenchmarkResult> {
    const batchSize = 100;
    const batches = 10;
    const startTime = Date.now();

    try {
      // Benchmark batch SET operations
      for (let batch = 0; batch < batches; batch++) {
        const keyValuePairs: Record<string, any> = {};
        for (let i = 0; i < batchSize; i++) {
          keyValuePairs[`batch-${batch}-${i}`] = { batch, index: i };
        }
        await this.cacheService.mset(keyValuePairs);
      }

      // Benchmark batch GET operations
      for (let batch = 0; batch < batches; batch++) {
        const keys = Array.from({ length: batchSize }, (_, i) => `batch-${batch}-${i}`);
        await this.cacheService.mget(keys);
      }

      const duration = Date.now() - startTime;
      const totalOps = batchSize * batches * 2;

      return {
        name: 'Cache Batch Operations',
        duration,
        operations: totalOps,
        opsPerSecond: (totalOps / duration) * 1000,
        success: true,
      };
    } catch (error) {
      return {
        name: 'Cache Batch Operations',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async benchmarkDatabaseQueries(): Promise<BenchmarkResult> {
    const queries = 100;
    const startTime = Date.now();

    try {
      const queryPromises = Array.from({ length: queries }, () =>
        this.queryOptimizer.executeWithStats(
          'SELECT COUNT(*) FROM users WHERE is_active = $1',
          [true]
        )
      );

      await Promise.all(queryPromises);

      const duration = Date.now() - startTime;

      return {
        name: 'Database Queries',
        duration,
        operations: queries,
        opsPerSecond: (queries / duration) * 1000,
        success: true,
      };
    } catch (error) {
      return {
        name: 'Database Queries',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async benchmarkDatabaseConnections(): Promise<BenchmarkResult> {
    const connections = 50;
    const startTime = Date.now();

    try {
      const connectionPromises = Array.from({ length: connections }, () =>
        this.pool.query('SELECT NOW()')
      );

      await Promise.all(connectionPromises);

      const duration = Date.now() - startTime;

      return {
        name: 'Database Connections',
        duration,
        operations: connections,
        opsPerSecond: (connections / duration) * 1000,
        success: true,
      };
    } catch (error) {
      return {
        name: 'Database Connections',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async benchmarkJobProcessing(): Promise<BenchmarkResult> {
    const jobs = 50;
    const startTime = Date.now();

    try {
      const jobPromises = Array.from({ length: jobs }, (_, i) =>
        this.jobQueue.addJob('file-processing', {
          type: 'thumbnail-generation',
          payload: { fileId: `benchmark-${i}` },
        })
      );

      await Promise.all(jobPromises);

      const duration = Date.now() - startTime;

      return {
        name: 'Job Queue Processing',
        duration,
        operations: jobs,
        opsPerSecond: (jobs / duration) * 1000,
        success: true,
      };
    } catch (error) {
      return {
        name: 'Job Queue Processing',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async benchmarkMemoryUsage(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;

    try {
      // Create and destroy objects to test memory management
      for (let i = 0; i < iterations; i++) {
        const largeObject = {
          id: i,
          data: new Array(1000).fill(`data-${i}`),
          metadata: { created: new Date(), size: 1000 },
        };

        // Simulate some processing
        JSON.stringify(largeObject);

        // Periodically trigger garbage collection if available
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const duration = Date.now() - startTime;

      return {
        name: 'Memory Usage',
        duration,
        operations: iterations,
        opsPerSecond: (iterations / duration) * 1000,
        success: memoryIncrease < 50 * 1024 * 1024, // Success if memory increase < 50MB
        error: memoryIncrease >= 50 * 1024 * 1024 
          ? `Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB` 
          : undefined,
      };
    } catch (error) {
      return {
        name: 'Memory Usage',
        duration: Date.now() - startTime,
        operations: 0,
        opsPerSecond: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.pool.end();
      await this.cacheService.disconnect();
      await this.jobQueue.shutdown();
      this.performanceMonitor.stopMonitoring();
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }
}

// Run benchmarks if this script is executed directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  
  benchmark.runAllBenchmarks()
    .then(results => {
      const overallSuccess = results.every(r => r.success);
      console.log(`\n${overallSuccess ? '✅' : '❌'} Overall benchmark ${overallSuccess ? 'passed' : 'failed'}`);
      
      if (!overallSuccess) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    })
    .finally(() => {
      benchmark.cleanup();
    });
}

export { PerformanceBenchmark };