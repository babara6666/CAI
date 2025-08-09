import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';

// Redis client for rate limiting (optional)
let redis: Redis | null = null;

// Only create Redis connection if not in test environment
if (process.env.NODE_ENV !== 'test') {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
  } catch (error) {
    console.warn('Redis connection failed, using memory store for rate limiting');
    redis = null;
  }
}

// Custom key generator that includes user ID for authenticated requests
const keyGenerator = (req: Request): string => {
  const userId = (req as any).user?.id;
  // Use proper IP extraction that handles IPv6
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || 'unknown';
  return userId ? `user:${userId}` : `ip:${ip}`;
};

// Custom error handler for rate limit exceeded
const rateLimitHandler = (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
      suggestions: [
        'Wait before making another request',
        'Consider upgrading your plan for higher rate limits',
        'Use pagination for bulk operations'
      ]
    }
  };
  
  res.status(429).json(response);
};

// Skip rate limiting for certain conditions
const skipRateLimit = (req: Request): boolean => {
  // Skip for health checks
  if (req.path === '/health') return true;
  
  // Skip for admin users (optional)
  const user = (req as any).user;
  if (user && user.role === 'admin' && process.env.SKIP_ADMIN_RATE_LIMIT === 'true') {
    return true;
  }
  
  return false;
};

// General API rate limiter
export const generalRateLimit = rateLimit({
  ...(redis && {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis!.call(...args),
    })
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each user/IP to 1000 requests per windowMs
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  ...(redis && {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis!.call(...args),
    })
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  keyGenerator: (req: Request) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || 'unknown';
  },
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limiter
export const uploadRateLimit = rateLimit({
  ...(redis && {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis!.call(...args),
    })
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each user to 100 uploads per hour
  keyGenerator,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

// Search rate limiter
export const searchRateLimit = rateLimit({
  ...(redis && {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis!.call(...args),
    })
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each user to 60 searches per minute
  keyGenerator,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

// AI model training rate limiter (very restrictive)
export const trainingRateLimit = rateLimit({
  ...(redis && {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis!.call(...args),
    })
  }),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each user to 5 training jobs per day
  keyGenerator,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

// Request throttling middleware for heavy operations
export const requestThrottling = (maxConcurrent: number = 10) => {
  const activeRequests = new Map<string, number>();
  
  return async (req: Request, res: Response, next: Function) => {
    const key = keyGenerator(req);
    const current = activeRequests.get(key) || 0;
    
    if (current >= maxConcurrent) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'REQUEST_THROTTLED',
          message: 'Too many concurrent requests. Please wait for current requests to complete.',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          suggestions: [
            'Wait for current requests to complete',
            'Reduce the number of concurrent requests',
            'Consider using batch operations'
          ]
        }
      };
      return res.status(429).json(response);
    }
    
    // Increment active request count
    activeRequests.set(key, current + 1);
    
    // Decrement on response finish
    res.on('finish', () => {
      const newCount = (activeRequests.get(key) || 1) - 1;
      if (newCount <= 0) {
        activeRequests.delete(key);
      } else {
        activeRequests.set(key, newCount);
      }
    });
    
    next();
  };
};

// Adaptive rate limiting based on system load
export const adaptiveRateLimit = () => {
  let currentMultiplier = 1.0;
  
  // Monitor system metrics (simplified version)
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    
    if (memUsagePercent > 0.8) {
      currentMultiplier = 0.5; // Reduce rate limits by 50%
    } else if (memUsagePercent > 0.6) {
      currentMultiplier = 0.75; // Reduce rate limits by 25%
    } else {
      currentMultiplier = 1.0; // Normal rate limits
    }
  }, 30000); // Check every 30 seconds
  
  return rateLimit({
    ...(redis && {
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis!.call(...args),
      })
    }),
    windowMs: 15 * 60 * 1000,
    max: (req: Request) => Math.floor(1000 * currentMultiplier),
    keyGenerator,
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Export Redis client for cleanup
export { redis };