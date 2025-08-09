import { logger } from '../utils/logger';
import { createCircuitBreaker, CircuitState } from '../utils/circuitBreaker';
import { retry, RetryConfigs } from '../utils/retryMechanism';
import { SearchService } from './SearchService';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  lastCheck: Date;
  responseTime?: number;
  errorRate?: number;
  circuitState?: CircuitState;
}

export interface DegradationStrategy {
  name: string;
  condition: (health: ServiceHealth) => boolean;
  fallbackAction: () => Promise<any>;
  description: string;
}

export class GracefulDegradationService {
  private static instance: GracefulDegradationService;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private degradationStrategies: Map<string, DegradationStrategy[]> = new Map();
  private aiServiceCircuitBreaker = createCircuitBreaker('ai-service', {
    failureThreshold: 3,
    resetTimeout: 30000,
    monitoringPeriod: 60000
  });

  public static getInstance(): GracefulDegradationService {
    if (!GracefulDegradationService.instance) {
      GracefulDegradationService.instance = new GracefulDegradationService();
    }
    return GracefulDegradationService.instance;
  }

  constructor() {
    this.initializeDegradationStrategies();
    this.startHealthMonitoring();
  }

  private initializeDegradationStrategies(): void {
    // AI Search degradation strategies
    this.addDegradationStrategy('ai-search', {
      name: 'fallback-to-keyword-search',
      condition: (health) => health.status === 'unavailable' || health.status === 'degraded',
      fallbackAction: async () => {
        logger.warn('AI search unavailable, falling back to keyword search');
        return 'keyword-search';
      },
      description: 'Fall back to keyword-based search when AI service is unavailable'
    });

    // Model training degradation strategies
    this.addDegradationStrategy('model-training', {
      name: 'queue-training-job',
      condition: (health) => health.status === 'unavailable',
      fallbackAction: async () => {
        logger.warn('AI service unavailable, queueing training job for later');
        return 'queued';
      },
      description: 'Queue training jobs when AI service is unavailable'
    });

    // File processing degradation strategies
    this.addDegradationStrategy('file-processing', {
      name: 'skip-ai-metadata-extraction',
      condition: (health) => health.status !== 'healthy',
      fallbackAction: async () => {
        logger.warn('AI service degraded, skipping AI-based metadata extraction');
        return 'basic-metadata-only';
      },
      description: 'Skip AI-based metadata extraction when service is degraded'
    });
  }

  public async executeWithDegradation<T>(
    serviceName: string,
    primaryOperation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    try {
      // Check if we should attempt primary operation
      const health = this.getServiceHealth(serviceName);
      
      if (health.status === 'unavailable') {
        return await this.executeFallback(serviceName, operationName);
      }

      // Try primary operation with circuit breaker
      if (serviceName === 'ai-service') {
        return await this.aiServiceCircuitBreaker.execute(async () => {
          return await retry(primaryOperation, RetryConfigs.FAST, operationName);
        });
      } else {
        return await retry(primaryOperation, RetryConfigs.STANDARD, operationName);
      }

    } catch (error) {
      logger.error(`Primary operation failed for ${serviceName}:${operationName}`, {
        error: (error as Error).message,
        serviceName,
        operationName
      });

      // Update service health
      this.updateServiceHealth(serviceName, 'degraded', Date.now());

      // Execute fallback
      return await this.executeFallback(serviceName, operationName);
    }
  }

  private async executeFallback<T>(serviceName: string, operationName: string): Promise<T> {
    const strategies = this.degradationStrategies.get(serviceName) || [];
    const health = this.getServiceHealth(serviceName);

    for (const strategy of strategies) {
      if (strategy.condition(health)) {
        logger.info(`Executing degradation strategy: ${strategy.name}`, {
          serviceName,
          operationName,
          strategy: strategy.description
        });

        try {
          return await strategy.fallbackAction();
        } catch (fallbackError) {
          logger.error(`Fallback strategy failed: ${strategy.name}`, {
            error: (fallbackError as Error).message,
            serviceName,
            operationName
          });
        }
      }
    }

    // If no fallback strategy worked, throw the original error
    throw new Error(`All fallback strategies failed for ${serviceName}:${operationName}`);
  }

