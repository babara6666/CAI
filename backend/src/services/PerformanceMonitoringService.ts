import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { CacheService } from './CacheService';
import { DatabaseService } from '../database/DatabaseService';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
}

interface ApplicationMetrics {
  requests: {
    total: number;
    perSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
  database: {
    connections: number;
    queryTime: number;
    slowQueries: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    evictions: number;
  };
  fileOperations: {
    uploads: number;
    downloads: number;
    failures: number;
  };
  aiOperations: {
    inferences: number;
    trainingJobs: number;
    modelLoadTime: number;
  };
}

export class PerformanceMonitoringService extends EventEmitter {
  private static instance: PerformanceMonitoringService;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private cacheService: CacheService;
  private databaseService: DatabaseService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertThresholds: Map<string, number> = new Map();

  constructor() {
    super();
    this.cacheService = CacheService.getInstance();
    this.databaseService = DatabaseService.getInstance();
    this.setupDefaultThresholds();
  }

  public static getInstance(): PerformanceMonitoringService {
    if (!PerformanceMonitoringService.instance) {
      PerformanceMonitoringService.instance = new PerformanceMonitoringService();
    }
    return PerformanceMonitoringService.instance;
  }

  private setupDefaultThresholds(): void {
    this.alertThresholds.set('cpu_usage', 80);
    this.alertThresholds.set('memory_usage', 85);
    this.alertThresholds.set('disk_usage', 90);
    this.alertThresholds.set('response_time', 2000);
    this.alertThresholds.set('error_rate', 5);
    this.alertThresholds.set('database_connections', 80);
    this.alertThresholds.set('cache_miss_rate', 50);
  }

