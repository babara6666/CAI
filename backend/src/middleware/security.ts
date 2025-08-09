import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import { EncryptionService } from '../config/encryption.js';

/**
 * Security middleware for HTTPS/TLS enforcement and security headers
 */

/**
 * Force HTTPS redirect middleware
 */
export const forceHTTPS = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    res.redirect(301, `https://${req.get('host')}${req.url}`);
    return;
  }
  next();
};

/**
 * Enhanced security headers middleware
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // unsafe-eval needed for Three.js
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Disabled for Three.js compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

/**
 * API rate limiting middleware
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * File upload rate limiting
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 uploads per hour
  message: {
    success: false,
    error: {
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      message: 'Too many file uploads, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Request integrity verification middleware
 */
export const verifyRequestIntegrity = (req: Request, res: Response, next: NextFunction): void => {
  // Skip integrity check for GET requests
  if (req.method === 'GET') {
    next();
    return;
  }

  const contentHash = req.headers['x-content-hash'] as string;
  if (!contentHash) {
    next();
    return;
  }

  const bodyString = JSON.stringify(req.body);
  const computedHash = createHash('sha256').update(bodyString).digest('hex');

  if (contentHash !== computedHash) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INTEGRITY_CHECK_FAILED',
        message: 'Request integrity verification failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
    return;
  }

  next();
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  // Recursively sanitize object properties
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters and scripts
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Security event logging middleware
 */
export const logSecurityEvent = (eventType: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Log security event asynchronously
    setImmediate(async () => {
      try {
        const { SecurityEventService } = await import('../services/SecurityEventService.js');
        await SecurityEventService.logEvent({
          eventType,
          severity,
          userId: req.user?.id,
          resourceType: 'api_endpoint',
          resourceId: req.path,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: {
            method: req.method,
            path: req.path,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Failed to log security event:', error);
      }
    });

    next();
  };
};

/**
 * Suspicious activity detection middleware
 */
export const detectSuspiciousActivity = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /<script/gi, // XSS attempts
    /union\s+select/gi, // SQL injection
    /exec\s*\(/gi, // Command injection
    /eval\s*\(/gi, // Code injection
  ];

  const checkString = JSON.stringify(req.body) + JSON.stringify(req.query) + req.url;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      // Log suspicious activity
      setImmediate(async () => {
        try {
          const { SecurityEventService } = await import('../services/SecurityEventService.js');
          await SecurityEventService.logEvent({
            eventType: 'suspicious_activity',
            severity: 'high',
            userId: req.user?.id,
            resourceType: 'api_endpoint',
            resourceId: req.path,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: {
              pattern: pattern.source,
              matchedContent: checkString.substring(0, 500),
              method: req.method,
              path: req.path
            }
          });
        } catch (error) {
          console.error('Failed to log suspicious activity:', error);
        }
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'SUSPICIOUS_ACTIVITY_DETECTED',
          message: 'Request blocked due to suspicious activity',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
  }

  next();
};

/**
 * API key validation middleware (for external integrations)
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'API key is required for this endpoint',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
    return;
  }

  // Validate API key format and existence
  if (!/^[a-f0-9]{64}$/.test(apiKey)) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY_FORMAT',
        message: 'Invalid API key format',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
    return;
  }

  // TODO: Implement API key validation against database
  // For now, accept any properly formatted key
  next();
};

/**
 * CORS security middleware with dynamic origin validation
 */
export const secureCORS = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://localhost:3000',
    'https://cad-ai-platform.com',
    'https://www.cad-ai-platform.com'
  ];

  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) {
    next();
    return;
  }

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id, x-api-key, x-content-hash');
  } else {
    // Log unauthorized origin attempt
    setImmediate(async () => {
      try {
        const { SecurityEventService } = await import('../services/SecurityEventService.js');
        await SecurityEventService.logEvent({
          eventType: 'unauthorized_origin',
          severity: 'medium',
          resourceType: 'api_endpoint',
          resourceId: req.path,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: {
            origin,
            method: req.method,
            path: req.path
          }
        });
      } catch (error) {
        console.error('Failed to log unauthorized origin:', error);
      }
    });
  }

  next();
};