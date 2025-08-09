import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import axios from 'axios';
import { SearchService } from '../SearchService.js';
import { SearchQueryModel } from '../../models/SearchQuery.js';
import { CADFileModel } from '../../models/CADFile.js';
import { QueryType } from '../../types/index.js';

// Mock dependencies
vi.mock('axios');
vi.mock('../../models/SearchQuery.js');
vi.mock('../../models/CADFile.js');

const mockedAxios = axios as any;
const mockedSearchQueryModel = SearchQueryModel as any;
const mockedCADFileModel = CADFileModel as any;

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    searchService = new SearchService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSearchRequest = {
    query: 'find gear assembly',
    userId: 'user-123',
    limit: 10
  };

  describe('search', () => {

    const mockAIResponse = {
      query: 'find gear assembly',
      model_id: 'model-123',
      model_type: 'cnn',
      results: [
        {
          file_id: 'file-1',
          similarity_score: 0.9,
          confidence: 0.85,
          features: [0.1, 0.2, 0.3]
        },
        {
          file_id: 'file-2',
          similarity_score: 0.8,
          confidence: 0.75,
          features: [0.2, 0.3, 0.4]
        }
      ],
      processing_time: 0.5
    };

    const mockSearchQuery = {
      id: 'query-123',
      userId: 'user-123',
      query: 'find gear assembly',
      queryType: 'natural_language' as QueryType,
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
      timestamp: new Date()
    };

    it('should perform AI search successfully', async () => {
      // Mock AI service response
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });
      
      // Mock CADFile existence check
      mockedCADFileModel.findById.mockResolvedValue({ 
        id: 'file-1',
        tags: ['gear', 'assembly'],
        uploadedAt: new Date()
      });
      
      // Mock SearchQuery creation
      mockedSearchQueryModel.create.mockResolvedValue(mockSearchQuery);

      const result = await searchService.search(mockSearchRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8002/api/inference/search',
        {
          query: 'find gear assembly',
          model_id: undefined,
          top_k: 10
        },
        expect.any(Object)
      );

      expect(mockedSearchQueryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          query: 'find gear assembly',
          queryType: 'natural_language',
          filters: undefined,
          modelId: 'model-123',
          responseTime: expect.any(Number),
          results: expect.arrayContaining([
            expect.objectContaining({
              fileId: 'file-1',
              relevanceScore: expect.any(Number),
              confidence: 0.85,
              matchedFeatures: ['ai_similarity'],
              position: expect.any(Number)
            })
          ])
        })
      );

      expect(result).toEqual(mockSearchQuery);
    });

    it('should fall back to keyword search when AI service fails', async () => {
      // Mock AI service failure
      mockedAxios.post.mockRejectedValue(new Error('AI service unavailable'));
      
      // Mock keyword search results
      const mockKeywordResults = {
        files: [
          {
            id: 'file-1',
            filename: 'gear_assembly.dwg',
            tags: ['gear', 'assembly'],
            projectName: 'transmission',
            partName: 'main_gear',
            description: 'Main gear assembly for transmission'
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      };
      
      mockedCADFileModel.search.mockResolvedValue(mockKeywordResults);
      mockedSearchQueryModel.create.mockResolvedValue(mockSearchQuery);

      const result = await searchService.search(mockSearchRequest);

      expect(mockedCADFileModel.search).toHaveBeenCalled();
      expect(result).toEqual(mockSearchQuery);
    });

    it('should determine query type correctly', async () => {
      // Test natural language query
      const nlQuery = { ...mockSearchRequest, query: 'show me all gear assemblies with high precision' };
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });
      mockedCADFileModel.findById.mockResolvedValue({ id: 'file-1' });
      mockedSearchQueryModel.create.mockResolvedValue(mockSearchQuery);

      await searchService.search(nlQuery);

      expect(mockedSearchQueryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'natural_language'
        })
      );

      // Test filtered query
      const filteredQuery = { 
        ...mockSearchRequest, 
        query: 'gear',
        filters: { tags: ['mechanical'] }
      };
      
      await searchService.search(filteredQuery);

      expect(mockedSearchQueryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'hybrid'
        })
      );
    });

    it('should apply filters correctly', async () => {
      const filteredRequest = {
        ...mockSearchRequest,
        filters: {
          tags: ['mechanical'],
          projectName: 'transmission',
          dateRange: {
            startDate: new Date('2023-01-01'),
            endDate: new Date('2023-12-31')
          }
        }
      };

      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });
      mockedCADFileModel.findById.mockResolvedValue({
        id: 'file-1',
        tags: ['mechanical', 'gear'],
        projectName: 'transmission',
        uploadedAt: new Date('2023-06-01')
      });
      mockedSearchQueryModel.create.mockResolvedValue(mockSearchQuery);

      const result = await searchService.search(filteredRequest);

      expect(result).toEqual(mockSearchQuery);
    });

    it('should rank results correctly', async () => {
      const multiResultResponse = {
        ...mockAIResponse,
        results: [
          { file_id: 'file-1', similarity_score: 0.7, confidence: 0.8 },
          { file_id: 'file-2', similarity_score: 0.9, confidence: 0.6 },
          { file_id: 'file-3', similarity_score: 0.8, confidence: 0.9 }
        ]
      };

      mockedAxios.post.mockResolvedValue({ data: multiResultResponse });
      mockedCADFileModel.findById.mockResolvedValue({ 
        id: 'file-1',
        tags: ['gear', 'assembly'],
        uploadedAt: new Date()
      });
      mockedSearchQueryModel.create.mockImplementation((data) => ({
        ...mockSearchQuery,
        results: data.results
      }));

      const result = await searchService.search(mockSearchRequest);

      // Results should be sorted by relevance score (descending)
      expect(result.results[0].relevanceScore).toBeGreaterThanOrEqual(result.results[1].relevanceScore);
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return search suggestions from multiple sources', async () => {
      const mockHistorySuggestions = ['gear assembly', 'gear box'];
      const mockFiles = [
        {
          id: 'file-1',
          tags: ['gear', 'transmission'],
          projectName: 'automotive',
          partName: 'gear_wheel'
        }
      ];
      const mockPopularTerms = [
        { query: 'gear system', count: 50 },
        { query: 'gear ratio', count: 30 }
      ];

      mockedSearchQueryModel.getSearchSuggestions.mockResolvedValue(mockHistorySuggestions);
      mockedCADFileModel.findAll.mockResolvedValue({ files: mockFiles });
      mockedSearchQueryModel.getPopularSearchTerms.mockResolvedValue(mockPopularTerms);

      const suggestions = await searchService.getSearchSuggestions('user-123', 'gear', 10);

      expect(suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            query: expect.stringContaining('gear'),
            type: expect.any(String),
            score: expect.any(Number)
          })
        ])
      );

      expect(suggestions.length).toBeLessThanOrEqual(10);
    });

    it('should handle errors gracefully', async () => {
      mockedSearchQueryModel.getSearchSuggestions.mockRejectedValue(new Error('Database error'));
      mockedCADFileModel.findAll.mockRejectedValue(new Error('Database error'));
      mockedSearchQueryModel.getPopularSearchTerms.mockRejectedValue(new Error('Database error'));

      const suggestions = await searchService.getSearchSuggestions('user-123', 'gear', 10);

      expect(suggestions).toEqual([]);
    });
  });

  describe('processNaturalLanguageQuery', () => {
    it('should extract intent, entities, and keywords', async () => {
      const query = 'find steel brackets with 10mm thickness';

      const result = await searchService.processNaturalLanguageQuery(query);

      expect(result).toEqual({
        intent: 'search',
        entities: expect.objectContaining({
          materials: expect.arrayContaining(['steel']),
          dimensions: expect.arrayContaining(['10mm'])
        }),
        keywords: expect.arrayContaining(['steel', 'brackets', 'thickness'])
      });
    });

    it('should handle similarity queries', async () => {
      const query = 'find similar gear assembly';

      const result = await searchService.processNaturalLanguageQuery(query);

      expect(result.intent).toBe('similarity');
      expect(result.keywords).toContain('similar');
      expect(result.keywords).toContain('gear');
      expect(result.keywords).toContain('assembly');
    });

    it('should extract file types', async () => {
      const query = 'find all dwg files with step format';

      const result = await searchService.processNaturalLanguageQuery(query);

      expect(result.entities.fileTypes).toEqual(['dwg', 'step']);
    });
  });

  describe('keyword search functionality', () => {
    it('should calculate keyword relevance correctly', async () => {
      const mockFile = {
        id: 'file-1',
        filename: 'gear_assembly.dwg',
        tags: ['mechanical', 'gear'],
        projectName: 'transmission',
        partName: 'main_gear',
        description: 'Primary gear assembly for automotive transmission'
      };

      mockedCADFileModel.search.mockResolvedValue({
        files: [mockFile],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      mockedSearchQueryModel.create.mockImplementation((data) => ({
        id: 'query-123',
        results: data.results
      }));

      const result = await searchService.search({
        query: 'gear assembly',
        userId: 'user-123',
        queryType: 'filtered'
      });

      expect(result.results[0].relevanceScore).toBeGreaterThan(0);
      expect(result.results[0].matchedFeatures).toContain('filename');
    });

    it('should match features correctly', async () => {
      const mockFile = {
        id: 'file-1',
        filename: 'pump.dwg',
        tags: ['pump', 'fluid'],
        projectName: 'hydraulic_system',
        partName: 'centrifugal_pump',
        description: 'High-pressure pump for hydraulic system'
      };

      mockedCADFileModel.search.mockResolvedValue({
        files: [mockFile],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      mockedSearchQueryModel.create.mockImplementation((data) => ({
        id: 'query-123',
        results: data.results
      }));

      const result = await searchService.search({
        query: 'pump hydraulic',
        userId: 'user-123',
        queryType: 'filtered'
      });

      const matchedFeatures = result.results[0].matchedFeatures;
      expect(matchedFeatures).toContain('filename');
      expect(matchedFeatures).toContain('tags');
      expect(matchedFeatures).toContain('project_name');
      expect(matchedFeatures).toContain('part_name');
      expect(matchedFeatures).toContain('description');
    });
  });

  describe('error handling', () => {
    it('should handle AI service timeout', async () => {
      mockedAxios.post.mockRejectedValue({ code: 'ECONNREFUSED' });
      mockedCADFileModel.search.mockResolvedValue({
        files: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockedSearchQueryModel.create.mockResolvedValue({
        id: 'query-123',
        results: []
      });

      const result = await searchService.search(mockSearchRequest);

      expect(result).toBeDefined();
      expect(mockedCADFileModel.search).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('AI service error'));
      mockedCADFileModel.search.mockRejectedValue(new Error('Database error'));

      await expect(searchService.search(mockSearchRequest)).rejects.toThrow('Keyword search failed');
    });

    it('should handle invalid AI response', async () => {
      mockedAxios.post.mockResolvedValue({ data: { invalid: 'response' } });
      
      // Mock keyword search fallback to also fail
      mockedCADFileModel.search.mockResolvedValue({
        files: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockedSearchQueryModel.create.mockResolvedValue({
        id: 'query-123',
        results: []
      });

      const result = await searchService.search(mockSearchRequest);
      expect(result).toBeDefined();
    });
  });

  describe('query type determination', () => {
    it('should identify natural language queries', () => {
      const nlQueries = [
        'what are the best gear assemblies?',
        'show me parts similar to this bracket',
        'find all components with high precision tolerances',
        'how many pump designs do we have?'
      ];

      nlQueries.forEach(query => {
        const queryType = (searchService as any).determineQueryType(query);
        expect(queryType).toBe('natural_language');
      });
    });

    it('should identify filtered queries', () => {
      const filteredQueries = [
        'gear',
        'pump assembly',
        'bracket'
      ];

      filteredQueries.forEach(query => {
        const queryType = (searchService as any).determineQueryType(query);
        expect(queryType).toBe('filtered');
      });
    });

    it('should identify hybrid queries', () => {
      const filters = { tags: ['mechanical'] };
      const queryType = (searchService as any).determineQueryType('gear assembly', filters);
      expect(queryType).toBe('hybrid');
    });
  });
});