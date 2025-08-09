import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticate, authorize, adminOnly, adminOrEngineer, allRoles, optionalAuth } from '../auth.js';
import { AuthService } from '../../services/AuthService.js';

// Mock dependencies
vi.mock('../../services/AuthService.js');

const mockAuthService = vi.mocked(AuthService);

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    role: 'engineer' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    preferences: {
      theme: 'light' as const,
      notificationSettings: {
        emailNotifications: true,
        trainingComplete: true,
        searchResults: false,
        systemUpdates: true
      }
    }
  };

  beforeEach(() => {
    mockRequest = {
      headers: {
        'x-request-id': 'test-request-id'
      }
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate user with valid Bearer token', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
        'x-request-id': 'test-request-id'
      };
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 if no authorization header', async () => {
      // Arrange
      mockRequest.headers = { 'x-request-id': 'test-request-id' };

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Basic invalid-format',
        'x-request-id': 'test-request-id'
      };

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token verification fails', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
        'x-request-id': 'test-request-id'
      };
      mockAuthService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('invalid-token');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired access token',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 if unexpected error occurs', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
        'x-request-id': 'test-request-id'
      };
      mockAuthService.verifyAccessToken.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authentication error',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use unknown as requestId if not provided', async () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      await authenticate(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required',
          timestamp: expect.any(Date),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('authorize', () => {
    it('should allow access for user with correct role', () => {
      // Arrange
      mockRequest.user = mockUser; // engineer role
      const middleware = authorize(['engineer', 'admin']);

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for user with incorrect role', () => {
      // Arrange
      mockRequest.user = mockUser; // engineer role
      mockRequest.headers = { 'x-request-id': 'test-request-id' };
      const middleware = authorize(['admin']);

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Required roles: admin',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access if user is not authenticated', () => {
      // Arrange
      mockRequest.headers = { 'x-request-id': 'test-request-id' };
      const middleware = authorize(['engineer']);

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('adminOnly', () => {
    it('should allow access for admin user', () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockRequest.user = adminUser;

      // Act
      adminOnly(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-admin user', () => {
      // Arrange
      mockRequest.user = mockUser; // engineer role
      mockRequest.headers = { 'x-request-id': 'test-request-id' };

      // Act
      adminOnly(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Required roles: admin',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('adminOrEngineer', () => {
    it('should allow access for admin user', () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockRequest.user = adminUser;

      // Act
      adminOrEngineer(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for engineer user', () => {
      // Arrange
      mockRequest.user = mockUser; // engineer role

      // Act
      adminOrEngineer(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for viewer user', () => {
      // Arrange
      const viewerUser = { ...mockUser, role: 'viewer' as const };
      mockRequest.user = viewerUser;
      mockRequest.headers = { 'x-request-id': 'test-request-id' };

      // Act
      adminOrEngineer(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Required roles: admin, engineer',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('allRoles', () => {
    it('should allow access for admin user', () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockRequest.user = adminUser;

      // Act
      allRoles(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for engineer user', () => {
      // Arrange
      mockRequest.user = mockUser; // engineer role

      // Act
      allRoles(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for viewer user', () => {
      // Arrange
      const viewerUser = { ...mockUser, role: 'viewer' as const };
      mockRequest.user = viewerUser;

      // Act
      allRoles(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should set user if valid token provided', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);

      // Act
      await optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue without user if no token provided', async () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      await optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthService.verifyAccessToken).not.toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue without user if token verification fails', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };
      mockAuthService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      // Act
      await optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('invalid-token');
      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue without user if unexpected error occurs', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };
      mockAuthService.verifyAccessToken.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      await optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });
});