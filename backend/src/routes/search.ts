import { Router, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { SearchService } from '../services/SearchService.js';
import { SearchQueryModel } from '../models/SearchQuery.js';
import { authenticate } from '../middleware/auth.js';
import { ApiResponse, QueryType, SearchFilters } from '../types/index.js';
import {
  validateSearchQuery,
  validateSearchSuggestions,
  validateNLPQuery,
  validateSearchFeedback,
  validateSearchHistory,
  validatePopularTerms,
  validateDateRange,
  validateFileSizeRange
} from '../validation/searchValidation.js';

const router = Router();

// Apply authentication to all search routes
router.use(authenticate);

/**
 * Perform intelligent search
 */
router.post('/query',
  validateSearchQuery,
  validateDateRange,
  validateFileSizeRange,
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

      const { query, queryType, modelId, filters, limit } = req.body;
      const userId = (req as any).user.id;

      const searchService = new SearchService();
      const searchQuery = await searchService.search({
        query,
        queryType: queryType as QueryType,
        filters: filters as SearchFilters,
        modelId,
        userId,
        limit: limit || 10
      });

      const response: ApiResponse = {
        success: true,
        data: {
          id: searchQuery.id,
          query: searchQuery.query,
          queryType: searchQuery.queryType,
          results: searchQuery.results,
          responseTime: searchQuery.responseTime,
          resultCount: searchQuery.resultCount,
          timestamp: searchQuery.timestamp,
          modelId: searchQuery.modelId
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Search query failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SEARCH_ERROR',
          message: error instanceof Error ? error.message : 'Search failed',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get search suggestions
 */
router.get('/suggestions',
  validateSearchSuggestions,
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

      const { partial, limit } = req.query;
      const userId = (req as any).user.id;

      const searchService = new SearchService();
      const suggestions = await searchService.getSearchSuggestions(
        userId,
        partial as string,
        parseInt(limit as string) || 10
      );

      const response: ApiResponse = {
        success: true,
        data: {
          suggestions: suggestions.map(s => s.query),
          detailed: suggestions
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Get suggestions failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SUGGESTIONS_ERROR',
          message: 'Failed to get search suggestions',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Process natural language query
 */
router.post('/nlp',
  validateNLPQuery,
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

      const { query } = req.body;

      const searchService = new SearchService();
      const nlpResult = await searchService.processNaturalLanguageQuery(query);

      const response: ApiResponse = {
        success: true,
        data: nlpResult
      };

      res.json(response);
    } catch (error) {
      console.error('NLP processing failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NLP_ERROR',
          message: 'Failed to process natural language query',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Add feedback to search result
 */
router.post('/feedback',
  validateSearchFeedback,
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

      const { queryId, resultId, rating, comment, helpful } = req.body;
      const userId = (req as any).user.id;

      const feedback = await SearchQueryModel.addFeedback({
        queryId,
        resultId,
        userId,
        rating,
        comment,
        helpful
      });

      const response: ApiResponse = {
        success: true,
        data: feedback
      };

      res.json(response);
    } catch (error) {
      console.error('Add feedback failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FEEDBACK_ERROR',
          message: 'Failed to add feedback',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get search history for current user
 */
router.get('/history',
  validateSearchHistory,
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

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const userId = (req as any).user.id;

      const { queries, pagination } = await SearchQueryModel.findByUser(userId, {
        limit,
        offset: (page - 1) * limit
      });

      const response: ApiResponse = {
        success: true,
        data: queries,
        pagination
      };

      res.json(response);
    } catch (error) {
      console.error('Get search history failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'HISTORY_ERROR',
          message: 'Failed to get search history',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get search statistics (admin only)
 */
router.get('/statistics',
  async (req: Request, res: Response) => {
    try {
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

      const statistics = await SearchQueryModel.getStatistics();

      const response: ApiResponse = {
        success: true,
        data: statistics
      };

      res.json(response);
    } catch (error) {
      console.error('Get search statistics failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATISTICS_ERROR',
          message: 'Failed to get search statistics',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get popular search terms
 */
router.get('/popular',
  validatePopularTerms,
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

      const limit = parseInt(req.query.limit as string) || 10;
      const popularTerms = await SearchQueryModel.getPopularSearchTerms(limit);

      const response: ApiResponse = {
        success: true,
        data: popularTerms
      };

      res.json(response);
    } catch (error) {
      console.error('Get popular terms failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'POPULAR_TERMS_ERROR',
          message: 'Failed to get popular search terms',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

export default router;