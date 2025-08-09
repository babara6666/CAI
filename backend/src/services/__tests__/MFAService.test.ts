import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MFAService } from '../MFAService.js';
import { UserModel } from '../../models/User.js';
import crypto from 'crypto';

// Mock dependencies
vi.mock('../../models/User.js');
vi.mock('crypto');

const mockUserModel = vi.mocked(UserModel);
const mockCrypto = vi.mocked(crypto);

describe('MFAService', () => {
  const mockUser = {
    id: 'user-123',
    email: 'admin@example.com',
    username: 'admin',
    role: 'admin' as const,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setupMFA', () => {
    it('should successfully setup MFA for a user', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockUserModel.update.mockResolvedValue(mockUser);
      
      // Mock crypto functions
      mockCrypto.randomBytes
        .mockReturnValueOnce(Buffer.from('secret123456789012345678901234567890', 'utf8')) // secret
        .mockReturnValue(Buffer.from('12345678', 'utf8')); // backup codes

      // Act
      const result = await MFAService.setupMFA('user-123');

      // Assert
      expect(mockUserModel.findById).toHaveBeenCalledWith('user-123');
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeUrl');
      expect(result).toHaveProperty('backupCodes');
      expect(result.backupCodes).toHaveLength(10);
      expect(result.qrCodeUrl).toContain('otpauth://totp/');
      expect(mockUserModel.update).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(MFAService.setupMFA('nonexistent-user')).rejects.toThrow('User not found');
    });
  });

  describe('enableMFA', () => {
    const mockUserWithMFA = {
      ...mockUser,
      preferences: {
        ...mockUser.preferences,
        mfa: {
          enabled: false,
          secret: 'TESTSECRET123456789012345678901234',
          backupCodes: [
            { code: 'BACKUP01', used: false },
            { code: 'BACKUP02', used: false }
          ]
        }
      }
    };

    it('should successfully enable MFA with valid verification code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithMFA);
      mockUserModel.update.mockResolvedValue(mockUserWithMFA);
      
      // Mock TOTP verification (simplified)
      vi.spyOn(MFAService as any, 'verifyTOTP').mockReturnValue(true);

      // Act
      const result = await MFAService.enableMFA('user-123', '123456');

      // Assert
      expect(result).toBe(true);
      expect(mockUserModel.update).toHaveBeenCalledWith('user-123', expect.objectContaining({
        preferences: expect.objectContaining({
          mfa: expect.objectContaining({
            enabled: true
          })
        })
      }));
    });

    it('should throw error with invalid verification code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithMFA);
      
      // Mock TOTP verification to return false
      vi.spyOn(MFAService as any, 'verifyTOTP').mockReturnValue(false);

      // Act & Assert
      await expect(MFAService.enableMFA('user-123', '000000')).rejects.toThrow('Invalid verification code');
    });

    it('should throw error if MFA setup not found', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser); // User without MFA setup

      // Act & Assert
      await expect(MFAService.enableMFA('user-123', '123456')).rejects.toThrow('MFA setup not found');
    });
  });

  describe('disableMFA', () => {
    const mockUserWithEnabledMFA = {
      ...mockUser,
      preferences: {
        ...mockUser.preferences,
        mfa: {
          enabled: true,
          secret: 'TESTSECRET123456789012345678901234',
          backupCodes: [
            { code: 'BACKUP01', used: false },
            { code: 'BACKUP02', used: false }
          ]
        }
      }
    };

    it('should successfully disable MFA with valid verification code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      mockUserModel.update.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock MFA code verification
      vi.spyOn(MFAService as any, 'verifyMFACode').mockReturnValue({ isValid: true });

      // Act
      const result = await MFAService.disableMFA('user-123', '123456');

      // Assert
      expect(result).toBe(true);
      expect(mockUserModel.update).toHaveBeenCalledWith('user-123', expect.objectContaining({
        preferences: expect.objectContaining({
          mfa: expect.objectContaining({
            enabled: false,
            secret: null,
            backupCodes: []
          })
        })
      }));
    });

    it('should throw error with invalid verification code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock MFA code verification to return false
      vi.spyOn(MFAService as any, 'verifyMFACode').mockReturnValue({ isValid: false });

      // Act & Assert
      await expect(MFAService.disableMFA('user-123', '000000')).rejects.toThrow('Invalid verification code');
    });

    it('should throw error if MFA not enabled', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser); // User without MFA enabled

      // Act & Assert
      await expect(MFAService.disableMFA('user-123', '123456')).rejects.toThrow('MFA not enabled');
    });
  });

  describe('verifyMFA', () => {
    const mockUserWithEnabledMFA = {
      ...mockUser,
      preferences: {
        ...mockUser.preferences,
        mfa: {
          enabled: true,
          secret: 'TESTSECRET123456789012345678901234',
          backupCodes: [
            { code: 'BACKUP01', used: false },
            { code: 'BACKUP02', used: true }
          ]
        }
      }
    };

    it('should successfully verify valid TOTP code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock MFA code verification
      vi.spyOn(MFAService as any, 'verifyMFACode').mockReturnValue({ isValid: true });

      // Act
      const result = await MFAService.verifyMFA('user-123', '123456');

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.backupCodeUsed).toBeUndefined();
    });

    it('should successfully verify valid backup code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      mockUserModel.update.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock MFA code verification for backup code
      vi.spyOn(MFAService as any, 'verifyMFACode').mockReturnValue({ 
        isValid: true, 
        backupCodeUsed: true 
      });

      // Act
      const result = await MFAService.verifyMFA('user-123', 'BACKUP01');

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.backupCodeUsed).toBe(true);
      expect(mockUserModel.update).toHaveBeenCalled();
    });

    it('should return false for invalid code', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock MFA code verification to return false
      vi.spyOn(MFAService as any, 'verifyMFACode').mockReturnValue({ isValid: false });

      // Act
      const result = await MFAService.verifyMFA('user-123', '000000');

      // Assert
      expect(result.isValid).toBe(false);
    });

    it('should return false if MFA not enabled', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser); // User without MFA enabled

      // Act
      const result = await MFAService.verifyMFA('user-123', '123456');

      // Assert
      expect(result.isValid).toBe(false);
    });
  });

  describe('isMFAEnabled', () => {
    it('should return true if MFA is enabled', async () => {
      // Arrange
      const mockUserWithEnabledMFA = {
        ...mockUser,
        preferences: {
          ...mockUser.preferences,
          mfa: { enabled: true }
        }
      };
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);

      // Act
      const result = await MFAService.isMFAEnabled('user-123');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if MFA is not enabled', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser);

      // Act
      const result = await MFAService.isMFAEnabled('user-123');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('isMFARequired', () => {
    it('should return true for admin role', () => {
      // Act
      const result = MFAService.isMFARequired('admin');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for engineer role', () => {
      // Act
      const result = MFAService.isMFARequired('engineer');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for viewer role', () => {
      // Act
      const result = MFAService.isMFARequired('viewer');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('regenerateBackupCodes', () => {
    const mockUserWithEnabledMFA = {
      ...mockUser,
      preferences: {
        ...mockUser.preferences,
        mfa: {
          enabled: true,
          secret: 'TESTSECRET123456789012345678901234',
          backupCodes: [
            { code: 'OLDBACKUP01', used: false },
            { code: 'OLDBACKUP02', used: true }
          ]
        }
      }
    };

    it('should successfully regenerate backup codes', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUserWithEnabledMFA);
      mockUserModel.update.mockResolvedValue(mockUserWithEnabledMFA);
      
      // Mock crypto for backup codes
      mockCrypto.randomBytes.mockReturnValue(Buffer.from('12345678', 'utf8'));

      // Act
      const result = await MFAService.regenerateBackupCodes('user-123');

      // Assert
      expect(result).toHaveLength(10);
      expect(mockUserModel.update).toHaveBeenCalled();
    });

    it('should throw error if MFA not enabled', async () => {
      // Arrange
      mockUserModel.findById.mockResolvedValue(mockUser); // User without MFA enabled

      // Act & Assert
      await expect(MFAService.regenerateBackupCodes('user-123')).rejects.toThrow('MFA not enabled');
    });
  });
});