import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth.js';
import { AuthService } from '../../services/AuthService.js';
import { MFAService } from '../../services/MFAService.js';
import { UserModel } from '../../models/User.js';

// Mock dependencies
vi.mock('../../services/AuthService.js');
vi.mock('../../services/MFAService.js');
vi.mock('../../models/User.js');

const mockAuthService = vi.mocked(AuthService);
const mockMFAService = vi.mocked(MFAService);
const mockUserModel = vi.mocked(UserModel);

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    role: 'engineer' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
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

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
      role: 'engineer'
    };

    it('should successfully register a new user', async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens
      });

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role
      });
      expect(response.body.data.tokens).toEqual(mockTokens);
      expect(mockAuthService.register).toHaveBeenCalledWith(validRegistrationData);
    });

    it('should return 400 for invalid email', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistrationData,
          email: 'invalid-email'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for weak password', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistrationData,
          password: 'weak'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if email already exists', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Email already registered'));

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REGISTRATION_FAILED');
      expect(response.body.error.message).toBe('Email already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'Password123!'
    };

    it('should successfully login with valid credentials', async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens
      });
      mockMFAService.isMFARequired.mockReturnValue(false);

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role
      });
      expect(response.body.data.tokens).toEqual(mockTokens);
      expect(mockAuthService.login).toHaveBeenCalledWith(validLoginData.email, validLoginData.password);
    });

    it('should require MFA code for admin users', async () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockAuthService.login.mockResolvedValue({
        user: adminUser,
        tokens: mockTokens
      });
      mockMFAService.isMFARequired.mockReturnValue(true);
      mockMFAService.isMFAEnabled.mockResolvedValue(true);

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MFA_REQUIRED');
    });

    it('should successfully login admin with valid MFA code', async () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockAuthService.login.mockResolvedValue({
        user: adminUser,
        tokens: mockTokens
      });
      mockMFAService.isMFARequired.mockReturnValue(true);
      mockMFAService.isMFAEnabled.mockResolvedValue(true);
      mockMFAService.verifyMFA.mockResolvedValue({ isValid: true });

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          ...validLoginData,
          mfaCode: '123456'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockMFAService.verifyMFA).toHaveBeenCalledWith(adminUser.id, '123456');
    });

    it('should return 400 for invalid MFA code', async () => {
      // Arrange
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockAuthService.login.mockResolvedValue({
        user: adminUser,
        tokens: mockTokens
      });
      mockMFAService.isMFARequired.mockReturnValue(true);
      mockMFAService.isMFAEnabled.mockResolvedValue(true);
      mockMFAService.verifyMFA.mockResolvedValue({ isValid: false });

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          ...validLoginData,
          mfaCode: '000000'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_MFA_CODE');
    });

    it('should return 401 for invalid credentials', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new Error('Invalid email or password'));

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LOGIN_FAILED');
    });

    it('should return 400 for invalid email format', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'Password123!'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should successfully refresh tokens', async () => {
      // Arrange
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      };
      mockAuthService.refreshToken.mockResolvedValue(newTokens);

      // Act
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toEqual(newTokens);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return 401 for invalid refresh token', async () => {
      // Arrange
      mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      // Act
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_REFRESH_FAILED');
    });

    it('should return 400 for missing refresh token', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout authenticated user', async () => {
      // Arrange
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);

      // Act
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logged out successfully');
    });

    it('should return 401 for unauthenticated user', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/logout');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      // Arrange
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);

      // Act
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      // Act
      const response = await request(app)
        .get('/api/auth/me');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/change-password', () => {
    const validPasswordChangeData = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!'
    };

    it('should successfully change password', async () => {
      // Arrange
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);
      mockUserModel.authenticate.mockResolvedValue(mockUser);
      mockUserModel.updatePassword.mockResolvedValue(true);

      // Act
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send(validPasswordChangeData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Password changed successfully');
      expect(mockUserModel.authenticate).toHaveBeenCalledWith(mockUser.email, validPasswordChangeData.currentPassword);
      expect(mockUserModel.updatePassword).toHaveBeenCalledWith(mockUser.id, validPasswordChangeData.newPassword);
    });

    it('should return 400 for incorrect current password', async () => {
      // Arrange
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);
      mockUserModel.authenticate.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send(validPasswordChangeData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('should return 400 for weak new password', async () => {
      // Arrange
      mockAuthService.verifyAccessToken.mockResolvedValue(mockUser);

      // Act
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'weak'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for unauthenticated user', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/change-password')
        .send(validPasswordChangeData);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should always return success to prevent email enumeration', async () => {
      // Arrange
      mockUserModel.findByEmail.mockResolvedValue(mockUser);

      // Act
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('If an account with that email exists');
    });

    it('should return success even for non-existent email', async () => {
      // Arrange
      mockUserModel.findByEmail.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('If an account with that email exists');
    });

    it('should return 400 for invalid email format', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('MFA Routes', () => {
    const adminUser = { ...mockUser, role: 'admin' as const };

    describe('POST /api/auth/mfa/setup', () => {
      it('should setup MFA for admin user', async () => {
        // Arrange
        mockAuthService.verifyAccessToken.mockResolvedValue(adminUser);
        const mfaSetup = {
          secret: 'TESTSECRET123456789012345678901234',
          qrCodeUrl: 'otpauth://totp/CAD%20AI%20Platform:admin@example.com?secret=TESTSECRET123456789012345678901234&issuer=CAD%20AI%20Platform',
          backupCodes: ['BACKUP01', 'BACKUP02']
        };
        mockMFAService.setupMFA.mockResolvedValue(mfaSetup);

        // Act
        const response = await request(app)
          .post('/api/auth/mfa/setup')
          .set('Authorization', 'Bearer admin-token');

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mfaSetup);
        expect(mockMFAService.setupMFA).toHaveBeenCalledWith(adminUser.id);
      });

      it('should return 403 for non-admin user', async () => {
        // Arrange
        mockAuthService.verifyAccessToken.mockResolvedValue(mockUser); // engineer role

        // Act
        const response = await request(app)
          .post('/api/auth/mfa/setup')
          .set('Authorization', 'Bearer engineer-token');

        // Assert
        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('FORBIDDEN');
      });
    });

    describe('POST /api/auth/mfa/enable', () => {
      it('should enable MFA with valid verification code', async () => {
        // Arrange
        mockAuthService.verifyAccessToken.mockResolvedValue(adminUser);
        mockMFAService.enableMFA.mockResolvedValue(true);

        // Act
        const response = await request(app)
          .post('/api/auth/mfa/enable')
          .set('Authorization', 'Bearer admin-token')
          .send({ verificationCode: '123456' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('MFA enabled successfully');
        expect(mockMFAService.enableMFA).toHaveBeenCalledWith(adminUser.id, '123456');
      });

      it('should return 400 for invalid verification code format', async () => {
        // Arrange
        mockAuthService.verifyAccessToken.mockResolvedValue(adminUser);

        // Act
        const response = await request(app)
          .post('/api/auth/mfa/enable')
          .set('Authorization', 'Bearer admin-token')
          .send({ verificationCode: '12345' }); // Too short

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/auth/mfa/status', () => {
      it('should return MFA status for user', async () => {
        // Arrange
        mockAuthService.verifyAccessToken.mockResolvedValue(adminUser);
        mockMFAService.isMFAEnabled.mockResolvedValue(true);
        mockMFAService.isMFARequired.mockReturnValue(true);

        // Act
        const response = await request(app)
          .get('/api/auth/mfa/status')
          .set('Authorization', 'Bearer admin-token');

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual({
          enabled: true,
          required: true
        });
      });
    });
  });
});