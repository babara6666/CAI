import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AuditLoggingMiddleware } from '../auditLogging.js';
import { AuditLogService } from '../../services/AuditLogService.js';

// Mock the AuditLogService
vi.mock('../../services/AuditLogService.js');

interface MockRequest extends Partial<Request> {
  user?: {
    id: string;
    email: string;
    role: string;
    username?: string;
  };
  ip?: string;
  connection?: { remoteAddress?: string };
  headers: Record<string, string>;
  get: (header: string) => string | undefined;
  method: string;
  path: string;
  query: any;
  body: any;
  params: any;
}

interface MockResponse extends Partial<Response> {
  statusCode: number;
  locals?: any;
  end: (chunk?: any, encoding?: any) => void;
  get: (header: string) => string | undefined;
}

describe('AuditLoggingMiddleware', () => {
  let auditMiddleware: AuditLoggingMiddleware;
  let mockAuditLogService: any;
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;
  let originalEnd: (chunk?: any, encoding?: any) => void;

  beforeEach(() => {
    // Create mock audit log service
    mockAuditLogService = {
      logUserAction: vi.fn(),
      logSystemAction: vi.fn(),
      logSecurityEvent: vi.fn()
    };

    // Mock the AuditLogService constructor
    vi.mocked(AuditLogService).mockImplementation(() => mockAuditLogService);

    auditMiddleware = new AuditLoggingMiddleware();

    // Create mock request
    mockRequest = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'engineer',
        username: 'testuser'
      },
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' },
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-request-id': 'req-123'
      },
      get: vi.fn((header: string) => mockRequest.headers[header.toLowerCase()]),
      method: 'POST',
      path: '/api/files/upload',
      query: { test: 'value' },
      body: { filename: 'test.dwg' },
      params: { fileId: 'file-123' }
    };

    // Create mock response
    originalEnd = vi.fn();
    mockResponse = {
      statusCode: 200,
      locals: {},
      end: originalEnd,
      get: vi.fn()
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('logAction', () => {
    it('should log user action after response', async () => {
      const middleware = auditMiddleware.logAction(
        'file_upload',
        'file',
        'medium',
        (req) => req.params?.fileId,
        (req, res) => ({ filename: req.body?.filename })
      );

      // Execute middleware
      middleware(mockRequest as any, mockResponse as any, mockNext);

      // Verify next was called
      expect(mockNext).toHaveBeenCalled();

      // Simulate response end
      mockResponse.end!('response data');

      // Wait for async logging
      await new Promise(resolve => setImmediate(resolve));

      // Verify audit log was called
      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_upload',
        'file',
        'file-123',
        expect.objectContaining({
          filename: 'test.dwg',
          method: 'POST',
          path: '/api/files/upload',
          statusCode: 200
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'medium'
      );

      // Verify original end was called
      expect(originalEnd).toHaveBeenCalledWith('response data');
    });

    it('should log system action when no user is present', async () => {
      delete mockRequest.user;

      const middleware = auditMiddleware.logAction('system_backup', 'system');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'system_backup',
        'system',
        undefined,
        expect.objectContaining({
          method: 'POST',
          path: '/api/files/upload',
          statusCode: 200
        }),
        'low'
      );
    });

    it('should not log server errors as user actions', async () => {
      mockResponse.statusCode = 500;

      const middleware = auditMiddleware.logAction('test_action', 'test');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).not.toHaveBeenCalled();
      expect(mockAuditLogService.logSystemAction).not.toHaveBeenCalled();
    });

    it('should handle logging errors gracefully', async () => {
      mockAuditLogService.logUserAction.mockRejectedValueOnce(new Error('Logging failed'));

      const middleware = auditMiddleware.logAction('test_action', 'test');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      // Should not throw error
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logAuthentication', () => {
    it('should log successful login', async () => {
      mockRequest.body = { email: 'test@example.com' };
      mockResponse.statusCode = 200;

      const middleware = auditMiddleware.logAuthentication('login');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'login',
        'authentication',
        undefined,
        expect.objectContaining({
          email: 'test@example.com',
          success: true
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'low'
      );
    });

    it('should log failed login with medium severity', async () => {
      mockRequest.body = { email: 'test@example.com' };
      mockResponse.statusCode = 401;

      const middleware = auditMiddleware.logAuthentication('login_failed');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'login_failed',
        'authentication',
        undefined,
        expect.objectContaining({
          email: 'test@example.com',
          success: false,
          failureReason: 'Invalid credentials'
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'medium'
      );
    });
  });

  describe('logFileOperation', () => {
    it('should log file upload operation', async () => {
      mockRequest.body = {
        filename: 'document.dwg',
        fileSize: 1024000,
        mimeType: 'application/dwg'
      };

      const middleware = auditMiddleware.logFileOperation('file_upload');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_upload',
        'file',
        'file-123',
        expect.objectContaining({
          filename: 'document.dwg',
          fileSize: 1024000,
          mimeType: 'application/dwg',
          success: true
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'low'
      );
    });

    it('should log file deletion with medium severity', async () => {
      const middleware = auditMiddleware.logFileOperation('file_delete');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_delete',
        'file',
        'file-123',
        expect.any(Object),
        '192.168.1.1',
        'Mozilla/5.0',
        'medium'
      );
    });
  });

  describe('logSearchOperation', () => {
    it('should log search query with results', async () => {
      mockRequest.body = {
        query: 'mechanical parts',
        modelId: 'model-456',
        filters: { category: 'mechanical' }
      };
      mockResponse.locals = {
        resultCount: 25,
        responseTime: 150
      };

      const middleware = auditMiddleware.logSearchOperation();

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'search_query',
        'search',
        undefined,
        expect.objectContaining({
          query: 'mechanical parts',
          modelId: 'model-456',
          filters: { category: 'mechanical' },
          resultCount: 25,
          responseTime: 150
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'low'
      );
    });
  });

  describe('logAIOperation', () => {
    it('should log model training operation', async () => {
      mockRequest.body = {
        name: 'CAD Classification Model',
        datasetId: 'dataset-789',
        config: { epochs: 100, batchSize: 32 }
      };

      const middleware = auditMiddleware.logAIOperation('model_training');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'model_training',
        'ai_model',
        'file-123',
        expect.objectContaining({
          modelName: 'CAD Classification Model',
          datasetId: 'dataset-789',
          trainingConfig: { epochs: 100, batchSize: 32 },
          success: true
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'medium'
      );
    });
  });

  describe('logAdminAction', () => {
    it('should log admin action with high severity', async () => {
      mockRequest.body = {
        email: 'newuser@example.com',
        role: 'engineer'
      };
      mockRequest.params = { userId: 'user-456' };

      const middleware = auditMiddleware.logAdminAction('user_created');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'user_created',
        'admin',
        'user-456',
        expect.objectContaining({
          targetUser: 'newuser@example.com',
          changes: { email: 'newuser@example.com', role: 'engineer' },
          adminUser: 'test@example.com',
          success: true
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'high'
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event immediately', async () => {
      const middleware = auditMiddleware.logSecurityEvent('suspicious_activity');

      await middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockAuditLogService.logSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'suspicious_activity',
        expect.objectContaining({
          path: '/api/files/upload',
          method: 'POST',
          query: { test: 'value' },
          body: { filename: 'test.dwg' }
        }),
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize sensitive data in security logs', async () => {
      mockRequest.body = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token'
      };
      mockRequest.headers = {
        'authorization': 'Bearer token123',
        'cookie': 'session=abc123',
        'user-agent': 'Mozilla/5.0'
      };

      const middleware = auditMiddleware.logSecurityEvent('login_attempt');

      await middleware(mockRequest as any, mockResponse as any, mockNext);

      const loggedData = mockAuditLogService.logSecurityEvent.mock.calls[0][2];
      
      expect(loggedData.body.username).toBe('testuser');
      expect(loggedData.body.password).toBe('[REDACTED]');
      expect(loggedData.body.token).toBe('[REDACTED]');
      expect(loggedData.headers.authorization).toBe('[REDACTED]');
      expect(loggedData.headers.cookie).toBe('[REDACTED]');
      expect(loggedData.headers['user-agent']).toBe('Mozilla/5.0');
    });

    it('should handle logging errors gracefully', async () => {
      mockAuditLogService.logSecurityEvent.mockRejectedValueOnce(new Error('Security logging failed'));

      const middleware = auditMiddleware.logSecurityEvent('test_event');

      await middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logDataAccess', () => {
    it('should log data read operation', async () => {
      mockResponse.locals = { recordCount: 10 };

      const middleware = auditMiddleware.logDataAccess('user_data', 'read');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'data_read',
        'data',
        'file-123',
        expect.objectContaining({
          dataType: 'user_data',
          operation: 'read',
          recordCount: 10,
          success: true
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'medium'
      );
    });

    it('should log data deletion with high severity', async () => {
      const middleware = auditMiddleware.logDataAccess('audit_logs', 'delete');

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'data_delete',
        'data',
        'file-123',
        expect.objectContaining({
          dataType: 'audit_logs',
          operation: 'delete'
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'high'
      );
    });
  });

  describe('logRateLimit', () => {
    it('should log rate limit exceeded event', async () => {
      mockResponse.get = vi.fn()
        .mockReturnValueOnce('100') // X-RateLimit-Limit
        .mockReturnValueOnce('0')   // X-RateLimit-Remaining
        .mockReturnValueOnce('3600'); // X-RateLimit-Reset

      const middleware = auditMiddleware.logRateLimit();

      await middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockAuditLogService.logSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'rate_limit_exceeded',
        expect.objectContaining({
          path: '/api/files/upload',
          method: 'POST',
          rateLimitInfo: {
            limit: '100',
            remaining: '0',
            reset: '3600'
          }
        }),
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied event', async () => {
      mockResponse.locals = {
        requiredRole: 'admin',
        resource: 'user_management'
      };

      const middleware = auditMiddleware.logPermissionDenied();

      await middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockAuditLogService.logSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'permission_denied',
        expect.objectContaining({
          path: '/api/files/upload',
          method: 'POST',
          requiredRole: 'admin',
          userRole: 'engineer',
          resource: 'user_management'
        }),
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });
  });

  describe('logRequest', () => {
    it('should log general API request', async () => {
      const middleware = auditMiddleware.logRequest();

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        'post_request',
        'api_request',
        undefined,
        expect.objectContaining({
          method: 'POST',
          path: '/api/files/upload',
          statusCode: 200,
          responseTime: expect.any(Number)
        }),
        '192.168.1.1',
        'Mozilla/5.0',
        'low'
      );
    });

    it('should not log requests without user', async () => {
      delete mockRequest.user;

      const middleware = auditMiddleware.logRequest();

      middleware(mockRequest as any, mockResponse as any, mockNext);
      mockResponse.end!();

      await new Promise(resolve => setImmediate(resolve));

      expect(mockAuditLogService.logUserAction).not.toHaveBeenCalled();
    });
  });

  describe('data sanitization', () => {
    it('should sanitize sensitive fields in request body', () => {
      const sanitizeBody = (auditMiddleware as any).sanitizeBody;
      
      const body = {
        username: 'testuser',
        password: 'secret123',
        email: 'test@example.com',
        token: 'jwt-token',
        secret: 'api-secret',
        key: 'encryption-key',
        authorization: 'Bearer token'
      };

      const sanitized = sanitizeBody(body);

      expect(sanitized.username).toBe('testuser');
      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.key).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
    });

    it('should sanitize sensitive headers', () => {
      const sanitizeHeaders = (auditMiddleware as any).sanitizeHeaders;
      
      const headers = {
        'user-agent': 'Mozilla/5.0',
        'authorization': 'Bearer token123',
        'cookie': 'session=abc123',
        'x-api-key': 'api-key-123',
        'content-type': 'application/json'
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['user-agent']).toBe('Mozilla/5.0');
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
    });

    it('should handle non-object inputs gracefully', () => {
      const sanitizeBody = (auditMiddleware as any).sanitizeBody;
      
      expect(sanitizeBody(null)).toBe(null);
      expect(sanitizeBody(undefined)).toBe(undefined);
      expect(sanitizeBody('string')).toBe('string');
      expect(sanitizeBody(123)).toBe(123);
    });
  });
});