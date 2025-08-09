import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export interface QueryStats {
  query: string;
  executionTime: number;
  rowsReturned: number;
  planningTime: number;
  executionPlan?: any;
}

export interface OptimizationRecommendation {
  type: 'index' | 'query_rewrite' | 'table_structure';
  description: string;
  impact: 'high' | 'medium' | 'low';
  sql?: string;
}

export class QueryOptimizationService {
  private queryStats: Map<string, QueryStats[]> = new Map();
  private slowQueryThreshold: number = 1000; // 1 second

  constructor(private pool: Pool) {}

  // Execute query with performance monitoring
  async executeWithStats<T = any>(
    query: string, 
    params: any[] = [],
    client?: PoolClient
  ): Promise<{ result: T[], stats: QueryStats }> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(query);
    
    try {
      const dbClient = client || await this.pool.connect();
      
      // Enable timing for this query
      await dbClient.query('SET track_io_timing = on');
      
      // Execute EXPLAIN ANALYZE for performance insights
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const explainResult = await dbClient.query(explainQuery, params);
      const executionPlan = explainResult.rows[0]['QUERY PLAN'][0];
      
      // Execute the actual query
      const result = await dbClient.query(query, params);
      
      if (!client) {
        dbClient.release();
      }
      
      const executionTime = Date.now() - startTime;
      const stats: QueryStats = {
        query: this.sanitizeQuery(query),
        executionTime,
        rowsReturned: result.rowCount || 0,
        planningTime: executionPlan['Planning Time'] || 0,
        executionPlan
      };
      
      // Store stats for analysis
      this.recordQueryStats(queryHash, stats);
      
      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        logger.warn('Slow query detected:', {
          query: this.sanitizeQuery(query),
          executionTime,
          rowsReturned: result.rowCount
        });
      }
      
      return { result: result.rows, stats };
    } catch (error) {
      logger.error('Query execution error:', error);
      throw error;
    }
  }

  // Analyze query performance and provide recommendations
  async analyzeQueryPerformance(query: string, params: any[] = []): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    
    try {
      const client = await this.pool.connect();
      
      // Get query execution plan
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      client.release();
      
      // Analyze the execution plan
      recommendations.push(...this.analyzePlan(plan));
      
      return recommendations;
    } catch (error) {
      logger.error('Query analysis error:', error);
      return [];
    }
  }

  // Get performance statistics for queries
  getQueryStats(queryPattern?: string): QueryStats[] {
    if (queryPattern) {
      const stats: QueryStats[] = [];
      for (const [hash, queryStats] of this.queryStats.entries()) {
        if (queryStats[0]?.query.includes(queryPattern)) {
          stats.push(...queryStats);
        }
      }
      return stats;
    }
    
    return Array.from(this.queryStats.values()).flat();
  }

  // Get slow queries report
  getSlowQueriesReport(limit: number = 10): QueryStats[] {
    const allStats = this.getQueryStats();
    return allStats
      .filter(stat => stat.executionTime > this.slowQueryThreshold)
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit);
  }

  // Optimize common query patterns
  optimizeFileSearchQuery(filters: any): string {
    let query = `
      SELECT f.*, u.username as uploaded_by_username
      FROM cad_files f
      JOIN users u ON f.uploaded_by = u.id
      WHERE 1=1
    `;
    
    const conditions: string[] = [];
    
    if (filters.uploadedBy) {
      conditions.push('f.uploaded_by = $' + (conditions.length + 1));
    }
    
    if (filters.projectName) {
      conditions.push('f.project_name ILIKE $' + (conditions.length + 1));
    }
    
    if (filters.partName) {
      conditions.push('f.part_name ILIKE $' + (conditions.length + 1));
    }
    
    if (filters.tags && filters.tags.length > 0) {
      conditions.push('f.tags && $' + (conditions.length + 1));
    }
    
    if (filters.dateRange) {
      if (filters.dateRange.start) {
        conditions.push('f.uploaded_at >= $' + (conditions.length + 1));
      }
      if (filters.dateRange.end) {
        conditions.push('f.uploaded_at <= $' + (conditions.length + 1));
      }
    }
    
    if (filters.fileSize) {
      if (filters.fileSize.min) {
        conditions.push('f.file_size >= $' + (conditions.length + 1));
      }
      if (filters.fileSize.max) {
        conditions.push('f.file_size <= $' + (conditions.length + 1));
      }
    }
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }
    
    // Add ordering for better performance with indexes
    query += ' ORDER BY f.uploaded_at DESC';
    
    return query;
  }

  // Batch operations for better performance
  async batchInsert(table: string, records: any[], batchSize: number = 1000): Promise<void> {
    if (records.length === 0) return;
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const columns = Object.keys(batch[0]);
        const values = batch.map(record => columns.map(col => record[col]));
        
        const placeholders = values.map((_, idx) => 
          `(${columns.map((_, colIdx) => `$${idx * columns.length + colIdx + 1}`).join(', ')})`
        ).join(', ');
        
        const query = `
          INSERT INTO ${table} (${columns.join(', ')})
          VALUES ${placeholders}
        `;
        
        await client.query(query, values.flat());
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Connection pool monitoring
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  private recordQueryStats(queryHash: string, stats: QueryStats): void {
    if (!this.queryStats.has(queryHash)) {
      this.queryStats.set(queryHash, []);
    }
    
    const queryStatsList = this.queryStats.get(queryHash)!;
    queryStatsList.push(stats);
    
    // Keep only last 100 executions per query
    if (queryStatsList.length > 100) {
      queryStatsList.shift();
    }
  }

  private analyzePlan(plan: any): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    
    // Check for sequential scans
    if (this.hasSequentialScan(plan)) {
      recommendations.push({
        type: 'index',
        description: 'Sequential scan detected. Consider adding indexes on frequently queried columns.',
        impact: 'high',
        sql: '-- Add appropriate indexes based on WHERE clauses'
      });
    }
    
    // Check for high cost operations
    if (plan['Total Cost'] > 10000) {
      recommendations.push({
        type: 'query_rewrite',
        description: 'High cost query detected. Consider query optimization or result limiting.',
        impact: 'high'
      });
    }
    
    // Check for large buffer usage
    if (plan['Shared Hit Blocks'] && plan['Shared Hit Blocks'] > 1000) {
      recommendations.push({
        type: 'index',
        description: 'High buffer usage detected. Consider adding covering indexes.',
        impact: 'medium'
      });
    }
    
    return recommendations;
  }

  private hasSequentialScan(node: any): boolean {
    if (node['Node Type'] === 'Seq Scan') {
      return true;
    }
    
    if (node.Plans) {
      return node.Plans.some((child: any) => this.hasSequentialScan(child));
    }
    
    return false;
  }

  private hashQuery(query: string): string {
    // Simple hash function for query identification
    return Buffer.from(query.replace(/\s+/g, ' ').trim()).toString('base64').slice(0, 32);
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from query for logging
    return query.replace(/\$\d+/g, '?').replace(/\s+/g, ' ').trim();
  }
}