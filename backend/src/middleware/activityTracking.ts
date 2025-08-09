import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/AdminService';
import { pool } from '../database/connection';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const adminService = new AdminService(pool);

export const trackActivity = (activityType: string, getDescription?: (req: Request) => string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Store original end function
    const originalEnd = res.end;
    
    // Override end function to track activity after response
    res.end = function(chunk?: any, encoding?: any) {
      // Call original end function
      originalEnd.call(this, chunk, encoding);
      
      // Track activity asynchronously (don't block response)
      if (req.user && res.statusCode < 400) {
        setImmediate(async () => {
          try {
            const description = getDescription ? getDescription(req) : `${req.method} ${req.path}`;
            await adminService.recordUserActivity({
              user_id: req.user!.id,
              activity_type: activityType,
              activity_description: description,
              ip_address: req.ip || req.connection.remoteAddress,
              user_agent: req.get('User-Agent'),
              session_id: req.sessionID,
              metadata: {
                method: req.method,
                path: req.path,
                query: req.query,
                status_code: res.statusCode
              },
              timestamp: new Date()
            });
          } catch (error) {
            console.error('Failed to track user activity:', error);
          }
        });
      }
    };
    
    next();
  };
};

// Predefined activity trackers for common actions
export const trackFileUpload = trackActivity('FILE_UPLOAD', (req) => 
  `Uploaded file: ${req.body?.filename || 'unknown'}`
);

export const trackFileDownload = trackActivity('FILE_DOWNLOAD', (req) => 
  `Downloaded file: ${req.params?.fileId || 'unknown'}`
);

export const trackLogin = trackActivity('LOGIN', () => 'User logged in');

export const trackLogout = trackActivity('LOGOUT', () => 'User logged out');

export const trackProfileUpdate = trackActivity('PROFILE_UPDATE', () => 'Updated profile');

export const trackPasswordChange = trackActivity('PASSWORD_CHANGE', () => 'Changed password');

export const trackAPICall = trackActivity('API_CALL', (req) => 
  `API call: ${req.method} ${req.path}`
);

export const trackAdminAction = trackActivity('ADMIN_ACTION', (req) => 
  `Admin action: ${req.method} ${req.path}`
);

export const trackSearchQuery = trackActivity('SEARCH', (req) => 
  `Search query: ${req.query?.q || 'unknown'}`
);

export const trackAIInference = trackActivity('AI_INFERENCE', (req) => 
  `AI inference: ${req.body?.model || 'unknown model'}`
);