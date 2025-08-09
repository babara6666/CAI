import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ABTestService } from '../ABTestService.js';
import { ABTestModel } from '../../models/ABTest.js';
import { UserInteractionModel } from '../../models/UserInteraction.js';

// Mock the models
vi.mock('../../models/ABTest.js');
vi.mock('../../models/UserInteraction.js');

describe('ABTestService', () => {
  let abtestService: ABTestService;

  beforeEach(() => {
    abtestService = new ABTestService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTest', () => {
    it('should create A/B test successfully', async () => {
      const testData = {
        name: 'Search Algorithm Test',
        description: 'Testing new search algorithm',
        feature: 'search',
        variants: [
          {
            name: 'Control',
            description: 'Current algorithm',
            configuration: { algorithm: 'current' },
            trafficPercentage: 50
          },
          {
            name: 'New Algorithm',
            description: 'Improved algorithm',
            configuration: { algorithm: 'improved' },
            trafficPercentage: 50
          }
        ],
        trafficAllocation: 100,
        targetMetric: 'search_relevance',
        minimumSampleSize: 100,
        confidenceLevel: 95
      };

      const mockTest = {
        id: 'test-1',
        ...testData,
        status: 'draft',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(ABTestModel.create).mockResolvedValue(mockTest as any);

      const result = await abtestService.createTest(testData, 'user-1');

      expect(ABTestModel.create).toHaveBeenCalledWith({
        ...testData,
        createdBy: 'user-1'
      });

      expect(result).toEqual(mockTest);
    });

    it('should validate traffic percentages sum to 100', async () => {
      const testData = {
        name: 'Test',
        feature: 'search',
        variants: [
          { name: 'A', configuration: {}, trafficPercentage: 40 },
          { name: 'B', configuration: {}, trafficPercentage: 40 }
        ],
        trafficAllocation: 100,
        targetMetric: 'relevance',
        minimumSampleSize: 100,
        confidenceLevel: 95
      };

      await expect(
        abtestService.createTest(testData, 'user-1')
      ).rejects.toThrow('Variant traffic percentages must sum to 100%');
    });

    it('should require at least 2 variants', async () => {
      const testData = {
        name: 'Test',
        feature: 'search',
        variants: [
          { name: 'A', configuration: {}, trafficPercentage: 100 }
        ],
        trafficAllocation: 100,
        targetMetric: 'relevance',
        minimumSampleSize: 100,
        confidenceLevel: 95
      };

      await expect(
        abtestService.createTest(testData, 'user-1')
      ).rejects.toThrow('A/B test must have at least 2 variants');
    });
  });

  describe('startTest', () => {
    it('should start a draft test successfully', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'draft',
        feature: 'search',
        variants: [
          { id: 'variant-1', name: 'A', configuration: { algorithm: 'current' } },
          { id: 'variant-2', name: 'B', configuration: { algorithm: 'new' } }
        ]
      };

      const mockStartedTest = { ...mockTest, status: 'running' };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.startTest).mockResolvedValue(mockStartedTest as any);

      // Mock getActiveTestsForFeature to return empty array (no conflicts)
      const getActiveTestsSpy = vi.spyOn(abtestService, 'getActiveTestsForFeature')
        .mockResolvedValue([]);

      const result = await abtestService.startTest('test-1');

      expect(ABTestModel.findById).toHaveBeenCalledWith('test-1');
      expect(ABTestModel.startTest).toHaveBeenCalledWith('test-1');
      expect(result.status).toBe('running');
    });

    it('should not start test if another test is running for same feature', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'draft',
        feature: 'search',
        variants: [
          { id: 'variant-1', name: 'A', configuration: {} },
          { id: 'variant-2', name: 'B', configuration: {} }
        ]
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);

      // Mock getActiveTestsForFeature to return existing test
      const getActiveTestsSpy = vi.spyOn(abtestService, 'getActiveTestsForFeature')
        .mockResolvedValue([{ id: 'other-test', feature: 'search' } as any]);

      await expect(
        abtestService.startTest('test-1')
      ).rejects.toThrow('Another test is already running for feature: search');
    });

    it('should not start non-draft test', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running',
        feature: 'search',
        variants: []
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);

      await expect(
        abtestService.startTest('test-1')
      ).rejects.toThrow('Only draft tests can be started');
    });
  });

  describe('assignUserToTest', () => {
    it('should assign user to variant based on traffic allocation', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running',
        trafficAllocation: 100,
        variants: [
          {
            id: 'variant-1',
            name: 'Control',
            configuration: { algorithm: 'current' },
            trafficPercentage: 50
          },
          {
            id: 'variant-2',
            name: 'Treatment',
            configuration: { algorithm: 'new' },
            trafficPercentage: 50
          }
        ]
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.getUserVariant).mockResolvedValue(null);
      vi.mocked(ABTestModel.assignUserToVariant).mockResolvedValue('variant-1');
      vi.mocked(UserInteractionModel.create).mockResolvedValue({} as any);

      // Mock Math.random to return predictable values
      const mathRandomSpy = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // Include in test (50% < 100%)
        .mockReturnValueOnce(0.3); // Assign to first variant (30% < 50%)

      const result = await abtestService.assignUserToTest('test-1', 'user-1', 'session-1');

      expect(result).toEqual({
        testId: 'test-1',
        variantId: 'variant-1',
        variantName: 'Control',
        configuration: { algorithm: 'current' }
      });

      expect(ABTestModel.assignUserToVariant).toHaveBeenCalledWith({
        testId: 'test-1',
        userId: 'user-1',
        variantId: 'variant-1',
        assignedAt: expect.any(Date),
        sessionId: 'session-1'
      });

      mathRandomSpy.mockRestore();
    });

    it('should return existing assignment if user already assigned', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running',
        variants: [
          {
            id: 'variant-1',
            name: 'Control',
            configuration: { algorithm: 'current' }
          }
        ]
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.getUserVariant).mockResolvedValue('variant-1');

      const result = await abtestService.assignUserToTest('test-1', 'user-1');

      expect(result).toEqual({
        testId: 'test-1',
        variantId: 'variant-1',
        variantName: 'Control',
        configuration: { algorithm: 'current' }
      });

      expect(ABTestModel.assignUserToVariant).not.toHaveBeenCalled();
    });

    it('should return null for non-running test', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'completed',
        variants: []
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);

      const result = await abtestService.assignUserToTest('test-1', 'user-1');

      expect(result).toBeNull();
    });

    it('should exclude user based on traffic allocation', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running',
        trafficAllocation: 50,
        variants: []
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.getUserVariant).mockResolvedValue(null);

      // Mock Math.random to exclude user (80% > 50%)
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8);

      const result = await abtestService.assignUserToTest('test-1', 'user-1');

      expect(result).toBeNull();
      expect(ABTestModel.assignUserToVariant).not.toHaveBeenCalled();

      mathRandomSpy.mockRestore();
    });
  });

  describe('recordMetric', () => {
    it('should record metric for assigned user', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running'
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.getUserVariant).mockResolvedValue('variant-1');
      vi.mocked(ABTestModel.recordMetric).mockResolvedValue(undefined);
      vi.mocked(UserInteractionModel.create).mockResolvedValue({} as any);

      await abtestService.recordMetric('test-1', 'user-1', 'conversion', 1, { source: 'test' });

      expect(ABTestModel.recordMetric).toHaveBeenCalledWith({
        testId: 'test-1',
        variantId: 'variant-1',
        userId: 'user-1',
        metricName: 'conversion',
        metricValue: 1,
        timestamp: expect.any(Date),
        metadata: { source: 'test' }
      });

      expect(UserInteractionModel.create).toHaveBeenCalled();
    });

    it('should silently ignore metrics for non-running test', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'completed'
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);

      await abtestService.recordMetric('test-1', 'user-1', 'conversion', 1);

      expect(ABTestModel.recordMetric).not.toHaveBeenCalled();
    });

    it('should silently ignore metrics for unassigned user', async () => {
      const mockTest = {
        id: 'test-1',
        status: 'running'
      };

      vi.mocked(ABTestModel.findById).mockResolvedValue(mockTest as any);
      vi.mocked(ABTestModel.getUserVariant).mockResolvedValue(null);

      await abtestService.recordMetric('test-1', 'user-1', 'conversion', 1);

      expect(ABTestModel.recordMetric).not.toHaveBeenCalled();
    });
  });

  describe('getTestResults', () => {
    it('should get test results', async () => {
      const mockResults = {
        testId: 'test-1',
        testName: 'Search Test',
        status: 'completed',
        startDate: new Date(),
        endDate: new Date(),
        targetMetric: 'conversion',
        confidenceLevel: 95,
        variantResults: {
          'variant-1': {
            variantName: 'Control',
            participants: 100,
            metrics: {
              conversion: {
                sampleSize: 100,
                mean: 0.15,
                stddev: 0.05,
                minValue: 0,
                maxValue: 1
              }
            }
          }
        },
        statisticalSignificance: {
          pValue: 0.03,
          confidenceInterval: { lower: -0.1, upper: 0.1 },
          effectSize: 0.2
        },
        totalParticipants: 100,
        isSignificant: true
      };

      vi.mocked(ABTestModel.getTestResults).mockResolvedValue(mockResults as any);

      const result = await abtestService.getTestResults('test-1');

      expect(ABTestModel.getTestResults).toHaveBeenCalledWith('test-1');
      expect(result).toEqual(mockResults);
    });
  });

  describe('getTestPerformanceSummary', () => {
    it('should get test performance summary', async () => {
      const mockResults = {
        testId: 'test-1',
        testName: 'Search Test',
        status: 'running',
        targetMetric: 'conversion',
        variantResults: {
          'variant-1': {
            variantName: 'Control',
            participants: 50,
            metrics: {
              conversion: { sampleSize: 10, mean: 0.2 }
            }
          },
          'variant-2': {
            variantName: 'Treatment',
            participants: 50,
            metrics: {
              conversion: { sampleSize: 15, mean: 0.3 }
            }
          }
        },
        totalParticipants: 100,
        isSignificant: false
      };

      const getTestResultsSpy = vi.spyOn(abtestService, 'getTestResults')
        .mockResolvedValue(mockResults as any);

      const result = await abtestService.getTestPerformanceSummary('test-1');

      expect(result).toEqual({
        totalParticipants: 100,
        metricsCollected: 25, // 10 + 15
        conversionRate: 25, // (10 + 15) / 100 * 100
        topPerformingVariant: 'Treatment',
        statisticalSignificance: false
      });

      expect(getTestResultsSpy).toHaveBeenCalledWith('test-1');
    });
  });

  describe('autoStopSignificantTests', () => {
    it('should auto-stop tests that meet criteria', async () => {
      const mockTests = [
        {
          id: 'test-1',
          name: 'Test 1',
          minimumSampleSize: 100,
          startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
        },
        {
          id: 'test-2',
          name: 'Test 2',
          minimumSampleSize: 100,
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
        }
      ];

      vi.mocked(ABTestModel.findAll).mockResolvedValue({ tests: mockTests } as any);

      const getTestResultsSpy = vi.spyOn(abtestService, 'getTestResults')
        .mockResolvedValueOnce({
          totalParticipants: 150,
          isSignificant: true
        } as any)
        .mockResolvedValueOnce({
          totalParticipants: 80,
          isSignificant: true
        } as any);

      const stopTestSpy = vi.spyOn(abtestService, 'stopTest')
        .mockResolvedValue({} as any);

      const result = await abtestService.autoStopSignificantTests();

      expect(result).toEqual(['test-1']); // Only test-1 should be stopped (running > 7 days)
      expect(stopTestSpy).toHaveBeenCalledTimes(1);
      expect(stopTestSpy).toHaveBeenCalledWith('test-1');
    });

    it('should not stop tests with insufficient data', async () => {
      const mockTests = [
        {
          id: 'test-1',
          name: 'Test 1',
          minimumSampleSize: 100,
          startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        }
      ];

      vi.mocked(ABTestModel.findAll).mockResolvedValue({ tests: mockTests } as any);

      const getTestResultsSpy = vi.spyOn(abtestService, 'getTestResults')
        .mockResolvedValue({
          totalParticipants: 50, // Below minimum
          isSignificant: true
        } as any);

      const stopTestSpy = vi.spyOn(abtestService, 'stopTest');

      const result = await abtestService.autoStopSignificantTests();

      expect(result).toEqual([]);
      expect(stopTestSpy).not.toHaveBeenCalled();
    });
  });
});