  public addDegradationStrategy(serviceName: string, strategy: DegradationStrategy): void {
    if (!this.degradationStrategies.has(serviceName)) {
      this.degradationStrategies.set(serviceName, []);
    }
    this.degradationStrategies.get(serviceName)!.push(strategy);
  }

  public updateServiceHealth(
    serviceName: string, 
    status: 'healthy' | 'degraded' | 'unavailable',
    responseTime?: number,
    errorRate?: number
  ): void {
    const health: ServiceHealth = {
      name: serviceName,
      status,
      lastCheck: new Date(),
      responseTime,
      errorRate,
      circuitState: serviceName === 'ai-service' ? this.aiServiceCircuitBreaker.getStats().state : undefined
    };

    this.serviceHealth.set(serviceName, health);

    logger.info(`Service health updated: ${serviceName}`, {
      status,
      responseTime,
      errorRate
    });
  }

  public getServiceHealth(serviceName: string): ServiceHealth {
    return this.serviceHealth.get(serviceName) || {
      name: serviceName,
      status: 'healthy',
      lastCheck: new Date()
    };
  }

  public getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.serviceHealth.values());
  }

  private startHealthMonitoring(): void {
    // Monitor AI service health every 30 seconds
    setInterval(async () => {
      await this.checkAIServiceHealth();
    }, 30000);

    // Monitor other services every minute
    setInterval(async () => {
      await this.checkDatabaseHealth();
      await this.checkStorageHealth();
    }, 60000);
  }

  private async checkAIServiceHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple health check - try to ping AI service
      const response = await fetch(`${process.env.AI_SERVICE_URL}/health`, {
        method: 'GET',
        timeout: 5000
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.updateServiceHealth('ai-service', 'healthy', responseTime);
      } else {
        this.updateServiceHealth('ai-service', 'degraded', responseTime);
      }
    } catch (error) {
      logger.error('AI service health check failed', {
        error: (error as Error).message
      });
      this.updateServiceHealth('ai-service', 'unavailable');
    }
  }

  private async checkDatabaseHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple database health check
      // This would typically use your database connection
      // For now, we'll simulate it
      const responseTime = Date.now() - startTime;
      this.updateServiceHealth('database', 'healthy', responseTime);
    } catch (error) {
      logger.error('Database health check failed', {
        error: (error as Error).message
      });
      this.updateServiceHealth('database', 'unavailable');
    }
  }

  private async checkStorageHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple storage health check
      // This would typically check your S3/MinIO connection
      const responseTime = Date.now() - startTime;
      this.updateServiceHealth('storage', 'healthy', responseTime);
    } catch (error) {
      logger.error('Storage health check failed', {
        error: (error as Error).message
      });
      this.updateServiceHealth('storage', 'unavailable');
    }
  }

  // Specific degradation methods for common scenarios
  public async performIntelligentSearch(query: string, filters?: any): Promise<any> {
    return await this.executeWithDegradation(
      'ai-search',
      async () => {
        // Primary: AI-powered search
        const response = await fetch(`${process.env.AI_SERVICE_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, filters })
        });

        if (!response.ok) {
          throw new Error(`AI search failed: ${response.statusText}`);
        }

        return await response.json();
      },
      'intelligent-search'
    );
  }

  public async trainModel(datasetId: string, config: any): Promise<any> {
    return await this.executeWithDegradation(
      'model-training',
      async () => {
        // Primary: Start training immediately
        const response = await fetch(`${process.env.AI_SERVICE_URL}/train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datasetId, config })
        });

        if (!response.ok) {
          throw new Error(`Model training failed: ${response.statusText}`);
        }

        return await response.json();
      },
      'model-training'
    );
  }

  public async extractFileMetadata(fileId: string): Promise<any> {
    return await this.executeWithDegradation(
      'file-processing',
      async () => {
        // Primary: AI-powered metadata extraction
        const response = await fetch(`${process.env.AI_SERVICE_URL}/extract-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId })
        });

        if (!response.ok) {
          throw new Error(`Metadata extraction failed: ${response.statusText}`);
        }

        return await response.json();
      },
      'metadata-extraction'
    );
  }
}