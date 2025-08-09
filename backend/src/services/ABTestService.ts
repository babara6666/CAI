import { ABTestModel } from '../models/ABTest.js';
import { UserInteractionModel } from '../models/UserInteraction.js';
import { 
  ABTest, 
  ABTestVariant, 
  ABTestResult, 
  ABTestStatus,
  Pagination,
  QueryOptions 
} from '../types/index.js';

export interface CreateABTestRequest {
  name: string;
  description?: string;
  feature: string;
  variants: Array<{
    name: string;
    description?: string;
    configuration: Record<string, any>;
    trafficPercentage: number;
  }>;
  trafficAllocation: number;
  startDate?: Date;
  endDate?: Date;
  targetMetric: string;
  minimumSampleSize: number;
  confidenceLevel: number;
}

export interface ABTestAssignment {
  testId: string;
  variantId: string;
  variantName: string;
  configuration: Record<string, any>;
}

export interface ABTestFilters {
  status?: ABTestStatus;
  feature?: string;
  createdBy?: string;
  dateRange?: { startDate: Date; endDate: Date };
}

export class ABTestService {
  /**
   * Create a new A/B test
   */
  async createTest(testData: CreateABTestRequest, createdBy: string): Promise<ABTest> {
    try {
      // Validate traffic allocation
      const totalTraffic = testData.variants.reduce((sum, variant) => sum + variant.trafficPercentage, 0);
      if (Math.abs(totalTraffic - 100) > 0.01) {
        throw new Error('Variant traffic percentages must sum to 100%');
      }

      if (testData.trafficAllocation < 0 || testData.trafficAllocation > 100) {
        throw new Error('Traffic allocation must be between 0 and 100');
      }

      if (testData.variants.length < 2) {
        throw new Error('A/B test must have at least 2 variants');
      }

      if (testData.confidenceLevel <= 0 || testData.confidenceLevel >= 100) {
        throw new Error('Confidence level must be between 0 and 100');
      }

      return await ABTestModel.create({
        ...testData,
        createdBy
      });
    } catch (error) {
      console.error('Failed to create A/B test:', error);
      throw new Error(`Failed to create A/B test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get A/B test by ID
   */
  async getTest(testId: string): Promise<ABTest | null> {
    try {
      return await ABTestModel.findById(testId);
    } catch (error) {
      console.error('Failed to get A/B test:', error);
      throw new Error('Failed to get A/B test');
    }
  }

  /**
   * Get all A/B tests with filtering
   */
  async getTests(
    filters: ABTestFilters = {},
    options: QueryOptions = {}
  ): Promise<{ tests: ABTest[]; pagination: Pagination }> {
    try {
      return await ABTestModel.findAll(filters, options);
    } catch (error) {
      console.error('Failed to get A/B tests:', error);
      throw new Error('Failed to get A/B tests');
    }
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<ABTest> {
    try {
      const test = await ABTestModel.findById(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (test.status !== 'draft') {
        throw new Error('Only draft tests can be started');
      }

      // Validate test configuration before starting
      await this.validateTestConfiguration(test);

      return await ABTestModel.startTest(testId);
    } catch (error) {
      console.error('Failed to start A/B test:', error);
      throw new Error(`Failed to start A/B test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop an A/B test
   */
  async stopTest(testId: string): Promise<ABTest> {
    try {
      const test = await ABTestModel.findById(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (test.status !== 'running') {
        throw new Error('Only running tests can be stopped');
      }

      return await ABTestModel.stopTest(testId);
    } catch (error) {
      console.error('Failed to stop A/B test:', error);
      throw new Error(`Failed to stop A/B test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assign user to A/B test variant
   */
  async assignUserToTest(testId: string, userId: string, sessionId?: string): Promise<ABTestAssignment | null> {
    try {
      const test = await ABTestModel.findById(testId);
      if (!test || test.status !== 'running') {
        return null;
      }

      // Check if user is already assigned
      const existingVariant = await ABTestModel.getUserVariant(testId, userId);
      if (existingVariant) {
        const variant = test.variants.find(v => v.id === existingVariant);
        if (variant) {
          return {
            testId: test.id,
            variantId: variant.id,
            variantName: variant.name,
            configuration: variant.configuration
          };
        }
      }

      // Determine if user should be included in test based on traffic allocation
      const random = Math.random() * 100;
      if (random > test.trafficAllocation) {
        return null; // User not included in test
      }

      // Assign user to variant based on traffic percentages
      const variantRandom = Math.random() * 100;
      let cumulativePercentage = 0;
      
      for (const variant of test.variants) {
        cumulativePercentage += variant.trafficPercentage;
        if (variantRandom <= cumulativePercentage) {
          // Assign user to this variant
          await ABTestModel.assignUserToVariant({
            testId: test.id,
            userId,
            variantId: variant.id,
            assignedAt: new Date(),
            sessionId
          });

          // Track assignment interaction
          await UserInteractionModel.create({
            userId,
            interactionType: 'model_training', // Using existing type, could add 'ab_test_assignment'
            resourceType: 'ab_test',
            resourceId: testId,
            metadata: {
              variantId: variant.id,
              variantName: variant.name,
              assignmentType: 'automatic'
            },
            sessionId
          });

          return {
            testId: test.id,
            variantId: variant.id,
            variantName: variant.name,
            configuration: variant.configuration
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to assign user to A/B test:', error);
      throw new Error('Failed to assign user to A/B test');
    }
  }

  /**
   * Record A/B test metric
   */
  async recordMetric(
    testId: string,
    userId: string,
    metricName: string,
    metricValue: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const test = await ABTestModel.findById(testId);
      if (!test || test.status !== 'running') {
        return; // Silently ignore metrics for non-running tests
      }

      const variantId = await ABTestModel.getUserVariant(testId, userId);
      if (!variantId) {
        return; // User not assigned to test
      }

      await ABTestModel.recordMetric({
        testId,
        variantId,
        userId,
        metricName,
        metricValue,
        timestamp: new Date(),
        metadata
      });

      // Track metric recording interaction
      await UserInteractionModel.create({
        userId,
        interactionType: 'model_training', // Using existing type
        resourceType: 'ab_test_metric',
        resourceId: testId,
        metadata: {
          variantId,
          metricName,
          metricValue,
          ...metadata
        }
      });
    } catch (error) {
      console.error('Failed to record A/B test metric:', error);
      // Don't throw error to avoid disrupting user experience
    }
  }

  /**
   * Get A/B test results
   */
  async getTestResults(testId: string): Promise<ABTestResult> {
    try {
      return await ABTestModel.getTestResults(testId);
    } catch (error) {
      console.error('Failed to get A/B test results:', error);
      throw new Error('Failed to get A/B test results');
    }
  }

  /**
   * Get active tests for a feature
   */
  async getActiveTestsForFeature(feature: string): Promise<ABTest[]> {
    try {
      const { tests } = await ABTestModel.findAll(
        { status: 'running', feature },
        { limit: 10 }
      );
      return tests;
    } catch (error) {
      console.error('Failed to get active tests for feature:', error);
      throw new Error('Failed to get active tests for feature');
    }
  }

  /**
   * Get user's test assignments
   */
  async getUserTestAssignments(userId: string): Promise<ABTestAssignment[]> {
    try {
      const query = `
        SELECT 
          atp.test_id,
          atp.variant_id,
          atv.name as variant_name,
          atv.configuration,
          at.feature,
          at.status
        FROM ab_test_participants atp
        JOIN ab_test_variants atv ON atp.variant_id = atv.id
        JOIN ab_tests at ON atp.test_id = at.id
        WHERE atp.user_id = $1 AND at.status = 'running'
      `;

      const result = await ABTestModel.query(query, [userId]);
      
      return result.rows.map(row => ({
        testId: row.test_id,
        variantId: row.variant_id,
        variantName: row.variant_name,
        configuration: row.configuration
      }));
    } catch (error) {
      console.error('Failed to get user test assignments:', error);
      throw new Error('Failed to get user test assignments');
    }
  }

  /**
   * Get test performance summary
   */
  async getTestPerformanceSummary(testId: string): Promise<{
    totalParticipants: number;
    metricsCollected: number;
    conversionRate: number;
    topPerformingVariant: string | null;
    statisticalSignificance: boolean;
  }> {
    try {
      const results = await this.getTestResults(testId);
      
      const totalParticipants = results.totalParticipants;
      
      // Count total metrics collected
      const metricsCollected = Object.values(results.variantResults)
        .reduce((sum, variant) => {
          return sum + Object.values(variant.metrics)
            .reduce((metricSum, metric) => metricSum + metric.sampleSize, 0);
        }, 0);

      // Calculate overall conversion rate (assuming target metric represents conversions)
      const totalConversions = Object.values(results.variantResults)
        .reduce((sum, variant) => {
          const targetMetric = variant.metrics[results.targetMetric];
          return sum + (targetMetric ? targetMetric.sampleSize : 0);
        }, 0);
      
      const conversionRate = totalParticipants > 0 ? (totalConversions / totalParticipants) * 100 : 0;

      // Find top performing variant
      let topPerformingVariant: string | null = null;
      let bestScore = -Infinity;

      for (const [variantId, variantData] of Object.entries(results.variantResults)) {
        const targetMetric = variantData.metrics[results.targetMetric];
        if (targetMetric && targetMetric.mean > bestScore) {
          bestScore = targetMetric.mean;
          topPerformingVariant = variantData.variantName;
        }
      }

      return {
        totalParticipants,
        metricsCollected,
        conversionRate,
        topPerformingVariant,
        statisticalSignificance: results.isSignificant
      };
    } catch (error) {
      console.error('Failed to get test performance summary:', error);
      throw new Error('Failed to get test performance summary');
    }
  }

  /**
   * Auto-stop tests that have reached statistical significance
   */
  async autoStopSignificantTests(): Promise<string[]> {
    try {
      const { tests } = await ABTestModel.findAll({ status: 'running' });
      const stoppedTests: string[] = [];

      for (const test of tests) {
        try {
          const results = await this.getTestResults(test.id);
          
          // Check if test has enough samples and is statistically significant
          if (results.totalParticipants >= test.minimumSampleSize && results.isSignificant) {
            // Check if test has been running for at least a minimum duration (e.g., 7 days)
            const runningDays = (Date.now() - test.startDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (runningDays >= 7) {
              await this.stopTest(test.id);
              stoppedTests.push(test.id);
              
              console.log(`Auto-stopped A/B test ${test.name} (${test.id}) due to statistical significance`);
            }
          }
        } catch (error) {
          console.error(`Failed to check test ${test.id} for auto-stop:`, error);
        }
      }

      return stoppedTests;
    } catch (error) {
      console.error('Failed to auto-stop significant tests:', error);
      throw new Error('Failed to auto-stop significant tests');
    }
  }

  /**
   * Validate test configuration before starting
   */
  private async validateTestConfiguration(test: ABTest): Promise<void> {
    // Check for conflicting tests on the same feature
    const activeTests = await this.getActiveTestsForFeature(test.feature);
    if (activeTests.length > 0) {
      throw new Error(`Another test is already running for feature: ${test.feature}`);
    }

    // Validate variant configurations
    for (const variant of test.variants) {
      if (!variant.configuration || Object.keys(variant.configuration).length === 0) {
        throw new Error(`Variant ${variant.name} must have configuration`);
      }
    }

    // Check if target metric is valid
    const validMetrics = ['search_relevance', 'user_satisfaction', 'click_through_rate', 'conversion_rate'];
    if (!validMetrics.includes(test.targetMetric)) {
      console.warn(`Target metric ${test.targetMetric} may not be automatically tracked`);
    }
  }

  /**
   * Get A/B test statistics for admin dashboard
   */
  async getABTestStatistics(): Promise<{
    totalTests: number;
    activeTests: number;
    completedTests: number;
    averageParticipants: number;
    significantResults: number;
    topFeatures: Array<{ feature: string; testCount: number }>;
  }> {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_tests,
          COUNT(CASE WHEN status = 'running' THEN 1 END) as active_tests,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tests,
          feature
        FROM ab_tests
        GROUP BY feature
        ORDER BY COUNT(*) DESC
      `;

      const result = await ABTestModel.query(statsQuery);
      
      let totalTests = 0;
      let activeTests = 0;
      let completedTests = 0;
      const topFeatures: Array<{ feature: string; testCount: number }> = [];

      for (const row of result.rows) {
        const testCount = parseInt(row.total_tests);
        totalTests += testCount;
        activeTests += parseInt(row.active_tests);
        completedTests += parseInt(row.completed_tests);
        
        topFeatures.push({
          feature: row.feature,
          testCount
        });
      }

      // Get average participants
      const participantQuery = `
        SELECT AVG(participant_count) as avg_participants
        FROM (
          SELECT test_id, COUNT(*) as participant_count
          FROM ab_test_participants
          GROUP BY test_id
        ) as test_participants
      `;

      const participantResult = await ABTestModel.query(participantQuery);
      const averageParticipants = parseFloat(participantResult.rows[0]?.avg_participants) || 0;

      // Count significant results (simplified - would need actual statistical analysis)
      const significantResults = Math.floor(completedTests * 0.3); // Placeholder

      return {
        totalTests,
        activeTests,
        completedTests,
        averageParticipants,
        significantResults,
        topFeatures: topFeatures.slice(0, 10)
      };
    } catch (error) {
      console.error('Failed to get A/B test statistics:', error);
      throw new Error('Failed to get A/B test statistics');
    }
  }
}