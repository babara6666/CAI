import compression from 'compression';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface CompressionOptions {
  threshold?: number;
  level?: number;
  chunkSize?: number;
  windowBits?: number;
  memLevel?: number;
  strategy?: number;
  filter?: (req: Request, res: Response) => boolean;
}

export class CompressionService {
  private static defaultOptions: CompressionOptions = {
    threshold: 1024, // Only compress responses larger than 1KB
    level: 6, // Compression level (1-9, 6 is default)
    chunkSize: 16 * 1024, // 16KB chunks
    windowBits: 15,
    memLevel: 8,
    strategy: 0, // Default strategy
  };

  // Create compression middleware with custom options
  static create(options: CompressionOptions = {}) {
    const config = { ...this.defaultOptions, ...options };

    return compression({
      threshold: config.threshold,
      level: config.level,
      chunkSize: config.chunkSize,
      windowBits: config.windowBits,
      memLevel: config.memLevel,
      strategy: config.strategy,
      filter: config.filter || this.shouldCompress,
    });
  }

  // Determine if response should be compressed
  private static shouldCompress(req: Request, res: Response): boolean {
    // Don't compress if client doesn't support it
    if (!req.headers['accept-encoding']?.includes('gzip')) {
      return false;
    }

    // Don't compress already compressed content
    const contentEncoding = res.getHeader('content-encoding');
    if (contentEncoding) {
      return false;
    }

    // Don't compress images, videos, or already compressed files
    const contentType = res.getHeader('content-type') as string;
    if (contentType) {
      const nonCompressibleTypes = [
        'image/',
        'video/',
        'audio/',
        'application/zip',
        'application/gzip',
        'application/x-rar-compressed',
        'application/pdf',
      ];

      if (nonCompressibleTypes.some(type => contentType.includes(type))) {
        return false;
      }
    }

    // Compress JSON, HTML, CSS, JS, and text content
    const compressibleTypes = [
      'application/json',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'text/plain',
      'application/xml',
      'text/xml',
    ];

    return compressibleTypes.some(type => contentType?.includes(type));
  }

  // Response optimization middleware
  static optimize() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const originalSend = res.send.bind(res);
      const originalJson = res.json.bind(res);

      // Override send method to add optimization
      res.send = function(data: any) {
        const responseTime = Date.now() - startTime;
        
        // Add performance headers
        res.set({
          'X-Response-Time': `${responseTime}ms`,
          'X-Powered-By': 'CAD-AI-Platform',
        });

        // Log slow responses
        if (responseTime > 1000) {
          logger.warn('Slow response detected:', {
            method: req.method,
            url: req.url,
            responseTime,
            statusCode: res.statusCode,
          });
        }

        return originalSend(data);
      };

      // Override json method to add optimization
      res.json = function(data: any) {
        const responseTime = Date.now() - startTime;
        
        // Add performance headers
        res.set({
          'X-Response-Time': `${responseTime}ms`,
          'X-Powered-By': 'CAD-AI-Platform',
        });

        // Optimize JSON response
        const optimizedData = CompressionService.optimizeJsonResponse(data);
        
        return originalJson(optimizedData);
      };

