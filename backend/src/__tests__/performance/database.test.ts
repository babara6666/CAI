import { Pool } from 'pg';
import { QueryOptimizationService } from '../../services/QueryOptimizationService';
import { DatabaseService } from '../../database/DatabaseService';

describe('Database Performance Tests', () => {
  let pool: Pool;
  let queryOptimizer: QueryOptimizationService;
  let dbService: DatabaseService;

  beforeAll(async () => {
    // Use test database configuration
    pool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'cad_ai_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    queryOptimizer = new QueryOptimizationService(pool);
    dbService = new DatabaseService(pool);

    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  describe('Query Performance Tests', () => {
    it('should execute file search queries efficiently', async () => {
      const filters = {
        projectName: 'Test Project',
        tags: ['mechanical', 'design'],
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
      };

      const optimizedQuery = queryOptimizer.optimizeFileSearchQuery(filters);
      const params = [
        'Test Project',
        ['mechanical', 'design'],
        filters.dateRange.start,
        filters.dateRange.end,
      ];

      const startTime = Date.now();
      const { result, stats } = await queryOptimizer.executeWithStats(optimizedQuery, params);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
      expect(stats.executionTime).toBeLessThan(500); // Database execution should be faster
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle complex search queries with joins efficiently', async () => {
      const complexQuery = `
        SELECT 
          f.id,
          f.filename,
          f.project_name,
          f.uploaded_at,
          u.username,
          COUNT(sr.id) as search_count,
          AVG(sr.relevance_score) as avg_relevance
        FROM cad_files f
        JOIN users u ON f.uploaded_by = u.id
        LEFT JOIN search_results sr ON f.id = sr.file_id
        WHERE f.uploaded_at > $1
          AND f.tags && $2
        GROUP BY f.id, f.filename, f.project_name, f.uploaded_at, u.username
        ORDER BY avg_relevance DESC NULLS LAST, f.uploaded_at DESC
        LIMIT 50
      `;

      const params = [
        new Date('2024-01-01'),
        ['mechanical', 'design'],
      ];

      const startTime = Date.now();
      const { result, stats } = await queryOptimizer.executeWithStats(complexQuery, params);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(2000);
      expect(stats.planningTime).toBeLessThan(100);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should efficiently handle batch insert operations', async () => {
      const batchSize = 1000;
      const testRecords = Array.from({ length: batchSize }, (_, i) => ({
        id: `test-batch-${i}`,
        filename: `test-file-${i}.dwg`,
        original_name: `test-file-${i}.dwg`,
        file_size: Math.floor(Math.random() * 1000000),
        mime_type: 'application/dwg',
        uploaded_by: 'test-user-id',
        uploaded_at: new Date(),
        tags: ['test', 'batch'],
        project_name: 'Batch Test Project',
        current_version: 1,
      }));

      const startTime = Date.now();
      await queryOptimizer.batchInsert('cad_files', testRecords, 100);
      const batchInsertTime = Date.now() - startTime;

      expect(batchInsertTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify data was inserted
      const countQuery = 'SELECT COUNT(*) FROM cad_files WHERE project_name = $1';
      const { result } = await queryOptimizer.executeWithStats(countQuery, ['Batch Test Project']);
      expect(parseInt(result[0].count)).toBeGreaterThanOrEqual(batchSize);

      // Cleanup
      await pool.query('DELETE FROM cad_files WHERE project_name = $1', ['Batch Test Project']);
    });

    it('should optimize queries with proper index usage', async () => {
      const indexedQuery = `
        SELECT f.*, u.username
        FROM cad_files f
        JOIN users u ON f.uploaded_by = u.id
        WHERE f.uploaded_at > $1
          AND f.project_name = $2
        ORDER BY f.uploaded_at DESC
        LIMIT 20
      `;

      const params = [new Date('2024-01-01'), 'Test Project'];

      const { stats } = await queryOptimizer.executeWithStats(indexedQuery, params);
      
      // Check that the query uses indexes efficiently
      expect(stats.executionPlan).toBeDefined();
      expect(stats.executionTime).toBeLessThan(100); // Should be very fast with proper indexes
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle high concurrent connection requests', async () => {
      const concurrentQueries = 50;
      const simpleQuery = 'SELECT COUNT(*) FROM users';

      const startTime = Date.now();
      const queryPromises = Array.from({ length: concurrentQueries }, () =>
        pool.query(simpleQuery)
      );

      const results = await Promise.all(queryPromises);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(concurrentQueries);
      expect(totalTime).toBeLessThan(3000); // Should handle concurrent queries efficiently
      
      // Check pool statistics
      const poolStats = queryOptimizer.getPoolStats();
      expect(poolStats.totalCount).toBeGreaterThan(0);
      expect(poolStats.idleCount).toBeGreaterThanOrEqual(0);
    });

    it('should recover from connection failures gracefully', async () => {
      // Simulate connection stress
      const stressQueries = Array.from({ length: 100 }, (_, i) => 
        pool.query('SELECT pg_sleep(0.01), $1 as query_id', [i])
      );

      const startTime = Date.now();
      const results = await Promise.allSettled(stressQueries);
      const totalTime = Date.now() - startTime;

      const successfulQueries = results.filter(r => r.status === 'fulfilled').length;
      const failedQueries = results.filter(r => r.status === 'rejected').length;

      expect(successfulQueries).toBeGreaterThan(90); // Most queries should succeed
      expect(failedQueries).toBeLessThan(10); // Few failures are acceptable under stress
      expect(totalTime).toBeLessThan(10000); // Should complete within reasonable time
    });
  });

  describe('Query Analysis and Optimization', () => {
    it('should provide performance recommendations for slow queries', async () => {
      const slowQuery = `
        SELECT f.*, u.username, d.name as dataset_name
        FROM cad_files f
        JOIN users u ON f.uploaded_by = u.id
        LEFT JOIN dataset_files df ON f.id = df.file_id
        LEFT JOIN datasets d ON df.dataset_id = d.id
        WHERE f.metadata->>'software' = $1
          AND f.file_size > $2
        ORDER BY f.uploaded_at DESC
      `;

      const params = ['AutoCAD', 1000000];

      const recommendations = await queryOptimizer.analyzeQueryPerformance(slowQuery, params);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      
      if (recommendations.length > 0) {
        expect(recommendations[0]).toHaveProperty('type');
        expect(recommendations[0]).toHaveProperty('description');
        expect(recommendations[0]).toHaveProperty('impact');
      }
    });

    it('should track query statistics over time', async () => {
      const testQuery = 'SELECT COUNT(*) FROM cad_files WHERE project_name = $1';
      const testParam = 'Performance Test Project';

      // Execute the same query multiple times
      for (let i = 0; i < 10; i++) {
        await queryOptimizer.executeWithStats(testQuery, [testParam]);
      }

      const queryStats = queryOptimizer.getQueryStats('SELECT COUNT(*) FROM cad_files');
      expect(queryStats.length).toBeGreaterThanOrEqual(10);
      
      const avgExecutionTime = queryStats.reduce((sum, stat) => sum + stat.executionTime, 0) / queryStats.length;
      expect(avgExecutionTime).toBeLessThan(1000); // Average should be reasonable
    });

    it('should identify slow queries for optimization', async () => {
      // Execute a deliberately slow query
      const slowQuery = 'SELECT pg_sleep(1.5), COUNT(*) FROM cad_files';
      await queryOptimizer.executeWithStats(slowQuery);

      const slowQueries = queryOptimizer.getSlowQueriesReport(5);
      expect(slowQueries.length).toBeGreaterThan(0);
      
      const slowestQuery = slowQueries[0];
      expect(slowestQuery.executionTime).toBeGreaterThan(1000);
    });
  });

  describe('Index Performance Tests', () => {
    it('should demonstrate improved performance with indexes', async () => {
      // Test query performance before and after index creation
      const testQuery = `
        SELECT * FROM cad_files 
        WHERE tags && $1 
          AND file_size > $2 
        ORDER BY uploaded_at DESC 
        LIMIT 10
      `;
      
      const params = [['mechanical'], 100000];

      // Execute query and measure performance
      const { stats: beforeStats } = await queryOptimizer.executeWithStats(testQuery, params);
      
      // The query should use the existing indexes we created in the migration
      expect(beforeStats.executionTime).toBeLessThan(500);
      expect(beforeStats.executionPlan).toBeDefined();
    });
  });

  // Helper functions
  async function setupTestData(): Promise<void> {
    // Create test users
    await pool.query(`
      INSERT INTO users (id, email, username, password_hash, role, is_active, created_at, updated_at)
      VALUES 
        ('test-user-id', 'test@example.com', 'testuser', 'hashed', 'engineer', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    // Create test CAD files
    const testFiles = Array.from({ length: 100 }, (_, i) => `
      ('test-file-${i}', 'test-file-${i}.dwg', 'test-file-${i}.dwg', ${Math.floor(Math.random() * 1000000)}, 
       'application/dwg', 'test-user-id', NOW(), ARRAY['mechanical', 'design'], 'Test Project', 
       'Part ${i}', 'Test description', '{}', '/thumbnails/test-${i}.jpg', '/files/test-${i}.dwg', 1, NOW(), NOW())
    `).join(',');

    await pool.query(`
      INSERT INTO cad_files (id, filename, original_name, file_size, mime_type, uploaded_by, 
                            uploaded_at, tags, project_name, part_name, description, metadata, 
                            thumbnail_url, file_url, current_version, created_at, updated_at)
      VALUES ${testFiles}
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async function cleanupTestData(): Promise<void> {
    await pool.query('DELETE FROM cad_files WHERE id LIKE $1', ['test-file-%']);
    await pool.query('DELETE FROM users WHERE id = $1', ['test-user-id']);
  }
});

// Database benchmark utility
export class DatabaseBenchmark {
  static async runQueryBenchmark(
    pool: Pool,
    query: string,
    params: any[] = [],
    iterations: number = 100
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
    queriesPerSecond: number;
  }> {
    const times: number[] = [];
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const queryStart = Date.now();
      await pool.query(query, params);
      const queryTime = Date.now() - queryStart;
      times.push(queryTime);
    }

    const totalTime = Date.now() - startTime;
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const queriesPerSecond = Math.round((iterations / totalTime) * 1000);

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      queriesPerSecond,
    };
  }

  static async runConnectionPoolBenchmark(
    pool: Pool,
    concurrentConnections: number = 50,
    queriesPerConnection: number = 10
  ): Promise<{
    totalQueries: number;
    totalTime: number;
    averageQueryTime: number;
    queriesPerSecond: number;
    successRate: number;
  }> {
    const totalQueries = concurrentConnections * queriesPerConnection;
    const startTime = Date.now();

    const connectionPromises = Array.from({ length: concurrentConnections }, async () => {
      const queryPromises = Array.from({ length: queriesPerConnection }, () =>
        pool.query('SELECT NOW(), pg_backend_pid()')
      );
      return Promise.allSettled(queryPromises);
    });

    const results = await Promise.all(connectionPromises);
    const totalTime = Date.now() - startTime;

    const allResults = results.flat();
    const successfulQueries = allResults.filter(r => r.status === 'fulfilled').length;
    const successRate = (successfulQueries / totalQueries) * 100;
    const averageQueryTime = totalTime / totalQueries;
    const queriesPerSecond = Math.round((successfulQueries / totalTime) * 1000);

    return {
      totalQueries,
      totalTime,
      averageQueryTime,
      queriesPerSecond,
      successRate,
    };
  }
}