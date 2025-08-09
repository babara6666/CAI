import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryMechanism, RetryError, retry, RetryConfigs } from '../../utils/retryMechanism';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe('RetryMechanism', () => {
  let retryMechanism: RetryMechanism;

  beforeEach(() => {
    retryMechanism = new RetryMechanism({
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false
    });
  });

  describe('Successful Operations', () => {
    it('should execute successful operation on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryMechanism.execute(operation, 'test-operation');
      
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should execute successful operation after retries', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');
      
      const result = await retryMechanism.execute(operation, 'test-operation');
      
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Failed Operations', () => {
    it('should throw RetryError after exhausting all attempts', async () => {
      const error = new Error('Persistent error');
      const operation = vi.fn().mockRejectedValue(error);
      
      try {
        await retryMechanism.execute(operation, 'test-operation');
        expect.fail('Should have thrown RetryError');
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(RetryError);
        expect((thrownError as RetryError).attempts).toBe(3);
        expect((thrownError as RetryError).lastError).toBe(error);
        expect((thrownError as RetryError).allErrors).toHaveLength(3);
        expect(operation).toHaveBeenCalledTimes(3);
      }
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('Validation error');
      nonRetryableError.name = 'ValidationError';
      const operation = vi.fn().mockRejectedValue(nonRetryableError);
      
      try {
        await retryMechanism.execute(operation, 'test-operation');
        expect.fail('Should have thrown the original error');
      } catch (thrownError) {
        expect(thrownError).toBe(nonRetryableError);
        expect(operation).toHaveBeenCalledTimes(1);
      }
    });

    it('should retry retryable errors by name', async () => {
      const retryableError = new Error('Connection reset');
      retryableError.name = 'ECONNRESET';
      const operation = vi.fn().mockRejectedValue(retryableError);
      
      try {
        await retryMechanism.execute(operation, 'test-operation');
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(RetryError);
        expect(operation).toHaveBeenCalledTimes(3);
      }
    });

    it('should retry retryable errors by message pattern', async () => {
      const networkError = new Error('Network connection failed');
      const operation = vi.fn().mockRejectedValue(networkError);
      
      try {
        await retryMechanism.execute(operation, 'test-operation');
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(RetryError);
        expect(operation).toHaveBeenCalledTimes(3);
      }
    });
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff delays', async () => {
      const retryMechanismWithDelay = new RetryMechanism({
        maxAttempts: 4,
        baseDelay: 100,
        backoffMultiplier: 2,
        jitter: false
      });

      const operation = vi.fn().mockRejectedValue(new Error('Network error'));
      const startTime = Date.now();
      
      try {
        await retryMechanismWithDelay.execute(operation, 'test-operation');
      } catch (error) {
        // Expected to fail
      }
      
      const totalTime = Date.now() - startTime;
      // Should have delays of approximately 100ms, 200ms, 400ms
      // Total should be at least 700ms (100 + 200 + 400)
      expect(totalTime).toBeGreaterThan(600);
    });

    it('should respect maximum delay limit', () => {
      const retryMechanismWithMaxDelay = new RetryMechanism({
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 3,
        jitter: false
      });

      // Calculate delay for attempt 4 (should be capped at maxDelay)
      const delay = retryMechanismWithMaxDelay['calculateDelay'](4);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should apply jitter when enabled', () => {
      const retryMechanismWithJitter = new RetryMechanism({
        baseDelay: 1000,
        jitter: true
      });

      const delay1 = retryMechanismWithJitter['calculateDelay'](1);
      const delay2 = retryMechanismWithJitter['calculateDelay'](1);
      
      // With jitter, delays should vary
      expect(delay1).toBeGreaterThanOrEqual(500);
      expect(delay1).toBeLessThanOrEqual(1000);
      expect(delay2).toBeGreaterThanOrEqual(500);
      expect(delay2).toBeLessThanOrEqual(1000);
    });
  });

  describe('Retry Callback', () => {
    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const retryMechanismWithCallback = new RetryMechanism({
        maxAttempts: 3,
        baseDelay: 10,
        onRetry
      });

      const error = new Error('Network error');
      const operation = vi.fn().mockRejectedValue(error);
      
      try {
        await retryMechanismWithCallback.execute(operation, 'test-operation');
      } catch (thrownError) {
        // Expected to fail
      }
      
      expect(onRetry).toHaveBeenCalledTimes(2); // Called before retry attempts 2 and 3
      expect(onRetry).toHaveBeenCalledWith(1, error);
      expect(onRetry).toHaveBeenCalledWith(2, error);
    });
  });
});

describe('retry convenience function', () => {
  it('should work with default options', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    
    const result = await retry(operation, undefined, 'test-operation');
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should work with custom options', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');
    
    const result = await retry(operation, { maxAttempts: 2, baseDelay: 10 }, 'test-operation');
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('RetryConfigs', () => {
  it('should have predefined configurations', () => {
    expect(RetryConfigs.FAST).toBeDefined();
    expect(RetryConfigs.STANDARD).toBeDefined();
    expect(RetryConfigs.PATIENT).toBeDefined();
    expect(RetryConfigs.CRITICAL).toBeDefined();

    expect(RetryConfigs.FAST.maxAttempts).toBe(3);
    expect(RetryConfigs.STANDARD.maxAttempts).toBe(3);
    expect(RetryConfigs.PATIENT.maxAttempts).toBe(5);
    expect(RetryConfigs.CRITICAL.maxAttempts).toBe(10);
  });

  it('should work with predefined configurations', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');
    
    const result = await retry(operation, RetryConfigs.FAST, 'test-operation');
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});