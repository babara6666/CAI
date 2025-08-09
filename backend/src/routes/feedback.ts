import { Router, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { FeedbackService } from '../services/FeedbackService.js';
import { authenticateToken } from '../middleware/auth.js';
import { ApiResponse, InteractionType } from '../types/index.js';
import {
  validateTrackInteraction,
  validateFeedbackAggregation,
  validateModelImprovement,
  validateUserBehavior,
  validateFeedbackAnalytics
} from '../validation/feedbackValidation.js';

const router = Router();

// Apply authentication to all feedback routes
router.use(authenticateToken);

/**
 * Track user interaction
 */
router.post('/interactions',
  validateTrackInteraction,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { interactionType, resourceType, resourceId, metadata } = req.body;
      const userId = (req as any).user.id;
      const sessionId = req.headers['x-session-id'] as string;
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const feedbackService = new FeedbackService();
      const interaction = await feedbackService.trackInteraction(
        userId,
        interactionType as InteractionType,
        resourceType,
        resourceId,
        metadata || {},
        sessionId,
        ipAddress,
        userAgent
      );

      const response: ApiResponse = {
        success: true,
        data: interaction
      };

      res.json(response);
    } catch (error) {
      console.error('Track interaction failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERACTION_ERROR',
          message: 'Failed to track interaction',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get feedback aggregation for a model
 */
router.get('/aggregation/:modelId',
  validateFeedbackAggregation,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { modelId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const feedbackService = new FeedbackService();
      const aggregation = await feedbackService.getFeedbackAggregation(modelId, days);

      const response: ApiResponse = {
        success: true,
        data: aggregation
      };

      res.json(response);
    } catch (error) {
      console.error('Get feedback aggregation failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AGGREGATION_ERROR',
          message: 'Failed to get feedback aggregation',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get model improvement suggestions
 */
router.get('/improvements',
  validateModelImprovement,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const modelId = req.query.modelId as string;

      const feedbackService = new FeedbackService();
      const suggestions = await feedbackService.getModelImprovementSuggestions(modelId);

      const response: ApiResponse = {
        success: true,
        data: suggestions
      };

      res.json(response);
    } catch (error) {
      console.error('Get model improvement suggestions failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'IMPROVEMENT_ERROR',
          message: 'Failed to get model improvement suggestions',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get user behavior insights
 */
router.get('/behavior',
  validateUserBehavior,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const userId = (req as any).user.id;
      const days = parseInt(req.query.days as string) || 30;

      const feedbackService = new FeedbackService();
      const insights = await feedbackService.getUserBehaviorInsights(userId, days);

      const response: ApiResponse = {
        success: true,
        data: insights
      };

      res.json(response);
    } catch (error) {
      console.error('Get user behavior insights failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'BEHAVIOR_ERROR',
          message: 'Failed to get user behavior insights',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get feedback analytics (admin only)
 */
router.get('/analytics',
  validateFeedbackAnalytics,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const user = (req as any).user;
      
      // Check if user is admin
      if (user.role !== 'admin') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const days = parseInt(req.query.days as string) || 30;

      const feedbackService = new FeedbackService();
      const analytics = await feedbackService.getFeedbackAnalytics(days);

      const response: ApiResponse = {
        success: true,
        data: analytics
      };

      res.json(response);
    } catch (error) {
      console.error('Get feedback analytics failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ANALYTICS_ERROR',
          message: 'Failed to get feedback analytics',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Process feedback for model improvement
 */
router.post('/process/:modelId',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin or engineer
      if (!['admin', 'engineer'].includes(user.role)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin or engineer access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { modelId } = req.params;

      const feedbackService = new FeedbackService();
      const improvement = await feedbackService.processFeedbackForImprovement(modelId);

      const response: ApiResponse = {
        success: true,
        data: improvement
      };

      res.json(response);
    } catch (error) {
      console.error('Process feedback for improvement failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PROCESS_ERROR',
          message: 'Failed to process feedback for improvement',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

export default router;