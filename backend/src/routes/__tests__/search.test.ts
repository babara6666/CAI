import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import searchRoutes from '../search.js';
import { SearchService } from '../../services/SearchService.js';
import { SearchQueryModel } from '../../models/SearchQuery.js';
import { authenticateToken } from '../../middleware/auth.js';

// Mock dependencies
vi.mock('../../services/SearchService.js');
vi.mock('../../models/SearchQuery.js');
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: vi.fn()
}));

const mockedSearchService = SearchService as any;
const mockedSearchQueryModel = SearchQueryModel as any;
const mockedAuthenticateToken = vi.mocked(authenticateToken);

// Create test app
const app = express();
app.use(express.json());
app.use('/api/search', searchRoutes);

// Mock user for authentication
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'engineer'
};

describe('Search Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock authentication middleware
    mockedAuthenticateToken.mockImplementation((req: any, res: any, next: any) => {
      req.user = mockUser;
      next();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/search/query', () => {
    const validSearchRequest = {
      query: 'find gear assembly',
      queryType: 'natural_language',
      limit: 10
    };

    const mockSearchResult = {
      id: 'query-123',
      query: 'find gear assembly',
      queryType: 'natural_language',
      results: [
        {
          fileId: 'file-1',
          relevanceScore: 0.9,
          confidence: 0.85,
          matchedFeatures: ['ai_similarity']
        }
      ],
      responseTime: 500,
      resultCount: 1,
      timestamp: new Date(),
      modelId: 'model-123'
    };

    it('should perform search successfully', async () => {
      const mockSearchService = {
        search: vi.fn().mockResolvedValue(mockSearchResult)
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .post('/api/search/query')
        .send(validSearchRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: mockSearchResult.id,
          query: mockSearchResult.query,
          queryType: mockSearchResult.queryType,
          results: mockSearchResult.results,
          responseTime: mockSearchResult.responseTime,
          resultCount: mockSearchResult.resultCount,
          timestamp: expect.any(String),
          modelId: mockSearchResult.modelId
        })
      );

      expect(mockSearchService.search).toHaveBeenCalledWith({
        query: 'find gear assembly',
        queryType: 'natural_language',
        filters: undefined,
        modelId: undefined,
        userId: 'user-123',
        limit: 10
      });
    });

    it('should validate query parameter', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .send({ query: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate query type', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .send({
          query: 'test query',
          queryType: 'invalid_type'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate model ID format', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .send({
          query: 'test query',
          modelId: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate filters structure', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .send({
          query: 'test query',
          filters: {
            tags: 'not-an-array',
            dateRange: {
              startDate: '2023-01-01',
              endDate: '2022-12-31' // End before start
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle search service errors', async () => {
      const mockSearchService = {
        search: vi.fn().mockRejectedValue(new Error('Search failed'))
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .post('/api/search/query')
        .send(validSearchRequest);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SEARCH_ERROR');
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .post('/api/search/query')
        .send({
          query: 'test query',
          limit: 150 // Exceeds maximum
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/search/suggestions', () => {
    const mockSuggestions = [
      { query: 'gear assembly', type: 'history', score: 0.8 },
      { query: 'gear box', type: 'metadata', score: 0.7 },
      { query: 'gear system', type: 'popular', score: 0.9 }
    ];

    it('should get search suggestions successfully', async () => {
      const mockSearchService = {
        getSearchSuggestions: vi.fn().mockResolvedValue(mockSuggestions)
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ partial: 'gear', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toEqual(['gear assembly', 'gear box', 'gear system']);
      expect(response.body.data.detailed).toEqual(mockSuggestions);

      expect(mockSearchService.getSearchSuggestions).toHaveBeenCalledWith('user-123', 'gear', 10);
    });

    it('should validate partial parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ partial: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ partial: 'gear', limit: 25 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors', async () => {
      const mockSearchService = {
        getSearchSuggestions: vi.fn().mockRejectedValue(new Error('Service error'))
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ partial: 'gear' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SUGGESTIONS_ERROR');
    });
  });

  describe('POST /api/search/nlp', () => {
    const mockNLPResult = {
      intent: 'search',
      entities: {
        materials: ['steel'],
        dimensions: ['10mm']
      },
      keywords: ['steel', 'bracket', 'thickness']
    };

    it('should process natural language query successfully', async () => {
      const mockSearchService = {
        processNaturalLanguageQuery: vi.fn().mockResolvedValue(mockNLPResult)
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .post('/api/search/nlp')
        .send({ query: 'find steel brackets with 10mm thickness' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockNLPResult);

      expect(mockSearchService.processNaturalLanguageQuery).toHaveBeenCalledWith(
        'find steel brackets with 10mm thickness'
      );
    });

    it('should validate query parameter', async () => {
      const response = await request(app)
        .post('/api/search/nlp')
        .send({ query: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle processing errors', async () => {
      const mockSearchService = {
        processNaturalLanguageQuery: vi.fn().mockRejectedValue(new Error('NLP error'))
      };
      mockedSearchService.mockImplementation(() => mockSearchService);

      const response = await request(app)
        .post('/api/search/nlp')
        .send({ query: 'test query' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NLP_ERROR');
    });
  });

  describe('POST /api/search/feedback', () => {
    const validFeedback = {
      queryId: '123e4567-e89b-12d3-a456-426614174000',
      resultId: 'file-1',
      rating: 4,
      comment: 'Very helpful result',
      helpful: true
    };

    const mockFeedback = {
      rating: 4,
      comment: 'Very helpful result',
      timestamp: new Date(),
      helpful: true
    };

    it('should add feedback successfully', async () => {
      mockedSearchQueryModel.addFeedback.mockResolvedValue(mockFeedback);

      const response = await request(app)
        .post('/api/search/feedback')
        .send(validFeedback);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          rating: mockFeedback.rating,
          comment: mockFeedback.comment,
          helpful: mockFeedback.helpful,
          timestamp: expect.any(String)
        })
      );

      expect(mockedSearchQueryModel.addFeedback).toHaveBeenCalledWith({
        queryId: validFeedback.queryId,
        resultId: validFeedback.resultId,
        userId: 'user-123',
        rating: validFeedback.rating,
        comment: validFeedback.comment,
        helpful: validFeedback.helpful
      });
    });

    it('should validate query ID format', async () => {
      const response = await request(app)
        .post('/api/search/feedback')
        .send({
          ...validFeedback,
          queryId: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate rating range', async () => {
      const response = await request(app)
        .post('/api/search/feedback')
        .send({
          ...validFeedback,
          rating: 6 // Out of range
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate helpful boolean', async () => {
      const response = await request(app)
        .post('/api/search/feedback')
        .send({
          ...validFeedback,
          helpful: 'yes' // Should be boolean
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle database errors', async () => {
      mockedSearchQueryModel.addFeedback.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/search/feedback')
        .send(validFeedback);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FEEDBACK_ERROR');
    });
  });

  describe('GET /api/search/history', () => {
    const mockHistory = {
      queries: [
        {
          id: 'query-1',
          query: 'gear assembly',
          timestamp: new Date(),
          resultCount: 5
        }
      ],
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1
      }
    };

    it('should get search history successfully', async () => {
      mockedSearchQueryModel.findByUser.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/search/history')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'query-1',
            query: 'gear assembly',
            resultCount: 5,
            timestamp: expect.any(String)
          })
        ])
      );
      expect(response.body.pagination).toEqual(mockHistory.pagination);

      expect(mockedSearchQueryModel.findByUser).toHaveBeenCalledWith('user-123', {
        limit: 10,
        offset: 0
      });
    });

    it('should validate page parameter', async () => {
      const response = await request(app)
        .get('/api/search/history')
        .query({ page: 0 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/history')
        .query({ limit: 100 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle database errors', async () => {
      mockedSearchQueryModel.findByUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/search/history');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('HISTORY_ERROR');
    });
  });

  describe('GET /api/search/statistics', () => {
    const mockStatistics = {
      totalQueries: 1000,
      queriesByType: {
        natural_language: 600,
        filtered: 300,
        hybrid: 100
      },
      averageResponseTime: 250,
      averageResultCount: 8,
      recentQueries: 50,
      topQueries: [
        { query: 'gear assembly', count: 25 },
        { query: 'pump design', count: 20 }
      ]
    };

    it('should get statistics for admin users', async () => {
      // Mock admin user
      mockedAuthenticateToken.mockImplementation((req: any, res: any, next: any) => {
        req.user = { ...mockUser, role: 'admin' };
        next();
      });

      mockedSearchQueryModel.getStatistics.mockResolvedValue(mockStatistics);

      const response = await request(app)
        .get('/api/search/statistics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStatistics);
    });

    it('should deny access for non-admin users', async () => {
      const response = await request(app)
        .get('/api/search/statistics');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should handle database errors', async () => {
      mockedAuthenticateToken.mockImplementation((req: any, res: any, next: any) => {
        req.user = { ...mockUser, role: 'admin' };
        next();
      });

      mockedSearchQueryModel.getStatistics.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/search/statistics');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('STATISTICS_ERROR');
    });
  });

  describe('GET /api/search/popular', () => {
    const mockPopularTerms = [
      { query: 'gear assembly', count: 50 },
      { query: 'pump design', count: 30 },
      { query: 'valve body', count: 25 }
    ];

    it('should get popular search terms successfully', async () => {
      mockedSearchQueryModel.getPopularSearchTerms.mockResolvedValue(mockPopularTerms);

      const response = await request(app)
        .get('/api/search/popular')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPopularTerms);

      expect(mockedSearchQueryModel.getPopularSearchTerms).toHaveBeenCalledWith(10);
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/popular')
        .query({ limit: 100 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle database errors', async () => {
      mockedSearchQueryModel.getPopularSearchTerms.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/search/popular');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('POPULAR_TERMS_ERROR');
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all routes', async () => {
      // Mock authentication failure
      mockedAuthenticateToken.mockImplementation((req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      });

      const routes = [
        { method: 'post', path: '/api/search/query', body: { query: 'test' } },
        { method: 'get', path: '/api/search/suggestions', query: { partial: 'test' } },
        { method: 'post', path: '/api/search/nlp', body: { query: 'test' } },
        { method: 'post', path: '/api/search/feedback', body: { queryId: '123e4567-e89b-12d3-a456-426614174000', resultId: 'file-1', rating: 5, helpful: true } },
        { method: 'get', path: '/api/search/history' },
        { method: 'get', path: '/api/search/statistics' },
        { method: 'get', path: '/api/search/popular' }
      ];

      for (const route of routes) {
        let response;
        if (route.method === 'post') {
          response = await request(app)[route.method](route.path).send(route.body);
        } else {
          response = await request(app)[route.method](route.path).query(route.query || {});
        }

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });
});