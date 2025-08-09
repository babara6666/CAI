import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../services/CacheService';
import { logger } from '../utils/logger';

export interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  skipCache?: (req: Request) => boolean;
}

export class CacheMiddleware {
  constructor(private cacheService: CacheService) {}

  // Cache GET requests
  cache(options: CacheOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Skip cache if condition is met
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      const cacheKey = options.keyGenerator 
        ? options.keyGenerator(req)
        : this.generateCacheKey(req);

      try {
        // Try to get from cache
        const cachedData = await this.cacheService.get(cacheKey);
        
        if (cachedData) {
          logger.debug(`Cache hit for key: ${cacheKey}`);
          return res.json(cachedData);
        }

        logger.debug(`Cache miss for key: ${cacheKey}`);

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache response
        res.json = (data: any) => {
          // Check if we should cache this response
          if (options.condition && !options.condition(req, res)) {
            return originalJson(data);
          }

          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.cacheService.set(cacheKey, data, options.ttl)
              .catch(error => logger.error('Failed to cache response:', error));
          }

          return originalJson(data);
        };

        next();
      } catch (error) {
        logger.error('Cache middleware error:', error);
        next();
      }
    };
  }

  // Invalidate cache patterns
  invalidate(patterns: string | string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
      
      // Store original methods
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const invalidateCache = async () => {
        try {
          for (const pattern of patternsArray) {
            const resolvedPattern = this.resolvePattern(pattern, req);
            await this.cacheService.invalidatePattern(resolvedPattern);
            logger.debug(`Invalidated cache pattern: ${resolvedPattern}`);
          }
        } catch (error) {
          logger.error('Cache invalidation error:', error);
        }
      };

      // Override response methods to invalidate cache after successful operations
      res.json = (data: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          invalidateCache();
        }
        return originalJson(data);
      };

      res.send = (data: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          invalidateCache();
        }
        return originalSend(data);
      };

      next();
    };
  }

  private generateCacheKey(req: Request): string {
    const baseKey = `${req.method}:${req.path}`;
    const queryString = Object.keys(req.query).length > 0 
      ? `:${Buffer.from(JSON.stringify(req.query)).toString('base64')}`
      : '';
    const userContext = req.user ? `:user:${req.user.id}` : '';
    
    return `api${baseKey}${queryString}${userContext}`;
  }

  private resolvePattern(pattern: string, req: Request): string {
    return pattern
      .replace(':userId', req.user?.id || '*')
      .replace(':fileId', req.params.id || '*')
      .replace(':datasetId', req.params.datasetId || '*')
      .replace(':modelId', req.params.modelId || '*');
  }
}

// Specific cache configurations for different endpoints
export const cacheConfigs = {
  // Cache user data for 5 minutes
  userData: {
    ttl: 300,
    keyGenerator: (req: Request) => CacheService.keys.user(req.user?.id || 'anonymous'),
  },

  // Cache CAD file metadata for 1 hour
  cadFileMetadata: {
    ttl: 3600,
    keyGenerator: (req: Request) => CacheService.keys.cadFileMetadata(req.params.id),
  },

  // Cache search results for 10 minutes
  searchResults: {
    ttl: 600,
    keyGenerator: (req: Request) => {
      const query = req.body.query || req.query.q || '';
      const filters = JSON.stringify(req.body.filters || req.query.filters || {});
      return CacheService.keys.searchResults(query, filters);
    },
  },

  // Cache AI model info for 30 minutes
  aiModelInfo: {
    ttl: 1800,
    keyGenerator: (req: Request) => CacheService.keys.aiModel(req.params.id),
  },

  // Cache dataset info for 15 minutes
  datasetInfo: {
    ttl: 900,
    keyGenerator: (req: Request) => CacheService.keys.dataset(req.params.id),
  },

  // Cache system metrics for 1 minute
  systemMetrics: {
    ttl: 60,
    keyGenerator: () => CacheService.keys.systemMetrics(),
  },
};

// Cache invalidation patterns
export const invalidationPatterns = {
  userUpdate: ['user:*'],
  cadFileUpdate: ['cad-file:*', 'search:*', 'dataset:*'],
  searchFeedback: ['search:*'],
  modelUpdate: ['ai-model:*', 'search:*'],
  datasetUpdate: ['dataset:*', 'ai-model:*'],
  systemUpdate: ['metrics:*'],
};