import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../services/AuthService';
import { User } from '../../../models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('bcryptjs');
vi.mock('jsonwebtoken');
vi.mock('../../../models/User');

describe('AuthService', () => {
  let authService: AuthService;
  
  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'engineer' as const,
      };

      const hashedPassword = 'hashed-password';
      const mockUser = { ...testUtils.createTestUser(), ...userData };

      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword);
      vi.mocked(User.findByEmail).mockResolvedValue(null);
      vi.mocked(User.findByUsername).mockResolvedValue(null);
      vi.mocked(User.create).mockResolvedValue(mockUser);

      const result = await authService.register(userData);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(User.create).toHaveBeenCalledWith({
        ...userData,
        password: hashedPassword,
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw error if email already exists', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'engineer' as const,
      };

      vi.mocked(User.findByEmail).mockResolvedValue(testUtils.createTestUser());

      await expect(authService.register(userData)).rejects.toThrow('Email already exists');
    });

    it('should throw error if username already exists', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'engineer' as const,
      };

      vi.mocked(User.findByEmail).mockResolvedValue(null);
      vi.mocked(User.findByUsername).mockResolvedValue(testUtils.createTestUser());

      await expect(authService.register(userData)).rejects.toThrow('Username already exists');
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = { ...testUtils.createTestUser(), password: 'hashed-password' };
      const mockToken = 'jwt-token';

      vi.mocked(User.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(jwt.sign).mockReturnValue(mockToken);

      const result = await authService.login(credentials);

      expect(User.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      expect(result).toEqual({
        user: { ...mockUser, password: undefined },
        token: mockToken,
      });
    });

    it('should throw error for invalid email', async () => {
      const credentials = {
        email: 'invalid@example.com',
        password: 'password123',
      };

      vi.mocked(User.findByEmail).mockResolvedValue(null);

      await expect(authService.login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for invalid password', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockUser = { ...testUtils.createTestUser(), password: 'hashed-password' };

      vi.mocked(User.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      await expect(authService.login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for inactive user', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = { ...testUtils.createTestUser(), password: 'hashed-password', isActive: false };

      vi.mocked(User.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      await expect(authService.login(credentials)).rejects.toThrow('Account is deactivated');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const token = 'valid-token';
      const payload = { userId: 'user-id', email: 'test@example.com', role: 'engineer' };
      const mockUser = testUtils.createTestUser();

      vi.mocked(jwt.verify).mockReturnValue(payload);
      vi.mocked(User.findById).mockResolvedValue(mockUser);

      const result = await authService.verifyToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(payload.userId);
      expect(result).toEqual(mockUser);
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalid-token';

      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });

    it('should throw error if user not found', async () => {
      const token = 'valid-token';
      const payload = { userId: 'user-id', email: 'test@example.com', role: 'engineer' };

      vi.mocked(jwt.verify).mockReturnValue(payload);
      vi.mocked(User.findById).mockResolvedValue(null);

      await expect(authService.verifyToken(token)).rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userId = 'user-id';
      const oldPassword = 'oldpassword';
      const newPassword = 'newpassword';
      const mockUser = { ...testUtils.createTestUser(), password: 'hashed-old-password' };
      const newHashedPassword = 'hashed-new-password';

      vi.mocked(User.findById).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(bcrypt.hash).mockResolvedValue(newHashedPassword);
      vi.mocked(User.update).mockResolvedValue({ ...mockUser, password: newHashedPassword });

      const result = await authService.changePassword(userId, oldPassword, newPassword);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(bcrypt.compare).toHaveBeenCalledWith(oldPassword, 'hashed-old-password');
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(User.update).toHaveBeenCalledWith(userId, { password: newHashedPassword });
      expect(result).toBe(true);
    });

    it('should throw error for incorrect old password', async () => {
      const userId = 'user-id';
      const oldPassword = 'wrongpassword';
      const newPassword = 'newpassword';
      const mockUser = { ...testUtils.createTestUser(), password: 'hashed-old-password' };

      vi.mocked(User.findById).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      await expect(authService.changePassword(userId, oldPassword, newPassword)).rejects.toThrow('Current password is incorrect');
    });
  });
});