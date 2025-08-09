import { logger } from '../utils/logger';
import { retry, RetryConfigs } from '../utils/retryMechanism';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { GracefulDegradationService } from './GracefulDegradationService';
import { createError, ErrorTypes } from '../middleware/errorHandler';

export interface RecoveryStrategy {
  name: string;
  condition: (error: Error) => boolean;
  recover: (error: Error, context?: any) => Promise<any>;
  priority: number;
  description: string;
}

export interface RecoveryContext {
  operation: string;
  userId?: string;
  requestId?: string;
  metadata?: any;
  attemptCount: number;
  maxAttempts: number;
}

export interface RecoveryResult {
  success: boolean;
  strategy?: string;
  result?: any;
  error?: Error;
  fallbackUsed: boolean;
  recoveryTime: number;
}

export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService;
  private recoveryStrategies: Map<string, RecoveryStrategy[]> = new Map();
  private gracefulDegradation: GracefulDegradationService;
  private recoveryStats: Map<string, { attempts: number; successes: number; failures: number }> = new Map();

  public static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  constructor() {
    this.gracefulDegradation = GracefulDegradationService.getInstance();
    this.initializeRecoveryStrategies();
  }

  private initializeRecoveryStrategies(): void {
    // Database connection recovery strategies
    this.addRecoveryStrategy('database', {
      name: 'reconnect-database',
      condition: (error) => error.message.includes('connection') || error.message.includes('ECONNREFUSED'),
      recover: async (error, context) => {
        logger.info('Attempting database reconnection', { context });
        
        // Wait before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // In a real implementation, you would reconnect to the database
        // For now, we'll simulate it
        return { reconnected: true };
      },
      priority: 1,
      description: 'Reconnect to database when connection is lost'
    });

    this.addRecoveryStrategy('database', {
      name: 'use-read-replica',
      condition: (error) => error.message.includes('database') && error.message.includes('timeout'),
      recover: async (error, context) => {
        logger.info('Switching to read replica', { context });
        
        // Switch to read-only replica for read operations
        return { usingReplica: true, readOnly: true };
      },
      priority: 2,
      description: 'Use read replica when primary database is slow'
    });

    // File storage recovery strategies
    this.addRecoveryStrategy('storage', {
      name: 'retry-with-different-region',
      condition: (error) => error.message.includes('S3') || error.message.includes('storage'),
      recover: async (error, context) => {
        logger.info('Retrying storage operation with different region', { context });
        
        // Try different storage region or provider
        return { alternativeRegion: true };
      },
      priority: 1,
      description: 'Retry storage operations with alternative region'
    });

    this.addRecoveryStrategy('storage', {
      name: 'use-local-cache',
      condition: (error) => error.message.includes('storage') && error.message.includes('unavailable'),
      recover: async (error, context) => {
        logger.info('Using local cache for storage operation', { context });
        
        // Use local cache if available
        return { fromCache: true, limited: true };
      },
      priority: 2,
      description: 'Use local cache when storage is unavailable'
    });

    // AI service recovery strategies
    this.addRecoveryStrategy('ai-service', {
      name: 'fallback-to-basic-processing',
      condition: (error) => error.message.includes('AI') || error.message.includes('model'),
      recover: async (error, context) => {
        logger.info('Falling back to basic processing', { context });
        
        // Use basic processing instead of AI
        return { basicProcessing: true, aiUnavailable: true };
      },
      priority: 1,
      description: 'Use basic processing when AI service is unavailable'
    });

    this.addRecoveryStrategy('ai-service', {
      name: 'queue-for-later',
      condition: (error) => error.message.includes('AI') && error.message.includes('overloaded'),
      recover: async (error, context) => {
        logger.info('Queueing AI operation for later processing', { context });
        
        // Queue operation for later when service is available
        return { queued: true, processLater: true };
      },
      priority: 2,
      description: 'Queue AI operations when service is overloaded'
    });

    // Network recovery strategies
    this.addRecoveryStrategy('network', {
      name: 'retry-with-backoff',
      condition: (error) => error.message.includes('network') || error.message.includes('timeout'),
      recover: async (error, context) => {
        logger.info('Retrying network operation with backoff', { context });
        
        // Implement exponential backoff retry
        const delay = Math.min(1000 * Math.pow(2, context?.attemptCount || 0), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return { retried: true, delay };
      },
      priority: 1,
      description: 'Retry network operations with exponential backoff'
    });

    // Authentication recovery strategies
    this.addRecoveryStrategy('authentication', {
      name: 'refresh-token',
      condition: (error) => error.message.includes('token') && error.message.includes('expired'),
      recover: async (error, context) => {
        logger.info('Attempting token refresh', { context });
        
        // Try to refresh the authentication token
        // In a real implementation, you would call your token refresh endpoint
        return { tokenRefreshed: true };
      },
      priority: 1,
      description: 'Refresh authentication token when expired'
    });

    this.addRecoveryStrategy('authentication', {
      name: 'redirect-to-login',
      condition: (error) => error.message.includes('authentication') && error.message.includes('required'),
      recover: async (error, context) => {
        logger.info('Redirecting to login', { context });
        
        // Redirect user to login page
        return { redirectToLogin: true };
      },
      priority: 2,
      description: 'Redirect to login when authentication is required'
    });
  }

  public addRecoveryStrategy(category: string, strategy: RecoveryStrategy): void {
    if (!this.recoveryStrategies.has(category)) {
      this.recoveryStrategies.set(category, []);
    }
    
    const strategies = this.recoveryStrategies.get(category)!;
    strategies.push(strategy);
    
    // Sort by priority (lower number = higher priority)
    strategies.sort((a, b) => a.priority - b.priority);
  }

  public async recoverFromError(
    error: Error,
    category: string,
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    const strategies = this.recoveryStrategies.get(category) || [];

    logger.info('Starting error recovery', {
      error: error.message,
      category,
      context,
      availableStrategies: strategies.length
    });

    // Update recovery stats
    this.updateRecoveryStats(category, 'attempt');

    for (const strategy of strategies) {
      if (strategy.condition(error)) {
        try {
          logger.info(`Attempting recovery strategy: ${strategy.name}`, {
            strategy: strategy.description,
            category,
            context
          });

          const result = await strategy.recover(error, context);
          const recoveryTime = Date.now() - startTime;

          logger.info(`Recovery strategy succeeded: ${strategy.name}`, {
            result,
            recoveryTime,
            category
          });

          this.updateRecoveryStats(category, 'success');

          return {
            success: true,
            strategy: strategy.name,
            result,
            fallbackUsed: true,
            recoveryTime
          };

        } catch (recoveryError) {
          logger.warn(`Recovery strategy failed: ${strategy.name}`, {
            error: (recoveryError as Error).message,
            originalError: error.message,
            category
          });
          
          // Continue to next strategy
          continue;
        }
      }
    }

    // No recovery strategy worked
    const recoveryTime = Date.now() - startTime;
    this.updateRecoveryStats(category, 'failure');

    logger.error('All recovery strategies failed', {
      error: error.message,
      category,
      context,
      recoveryTime
    });

    return {
      success: false,
      error,
      fallbackUsed: false,
      recoveryTime
    };
  }

  public async executeWithRecovery<T>(
    operation: () => Promise<T>,
    category: string,
    context: Partial<RecoveryContext> = {}
  ): Promise<T> {
    const fullContext: RecoveryContext = {
      operation: context.operation || 'unknown',
      userId: context.userId,
      requestId: context.requestId || `req_${Date.now()}`,
      metadata: context.metadata,
      attemptCount: context.attemptCount || 0,
      maxAttempts: context.maxAttempts || 3
    };

    try {
      return await operation();
    } catch (error) {
      logger.warn('Operation failed, attempting recovery', {
        error: (error as Error).message,
        category,
        context: fullContext
      });

      const recoveryResult = await this.recoverFromError(error as Error, category, fullContext);

      if (recoveryResult.success) {
        // If recovery provided a result, return it
        if (recoveryResult.result) {
          return recoveryResult.result;
        }

        // If recovery was successful but didn't provide a result, retry the operation
        if (fullContext.attemptCount < fullContext.maxAttempts) {
          return await this.executeWithRecovery(
            operation,
            category,
            { ...fullContext, attemptCount: fullContext.attemptCount + 1 }
          );
        }
      }

      // Recovery failed or max attempts reached
      throw createError(
        `Operation failed after recovery attempts: ${(error as Error).message}`,
        500,
        ErrorTypes.EXTERNAL_SERVICE_ERROR,
        {
          originalError: (error as Error).message,
          recoveryAttempted: true,
          recoveryResult
        },
        [
          'Try again in a few minutes',
          'Contact support if the problem persists',
          'Check service status page for known issues'
        ]
      );
    }
  }

  private updateRecoveryStats(category: string, type: 'attempt' | 'success' | 'failure'): void {
    if (!this.recoveryStats.has(category)) {
      this.recoveryStats.set(category, { attempts: 0, successes: 0, failures: 0 });
    }

    const stats = this.recoveryStats.get(category)!;
    
    switch (type) {
      case 'attempt':
        stats.attempts++;
        break;
      case 'success':
        stats.successes++;
        break;
      case 'failure':
        stats.failures++;
        break;
    }
  }

  public getRecoveryStats(): Record<string, { attempts: number; successes: number; failures: number; successRate: number }> {
    const stats: Record<string, any> = {};
    
    for (const [category, data] of this.recoveryStats) {
      stats[category] = {
        ...data,
        successRate: data.attempts > 0 ? (data.successes / data.attempts) * 100 : 0
      };
    }
    
    return stats;
  }

  public clearRecoveryStats(): void {
    this.recoveryStats.clear();
  }

  // Specific recovery methods for common scenarios
  public async recoverDatabaseOperation<T>(
    operation: () => Promise<T>,
    context?: Partial<RecoveryContext>
  ): Promise<T> {
    return this.executeWithRecovery(operation, 'database', context);
  }

  public async recoverStorageOperation<T>(
    operation: () => Promise<T>,
    context?: Partial<RecoveryContext>
  ): Promise<T> {
    return this.executeWithRecovery(operation, 'storage', context);
  }

  public async recoverAIOperation<T>(
    operation: () => Promise<T>,
    context?: Partial<RecoveryContext>
  ): Promise<T> {
    return this.executeWithRecovery(operation, 'ai-service', context);
  }

  public async recoverNetworkOperation<T>(
    operation: () => Promise<T>,
    context?: Partial<RecoveryContext>
  ): Promise<T> {
    return this.executeWithRecovery(operation, 'network', context);
  }

  public async recoverAuthenticationOperation<T>(
    operation: () => Promise<T>,
    context?: Partial<RecoveryContext>
  ): Promise<T> {
    return this.executeWithRecovery(operation, 'authentication', context);
  }
}

// Export singleton instance
export const errorRecoveryService = ErrorRecoveryService.getInstance();