  public startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Failed to collect performance metrics', { error: error.message });
      }
    }, intervalMs);

    logger.info('Performance monitoring started', { intervalMs });
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Performance monitoring stopped');
  }

  private async collectMetrics(): Promise<void> {
    const systemMetrics = await this.getSystemMetrics();
    const appMetrics = await this.getApplicationMetrics();

    // Store metrics
    this.storeMetric('cpu_usage', systemMetrics.cpu.usage);
    this.storeMetric('memory_usage', systemMetrics.memory.percentage);
    this.storeMetric('disk_usage', systemMetrics.disk.percentage);
    this.storeMetric('response_time', appMetrics.requests.averageResponseTime);
    this.storeMetric('error_rate', appMetrics.requests.errorRate);
    this.storeMetric('database_connections', appMetrics.database.connections);
    this.storeMetric('cache_hit_rate', appMetrics.cache.hitRate);

    // Check thresholds and emit alerts
    this.checkThresholds();

    // Log metrics summary
    logger.info('Performance metrics collected', {
      cpu: systemMetrics.cpu.usage,
      memory: systemMetrics.memory.percentage,
      responseTime: appMetrics.requests.averageResponseTime,
      errorRate: appMetrics.requests.errorRate
    });
  }

  private async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: require('os').loadavg()
      },
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      disk: {
        used: 0, // Would need to implement disk usage check
        total: 0,
        percentage: 0
      },
      network: {
        bytesIn: 0, // Would need to implement network monitoring
        bytesOut: 0
      }
    };
  }

  private async getApplicationMetrics(): Promise<ApplicationMetrics> {
    // Get cached metrics or calculate from stored data
    const requestMetrics = await this.getRequestMetrics();
    const dbMetrics = await this.getDatabaseMetrics();
    const cacheMetrics = await this.getCacheMetrics();
    const fileMetrics = await this.getFileOperationMetrics();
    const aiMetrics = await this.getAIOperationMetrics();

    return {
      requests: requestMetrics,
      database: dbMetrics,
      cache: cacheMetrics,
      fileOperations: fileMetrics,
      aiOperations: aiMetrics
    };
  }

  private async getRequestMetrics(): Promise<ApplicationMetrics['requests']> {
    // This would typically come from your metrics collection middleware
    const cachedMetrics = await this.cacheService.get('request_metrics');
    
    return cachedMetrics || {
      total: 0,
      perSecond: 0,
      averageResponseTime: 0,
      errorRate: 0
    };
  }

  private async getDatabaseMetrics(): Promise<ApplicationMetrics['database']> {
    try {
      const result = await this.databaseService.query(`
        SELECT 
          count(*) as active_connections,
          avg(extract(epoch from (now() - query_start))) as avg_query_time
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);

      const slowQueries = await this.databaseService.query(`
        SELECT count(*) as slow_queries
        FROM pg_stat_statements 
        WHERE mean_time > 1000
      `);

      return {
        connections: parseInt(result.rows[0]?.active_connections || '0'),
        queryTime: parseFloat(result.rows[0]?.avg_query_time || '0'),
        slowQueries: parseInt(slowQueries.rows[0]?.slow_queries || '0')
      };
    } catch (error) {
      logger.error('Failed to get database metrics', { error: error.message });
      return { connections: 0, queryTime: 0, slowQueries: 0 };
    }
  }

  private async getCacheMetrics(): Promise<ApplicationMetrics['cache']> {
    try {
      const info = await this.cacheService.getInfo();
      const stats = info.split('\r\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const hits = parseInt(stats.keyspace_hits || '0');
      const misses = parseInt(stats.keyspace_misses || '0');
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        hitRate,
        missRate: 100 - hitRate,
        evictions: parseInt(stats.evicted_keys || '0')
      };
    } catch (error) {
      logger.error('Failed to get cache metrics', { error: error.message });
      return { hitRate: 0, missRate: 0, evictions: 0 };
    }
  }

  private async getFileOperationMetrics(): Promise<ApplicationMetrics['fileOperations']> {
    const cachedMetrics = await this.cacheService.get('file_operation_metrics');
    
    return cachedMetrics || {
      uploads: 0,
      downloads: 0,
      failures: 0
    };
  }

  private async getAIOperationMetrics(): Promise<ApplicationMetrics['aiOperations']> {
    const cachedMetrics = await this.cacheService.get('ai_operation_metrics');
    
    return cachedMetrics || {
      inferences: 0,
      trainingJobs: 0,
      modelLoadTime: 0
    };
  }

  private storeMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: new Date(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(metric);

    // Keep only last 1000 metrics per type
    if (metrics.length > 1000) {
      metrics.shift();
    }

    // Emit metric event
    this.emit('metric', metric);
  }

  private checkThresholds(): void {
    for (const [metricName, threshold] of this.alertThresholds.entries()) {
      const metrics = this.metrics.get(metricName);
      if (!metrics || metrics.length === 0) continue;

      const latestMetric = metrics[metrics.length - 1];
      
      if (latestMetric.value > threshold) {
        this.emit('alert', {
          metric: metricName,
          value: latestMetric.value,
          threshold,
          timestamp: latestMetric.timestamp,
          severity: this.getSeverity(metricName, latestMetric.value, threshold)
        });

        logger.warn('Performance threshold exceeded', {
          metric: metricName,
          value: latestMetric.value,
          threshold
        });
      }
    }
  }

  private getSeverity(metricName: string, value: number, threshold: number): 'warning' | 'critical' {
    const criticalMultiplier = 1.2; // 20% above threshold is critical
    return value > threshold * criticalMultiplier ? 'critical' : 'warning';
  }

  public getMetrics(metricName?: string, limit: number = 100): PerformanceMetric[] {
    if (metricName) {
      const metrics = this.metrics.get(metricName) || [];
      return metrics.slice(-limit);
    }

    // Return all metrics
    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics.slice(-limit));
    }

    return allMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }

  public getAverageMetric(metricName: string, timeWindowMs: number = 300000): number {
    const metrics = this.metrics.get(metricName);
    if (!metrics || metrics.length === 0) return 0;

    const cutoffTime = new Date(Date.now() - timeWindowMs);
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    
    if (recentMetrics.length === 0) return 0;

    const sum = recentMetrics.reduce((acc, m) => acc + m.value, 0);
    return sum / recentMetrics.length;
  }

  public setAlertThreshold(metricName: string, threshold: number): void {
    this.alertThresholds.set(metricName, threshold);
    logger.info('Alert threshold updated', { metricName, threshold });
  }

  public recordCustomMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.storeMetric(name, value, tags);
  }

  // Method to record specific application events
  public recordFileUpload(success: boolean, sizeBytes: number, durationMs: number): void {
    this.recordCustomMetric('file_upload_size', sizeBytes);
    this.recordCustomMetric('file_upload_duration', durationMs);
    this.recordCustomMetric('file_upload_success', success ? 1 : 0);
  }

  public recordSearchQuery(durationMs: number, resultCount: number, queryType: string): void {
    this.recordCustomMetric('search_duration', durationMs, { type: queryType });
    this.recordCustomMetric('search_results', resultCount, { type: queryType });
  }

  public recordAIInference(modelId: string, durationMs: number, success: boolean): void {
    this.recordCustomMetric('ai_inference_duration', durationMs, { model: modelId });
    this.recordCustomMetric('ai_inference_success', success ? 1 : 0, { model: modelId });
  }

  public recordDatabaseQuery(queryType: string, durationMs: number): void {
    this.recordCustomMetric('db_query_duration', durationMs, { type: queryType });
  }
}