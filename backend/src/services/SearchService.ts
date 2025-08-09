import axios from 'axios';
import { SearchQuery, SearchResult, SearchFilters, QueryType, CADFile, AIModel } from '../types/index.js';
import { SearchQueryModel } from '../models/SearchQuery.js';
import { CADFileModel } from '../models/CADFile.js';
import { AIModelModel } from '../models/AIModel.js';

export interface SearchRequest {
  query: string;
  queryType?: QueryType;
  filters?: SearchFilters;
  modelId?: string;
  userId: string;
  limit?: number;
}

export interface AISearchResponse {
  query: string;
  model_id: string;
  model_type: string;
  results: Array<{
    file_id: string;
    similarity_score: number;
    confidence: number;
    features?: number[];
  }>;
  processing_time: number;
}

export interface SearchSuggestion {
  query: string;
  type: 'history' | 'metadata' | 'popular';
  score: number;
}

export class SearchService {
  private aiServiceUrl: string;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8002';
  }

  /**
   * Perform intelligent search with natural language processing
   */
  async search(request: SearchRequest): Promise<SearchQuery> {
    const startTime = Date.now();
    
    try {
      // Determine query type if not specified
      const queryType = request.queryType || this.determineQueryType(request.query, request.filters);
      
      let results: SearchResult[] = [];
      let modelId: string | undefined = request.modelId;

      // Try AI-powered search first
      if (queryType === 'natural_language' || queryType === 'hybrid') {
        try {
          const aiResults = await this.performAISearch(request.query, request.modelId, request.limit);
          results = await this.processAIResults(aiResults);
          modelId = aiResults.model_id;
        } catch (error) {
          console.warn('AI search failed, falling back to keyword search:', error);
          // Fall back to keyword search
          results = await this.performKeywordSearch(request.query, request.filters, request.limit);
        }
      } else {
        // Use filtered/keyword search
        results = await this.performKeywordSearch(request.query, request.filters, request.limit);
      }

      // Apply additional filtering if specified
      if (request.filters) {
        results = await this.applyFilters(results, request.filters);
      }

      // Rank and sort results
      results = this.rankResults(results, request.query, queryType);

      const responseTime = Date.now() - startTime;

      // Save search query to database
      const searchQuery = await SearchQueryModel.create({
        userId: request.userId,
        query: request.query,
        queryType,
        filters: request.filters,
        modelId,
        responseTime,
        results: results.map((result, index) => ({
          fileId: result.fileId,
          relevanceScore: result.relevanceScore,
          confidence: result.confidence,
          matchedFeatures: result.matchedFeatures,
          position: index + 1
        }))
      });

      return searchQuery;
    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSearchSuggestions(userId: string, partial: string, limit: number = 10): Promise<SearchSuggestion[]> {
    const suggestions: SearchSuggestion[] = [];

    try {
      // Get suggestions from search history
      const historySuggestions = await SearchQueryModel.getSearchSuggestions(userId, partial, Math.ceil(limit / 3));
      suggestions.push(...historySuggestions.map(query => ({
        query,
        type: 'history' as const,
        score: 0.8
      })));

      // Get suggestions from file metadata
      const metadataSuggestions = await this.getMetadataSuggestions(partial, Math.ceil(limit / 3));
      suggestions.push(...metadataSuggestions);

      // Get popular search terms
      const popularTerms = await SearchQueryModel.getPopularSearchTerms(Math.ceil(limit / 3));
      const popularSuggestions = popularTerms
        .filter(term => term.query.toLowerCase().includes(partial.toLowerCase()))
        .map(term => ({
          query: term.query,
          type: 'popular' as const,
          score: Math.min(term.count / 100, 1.0) // Normalize count to 0-1
        }));
      suggestions.push(...popularSuggestions);

      // Sort by score and remove duplicates
      const uniqueSuggestions = suggestions
        .filter((suggestion, index, self) => 
          self.findIndex(s => s.query === suggestion.query) === index
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return uniqueSuggestions;
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Process natural language query to extract search intent
   */
  async processNaturalLanguageQuery(query: string): Promise<{
    intent: string;
    entities: Record<string, string[]>;
    keywords: string[];
  }> {
    try {
      // Simple NLP processing - in production, this could use more sophisticated NLP
      const intent = this.extractIntent(query);
      const entities = this.extractEntities(query);
      const keywords = this.extractKeywords(query);

      return { intent, entities, keywords };
    } catch (error) {
      console.error('NLP processing failed:', error);
      return {
        intent: 'search',
        entities: {},
        keywords: query.split(' ').filter(word => word.length > 2)
      };
    }
  }

  /**
   * Perform AI-powered similarity search
   */
  private async performAISearch(query: string, modelId?: string, limit: number = 10): Promise<AISearchResponse> {
    try {
      const response = await axios.post(`${this.aiServiceUrl}/api/inference/search`, {
        query,
        model_id: modelId,
        top_k: limit
      }, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.data || !response.data.results) {
        throw new Error('Invalid response from AI service');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('AI service is unavailable');
        }
        throw new Error(`AI service error: ${error.response?.data?.detail || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Perform keyword-based search as fallback
   */
  private async performKeywordSearch(query: string, filters?: SearchFilters, limit: number = 10): Promise<SearchResult[]> {
    try {
      // Extract keywords from query
      const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      
      // Build search conditions
      const searchConditions: any = {};
      
      if (keywords.length > 0) {
        // Search in filename, tags, project name, part name, and description
        searchConditions.searchTerms = keywords;
      }

      // Apply filters
      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          searchConditions.tags = filters.tags;
        }
        if (filters.projectName) {
          searchConditions.projectName = filters.projectName;
        }
        if (filters.partName) {
          searchConditions.partName = filters.partName;
        }
        if (filters.uploadedBy && filters.uploadedBy.length > 0) {
          searchConditions.uploadedBy = filters.uploadedBy;
        }
        if (filters.dateRange) {
          searchConditions.dateRange = filters.dateRange;
        }
        if (filters.fileSize) {
          searchConditions.fileSize = filters.fileSize;
        }
      }

      // Perform database search
      const { files } = await CADFileModel.search(searchConditions, { limit });

      // Convert to search results with basic relevance scoring
      const results: SearchResult[] = files.map(file => {
        const relevanceScore = this.calculateKeywordRelevance(file, keywords);
        return {
          fileId: file.id,
          relevanceScore,
          confidence: 0.7, // Lower confidence for keyword search
          matchedFeatures: this.getMatchedFeatures(file, keywords)
        };
      });

      return results;
    } catch (error) {
      console.error('Keyword search failed:', error);
      throw new Error('Keyword search failed');
    }
  }

  /**
   * Process AI search results into standard format
   */
  private async processAIResults(aiResponse: AISearchResponse): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const aiResult of aiResponse.results) {
      // Verify file exists
      const file = await CADFileModel.findById(aiResult.file_id);
      if (file) {
        results.push({
          fileId: aiResult.file_id,
          relevanceScore: aiResult.similarity_score,
          confidence: aiResult.confidence,
          matchedFeatures: ['ai_similarity'] // AI-based matching
        });
      }
    }

    return results;
  }

  /**
   * Apply additional filters to search results
   */
  private async applyFilters(results: SearchResult[], filters: SearchFilters): Promise<SearchResult[]> {
    if (!filters) return results;

    const filteredResults: SearchResult[] = [];

    for (const result of results) {
      const file = await CADFileModel.findById(result.fileId);
      if (!file) continue;

      let includeResult = true;

      // Apply date range filter
      if (filters.dateRange) {
        const uploadDate = new Date(file.uploadedAt);
        if (uploadDate < filters.dateRange.startDate || uploadDate > filters.dateRange.endDate) {
          includeResult = false;
        }
      }

      // Apply file size filter
      if (filters.fileSize && includeResult) {
        if (filters.fileSize.min && file.fileSize < filters.fileSize.min) {
          includeResult = false;
        }
        if (filters.fileSize.max && file.fileSize > filters.fileSize.max) {
          includeResult = false;
        }
      }

      // Apply tag filter
      if (filters.tags && filters.tags.length > 0 && includeResult) {
        const hasMatchingTag = filters.tags.some(tag => 
          file.tags && file.tags.some(fileTag => fileTag.toLowerCase().includes(tag.toLowerCase()))
        );
        if (!hasMatchingTag) {
          includeResult = false;
        }
      }

      // Apply project name filter
      if (filters.projectName && includeResult) {
        if (!file.projectName || !file.projectName.toLowerCase().includes(filters.projectName.toLowerCase())) {
          includeResult = false;
        }
      }

      // Apply part name filter
      if (filters.partName && includeResult) {
        if (!file.partName || !file.partName.toLowerCase().includes(filters.partName.toLowerCase())) {
          includeResult = false;
        }
      }

      // Apply uploaded by filter
      if (filters.uploadedBy && filters.uploadedBy.length > 0 && includeResult) {
        if (!filters.uploadedBy.includes(file.uploadedBy)) {
          includeResult = false;
        }
      }

      if (includeResult) {
        filteredResults.push(result);
      }
    }

    return filteredResults;
  }

  /**
   * Rank and sort search results
   */
  private rankResults(results: SearchResult[], query: string, queryType: QueryType): SearchResult[] {
    return results
      .map(result => ({
        ...result,
        // Boost relevance for natural language queries
        relevanceScore: queryType === 'natural_language' 
          ? result.relevanceScore * 1.1 
          : result.relevanceScore
      }))
      .sort((a, b) => {
        // Primary sort by relevance score
        if (Math.abs(a.relevanceScore - b.relevanceScore) > 0.01) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Secondary sort by confidence
        return b.confidence - a.confidence;
      });
  }

  /**
   * Determine query type based on query content and filters
   */
  private determineQueryType(query: string, filters?: SearchFilters): QueryType {
    // If filters are provided, it's likely a filtered search
    if (filters && Object.keys(filters).length > 0) {
      return 'hybrid';
    }

    // Check if query looks like natural language
    const words = query.split(/\s+/);
    const hasQuestionWords = /\b(what|where|when|how|why|which|who)\b/i.test(query);
    const hasConnectors = /\b(and|or|with|like|similar|find|show|get)\b/i.test(query);
    const isLongQuery = words.length > 3;

    if (hasQuestionWords || hasConnectors || isLongQuery) {
      return 'natural_language';
    }

    return 'filtered';
  }

  /**
   * Calculate keyword relevance score
   */
  private calculateKeywordRelevance(file: CADFile, keywords: string[]): number {
    let score = 0;
    const maxScore = keywords.length;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      
      // Check filename (highest weight)
      if (file.filename.toLowerCase().includes(keywordLower)) {
        score += 0.4;
      }
      
      // Check tags
      if (file.tags && file.tags.some(tag => tag.toLowerCase().includes(keywordLower))) {
        score += 0.3;
      }
      
      // Check project name
      if (file.projectName && file.projectName.toLowerCase().includes(keywordLower)) {
        score += 0.2;
      }
      
      // Check part name
      if (file.partName && file.partName.toLowerCase().includes(keywordLower)) {
        score += 0.2;
      }
      
      // Check description
      if (file.description && file.description.toLowerCase().includes(keywordLower)) {
        score += 0.1;
      }
    }

    return Math.min(score / maxScore, 1.0);
  }

  /**
   * Get matched features for keyword search
   */
  private getMatchedFeatures(file: CADFile, keywords: string[]): string[] {
    const features: string[] = [];

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      
      if (file.filename.toLowerCase().includes(keywordLower)) {
        features.push('filename');
      }
      if (file.tags && file.tags.some(tag => tag.toLowerCase().includes(keywordLower))) {
        features.push('tags');
      }
      if (file.projectName && file.projectName.toLowerCase().includes(keywordLower)) {
        features.push('project_name');
      }
      if (file.partName && file.partName.toLowerCase().includes(keywordLower)) {
        features.push('part_name');
      }
      if (file.description && file.description.toLowerCase().includes(keywordLower)) {
        features.push('description');
      }
    }

    return [...new Set(features)]; // Remove duplicates
  }

  /**
   * Get metadata-based suggestions
   */
  private async getMetadataSuggestions(partial: string, limit: number): Promise<SearchSuggestion[]> {
    try {
      const suggestions: SearchSuggestion[] = [];
      
      // Get suggestions from file metadata
      const { files } = await CADFileModel.findAll({}, { limit: 100 });
      
      const partialLower = partial.toLowerCase();
      
      // Collect unique values from metadata
      const tagSuggestions = new Set<string>();
      const projectSuggestions = new Set<string>();
      const partSuggestions = new Set<string>();
      
      for (const file of files) {
        // Tags
        if (file.tags) {
          file.tags.forEach(tag => {
            if (tag.toLowerCase().includes(partialLower)) {
              tagSuggestions.add(tag);
            }
          });
        }
        
        // Project names
        if (file.projectName && file.projectName.toLowerCase().includes(partialLower)) {
          projectSuggestions.add(file.projectName);
        }
        
        // Part names
        if (file.partName && file.partName.toLowerCase().includes(partialLower)) {
          partSuggestions.add(file.partName);
        }
      }
      
      // Convert to suggestions
      [...tagSuggestions].slice(0, Math.ceil(limit / 3)).forEach(tag => {
        suggestions.push({
          query: tag,
          type: 'metadata',
          score: 0.6
        });
      });
      
      [...projectSuggestions].slice(0, Math.ceil(limit / 3)).forEach(project => {
        suggestions.push({
          query: project,
          type: 'metadata',
          score: 0.7
        });
      });
      
      [...partSuggestions].slice(0, Math.ceil(limit / 3)).forEach(part => {
        suggestions.push({
          query: part,
          type: 'metadata',
          score: 0.7
        });
      });
      
      return suggestions.slice(0, limit);
    } catch (error) {
      console.error('Failed to get metadata suggestions:', error);
      return [];
    }
  }

  /**
   * Extract intent from natural language query
   */
  private extractIntent(query: string): string {
    const queryLower = query.toLowerCase();
    
    // Check for similarity intent first (more specific)
    if (/\b(similar|like|compare|match)\b/.test(queryLower)) {
      return 'similarity';
    }
    if (/\b(what|which|how many|count)\b/.test(queryLower)) {
      return 'question';
    }
    if (/\b(find|search|look|show|get|display)\b/.test(queryLower)) {
      return 'search';
    }
    
    return 'search';
  }

  /**
   * Extract entities from natural language query
   */
  private extractEntities(query: string): Record<string, string[]> {
    const entities: Record<string, string[]> = {};
    const queryLower = query.toLowerCase();
    
    // Extract file types
    const fileTypes = ['dwg', 'dxf', 'step', 'iges', 'stl', 'obj', 'ply'];
    const foundFileTypes = fileTypes.filter(type => queryLower.includes(type));
    if (foundFileTypes.length > 0) {
      entities.fileTypes = foundFileTypes;
    }
    
    // Extract dimensions/measurements
    const dimensionPattern = /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|ft)/g;
    const dimensions = [];
    let match;
    while ((match = dimensionPattern.exec(queryLower)) !== null) {
      dimensions.push(`${match[1]}${match[2]}`);
    }
    if (dimensions.length > 0) {
      entities.dimensions = dimensions;
    }
    
    // Extract materials (basic list)
    const materials = ['steel', 'aluminum', 'plastic', 'wood', 'copper', 'brass', 'titanium'];
    const foundMaterials = materials.filter(material => queryLower.includes(material));
    if (foundMaterials.length > 0) {
      entities.materials = foundMaterials;
    }
    
    return entities;
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'find', 'search', 'show', 'get', 'like'
    ]);
    
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => /^[a-zA-Z0-9]+$/.test(word)); // Only alphanumeric
  }
}