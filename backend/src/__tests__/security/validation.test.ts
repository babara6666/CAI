import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  validateRequest,
  deepSanitize,
  validateCSP,
  validateFileUpload,
  securitySchemas
} from '../../validation/securityValidation.js';

// Mock SecurityEventService
vi.mock('../../services/SecurityEventService.js', () => ({
  SecurityEventService: {
    logEvent: vi.fn().mockResolvedValue('event-id')
  }
}));

describe('Security Validation Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
      headers: { 'x-request-id': 'test-request-id' },
      path: '/test',
      method: 'POST',
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-user-agent'),
      user: { id: 'test-user-id' }
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Security Schemas', () => {
    it('should validate safe strings correctly', () => {
      const validString = 'This is a safe string with numbers 123 and symbols!@#';
      const invalidString = '<script>alert("xss")</script>';

      const { error: validError } = securitySchemas.safeString.validate(validString);
      const { error: invalidError } = securitySchemas.safeString.validate(invalidString);

      expect(validError).toBeUndefined();
      expect(invalidError).toBeDefined();
    });

    it('should validate filenames correctly', () => {
      const validFilename = 'document.dwg';
      const invalidFilename = '../../../etc/passwd';

      const { error: validError } = securitySchemas.filename.validate(validFilename);
      const { error: invalidError } = securitySchemas.filename.validate(invalidFilename);

      expect(validError).toBeUndefined();
      expect(invalidError).toBeDefined();
    });

    it('should validate UUIDs correctly', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const invalidUUID = 'not-a-uuid';

      const { error: validError } = securitySchemas.uuid.validate(validUUID);
      const { error: invalidError } = securitySchemas.uuid.validate(invalidUUID);

      expect(validError).toBeUndefined();
      expect(invalidError).toBeDefined();
    });

    it('should validate emails correctly', () => {
      const validEmail = 'user@example.com';
      const invalidEmail = 'not-an-email';

      const { error: validError } = securitySchemas.email.validate(validEmail);
      const { error: invalidError } = securitySchemas.email.validate(invalidEmail);

      expect(validError).toBeUndefined();
      expect(invalidError).toBeDefined();
    });

    it('should validate passwords with security requirements', () => {
      const validPassword = 'SecurePass123!';
      const weakPassword = 'weak';

      const { error: validError } = securitySchemas.password.validate(validPassword);
      const { error: weakError } = securitySchemas.password.validate(weakPassword);

      expect(validError).toBeUndefined();
      expect(weakError).toBeDefined();
    });

    it('should validate search queries safely', () => {
      const validQuery = 'CAD file search with spaces and numbers 123';
      const maliciousQuery = 'search<script>alert("xss")</script>';

      const { error: validError } = securitySchemas.searchQuery.validate(validQuery);
      const { error: maliciousError } = securitySchemas.searchQuery.validate(maliciousQuery);

      expect(validError).toBeUndefined();
      expect(maliciousError).toBeDefined();
    });
  });

  describe('Request Validation Middleware', () => {
    it('should pass valid requests', async () => {
      const schema = securitySchemas.safeString.required();
      const middleware = validateRequest(schema.label('testField'));

      mockReq.body = 'valid string';

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject invalid requests', async () => {
      const schema = securitySchemas.safeString.required();
      const middleware = validateRequest(schema.label('testField'));

      mockReq.body = '<script>alert("xss")</script>';

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR'
          })
        })
      );
    });

    it('should sanitize and validate query parameters', async () => {
      const schema = securitySchemas.safeString.required();
      const middleware = validateRequest(schema.label('query'), 'query');

      mockReq.query = { query: 'valid search term' };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query).toEqual('valid search term');
    });
  });

  describe('Deep Sanitization Middleware', () => {
    it('should remove dangerous script tags', () => {
      mockReq.body = {
        content: 'Safe content <script>alert("xss")</script> more content'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.content).toBe('Safe content  more content');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should remove javascript protocols', () => {
      mockReq.body = {
        url: 'javascript:alert("xss")'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.url).toBe('alert("xss")');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize nested objects', () => {
      mockReq.body = {
        user: {
          name: 'John<script>alert("xss")</script>',
          profile: {
            bio: 'Bio with <iframe src="evil.com"></iframe>'
          }
        }
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.user.name).toBe('John');
      expect(mockReq.body.user.profile.bio).toBe('Bio with ');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize arrays', () => {
      mockReq.body = {
        tags: ['safe tag', '<script>alert("xss")</script>', 'another safe tag']
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.tags).toEqual(['safe tag', '', 'another safe tag']);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should remove control characters', () => {
      mockReq.body = {
        text: 'Normal text\x00\x01\x02with control chars'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.text).toBe('Normal textwith control chars');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Content Security Policy Validation', () => {
    it('should allow safe content types', () => {
      mockReq.get = vi.fn().mockReturnValue('application/json');

      validateCSP(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block dangerous content types', () => {
      mockReq.get = vi.fn().mockReturnValue('text/html');

      validateCSP(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INVALID_CONTENT_TYPE'
          })
        })
      );
    });

    it('should block javascript content type', () => {
      mockReq.get = vi.fn().mockReturnValue('application/javascript');

      validateCSP(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('File Upload Validation', () => {
    it('should allow valid CAD files', () => {
      mockReq.file = {
        originalname: 'drawing.dwg',
        mimetype: 'application/dwg',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('test'),
        fieldname: 'file',
        encoding: '7bit'
      };

      validateFileUpload(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject files that are too large', () => {
      mockReq.file = {
        originalname: 'large.dwg',
        mimetype: 'application/dwg',
        size: 600 * 1024 * 1024, // 600MB (over limit)
        buffer: Buffer.from('test'),
        fieldname: 'file',
        encoding: '7bit'
      };

      validateFileUpload(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'FILE_TOO_LARGE'
          })
        })
      );
    });

    it('should reject invalid file types', () => {
      mockReq.file = {
        originalname: 'malicious.exe',
        mimetype: 'application/x-executable',
        size: 1024,
        buffer: Buffer.from('test'),
        fieldname: 'file',
        encoding: '7bit'
      };

      validateFileUpload(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INVALID_FILE_TYPE'
          })
        })
      );
    });

    it('should reject invalid filenames', () => {
      mockReq.file = {
        originalname: '../../../etc/passwd',
        mimetype: 'application/dwg',
        size: 1024,
        buffer: Buffer.from('test'),
        fieldname: 'file',
        encoding: '7bit'
      };

      validateFileUpload(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INVALID_FILENAME'
          })
        })
      );
    });

    it('should handle multiple files', () => {
      mockReq.files = [
        {
          originalname: 'file1.dwg',
          mimetype: 'application/dwg',
          size: 1024,
          buffer: Buffer.from('test1'),
          fieldname: 'files',
          encoding: '7bit'
        },
        {
          originalname: 'file2.dxf',
          mimetype: 'application/dxf',
          size: 2048,
          buffer: Buffer.from('test2'),
          fieldname: 'files',
          encoding: '7bit'
        }
      ];

      validateFileUpload(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('Attack Pattern Detection', () => {
    it('should detect SQL injection attempts', () => {
      mockReq.body = {
        query: "'; DROP TABLE users; --"
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      // Should still call next but sanitize the content
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.query).not.toContain('DROP TABLE');
    });

    it('should detect directory traversal attempts', () => {
      mockReq.body = {
        path: '../../../etc/passwd'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.path).not.toContain('../');
    });

    it('should detect XSS attempts', () => {
      mockReq.body = {
        comment: '<img src="x" onerror="alert(\'XSS\')">'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.comment).not.toContain('onerror');
    });

    it('should detect command injection attempts', () => {
      mockReq.body = {
        filename: 'test.txt; rm -rf /'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.filename).not.toContain('rm -rf');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values', () => {
      mockReq.body = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroNumber: 0
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.nullValue).toBeNull();
      expect(mockReq.body.undefinedValue).toBeUndefined();
      expect(mockReq.body.emptyString).toBe('');
      expect(mockReq.body.zeroNumber).toBe(0);
    });

    it('should handle circular references safely', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      
      mockReq.body = circularObj;

      // Should not throw an error
      expect(() => {
        deepSanitize(mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle very large strings', () => {
      const largeString = 'A'.repeat(10000) + '<script>alert("xss")</script>';
      mockReq.body = { content: largeString };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.content).not.toContain('<script>');
      expect(mockReq.body.content.length).toBeLessThan(largeString.length);
    });

    it('should handle unicode and special characters', () => {
      mockReq.body = {
        unicode: '🔒 Secure data with émojis 中文',
        special: 'Data with "quotes" and \'apostrophes\' and symbols: @#$%^&*()'
      };

      deepSanitize(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.unicode).toContain('🔒');
      expect(mockReq.body.unicode).toContain('中文');
      expect(mockReq.body.special).toContain('"quotes"');
    });
  });
});