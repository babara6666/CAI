import { Request, Response } from 'express';
import { DatabaseService } from '../database/DatabaseService';
import { CacheService } from '../services/CacheService';
import { logger } from '../utils/logger';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    storage: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
  };
  system: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private databaseService: DatabaseService;
  private cacheService: CacheService;

  constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.cacheService = CacheService.getInstance();
  }

  public static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  public async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const [databaseHealth, redisHealth, storageHealth] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkStorage()
      ]);

      const systemInfo = this.getSystemInfo();
      
      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : { status: 'down', error: (databaseHealth as PromiseRejectedResult).reason.message },
          redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { status: 'down', error: (redisHealth as PromiseRejectedResult).reason.message },
          storage: storageHealth.status === 'fulfilled' ? storageHealth.value : { status: 'down', error: (storageHealth as PromiseRejectedResult).reason.message }
        },
        system: systemInfo
      };

      // Determine overall health status
      const servicesDown = Object.values(health.services).filter(service => service.status === 'down').length;
      if (servicesDown > 0) {
        health.status = 'unhealthy';
      }

      logger.info('Health check completed', {
        status: health.status,
        responseTime: Date.now() - startTime,
        servicesDown
      });

      return health;
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      throw error;
    }
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const startTime = Date.now();
    
    try {
      await this.databaseService.query('SELECT 1');
      return {
        status: 'up',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      throw error;
    }
  }

  private async checkRedis(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const startTime = Date.now();
    
    try {
      await this.cacheService.ping();
      return {
        status: 'up',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Redis health check failed', { error: error.message });
      throw error;
    }
  }

  private async checkStorage(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const startTime = Date.now();
    
    try {
      // Simple storage connectivity check
      // This would depend on your storage implementation (S3, MinIO, etc.)
      // For now, we'll assume it's always up
      return {
        status: 'up',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Storage health check failed', { error: error.message });
      throw error;
    }
  }

  private getSystemInfo() {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    const usedMemory = memUsage.heapUsed;

    return {
      uptime: process.uptime(),
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: (usedMemory / totalMemory) * 100
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000 // Convert to seconds
      }
    };
  }
}

export const healthCheckHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const healthService = HealthCheckService.getInstance();
    const health = await healthService.checkHealth();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check endpoint failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};