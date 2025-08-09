import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService } from '../AuthService.js';
import { UserModel } from '../../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock dependencies
vi.mock('../../models/User.js');
vi.mock('jsonwebtoken');
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockJwt = vi.mocked(jwt);
const mockBcrypt = vi.mocked(bcrypt);

describe('AuthService', () => {
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
    vi.clearAllMocks();
    
    // Setup default environment variables
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    const validUserData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
      role: 'engineer' as const
    };

    it('should successfully register a new user', async () => {
      // Arrange
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValue('mock-token');

      // Act
      const result = await AuthService.register(validUserData);

      // Assert
      expect(mockUserModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUserModel.findByUsername).toHaveBeenCalledWith('testuser');
      expect(mockUserModel.create).toHaveBeenCalledWith(validUserData);
      expect(result.user).toEqual(mockUser);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw error if email already exists', async () => {
      // Arrange
      mockUserModel.findByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(AuthService.register(validUserData)).rejects.toThrow('Email already registered');
    });

    it('should throw error if username already exists', async () => {
      // Arrange
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(AuthService.register(validUserData)).rejects.toThrow('Username already taken');
    });

    it('should throw error for weak password', async () => {
      // Arrange
      const weakPasswordData = { ...validUserData, password: 'weak' };
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.register(weakPasswordData)).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should throw error for password without uppercase', async () => {
      // Arrange
      const noUppercaseData = { ...validUserData, password: 'password123!' };
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.register(noUppercaseData)).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should throw error for password without lowercase', async () => {
      // Arrange
      const noLowercaseData = { ...validUserData, password: 'PASSWORD123!' };
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.register(noLowercaseData)).rejects.toThrow('Password must contain at least one lowercase letter');
    });

    it('should throw error for password without number', async () => {
      // Arrange
      const noNumberData = { ...validUserData, password: 'Password!' };
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.register(noNumberData)).rejects.toThrow('Password must contain at least one number');
    });

    it('should throw error for password without special character', async () => {
      // Arrange
      const noSpecialData = { ...validUserData, password: 'Password123' };
      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.findByUsername.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.register(noSpecialData)).rejects.toThrow('Password must contain at least one special character (@$!%*?&)');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange
      mockUserModel.authenticate.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValue('mock-token');

      // Act
      const result = await AuthService.login('test@example.com', 'Password123!');

      // Assert
      expect(mockUserModel.authenticate).toHaveBeenCalledWith('test@example.com', 'Password123!');
      expect(result.user).toEqual(mockUser);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid credentials', async () => {
      // Arrange
      mockUserModel.authenticate.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.login('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for inactive user', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserModel.authenticate.mockResolvedValue(inactiveUser);

      // Act & Assert
      await expect(AuthService.login('test@example.com', 'Password123!')).rejects.toThrow('Account is deactivated');
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token with valid refresh token', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        tokenVersion: 1,
        type: 'refresh'
      };
      mockJwt.verify.mockReturnValue(mockPayload);
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValue('new-mock-token');

      // Act
      const result = await AuthService.refreshToken('valid-refresh-token');

      // Assert
      expect(mockJwt.verify).toHaveBeenCalledWith('valid-refresh-token', 'test-refresh-secret');
      expect(mockUserModel.findById).toHaveBeenCalledWith('user-123');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid refresh token', async () => {
      // Arrange
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(AuthService.refreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for wrong token type', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        type: 'access' // Wrong type
      };
      mockJwt.verify.mockReturnValue(mockPayload);

      // Act & Assert
      await expect(AuthService.refreshToken('wrong-type-token')).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error if user not found', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        tokenVersion: 1,
        type: 'refresh'
      };
      mockJwt.verify.mockReturnValue(mockPayload);
      mockUserModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(AuthService.refreshToken('valid-refresh-token')).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error if user is inactive', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        tokenVersion: 1,
        type: 'refresh'
      };
      const inactiveUser = { ...mockUser, isActive: false };
      mockJwt.verify.mockReturnValue(mockPayload);
      mockUserModel.findById.mockResolvedValue(inactiveUser);

      // Act & Assert
      await expect(AuthService.refreshToken('valid-refresh-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('verifyAccessToken', () => {
    it('should successfully verify valid access token', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'engineer',
        type: 'access'
      };
      mockJwt.verify.mockReturnValue(mockPayload);
      mockUserModel.findById.mockResolvedValue(mockUser);

      // Act
      const result = await AuthService.verifyAccessToken('valid-access-token');

      // Assert
      expect(mockJwt.verify).toHaveBeenCalledWith('valid-access-token', 'test-access-secret');
      expect(mockUserModel.findById).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUser);
    });

    it('should throw error for invalid access token', async () => {
      // Arrange
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(AuthService.verifyAccessToken('invalid-token')).rejects.toThrow('Invalid access token');
    });

    it('should throw error for wrong token type', async () => {
      // Arrange
      const mockPayload = {
        userId: 'user-123',
        type: 'refresh' // Wrong type
      };
      mockJwt.verify.mockReturnValue(mockPayload);

      // Act & Assert
      await expect(AuthService.verifyAccessToken('wrong-type-token')).rejects.toThrow('Invalid access token');
    });
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      // Arrange
      mockBcrypt.hash.mockResolvedValue('hashed-password');

      // Act
      const result = await AuthService.hashPassword('password123');

      // Assert
      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(result).toBe('hashed-password');
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await AuthService.comparePassword('password123', 'hashed-password');

      // Assert
      expect(mockBcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await AuthService.comparePassword('wrongpassword', 'hashed-password');

      // Assert
      expect(mockBcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashed-password');
      expect(result).toBe(false);
    });
  });
});