import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitState, CircuitBreakerRegistry } from '../../utils/circuitBreaker';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    it('should execute successful operations and update stats', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should reset circuit breaker from HALF_OPEN to CLOSED on success', async () => {
      // Force circuit to HALF_OPEN state
      circuitBreaker['state'] = CircuitState.HALF_OPEN;
      
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('Failed Operations', () => {
    it('should handle failures and update failure count', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        expect((error as Error).message).toBe('Operation failed');
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should trip to OPEN state after reaching failure threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Execute 3 failed operations to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failureCount).toBe(3);
      expect(stats.nextAttemptTime).toBeDefined();
    });

    it('should not count expected errors as failures', async () => {
      const circuitBreakerWithExpectedErrors = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        expectedErrors: ['ValidationError']
      });
      
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      const operation = vi.fn().mockRejectedValue(validationError);
      
      try {
        await circuitBreakerWithExpectedErrors.execute(operation);
      } catch (error) {
        // Expected to fail
      }
      
      const stats = circuitBreakerWithExpectedErrors.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
    });

    it('should reject operations immediately when OPEN', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      try {
        await circuitBreaker.execute(operation);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toContain('Circuit breaker test-service is OPEN');
        expect(operation).not.toHaveBeenCalled();
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual force open', () => {
      circuitBreaker.forceOpen();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttemptTime).toBeDefined();
    });

    it('should allow manual force close', () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClose();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.nextAttemptTime).toBeUndefined();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = CircuitBreakerRegistry.getInstance();
  });

  it('should be a singleton', () => {
    const registry1 = CircuitBreakerRegistry.getInstance();
    const registry2 = CircuitBreakerRegistry.getInstance();
    expect(registry1).toBe(registry2);
  });

  it('should create and retrieve circuit breakers', () => {
    const breaker1 = registry.getOrCreate('service1');
    const breaker2 = registry.getOrCreate('service1');
    const breaker3 = registry.getOrCreate('service2');

    expect(breaker1).toBe(breaker2);
    expect(breaker1).not.toBe(breaker3);
  });

  it('should get circuit breaker by name', () => {
    const breaker = registry.getOrCreate('service1');
    const retrieved = registry.get('service1');
    
    expect(retrieved).toBe(breaker);
  });

  it('should return undefined for non-existent circuit breaker', () => {
    const retrieved = registry.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should get all stats', () => {
    registry.getOrCreate('service1');
    registry.getOrCreate('service2');
    
    const allStats = registry.getAllStats();
    
    expect(Object.keys(allStats)).toContain('service1');
    expect(Object.keys(allStats)).toContain('service2');
    expect(allStats.service1.state).toBe(CircuitState.CLOSED);
    expect(allStats.service2.state).toBe(CircuitState.CLOSED);
  });

  it('should reset circuit breaker by name', () => {
    const breaker = registry.getOrCreate('service1');
    breaker.forceOpen();
    
    const resetResult = registry.reset('service1');
    
    expect(resetResult).toBe(true);
    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('should return false when resetting non-existent circuit breaker', () => {
    const resetResult = registry.reset('non-existent');
    expect(resetResult).toBe(false);
  });
});