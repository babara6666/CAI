import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService } from '../../../services/SearchService';
import { CADFile } from '../../../models/CADFile';
import { AIModel } from '../../../models/AIModel';
import { SearchQuery } from '../../../models/SearchQuery';
import { CacheService } from '../../../services/CacheService';

vi.mock('../../../models/CADFile');
vi.mock('../../../models/AIModel');
vi.mock('../../../models/SearchQuery');
vi.mock('../../../services/CacheService');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockCacheService: any;

  beforeEach(() => {
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };

    vi.mocked(CacheService).mockImplementation(() => mockCacheService);
    searchService = new SearchService();
    vi.clearAllMocks();
  });

  describe('searchFiles', () => {
    it('should perform natural language search successfully', async () => {
      const query = 'mechanical parts for engine';
      const userId = 'user-id';
      const options = {
        modelId: 'model-id',
        filters: {
          tags: ['mechanical'],
          projectName: 'Engine Project',
        },
      };

      const mockFiles = [
        { ...testUtils.createTestCADFile(), id: 'file1', tags: ['mechanical', 'engine'] },
        { ...testUtils.createTestCADFile(), id: 'file2', tags: ['mechanical', 'transmission'] },
      ];

      const mockModel = {
        id: 'model-id',
        name: 'Test Model',
        status: 'ready',
        type: 'cnn',
      };

      const mockSearchResults = [
        {
          fileId: 'file1',
          relevanceScore: 0.95,
          confidence: 0.88,
          matchedFeatures: ['mechanical', 'engine'],
        },
        {
          fileId: 'file2',
          relevanceScore: 0.82,
          confidence: 0.75,
          matchedFeatures: ['mechanical'],
        },
      ];

      mockCacheService.get.mockResolvedValue(null);
      vi.mocked(AIModel.findById).mockResolvedValue(mockModel);
      vi.mocked(CADFile.searchByFilters).mockResolvedValue(mockFiles);
      
      // Mock AI inference call
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: mockSearchResults }),
      });

      vi.mocked(SearchQuery.create).mockResolvedValue({
        id: 'query-id',
        userId,
        query,
        queryType: 'natural_language',
        results: mockSearchResults,
        timestamp: new Date(),
        responseTime: 150,
        resultCount: 2,
      });

      const result = await searchService.searchFiles(query, userId, options);

      expect(AIModel.findById).toHaveBeenCalledWith('model-id');
      expect(CADFile.searchByFilters).toHaveBeenCalledWith(options.filters);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/ai/inference'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: 'model-id',
            query,
            candidateFiles: mockFiles.map(f => f.id),
          }),
        })
      );
      expect(SearchQuery.create).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();

      expect(result).toEqual({
        queryId: 'query-id',
        results: expect.arrayContaining([
          expect.objectContaining({
            file: mockFiles[0],
            relevanceScore: 0.95,
            confidence: 0.88,
            matchedFeatures: ['mechanical', 'engine'],
          }),
        ]),
        totalResults: 2,
        responseTime: expect.any(Number),
      });
    });

    it('should fallback to keyword search when AI model is unavailable', async () => {
      const query = 'mechanical parts';
      const userId = 'user-id';
      const options = { modelId: 'unavailable-model' };

      const mockFiles = [
        { ...testUtils.createTestCADFile(), id: 'file1', tags: ['mechanical'] },
      ];

      mockCacheService.get.mockResolvedValue(null);
      vi.mocked(AIModel.findById).mockResolvedValue(null);
      vi.mocked(CADFile.searchByKeywords).mockResolvedValue(mockFiles);
      vi.mocked(SearchQuery.create).mockResolvedValue({
        id: 'query-id',
        userId,
        query,
        queryType: 'filtered',
        results: [],
        timestamp: new Date(),
        responseTime: 50,
        resultCount: 1,
      });

      const result = await searchService.searchFiles(query, userId, options);

      expect(CADFile.searchByKeywords).toHaveBeenCalledWith(query, undefined);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].relevanceScore).toBe(1.0); // Default score for keyword search
    });

    it('should return cached results when available', async () => {
      const query = 'cached query';
      const userId = 'user-id';
      const cacheKey = `search:${userId}:${Buffer.from(query).toString('base64')}`;
      
      const cachedResult = {
        queryId: 'cached-query-id',
        results: [
          {
            file: testUtils.createTestCADFile(),
            relevanceScore: 0.9,
            confidence: 0.8,
            matchedFeatures: ['test'],
          },
        ],
        totalResults: 1,
        responseTime: 100,
        fromCache: true,
      };

      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await searchService.searchFiles(query, userId);

      expect(mockCacheService.get).toHaveBeenCalledWith(cacheKey);
      expect(result).toEqual(cachedResult);
      expect(vi.mocked(AIModel.findById)).not.toHaveBeenCalled();
    });

    it('should handle AI service errors gracefully', async () => {
      const query = 'test query';
      const userId = 'user-id';
      const options = { modelId: 'model-id' };

      const mockModel = {
        id: 'model-id',
        name: 'Test Model',
        status: 'ready',
        type: 'cnn',
      };

      const mockFiles = [testUtils.createTestCADFile()];

      mockCacheService.get.mockResolvedValue(null);
      vi.mocked(AIModel.findById).mockResolvedValue(mockModel);
      vi.mocked(CADFile.searchByFilters).mockResolvedValue(mockFiles);
      vi.mocked(CADFile.searchByKeywords).mockResolvedValue(mockFiles);

      // Mock AI service failure
      global.fetch = vi.fn().mockRejectedValue(new Error('AI service unavailable'));

      vi.mocked(SearchQuery.create).mockResolvedValue({
        id: 'query-id',
        userId,
        query,
        queryType: 'filtered',
        results: [],
        timestamp: new Date(),
        responseTime: 50,
        resultCount: 1,
      });

      const result = await searchService.searchFiles(query, userId, options);

      expect(CADFile.searchByKeywords).toHaveBeenCalledWith(query, undefined);
      expect(result.results).toHaveLength(1);
    });
  });

  describe('getSuggestions', () => {
    it('should return search suggestions', async () => {
      const partial = 'mech';
      const userId = 'user-id';

      const mockSuggestions = [
        'mechanical parts',
        'mechanical assembly',
        'mechanism design',
      ];

      mockCacheService.get.mockResolvedValue(null);
      vi.mocked(SearchQuery.getRecentQueries).mockResolvedValue([
        { query: 'mechanical parts for engine' },
        { query: 'mechanical assembly drawing' },
        { query: 'mechanism design principles' },
      ]);
      vi.mocked(CADFile.getPopularTags).mockResolvedValue(['mechanical', 'assembly']);

      const result = await searchService.getSuggestions(partial, userId);

      expect(result).toEqual(expect.arrayContaining(mockSuggestions));
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return cached suggestions when available', async () => {
      const partial = 'cached';
      const userId = 'user-id';
      const cacheKey = `suggestions:${userId}:${partial}`;
      
      const cachedSuggestions = ['cached suggestion 1', 'cached suggestion 2'];

      mockCacheService.get.mockResolvedValue(cachedSuggestions);

      const result = await searchService.getSuggestions(partial, userId);

      expect(mockCacheService.get).toHaveBeenCalledWith(cacheKey);
      expect(result).toEqual(cachedSuggestions);
    });
  });

  describe('getSearchHistory', () => {
    it('should return user search history', async () => {
      const userId = 'user-id';
      const limit = 10;

      const mockHistory = [
        {
          id: 'query1',
          query: 'mechanical parts',
          timestamp: new Date(),
          resultCount: 5,
        },
        {
          id: 'query2',
          query: 'engine components',
          timestamp: new Date(),
          resultCount: 3,
        },
      ];

      vi.mocked(SearchQuery.findByUserId).mockResolvedValue(mockHistory);

      const result = await searchService.getSearchHistory(userId, limit);

      expect(SearchQuery.findByUserId).toHaveBeenCalledWith(userId, limit);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('clearSearchHistory', () => {
    it('should clear user search history', async () => {
      const userId = 'user-id';

      vi.mocked(SearchQuery.deleteByUserId).mockResolvedValue(true);

      const result = await searchService.clearSearchHistory(userId);

      expect(SearchQuery.deleteByUserId).toHaveBeenCalledWith(userId);
      expect(result).toBe(true);
    });
  });
});