import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService.js';
import { MFAService } from '../services/MFAService.js';
import { UserModel } from '../models/User.js';
import { 
  validate,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaSetupSchema,
  mfaVerificationSchema
} from '../validation/authValidation.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { ApiResponse } from '../types/index.js';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, username, password, role } = req.body;
    
    const result = await AuthService.register({
      email,
      username,
      password,
      role
    });

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          role: result.user.role,
          createdAt: result.user.createdAt,
          isActive: result.user.isActive
        },
        tokens: result.tokens
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: error.message || 'Registration failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, mfaCode } = req.body;
    
    // First, authenticate with email and password
    const result = await AuthService.login(email, password);
    
    // Check if MFA is required for this user
    const isMFARequired = MFAService.isMFARequired(result.user.role);
    const isMFAEnabled = await MFAService.isMFAEnabled(result.user.id);
    
    if (isMFARequired && isMFAEnabled) {
      if (!mfaCode) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'MFA_REQUIRED',
            message: 'Multi-factor authentication code required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }
      
      // Verify MFA code
      const mfaVerification = await MFAService.verifyMFA(result.user.id, mfaCode);
      if (!mfaVerification.isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_MFA_CODE',
            message: 'Invalid multi-factor authentication code',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }
    }

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          role: result.user.role,
          lastLoginAt: result.user.lastLoginAt,
          isActive: result.user.isActive,
          preferences: result.user.preferences
        },
        tokens: result.tokens
      }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: error.message || 'Login failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(401).json(response);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    const tokens = await AuthService.refreshToken(refreshToken);

    const response: ApiResponse = {
      success: true,
      data: { tokens }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'TOKEN_REFRESH_FAILED',
        message: error.message || 'Token refresh failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(401).json(response);
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  // In a production system, you might want to blacklist the token
  // For now, we'll just return success and let the client remove the token
  
  const response: ApiResponse = {
    success: true,
    data: { message: 'Logged out successfully' }
  };

  res.json(response);
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: req.user!.id,
          email: req.user!.email,
          username: req.user!.username,
          role: req.user!.role,
          createdAt: req.user!.createdAt,
          updatedAt: req.user!.updatedAt,
          lastLoginAt: req.user!.lastLoginAt,
          isActive: req.user!.isActive,
          preferences: req.user!.preferences
        }
      }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to fetch user profile',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;
    
    // Verify current password
    const user = await UserModel.authenticate(req.user!.email, currentPassword);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(400).json(response);
    }
    
    // Update password
    const success = await UserModel.updatePassword(userId, newPassword);
    
    if (!success) {
      throw new Error('Failed to update password');
    }

    const response: ApiResponse = {
      success: true,
      data: { message: 'Password changed successfully' }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: error.message || 'Password change failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await UserModel.findByEmail(email);
    
    // Always return success to prevent email enumeration
    const response: ApiResponse = {
      success: true,
      data: { 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      }
    };

    // Only send email if user exists (implement email service in production)
    if (user) {
      // TODO: Implement email service to send reset link
      console.log(`Password reset requested for user: ${user.email}`);
    }

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FORGOT_PASSWORD_FAILED',
        message: 'Failed to process password reset request',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    
    // TODO: Implement token verification and password reset
    // For now, return not implemented
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Password reset functionality not yet implemented',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(501).json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PASSWORD_RESET_FAILED',
        message: error.message || 'Password reset failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

// MFA Routes

/**
 * POST /api/auth/mfa/setup
 * Setup MFA for current user
 */
router.post('/mfa/setup', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const mfaSetup = await MFAService.setupMFA(userId);

    const response: ApiResponse = {
      success: true,
      data: {
        secret: mfaSetup.secret,
        qrCodeUrl: mfaSetup.qrCodeUrl,
        backupCodes: mfaSetup.backupCodes
      }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MFA_SETUP_FAILED',
        message: error.message || 'MFA setup failed',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/auth/mfa/enable
 * Enable MFA after verification
 */
router.post('/mfa/enable', authenticate, adminOnly, validate(mfaSetupSchema), async (req: Request, res: Response) => {
  try {
    const { verificationCode } = req.body;
    const userId = req.user!.id;
    
    await MFAService.enableMFA(userId, verificationCode);

    const response: ApiResponse = {
      success: true,
      data: { message: 'MFA enabled successfully' }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MFA_ENABLE_FAILED',
        message: error.message || 'Failed to enable MFA',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA
 */
router.post('/mfa/disable', authenticate, adminOnly, validate(mfaVerificationSchema), async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.user!.id;
    
    await MFAService.disableMFA(userId, code);

    const response: ApiResponse = {
      success: true,
      data: { message: 'MFA disabled successfully' }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MFA_DISABLE_FAILED',
        message: error.message || 'Failed to disable MFA',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /api/auth/mfa/regenerate-backup-codes
 * Regenerate backup codes
 */
router.post('/mfa/regenerate-backup-codes', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const backupCodes = await MFAService.regenerateBackupCodes(userId);

    const response: ApiResponse = {
      success: true,
      data: { backupCodes }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'BACKUP_CODES_REGENERATION_FAILED',
        message: error.message || 'Failed to regenerate backup codes',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/auth/mfa/status
 * Get MFA status for current user
 */
router.get('/mfa/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    
    const isEnabled = await MFAService.isMFAEnabled(userId);
    const isRequired = MFAService.isMFARequired(userRole);

    const response: ApiResponse = {
      success: true,
      data: {
        enabled: isEnabled,
        required: isRequired
      }
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MFA_STATUS_FAILED',
        message: 'Failed to get MFA status',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    res.status(500).json(response);
  }
});

export default router;