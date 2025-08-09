import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { 
  errorHandler, 
  notFoundHandler, 
  CustomError, 
  createError, 
  ErrorTypes,
  asyncHandler 
} from '../../middleware/errorHandler';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/test',
      originalUrl: '/test',
      headers: { 'x-request-id': 'test-request-id' },
      body: {},
      user: { id: 'test-user' }
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    mockNext = vi.fn();
  });

  describe('CustomError', () => {
    it('should create a custom error with all properties', () => {
      const error = new CustomError(
        'Test error',
        400,
        'TEST_ERROR',
        { field: 'test' },
        ['Try again']
      );

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.suggestions).toEqual(['Try again']);
      expect(error.isOperational).toBe(true);
    });

    it('should create a custom error with default values', () => {
      const error = new CustomError('Test error');

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('createError', () => {
    it('should create a CustomError instance', () => {
      const error = createError('Test error', 404, 'NOT_FOUND');

      expect(error).toBeInstanceOf(CustomError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('errorHandler', () => {
    it('should handle CustomError correctly', () => {
      const customError = new CustomError(
        'Custom error message',
        400,
        'CUSTOM_ERROR',
        { field: 'test' },
        ['Try again']
      );

      errorHandler(customError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'CUSTOM_ERROR',
          message: 'Custom error message',
          details: { field: 'test' },
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: ['Try again']
        }
      });
    });

    it('should handle ValidationError', () => {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';

      errorHandler(validationError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorTypes.VALIDATION_ERROR,
          message: 'Validation failed',
          details: 'Validation failed',
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: ['Please check your input and try again']
        }
      });
    });

    it('should handle JWT errors', () => {
      const jwtError = new Error('Invalid token');
      jwtError.name = 'JsonWebTokenError';

      errorHandler(jwtError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorTypes.AUTHENTICATION_ERROR,
          message: 'Invalid authentication token',
          details: undefined,
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: ['Please log in again']
        }
      });
    });

    it('should handle database errors', () => {
      const dbError = new Error('Database connection failed');

      errorHandler(dbError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorTypes.DATABASE_ERROR,
          message: 'Database service temporarily unavailable',
          details: undefined,
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: ['Please try again in a few moments']
        }
      });
    });

    it('should handle file upload errors', () => {
      const fileError = new Error('File upload failed');

      errorHandler(fileError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ErrorTypes.FILE_UPLOAD_ERROR,
          message: 'File upload failed',
          details: undefined,
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: ['Check file size and format', 'Ensure stable internet connection']
        }
      });
    });

    it('should handle generic errors', () => {
      const genericError = new Error('Something went wrong');

      errorHandler(genericError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          details: undefined,
          timestamp: expect.any(Date),
          requestId: expect.any(String),
          suggestions: []
        }
      });
    });

    it('should not expose internal details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Internal error');
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.error.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('notFoundHandler', () => {
    it('should handle 404 errors correctly', () => {
      mockRequest.originalUrl = '/non-existent-route';
      mockRequest.method = 'GET';

      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: ErrorTypes.NOT_FOUND,
          message: 'Route /non-existent-route not found'
        })
      );
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncOperation = vi.fn().mockResolvedValue('success');
      const wrappedHandler = asyncHandler(asyncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and forward async errors', async () => {
      const error = new Error('Async error');
      const asyncOperation = vi.fn().mockRejectedValue(error);
      const wrappedHandler = asyncHandler(asyncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});