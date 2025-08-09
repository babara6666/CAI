import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GracefulDegradationService } from '../../services/GracefulDegradationService';

// Mock dependencies
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../utils/circuitBreaker', () => ({
  createCircuitBreaker: vi.fn(() => ({
    execute: vi.fn(),
    getStats: vi.fn(() => ({ state: 'CLOSED' }))
  })),
  CircuitState: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
  }
}));

vi.mock('../../utils/retryMechanism', () => ({
  retry: vi.fn(),
  RetryConfigs: {
    FAST: { maxAttempts: 3 },
    STANDARD: { maxAttempts: 3 }
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('GracefulDegradationService', () => {
  let service: GracefulDegradationService;

  beforeEach(() => {
    service = GracefulDegradationService.getInstance();
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const service1 = GracefulDegradationService.getInstance();
      const service2 = GracefulDegradationService.getInstance();
      expect(service1).toBe(service2);
    });
  });

  describe('Service Health Management', () => {
    it('should update service health', () => {
      service.updateServiceHealth('test-service', 'healthy', 100, 0.1);
      
      const health = service.getServiceHealth('test-service');
      expect(health.name).toBe('test-service');
      expect(health.status).toBe('healthy');
      expect(health.responseTime).toBe(100);
      expect(health.errorRate).toBe(0.1);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should return default health for unknown service', () => {
      const health = service.getServiceHealth('unknown-service');
      expect(health.name).toBe('unknown-service');
      expect(health.status).toBe('healthy');
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should get all service health', () => {
      service.updateServiceHealth('service1', 'healthy');
      service.updateServiceHealth('service2', 'degraded');
      
      const allHealth = service.getAllServiceHealth();
      expect(allHealth).toHaveLength(2);
      expect(allHealth.find(h => h.name === 'service1')?.status).toBe('healthy');
      expect(allHealth.find(h => h.name === 'service2')?.status).toBe('degraded');
    });
  });

  describe('Degradation Strategies', () => {
    it('should add degradation strategy', () => {
      const strategy = {
        name: 'test-strategy',
        condition: (health: any) => health.status === 'unavailable',
        fallbackAction: vi.fn().mockResolvedValue('fallback-result'),
        description: 'Test strategy'
      };

      service.addDegradationStrategy('test-service', strategy);
      
      // Verify strategy was added by checking if it gets executed
      service.updateServiceHealth('test-service', 'unavailable');
      
      expect(service['degradationStrategies'].get('test-service')).toContainEqual(strategy);
    });
  });

  describe('Execute with Degradation', () => {
    it('should execute primary operation when service is healthy', async () => {
      const primaryOperation = vi.fn().mockResolvedValue('primary-result');
      service.updateServiceHealth('test-service', 'healthy');
      
      const result = await service.executeWithDegradation(
        'test-service',
        primaryOperation,
        'test-operation'
      );
      
      expect(result).toBe('primary-result');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
    });

    it('should execute fallback when service is unavailable', async () => {
      const primaryOperation = vi.fn().mockResolvedValue('primary-result');
      service.updateServiceHealth('test-service', 'unavailable');
      
      // Add a fallback strategy
      service.addDegradationStrategy('test-service', {
        name: 'fallback-strategy',
        condition: (health) => health.status === 'unavailable',
        fallbackAction: vi.fn().mockResolvedValue('fallback-result'),
        description: 'Fallback strategy'
      });
      
      const result = await service.executeWithDegradation(
        'test-service',
        primaryOperation,
        'test-operation'
      );
      
      expect(result).toBe('fallback-result');
      expect(primaryOperation).not.toHaveBeenCalled();
    });

    it('should execute fallback when primary operation fails', async () => {
      const primaryOperation = vi.fn().mockRejectedValue(new Error('Primary failed'));
      service.updateServiceHealth('test-service', 'healthy');
      
      // Add a fallback strategy
      service.addDegradationStrategy('test-service', {
        name: 'fallback-strategy',
        condition: (health) => health.status === 'degraded',
        fallbackAction: vi.fn().mockResolvedValue('fallback-result'),
        description: 'Fallback strategy'
      });
      
      const result = await service.executeWithDegradation(
        'test-service',
        primaryOperation,
        'test-operation'
      );
      
      expect(result).toBe('fallback-result');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw error when all fallback strategies fail', async () => {
      const primaryOperation = vi.fn().mockRejectedValue(new Error('Primary failed'));
      service.updateServiceHealth('test-service', 'healthy');
      
      // Add a failing fallback strategy
      service.addDegradationStrategy('test-service', {
        name: 'failing-fallback',
        condition: (health) => health.status === 'degraded',
        fallbackAction: vi.fn().mockRejectedValue(new Error('Fallback failed')),
        description: 'Failing fallback strategy'
      });
      
      try {
        await service.executeWithDegradation(
          'test-service',
          primaryOperation,
          'test-operation'
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toContain('All fallback strategies failed');
      }
    });
  });

  describe('Specific Degradation Methods', () => {
    beforeEach(() => {
      process.env.AI_SERVICE_URL = 'http://localhost:8000';
    });

    describe('performIntelligentSearch', () => {
      it('should perform AI search when service is healthy', async () => {
        const mockResponse = { results: ['result1', 'result2'] };
        (global.fetch as any).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse)
        });
        
        const result = await service.performIntelligentSearch('test query');
        
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/search',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'test query', filters: undefined })
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('should fall back to keyword search when AI service fails', async () => {
        (global.fetch as any).mockResolvedValue({
          ok: false,
          statusText: 'Service Unavailable'
        });
        
        const result = await service.performIntelligentSearch('test query');
        
        expect(result).toBe('keyword-search');
      });
    });

    describe('trainModel', () => {
      it('should start training when service is healthy', async () => {
        const mockResponse = { jobId: 'job123', status: 'started' };
        (global.fetch as any).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse)
        });
        
        const result = await service.trainModel('dataset123', { epochs: 10 });
        
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/train',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datasetId: 'dataset123', config: { epochs: 10 } })
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('should queue training job when AI service fails', async () => {
        (global.fetch as any).mockResolvedValue({
          ok: false,
          statusText: 'Service Unavailable'
        });
        
        const result = await service.trainModel('dataset123', { epochs: 10 });
        
        expect(result).toBe('queued');
      });
    });

    describe('extractFileMetadata', () => {
      it('should extract metadata when service is healthy', async () => {
        const mockResponse = { metadata: { dimensions: '100x200' } };
        (global.fetch as any).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse)
        });
        
        const result = await service.extractFileMetadata('file123');
        
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/extract-metadata',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: 'file123' })
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('should use basic metadata when AI service fails', async () => {
        (global.fetch as any).mockResolvedValue({
          ok: false,
          statusText: 'Service Unavailable'
        });
        
        const result = await service.extractFileMetadata('file123');
        
        expect(result).toBe('basic-metadata-only');
      });
    });
  });
});