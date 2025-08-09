import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackService } from '../FeedbackService.js';
import { UserInteractionModel } from '../../models/UserInteraction.js';
import { SearchQueryModel } from '../../models/SearchQuery.js';

// Mock the models
vi.mock('../../models/UserInteraction.js');
vi.mock('../../models/SearchQuery.js');

describe('FeedbackService', () => {
  let feedbackService: FeedbackService;

  beforeEach(() => {
    feedbackService = new FeedbackService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('trackInteraction', () => {
    it('should track user interaction successfully', async () => {
      const mockInteraction = {
        id: 'interaction-1',
        userId: 'user-1',
        interactionType: 'search',
        resourceType: 'search_query',
        resourceId: 'query-1',
        metadata: { query: 'test search' },
        timestamp: new Date(),
        createdAt: new Date()
      };

      vi.mocked(UserInteractionModel.create).mockResolvedValue(mockInteraction as any);

      const result = await feedbackService.trackInteraction(
        'user-1',
        'search',
        'search_query',
        'query-1',
        { query: 'test search' }
      );

      expect(UserInteractionModel.create).toHaveBeenCalledWith({
        userId: 'user-1',
        interactionType: 'search',
        resourceType: 'search_query',
        resourceId: 'query-1',
        metadata: { query: 'test search' },
        sessionId: undefined,
        ipAddress: undefined,
        userAgent: undefined
      });

      expect(result).toEqual(mockInteraction);
    });

    it('should handle tracking errors gracefully', async () => {
      vi.mocked(UserInteractionModel.create).mockRejectedValue(new Error('Database error'));

      await expect(
        feedbackService.trackInteraction('user-1', 'search', 'search_query', 'query-1')
      ).rejects.toThrow('Failed to track user interaction');
    });
  });

  describe('getFeedbackAggregation', () => {
    it('should get feedback aggregation for a model', async () => {
      const mockQueryResult = {
        rows: [
          {
            total_feedback: '10',
            average_rating: '4.2',
            rating_1_count: '1',
            rating_2_count: '0',
            rating_3_count: '2',
            rating_4_count: '3',
            rating_5_count: '4',
            helpful_count: '8',
            helpful_percentage: '80.00',
            feedback_date: '2024-01-01'
          }
        ]
      };

      vi.mocked(UserInteractionModel.query).mockResolvedValue(mockQueryResult as any);

      // Mock getCommonComments method
      const getCommonCommentsSpy = vi.spyOn(feedbackService as any, 'getCommonComments')
        .mockResolvedValue([
          { comment: 'Great results', frequency: 3 },
          { comment: 'Could be better', frequency: 2 }
        ]);

      const result = await feedbackService.getFeedbackAggregation('model-1', 30);

      expect(result).toEqual({
        totalFeedback: 10,
        averageRating: 4.2,
        ratingDistribution: { 1: 1, 2: 0, 3: 2, 4: 3, 5: 4 },
        helpfulPercentage: 80,
        commonComments: [
          { comment: 'Great results', frequency: 3 },
          { comment: 'Could be better', frequency: 2 }
        ],
        trendData: [
          { date: '2024-01-01', averageRating: 4.2, count: 10 }
        ]
      });

      expect(getCommonCommentsSpy).toHaveBeenCalledWith('model-1', 30);
    });

    it('should handle empty feedback data', async () => {
      const mockQueryResult = { rows: [] };
      vi.mocked(UserInteractionModel.query).mockResolvedValue(mockQueryResult as any);

      const getCommonCommentsSpy = vi.spyOn(feedbackService as any, 'getCommonComments')
        .mockResolvedValue([]);

      const result = await feedbackService.getFeedbackAggregation('model-1', 30);

      expect(result).toEqual({
        totalFeedback: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        helpfulPercentage: 0,
        commonComments: [],
        trendData: []
      });
    });
  });

  describe('getModelImprovementSuggestions', () => {
    it('should get model improvement suggestions', async () => {
      const mockQueryResult = {
        rows: [
          {
            model_id: 'model-1',
            suggestion_type: 'retrain',
            priority: 'high',
            description: 'Model performance is below expectations',
            expected_improvement: '25.5',
            total_samples: '100',
            average_rating: '2.1',
            common_issues: ['slow', 'inaccurate']
          }
        ]
      };

      vi.mocked(UserInteractionModel.query).mockResolvedValue(mockQueryResult as any);

      const result = await feedbackService.getModelImprovementSuggestions('model-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        modelId: 'model-1',
        suggestionType: 'retrain',
        priority: 'high',
        description: 'Model performance is below expectations',
        expectedImprovement: 25.5,
        estimatedEffort: '2-4 weeks (high effort)',
        basedOnFeedback: {
          totalSamples: 100,
          averageRating: 2.1,
          commonIssues: ['slow', 'inaccurate']
        }
      });
    });

    it('should handle database errors', async () => {
      vi.mocked(UserInteractionModel.query).mockRejectedValue(new Error('Database error'));

      await expect(
        feedbackService.getModelImprovementSuggestions('model-1')
      ).rejects.toThrow('Failed to get model improvement suggestions');
    });
  });

  describe('getUserBehaviorInsights', () => {
    it('should get user behavior insights', async () => {
      const mockBehaviorPatterns = {
        searchPatterns: [{ query: 'test', frequency: 5 }],
        fileInteractions: [{ fileId: 'file-1', interactions: 3, lastInteraction: new Date() }],
        sessionDuration: { averageMinutes: 15, totalSessions: 10 },
        preferredFeatures: [{ feature: 'search', usage: 20 }]
      };

      vi.mocked(UserInteractionModel.getUserBehaviorPatterns).mockResolvedValue(mockBehaviorPatterns as any);

      const mockInteractions = {
        interactions: [
          {
            id: '1',
            userId: 'user-1',
            interactionType: 'search',
            resourceType: 'search_query',
            resourceId: 'query-1',
            metadata: {},
            timestamp: new Date(),
            createdAt: new Date()
          }
        ]
      };

      vi.mocked(UserInteractionModel.findByUser).mockResolvedValue(mockInteractions as any);

      const getSearchPatternsWithRatingSpy = vi.spyOn(feedbackService as any, 'getSearchPatternsWithRating')
        .mockResolvedValue([{ query: 'test', frequency: 5, averageRating: 4.0 }]);

      const result = await feedbackService.getUserBehaviorInsights('user-1', 30);

      expect(result).toHaveProperty('searchPatterns');
      expect(result).toHaveProperty('interactionFrequency');
      expect(result).toHaveProperty('sessionMetrics');
      expect(result).toHaveProperty('preferredFeatures');

      expect(result.interactionFrequency.search).toBe(1);
      expect(result.sessionMetrics.averageMinutes).toBe(15);
      expect(result.sessionMetrics.totalSessions).toBe(10);
      expect(getSearchPatternsWithRatingSpy).toHaveBeenCalledWith('user-1', 30);
    });
  });

  describe('processFeedbackForImprovement', () => {
    it('should process feedback and recommend retraining', async () => {
      const mockSuggestions = [
        {
          modelId: 'model-1',
          suggestionType: 'retrain',
          priority: 'high',
          description: 'Model needs retraining',
          expectedImprovement: 30,
          estimatedEffort: '2-4 weeks',
          basedOnFeedback: {
            totalSamples: 150,
            averageRating: 1.8,
            commonIssues: ['poor accuracy', 'slow response']
          }
        }
      ];

      const getSuggestionsSpy = vi.spyOn(feedbackService, 'getModelImprovementSuggestions')
        .mockResolvedValue(mockSuggestions as any);

      const result = await feedbackService.processFeedbackForImprovement('model-1');

      expect(result.shouldRetrain).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasons).toContain('Average rating: 1.80');
      expect(result.recommendedActions).toContain('Model needs retraining');

      expect(getSuggestionsSpy).toHaveBeenCalledWith('model-1');
    });

    it('should handle insufficient feedback data', async () => {
      const getSuggestionsSpy = vi.spyOn(feedbackService, 'getModelImprovementSuggestions')
        .mockResolvedValue([]);

      const result = await feedbackService.processFeedbackForImprovement('model-1');

      expect(result.shouldRetrain).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasons).toContain('Insufficient feedback data');
      expect(result.recommendedActions).toContain('Collect more user feedback');
    });
  });

  describe('getFeedbackAnalytics', () => {
    it('should get feedback analytics for admin dashboard', async () => {
      const mockStatsResult = {
        rows: [{
          total_feedback: '100',
          average_rating: '3.8',
          rating_1: '5',
          rating_2: '10',
          rating_3: '25',
          rating_4: '35',
          rating_5: '25',
          helpful_count: '75'
        }]
      };

      const mockTrendResult = {
        rows: [
          { date: '2024-01-01', average_rating: '3.8', count: '50' },
          { date: '2024-01-02', average_rating: '4.0', count: '50' }
        ]
      };

      vi.mocked(UserInteractionModel.query)
        .mockResolvedValueOnce(mockStatsResult as any)
        .mockResolvedValueOnce(mockTrendResult as any);

      const getTopIssuesSpy = vi.spyOn(feedbackService as any, 'getTopIssues')
        .mockResolvedValue([
          { issue: 'slow', frequency: 10, averageRating: 2.5 }
        ]);

      const result = await feedbackService.getFeedbackAnalytics(30);

      expect(result).toEqual({
        totalFeedback: 100,
        averageRating: 3.8,
        ratingDistribution: { 1: 5, 2: 10, 3: 25, 4: 35, 5: 25 },
        helpfulPercentage: 75,
        trendData: [
          { date: '2024-01-01', averageRating: 3.8, count: 50 },
          { date: '2024-01-02', averageRating: 4.0, count: 50 }
        ],
        topIssues: [
          { issue: 'slow', frequency: 10, averageRating: 2.5 }
        ]
      });

      expect(getTopIssuesSpy).toHaveBeenCalledWith(30);
    });
  });
});