import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { SecurityEventService } from '../services/SecurityEventService.js';

/**
 * Security-focused validation schemas and middleware
 */

// Common security patterns
const SAFE_STRING_PATTERN = /^[a-zA-Z0-9\s\-_.,!?()[\]{}:;"'@#$%^&*+=|\\/<>~`]*$/;
const FILENAME_PATTERN = /^[a-zA-Z0-9\s\-_.,()[\]{}]+\.[a-zA-Z0-9]{1,10}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Dangerous patterns to detect
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
  /javascript:/gi, // JavaScript protocol
  /on\w+\s*=/gi, // Event handlers
  /\.\.\//g, // Directory traversal
  /union\s+select/gi, // SQL injection
  /exec\s*\(/gi, // Command execution
  /eval\s*\(/gi, // Code evaluation
  /<iframe/gi, // Iframe injection
  /<object/gi, // Object injection
  /<embed/gi, // Embed injection
  /data:text\/html/gi, // Data URI XSS
  /vbscript:/gi, // VBScript protocol
];

/**
 * Base validation schemas
 */
export const securitySchemas = {
  // Safe string that doesn't contain dangerous characters
  safeString: Joi.string()
    .pattern(SAFE_STRING_PATTERN)
    .max(1000)
    .messages({
      'string.pattern.base': 'String contains invalid or potentially dangerous characters',
      'string.max': 'String is too long (maximum 1000 characters)'
    }),

  // Filename validation
  filename: Joi.string()
    .pattern(FILENAME_PATTERN)
    .min(1)
    .max(255)
    .messages({
      'string.pattern.base': 'Invalid filename format',
      'string.max': 'Filename is too long (maximum 255 characters)'
    }),

  // UUID validation
  uuid: Joi.string()
    .pattern(UUID_PATTERN)
    .messages({
      'string.pattern.base': 'Invalid UUID format'
    }),

  // Email validation
  email: Joi.string()
    .pattern(EMAIL_PATTERN)
    .max(254)
    .messages({
      'string.pattern.base': 'Invalid email format',
      'string.max': 'Email is too long (maximum 254 characters)'
    }),

  // IP address validation
  ipAddress: Joi.string()
    .pattern(IP_PATTERN)
    .messages({
      'string.pattern.base': 'Invalid IP address format'
    }),

  // Password validation with security requirements
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password is too long (maximum 128 characters)',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),

  // Search query validation
  searchQuery: Joi.string()
    .min(1)
    .max(500)
    .pattern(/^[a-zA-Z0-9\s\-_.,!?()[\]{}:;"'@#$%^&*+=|\\/<>~`]*$/)
    .messages({
      'string.min': 'Search query cannot be empty',
      'string.max': 'Search query is too long (maximum 500 characters)',
      'string.pattern.base': 'Search query contains invalid characters'
    }),

  // File metadata validation
  fileMetadata: Joi.object({
    filename: Joi.string().pattern(FILENAME_PATTERN).required(),
    size: Joi.number().integer().min(0).max(500 * 1024 * 1024), // 500MB max
    mimeType: Joi.string().pattern(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/).required(),
    tags: Joi.array().items(Joi.string().pattern(SAFE_STRING_PATTERN).max(50)).max(20),
    description: Joi.string().pattern(SAFE_STRING_PATTERN).max(2000).allow('')
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).max(10000).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('created_at', 'updated_at', 'name', 'size').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Date range validation
  dateRange: Joi.object({
    startDate: Joi.date().iso().max('now'),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).max('now')
  }).with('startDate', 'endDate'),

  // User role validation
  userRole: Joi.string().valid('admin', 'engineer', 'viewer').required(),

  // API key validation
  apiKey: Joi.string().pattern(/^[a-f0-9]{64}$/).messages({
    'string.pattern.base': 'Invalid API key format'
  })
};

/**
 * Validation middleware factory
 */
export const validateRequest = (schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get data from specified source
      const data = req[source];

      // Validate against schema
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        // Log validation failure as security event
        await SecurityEventService.logEvent({
          eventType: 'input_validation_failed',
          severity: 'medium',
          userId: req.user?.id,
          resourceType: 'api_endpoint',
          resourceId: req.path,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: {
            validationErrors: error.details.map(detail => ({
              field: detail.path.join('.'),
              message: detail.message,
              value: detail.context?.value
            })),
            source,
            method: req.method
          }
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.details.map(detail => ({
              field: detail.path.join('.'),
              message: detail.message
            })),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      // Replace original data with validated and sanitized data
      req[source] = value;
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
};

/**
 * Deep sanitization middleware
 */
export const deepSanitize = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      // Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
          // Log potential attack attempt
          setImmediate(async () => {
            try {
              await SecurityEventService.logEvent({
                eventType: 'malicious_input_detected',
                severity: 'high',
                userId: req.user?.id,
                resourceType: 'api_endpoint',
                resourceId: req.path,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                details: {
                  pattern: pattern.source,
                  value: value.substring(0, 200), // Log first 200 chars
                  method: req.method
                }
              });
            } catch (error) {
              console.error('Failed to log malicious input:', error);
            }
          });

          // Remove dangerous content
          value = value.replace(pattern, '');
        }
      }

      // Additional sanitization
      return value
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitize key names too
        const sanitizedKey = key.replace(/[^\w\-_.]/g, '');
        if (sanitizedKey) {
          sanitized[sanitizedKey] = sanitizeValue(val);
        }
      }
      return sanitized;
    }

    return value;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
};

/**
 * Content Security Policy validation
 */
export const validateCSP = (req: Request, res: Response, next: NextFunction): void => {
  const contentType = req.get('Content-Type');
  
  // Check for potentially dangerous content types
  const dangerousContentTypes = [
    'text/html',
    'application/javascript',
    'text/javascript',
    'application/x-javascript'
  ];

  if (contentType && dangerousContentTypes.some(type => contentType.includes(type))) {
    // Log potential content injection attempt
    setImmediate(async () => {
      try {
        await SecurityEventService.logEvent({
          eventType: 'dangerous_content_type',
          severity: 'medium',
          userId: req.user?.id,
          resourceType: 'api_endpoint',
          resourceId: req.path,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: {
            contentType,
            method: req.method,
            bodySize: req.get('Content-Length')
          }
        });
      } catch (error) {
        console.error('Failed to log dangerous content type:', error);
      }
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CONTENT_TYPE',
        message: 'Content type not allowed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
    return;
  }

  next();
};

/**
 * File upload security validation
 */
export const validateFileUpload = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.files && !req.file) {
    next();
    return;
  }

  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];
  
  for (const file of files) {
    if (!file) continue;

    // Check file size
    if (file.size > 500 * 1024 * 1024) { // 500MB
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds maximum allowed size (500MB)',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    // Check file type
    const allowedMimeTypes = [
      'application/dwg',
      'application/dxf',
      'application/step',
      'application/iges',
      'application/x-step',
      'application/octet-stream',
      'model/step',
      'model/iges'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      // Log suspicious file upload
      setImmediate(async () => {
        try {
          await SecurityEventService.logEvent({
            eventType: 'suspicious_file_upload',
            severity: 'medium',
            userId: req.user?.id,
            resourceType: 'file_upload',
            resourceId: file.originalname,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: {
              filename: file.originalname,
              mimetype: file.mimetype,
              size: file.size
            }
          });
        } catch (error) {
          console.error('Failed to log suspicious file upload:', error);
        }
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'File type not allowed',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    // Check filename
    if (!FILENAME_PATTERN.test(file.originalname)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILENAME',
          message: 'Invalid filename format',
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
 * Rate limiting validation
 */
export const validateRateLimit = (windowMs: number, maxRequests: number) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip + (req.user?.id || 'anonymous');
    const now = Date.now();
    
    const clientData = requestCounts.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      // Reset or initialize counter
      requestCounts.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      // Log rate limit violation
      setImmediate(async () => {
        try {
          await SecurityEventService.logEvent({
            eventType: 'rate_limit_exceeded',
            severity: 'medium',
            userId: req.user?.id,
            resourceType: 'api_endpoint',
            resourceId: req.path,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: {
              requestCount: clientData.count,
              maxRequests,
              windowMs,
              method: req.method
            }
          });
        } catch (error) {
          console.error('Failed to log rate limit violation:', error);
        }
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        }
      });
      return;
    }

    // Increment counter
    clientData.count++;
    next();
  };
};