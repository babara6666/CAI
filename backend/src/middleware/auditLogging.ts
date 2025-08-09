import { Request, Response, NextFunction } from 'express';
import { AuditLogService } from '../services/AuditLogService.js';
import { pool } from '../database/connection.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    username?: string;
  };
}

export class AuditLoggingMiddleware {
  private auditLogService: AuditLogService;

  constructor() {
    this.auditLogService = new AuditLogService(pool);
  }

  /**
   * Generic audit logging middleware
   */
  logAction = (
    action: string,
    resourceType: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low',
    getResourceId?: (req: Request) => string,
    getDetails?: (req: Request, res: Response) => Record<string, any>
  ) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Store original end function
      const originalEnd = res.end;
      
      // Override end function to log after response
      res.end = function(chunk?: any, encoding?: any) {
        // Call original end function
        originalEnd.call(this, chunk, encoding);
        
        // Log action asynchronously (don't block response)
        if (res.statusCode < 500) { // Don't log server errors as user actions
          setImmediate(async () => {
            try {
              const resourceId = getResourceId ? getResourceId(req) : undefined;
              const details = getDetails ? getDetails(req, res) : {};
              
              const enhancedDetails = {
                ...details,
                method: req.method,
                path: req.path,
                query: req.query,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || `req_${Date.now()}`
              };

              if (req.user) {
                await this.auditLogService.logUserAction(
                  req.user.id,
                  action,
                  resourceType,
                  resourceId,
                  enhancedDetails,
                  req.ip || req.connection.remoteAddress,
                  req.get('User-Agent'),
                  severity
                );
              } else {
                await this.auditLogService.logSystemAction(
                  action,
                  resourceType,
                  resourceId,
                  enhancedDetails,
                  severity
                );
              }
            } catch (error) {
              console.error('Failed to log audit action:', error);
            }
          });
        }
      };
      
      next();
    };
  };

  /**
   * Log authentication events
   */
  logAuthentication = (action: 'login' | 'logout' | 'login_failed' | 'token_refresh') => {
    return this.logAction(
      action,
      'authentication',
      action === 'login_failed' ? 'medium' : 'low',
      undefined,
      (req, res) => ({
        email: req.body?.email,
        success: res.statusCode < 400,
        failureReason: res.statusCode >= 400 ? 'Invalid credentials' : undefined
      })
    );
  };

  /**
   * Log file operations
   */
  logFileOperation = (action: 'file_upload' | 'file_download' | 'file_delete' | 'file_view') => {
    return this.logAction(
      action,
      'file',
      action === 'file_delete' ? 'medium' : 'low',
      (req) => req.params?.fileId || req.body?.fileId,
      (req, res) => ({
        filename: req.body?.filename || req.params?.filename,
        fileSize: req.body?.fileSize,
        mimeType: req.body?.mimeType,
        success: res.statusCode < 400
      })
    );
  };

  /**
   * Log search operations
   */
  logSearchOperation = () => {
    return this.logAction(
      'search_query',
      'search',
      'low',
      undefined,
      (req, res) => ({
        query: req.body?.query || req.query?.q,
        modelId: req.body?.modelId,
        filters: req.body?.filters,
        resultCount: res.locals?.resultCount || 0,
        responseTime: res.locals?.responseTime || 0
      })
    );
  };

  /**
   * Log AI/ML operations
   */
  logAIOperation = (action: 'model_training' | 'model_inference' | 'dataset_creation') => {
    return this.logAction(
      action,
      'ai_model',
      'medium',
      (req) => req.params?.modelId || req.body?.modelId,
      (req, res) => ({
        modelName: req.body?.name,
        datasetId: req.body?.datasetId,
        trainingConfig: req.body?.config,
        success: res.statusCode < 400
      })
    );
  };

  /**
   * Log administrative actions
   */
  logAdminAction = (action: string) => {
    return this.logAction(
      action,
      'admin',
      'high',
      (req) => req.params?.userId || req.params?.id,
      (req, res) => ({
        targetUser: req.body?.email || req.params?.email,
        changes: req.body,
        adminUser: req.user?.email,
        success: res.statusCode < 400
      })
    );
  };

  /**
   * Log security events
   */
  logSecurityEvent = (action: string) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await this.auditLogService.logSecurityEvent(
          req.user?.id,
          action,
          {
            path: req.path,
            method: req.method,
            query: req.query,
            body: this.sanitizeBody(req.body),
            headers: this.sanitizeHeaders(req.headers)
          },
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent')
        );
      } catch (error) {
        console.error('Failed to log security event:', error);
      }
      
      next();
    };
  };

  /**
   * Log data access events (for compliance)
   */
  logDataAccess = (dataType: string, operation: 'read' | 'write' | 'delete') => {
    return this.logAction(
      `data_${operation}`,
      'data',
      operation === 'delete' ? 'high' : 'medium',
      (req) => req.params?.id,
      (req, res) => ({
        dataType,
        operation,
        recordCount: res.locals?.recordCount || 1,
        success: res.statusCode < 400
      })
    );
  };

  /**
   * Log API rate limiting events
   */
  logRateLimit = () => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await this.auditLogService.logSecurityEvent(
          req.user?.id,
          'rate_limit_exceeded',
          {
            path: req.path,
            method: req.method,
            rateLimitInfo: {
              limit: res.get('X-RateLimit-Limit'),
              remaining: res.get('X-RateLimit-Remaining'),
              reset: res.get('X-RateLimit-Reset')
            }
          },
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent')
        );
      } catch (error) {
        console.error('Failed to log rate limit event:', error);
      }
      
      next();
    };
  };

  /**
   * Log permission denied events
   */
  logPermissionDenied = () => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await this.auditLogService.logSecurityEvent(
          req.user?.id,
          'permission_denied',
          {
            path: req.path,
            method: req.method,
            requiredRole: res.locals?.requiredRole,
            userRole: req.user?.role,
            resource: res.locals?.resource
          },
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent')
        );
      } catch (error) {
        console.error('Failed to log permission denied event:', error);
      }
      
      next();
    };
  };

  /**
   * Comprehensive request logging middleware
   */
  logRequest = () => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Store original end function
      const originalEnd = res.end;
      
      // Override end function to log after response
      res.end = function(chunk?: any, encoding?: any) {
        // Call original end function
        originalEnd.call(this, chunk, encoding);
        
        // Log request asynchronously
        setImmediate(async () => {
          try {
            const responseTime = Date.now() - startTime;
            const action = `${req.method.toLowerCase()}_request`;
            
            const details = {
              method: req.method,
              path: req.path,
              query: req.query,
              statusCode: res.statusCode,
              responseTime,
              userAgent: req.get('User-Agent'),
              contentLength: res.get('Content-Length'),
              referer: req.get('Referer')
            };

            if (req.user) {
              await this.auditLogService.logUserAction(
                req.user.id,
                action,
                'api_request',
                undefined,
                details,
                req.ip || req.connection.remoteAddress,
                req.get('User-Agent'),
                'low'
              );
            }
          } catch (error) {
            console.error('Failed to log request:', error);
          }
        });
      };
      
      next();
    };
  };

  /**
   * Sanitize request body for logging (remove sensitive data)
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize request headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}

// Create singleton instance
export const auditLogger = new AuditLoggingMiddleware();

// Export commonly used middleware functions
export const {
  logAction,
  logAuthentication,
  logFileOperation,
  logSearchOperation,
  logAIOperation,
  logAdminAction,
  logSecurityEvent,
  logDataAccess,
  logRateLimit,
  logPermissionDenied,
  logRequest
} = auditLogger;