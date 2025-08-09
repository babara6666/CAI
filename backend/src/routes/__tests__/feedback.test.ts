import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import feedbackRoutes from '../feedback.js';
import { FeedbackService } from '../../services/FeedbackService.js';

// Mock the FeedbackService
vi.mock('../../services/FeedbackService.js');

// Mock authentication middleware
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: vi.fn((req, res, next) => {
    req.user = { id: 'user-1', role: 'engineer' };
    next();
  })
}));

describe('Feedback Routes', () => {
  let app: express.Application;
  let mockFeedbackService: any;
  let mockAuthenticateToken: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/feedback', feedbackRoutes);

    mockFeedbackService = {
      trackInteraction: vi.fn(),
      getFeedbackAggregation: vi.fn(),
      getModelImprovementSuggestions: vi.fn(),
      getUserBehaviorInsights: vi.fn(),
      getFeedbackAnalytics: vi.fn(),
      processFeedbackForImprovement: vi.fn()
    };

    vi.mocked(FeedbackService).mockImplementation(() => mockFeedbackService);
    
    // Get the mocked auth function
    const authModule = await import('../../middleware/auth.js');
    mockAuthenticateToken = vi.mocked(authModule.authenticateToken);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/feedback/interactions', () => {
    it('should track user interaction successfully', async () => {
      const interactionData = {
        interactionType: 'search',
        resourceType: 'search_query',
        resourceId: 'query-1',
        metadata: { query: 'test search' }
      };

      const mockInteraction = {
        id: 'interaction-1',
        userId: 'user-1',
        ...interactionData,
        timestamp: new Date()
      };

      mockFeedbackService.trackInteraction.mockResolvedValue(mockInteraction);

      const response = await request(app)
        .post('/api/feedback/interactions')
        .send(interactionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockInteraction);
      expect(mockFeedbackService.trackInteraction).toHaveBeenCalledWith(
        'user-1',
        'search',
        'search_query',
        'query-1',
        { query: 'test search' },
        undefined,
        expect.any(String),
        expect.any(String)
      );
    });

    it('should validate interaction type', async () => {
      const response = await request(app)
        .post('/api/feedback/interactions')
        .send({
          interactionType: 'invalid_type',
          resourceType: 'search_query',
          resourceId: 'query-1'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate resource ID format', async () => {
      const response = await request(app)
        .post('/api/feedback/interactions')
        .send({
          interactionType: 'search',
          resourceType: 'search_query',
          resourceId: 'invalid-uuid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/feedback/aggregation/:modelId', () => {
    it('should get feedback aggregation for model', async () => {
      const mockAggregation = {
        totalFeedback: 100,
        averageRating: 4.2,
        ratingDistribution: { 1: 5, 2: 10, 3: 15, 4: 35, 5: 35 },
        helpfulPercentage: 85,
        commonComments: [
          { comment: 'Great results', frequency: 10 }
        ],
        trendData: [
          { date: '2024-01-01', averageRating: 4.2, count: 50 }
        ]
      };

      mockFeedbackService.getFeedbackAggregation.mockResolvedValue(mockAggregation);

      const response = await request(app)
        .get('/api/feedback/aggregation/model-1')
        .query({ days: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAggregation);
      expect(mockFeedbackService.getFeedbackAggregation).toHaveBeenCalledWith('model-1', 30);
    });

    it('should validate model ID format', async () => {
      const response = await request(app)
        .get('/api/feedback/aggregation/invalid-uuid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should use default days if not provided', async () => {
      mockFeedbackService.getFeedbackAggregation.mockResolvedValue({});

      await request(app)
        .get('/api/feedback/aggregation/550e8400-e29b-41d4-a716-446655440000')
        .expect(200);

      expect(mockFeedbackService.getFeedbackAggregation).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        30
      );
    });
  });

  describe('GET /api/feedback/improvements', () => {
    it('should get model improvement suggestions', async () => {
      const mockSuggestions = [
        {
          modelId: 'model-1',
          suggestionType: 'retrain',
          priority: 'high',
          description: 'Model needs retraining',
          expectedImprovement: 25,
          estimatedEffort: '2-4 weeks',
          basedOnFeedback: {
            totalSamples: 100,
            averageRating: 2.1,
            commonIssues: ['slow', 'inaccurate']
          }
        }
      ];

      mockFeedbackService.getModelImprovementSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/feedback/improvements')
        .query({ modelId: 'model-1' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSuggestions);
      expect(mockFeedbackService.getModelImprovementSuggestions).toHaveBeenCalledWith('model-1');
    });

    it('should get suggestions for all models if no modelId provided', async () => {
      mockFeedbackService.getModelImprovementSuggestions.mockResolvedValue([]);

      await request(app)
        .get('/api/feedback/improvements')
        .expect(200);

      expect(mockFeedbackService.getModelImprovementSuggestions).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /api/feedback/behavior', () => {
    it('should get user behavior insights', async () => {
      const mockInsights = {
        searchPatterns: [
          { query: 'test search', frequency: 5, averageRating: 4.0 }
        ],
        interactionFrequency: {
          search: 10,
          file_view: 5,
          file_download: 2,
          feedback: 3,
          model_training: 1,
          dataset_creation: 0
        },
        sessionMetrics: {
          averageDuration: 15.5,
          totalSessions: 20,
          bounceRate: 25
        },
        preferredFeatures: [
          { feature: 'search', usage: 10, satisfaction: 4.2 }
        ]
      };

      mockFeedbackService.getUserBehaviorInsights.mockResolvedValue(mockInsights);

      const response = await request(app)
        .get('/api/feedback/behavior')
        .query({ days: 7 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockInsights);
      expect(mockFeedbackService.getUserBehaviorInsights).toHaveBeenCalledWith('user-1', 7);
    });
  });

  describe('GET /api/feedback/analytics', () => {
    it('should get feedback analytics for admin', async () => {
      // Mock admin user
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 'admin-1', role: 'admin' };
        next();
      });

      const mockAnalytics = {
        totalFeedback: 500,
        averageRating: 3.8,
        ratingDistribution: { 1: 25, 2: 50, 3: 125, 4: 175, 5: 125 },
        helpfulPercentage: 78,
        trendData: [
          { date: '2024-01-01', averageRating: 3.8, count: 250 }
        ],
        topIssues: [
          { issue: 'slow', frequency: 15, averageRating: 2.5 }
        ]
      };

      mockFeedbackService.getFeedbackAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/feedback/analytics')
        .query({ days: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAnalytics);
      expect(mockFeedbackService.getFeedbackAnalytics).toHaveBeenCalledWith(30);
    });

    it('should deny access to non-admin users', async () => {
      // Reset to non-admin user
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 'user-1', role: 'engineer' };
        next();
      });

      const response = await request(app)
        .get('/api/feedback/analytics')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/feedback/process/:modelId', () => {
    it('should process feedback for improvement (admin)', async () => {
      // Mock admin user
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 'admin-1', role: 'admin' };
        next();
      });

      const mockImprovement = {
        shouldRetrain: true,
        confidence: 0.85,
        reasons: ['Average rating: 2.10', 'Based on 150 feedback samples'],
        recommendedActions: ['Model needs retraining', 'Expected improvement: 30%']
      };

      mockFeedbackService.processFeedbackForImprovement.mockResolvedValue(mockImprovement);

      const response = await request(app)
        .post('/api/feedback/process/model-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockImprovement);
      expect(mockFeedbackService.processFeedbackForImprovement).toHaveBeenCalledWith('model-1');
    });

    it('should allow engineer access', async () => {
      // Mock engineer user
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 'engineer-1', role: 'engineer' };
        next();
      });

      mockFeedbackService.processFeedbackForImprovement.mockResolvedValue({});

      const response = await request(app)
        .post('/api/feedback/process/model-1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny access to viewer users', async () => {
      // Mock viewer user
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 'viewer-1', role: 'viewer' };
        next();
      });

      const response = await request(app)
        .post('/api/feedback/process/model-1')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockFeedbackService.trackInteraction.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/feedback/interactions')
        .send({
          interactionType: 'search',
          resourceType: 'search_query',
          resourceId: '550e8400-e29b-41d4-a716-446655440000'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERACTION_ERROR');
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/feedback/interactions')
        .send({
          interactionType: 'search'
          // Missing resourceType and resourceId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toBeDefined();
    });
  });
});