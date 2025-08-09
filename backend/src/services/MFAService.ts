import crypto from 'crypto';
import { UserModel } from '../models/User.js';

export interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerification {
  isValid: boolean;
  backupCodeUsed?: boolean;
}

export class MFAService {
  private static readonly MFA_SECRET_LENGTH = 32;
  private static readonly BACKUP_CODES_COUNT = 10;
  private static readonly BACKUP_CODE_LENGTH = 8;
  private static readonly TOTP_WINDOW = 30; // 30 seconds
  private static readonly TOTP_DIGITS = 6;

  /**
   * Generate MFA setup for a user (TOTP-based)
   */
  static async setupMFA(userId: string): Promise<MFASetup> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate secret key
    const secret = this.generateSecret();
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    
    // Create QR code URL (in production, use a proper TOTP library like 'otplib')
    const qrCodeUrl = this.generateQRCodeUrl(user.email, secret);

    // Store MFA settings (in production, store in database)
    // For now, we'll extend the user preferences to include MFA data
    const mfaPreferences = {
      ...user.preferences,
      mfa: {
        enabled: false,
        secret: secret,
        backupCodes: backupCodes.map(code => ({ code, used: false }))
      }
    };

    await UserModel.update(userId, { preferences: mfaPreferences });

    return {
      secret,
      qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Enable MFA for a user after verifying the initial code
   */
  static async enableMFA(userId: string, verificationCode: string): Promise<boolean> {
    const user = await UserModel.findById(userId);
    if (!user || !user.preferences.mfa) {
      throw new Error('MFA setup not found');
    }

    // Verify the code
    const isValid = this.verifyTOTP(user.preferences.mfa.secret, verificationCode);
    if (!isValid) {
      throw new Error('Invalid verification code');
    }

    // Enable MFA
    const mfaPreferences = {
      ...user.preferences,
      mfa: {
        ...user.preferences.mfa,
        enabled: true
      }
    };

    await UserModel.update(userId, { preferences: mfaPreferences });
    return true;
  }

  /**
   * Disable MFA for a user
   */
  static async disableMFA(userId: string, verificationCode: string): Promise<boolean> {
    const user = await UserModel.findById(userId);
    if (!user || !user.preferences.mfa?.enabled) {
      throw new Error('MFA not enabled');
    }

    // Verify the code or backup code
    const verification = this.verifyMFACode(user.preferences.mfa, verificationCode);
    if (!verification.isValid) {
      throw new Error('Invalid verification code');
    }

    // Disable MFA
    const mfaPreferences = {
      ...user.preferences,
      mfa: {
        enabled: false,
        secret: null,
        backupCodes: []
      }
    };

    await UserModel.update(userId, { preferences: mfaPreferences });
    return true;
  }

  /**
   * Verify MFA code (TOTP or backup code)
   */
  static async verifyMFA(userId: string, code: string): Promise<MFAVerification> {
    const user = await UserModel.findById(userId);
    if (!user || !user.preferences.mfa?.enabled) {
      return { isValid: false };
    }

    const verification = this.verifyMFACode(user.preferences.mfa, code);
    
    // If a backup code was used, mark it as used
    if (verification.isValid && verification.backupCodeUsed) {
      const mfaPreferences = {
        ...user.preferences,
        mfa: {
          ...user.preferences.mfa,
          backupCodes: user.preferences.mfa.backupCodes.map((bc: any) => 
            bc.code === code ? { ...bc, used: true } : bc
          )
        }
      };
      
      await UserModel.update(userId, { preferences: mfaPreferences });
    }

    return verification;
  }

  /**
   * Check if user has MFA enabled
   */
  static async isMFAEnabled(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId);
    return user?.preferences.mfa?.enabled || false;
  }

  /**
   * Check if MFA is required for user (admin accounts)
   */
  static isMFARequired(userRole: string): boolean {
    return userRole === 'admin';
  }

  /**
   * Generate backup codes for user
   */
  static async regenerateBackupCodes(userId: string): Promise<string[]> {
    const user = await UserModel.findById(userId);
    if (!user || !user.preferences.mfa?.enabled) {
      throw new Error('MFA not enabled');
    }

    const backupCodes = this.generateBackupCodes();
    
    const mfaPreferences = {
      ...user.preferences,
      mfa: {
        ...user.preferences.mfa,
        backupCodes: backupCodes.map(code => ({ code, used: false }))
      }
    };

    await UserModel.update(userId, { preferences: mfaPreferences });
    return backupCodes;
  }

  /**
   * Generate a random secret for TOTP
   */
  private static generateSecret(): string {
    return crypto.randomBytes(this.MFA_SECRET_LENGTH).toString('base32');
  }

  /**
   * Generate backup codes
   */
  private static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.BACKUP_CODES_COUNT; i++) {
      codes.push(crypto.randomBytes(this.BACKUP_CODE_LENGTH).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Generate QR code URL for TOTP setup
   */
  private static generateQRCodeUrl(email: string, secret: string): string {
    const issuer = 'CAD AI Platform';
    const label = `${issuer}:${email}`;
    return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  }

  /**
   * Verify TOTP code (simplified implementation)
   * In production, use a proper TOTP library like 'otplib'
   */
  private static verifyTOTP(secret: string, code: string): boolean {
    // This is a simplified implementation
    // In production, use a proper TOTP library that handles time windows
    const currentTime = Math.floor(Date.now() / 1000 / this.TOTP_WINDOW);
    
    // Check current time window and adjacent windows for clock drift
    for (let i = -1; i <= 1; i++) {
      const timeStep = currentTime + i;
      const expectedCode = this.generateTOTP(secret, timeStep);
      if (expectedCode === code) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate TOTP code for a given time step (simplified)
   */
  private static generateTOTP(secret: string, timeStep: number): string {
    // This is a very simplified implementation
    // In production, use a proper TOTP library
    const hash = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
    hash.update(Buffer.from(timeStep.toString()));
    const hmac = hash.digest();
    
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % Math.pow(10, this.TOTP_DIGITS);
    
    return code.toString().padStart(this.TOTP_DIGITS, '0');
  }

  /**
   * Verify MFA code (TOTP or backup code)
   */
  private static verifyMFACode(mfaData: any, code: string): MFAVerification {
    // First try TOTP
    if (this.verifyTOTP(mfaData.secret, code)) {
      return { isValid: true };
    }

    // Then try backup codes
    const backupCode = mfaData.backupCodes?.find((bc: any) => bc.code === code && !bc.used);
    if (backupCode) {
      return { isValid: true, backupCodeUsed: true };
    }

    return { isValid: false };
  }
}