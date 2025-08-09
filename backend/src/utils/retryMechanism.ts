import { logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
}

export class RetryError extends Error {
  public attempts: number;
  public lastError: Error;
  public allErrors: Error[];

  constructor(message: string, attempts: number, lastError: Error, allErrors: Error[]) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
    this.allErrors = allErrors;
  }
}

export class RetryMechanism {
  private readonly options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = {
      maxAttempts: options.maxAttempts || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2,
      jitter: options.jitter !== false,
      retryableErrors: options.retryableErrors || [
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'NETWORK_ERROR',
        'SERVICE_UNAVAILABLE'
      ],
      onRetry: options.onRetry
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const errors: Error[] = [];
    let lastError: Error;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        const totalTime = Date.now() - startTime;

        if (attempt > 1) {
          logger.info(`${operationName} succeeded after ${attempt} attempts`, {
            attempts: attempt,
            totalTime
          });
        }

        return {
          result,
          attempts: attempt,
          totalTime
        };
      } catch (error) {
        lastError = error as Error;
        errors.push(lastError);

        logger.warn(`${operationName} failed on attempt ${attempt}`, {
          error: lastError.message,
          attempt,
          maxAttempts: this.options.maxAttempts
        });

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          logger.error(`${operationName} failed with non-retryable error`, {
            error: lastError.message,
            errorType: lastError.name
          });
          throw lastError;
        }

        // Don't delay after the last attempt
        if (attempt < this.options.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          
          if (this.options.onRetry) {
            this.options.onRetry(attempt, lastError);
          }

          logger.info(`Retrying ${operationName} in ${delay}ms`, {
            attempt,
            nextAttempt: attempt + 1,
            delay
          });

          await this.sleep(delay);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const retryError = new RetryError(
      `${operationName} failed after ${this.options.maxAttempts} attempts`,
      this.options.maxAttempts,
      lastError!,
      errors
    );

    logger.error(`${operationName} exhausted all retry attempts`, {
      maxAttempts: this.options.maxAttempts,
      totalTime,
      errors: errors.map(e => e.message)
    });

    throw retryError;
  }

  private isRetryableError(error: Error): boolean {
    // Check error name/type
    if (this.options.retryableErrors?.includes(error.name)) {
      return true;
    }

    // Check error message for common patterns
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /unavailable/i,
      /temporary/i,
      /rate limit/i,
      /too many requests/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private calculateDelay(attempt: number): number {
    let delay = this.options.baseDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.options.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Convenience function for simple retry operations
export const retry = async <T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>,
  operationName?: string
): Promise<T> => {
  const retryMechanism = new RetryMechanism(options);
  const result = await retryMechanism.execute(operation, operationName);
  return result.result;
};

// Predefined retry configurations
export const RetryConfigs = {
  // Quick operations with fast retry
  FAST: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5
  },
  
  // Standard operations
  STANDARD: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },
  
  // Long-running operations with patient retry
  PATIENT: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  
  // Critical operations with aggressive retry
  CRITICAL: {
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 1.8,
    jitter: true
  }
};