      next();
    };
  }

  // Optimize JSON responses by removing null values and empty objects
  private static optimizeJsonResponse(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.optimizeJsonResponse(item));
    }

    if (typeof data === 'object') {
      const optimized: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Skip null and undefined values
        if (value === null || value === undefined) {
          continue;
        }

        // Skip empty objects and arrays
        if (typeof value === 'object' && !Array.isArray(value)) {
          const optimizedValue = this.optimizeJsonResponse(value);
          if (Object.keys(optimizedValue).length > 0) {
            optimized[key] = optimizedValue;
          }
        } else if (Array.isArray(value)) {
          const optimizedArray = this.optimizeJsonResponse(value);
          if (optimizedArray.length > 0) {
            optimized[key] = optimizedArray;
          }
        } else {
          optimized[key] = value;
        }
      }

      return optimized;
    }

    return data;
  }

  // Brotli compression for modern browsers
  static brotli() {
    return (req: Request, res: Response, next: NextFunction) => {
      const acceptEncoding = req.headers['accept-encoding'] || '';
      
      if (acceptEncoding.includes('br')) {
        // Use Brotli compression for supported browsers
        res.set('Content-Encoding', 'br');
        res.set('Vary', 'Accept-Encoding');
      }
      
      next();
    };
  }

  // Response caching headers
  static cacheHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Set cache headers based on content type and route
      const path = req.path;
      const method = req.method;

      if (method === 'GET') {
        if (path.includes('/api/files/') && path.includes('/thumbnail')) {
          // Cache thumbnails for 1 hour
          res.set('Cache-Control', 'public, max-age=3600');
        } else if (path.includes('/api/search/')) {
          // Cache search results for 5 minutes
          res.set('Cache-Control', 'public, max-age=300');
        } else if (path.includes('/api/models/') || path.includes('/api/datasets/')) {
          // Cache model and dataset info for 15 minutes
          res.set('Cache-Control', 'public, max-age=900');
        } else if (path.includes('/api/users/') || path.includes('/api/admin/')) {
          // Don't cache user-specific or admin data
          res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        } else {
          // Default cache for other GET requests
          res.set('Cache-Control', 'public, max-age=60');
        }
      } else {
        // Don't cache non-GET requests
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }

      next();
    };
  }

  // Response size monitoring
  static sizeMonitoring() {
    return (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send.bind(res);
      const originalJson = res.json.bind(res);

      res.send = function(data: any) {
        const size = Buffer.byteLength(data, 'utf8');
        res.set('X-Response-Size', size.toString());
        
        // Log large responses
        if (size > 1024 * 1024) { // 1MB
          logger.warn('Large response detected:', {
            method: req.method,
            url: req.url,
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
          });
        }

        return originalSend(data);
      };

      res.json = function(data: any) {
        const serialized = JSON.stringify(data);
        const size = Buffer.byteLength(serialized, 'utf8');
        res.set('X-Response-Size', size.toString());
        
        // Log large responses
        if (size > 1024 * 1024) { // 1MB
          logger.warn('Large JSON response detected:', {
            method: req.method,
            url: req.url,
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
          });
        }

        return originalJson(data);
      };

      next();
    };
  }
}

// Pagination helper for large datasets
export class PaginationOptimizer {
  static paginate<T>(
    data: T[],
    page: number = 1,
    limit: number = 20,
    maxLimit: number = 100
  ): {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  } {
    // Enforce maximum limit
    const actualLimit = Math.min(limit, maxLimit);
    const actualPage = Math.max(1, page);
    
    const startIndex = (actualPage - 1) * actualLimit;
    const endIndex = startIndex + actualLimit;
    
    const paginatedData = data.slice(startIndex, endIndex);
    const totalPages = Math.ceil(data.length / actualLimit);
    
    return {
      data: paginatedData,
      pagination: {
        page: actualPage,
        limit: actualLimit,
        total: data.length,
        totalPages,
        hasNext: actualPage < totalPages,
        hasPrev: actualPage > 1,
      },
    };
  }

  // Cursor-based pagination for better performance with large datasets
  static cursorPaginate<T extends { id: string; createdAt: Date }>(
    data: T[],
    cursor?: string,
    limit: number = 20,
    maxLimit: number = 100
  ): {
    data: T[];
    pagination: {
      limit: number;
      hasNext: boolean;
      nextCursor?: string;
    };
  } {
    const actualLimit = Math.min(limit, maxLimit);
    let filteredData = data;

    // Filter by cursor if provided
    if (cursor) {
      const cursorDate = new Date(Buffer.from(cursor, 'base64').toString());
      filteredData = data.filter(item => item.createdAt < cursorDate);
    }

    // Sort by creation date (newest first)
    filteredData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Take one extra item to check if there's a next page
    const paginatedData = filteredData.slice(0, actualLimit + 1);
    const hasNext = paginatedData.length > actualLimit;

    // Remove the extra item if it exists
    if (hasNext) {
      paginatedData.pop();
    }

    // Generate next cursor
    const nextCursor = hasNext && paginatedData.length > 0
      ? Buffer.from(paginatedData[paginatedData.length - 1].createdAt.toISOString()).toString('base64')
      : undefined;

    return {
      data: paginatedData,
      pagination: {
        limit: actualLimit,
        hasNext,
        nextCursor,
      },
    };
  }
}