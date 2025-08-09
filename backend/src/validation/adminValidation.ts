import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ApiResponse, UserRole } from '../types/index.js';

/**
 * Validation middleware for admin user role updates
 */
export const validateAdminUserUpdate = [
  body('role')
    .isIn(['admin', 'engineer', 'viewer'])
    .withMessage('Role must be one of: admin, engineer, viewer'),
  
  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be a string between 1 and 500 characters'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Validation middleware for admin user status updates
 */
export const validateAdminUserStatus = [
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean value'),
  
  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be a string between 1 and 500 characters'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Validation middleware for bulk user actions
 */
export const validateBulkUserAction = [
  body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('userIds must be an array with 1-100 items')
    .custom((userIds: string[]) => {
      if (!userIds.every(id => typeof id === 'string' && id.length > 0)) {
        throw new Error('All userIds must be non-empty strings');
      }
      return true;
    }),

  body('action')
    .isIn(['activate', 'deactivate', 'change_role'])
    .withMessage('Action must be one of: activate, deactivate, change_role'),

  body('role')
    .if(body('action').equals('change_role'))
    .isIn(['admin', 'engineer', 'viewer'])
    .withMessage('Role is required and must be one of: admin, engineer, viewer when action is change_role'),

  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be a string between 1 and 500 characters'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Validation middleware for system configuration updates
 */
export const validateSystemConfig = [
  body('maxFileSize')
    .optional()
    .isInt({ min: 1, max: 1000000000 }) // 1 byte to 1GB
    .withMessage('maxFileSize must be an integer between 1 and 1000000000 bytes'),

  body('maxStoragePerUser')
    .optional()
    .isInt({ min: 1, max: 10000000000 }) // 1 byte to 10GB
    .withMessage('maxStoragePerUser must be an integer between 1 and 10000000000 bytes'),

  body('allowedFileTypes')
    .optional()
    .isArray()
    .withMessage('allowedFileTypes must be an array')
    .custom((types: string[]) => {
      if (!types.every(type => typeof type === 'string' && type.length > 0)) {
        throw new Error('All file types must be non-empty strings');
      }
      return true;
    }),

  body('maintenanceMode')
    .optional()
    .isBoolean()
    .withMessage('maintenanceMode must be a boolean value'),

  body('registrationEnabled')
    .optional()
    .isBoolean()
    .withMessage('registrationEnabled must be a boolean value'),

  body('maxConcurrentTrainingJobs')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('maxConcurrentTrainingJobs must be an integer between 1 and 100'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Validation middleware for audit log queries
 */
export const validateAuditLogQuery = [
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),

  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (req.body.startDate && new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error('endDate must be after startDate');
      }
      return true;
    }),

  body('userId')
    .optional()
    .isString()
    .isLength({ min: 1 })
    .withMessage('userId must be a non-empty string'),

  body('action')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('action must be a string between 1 and 100 characters'),

  body('resourceType')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('resourceType must be a string between 1 and 50 characters'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Validation middleware for system metrics queries
 */
export const validateMetricsQuery = [
  body('timeRange')
    .optional()
    .isInt({ min: 1, max: 168 }) // 1 hour to 1 week
    .withMessage('timeRange must be an integer between 1 and 168 hours'),

  body('metricType')
    .optional()
    .isIn(['cpu', 'memory', 'storage', 'database', 'api', 'all'])
    .withMessage('metricType must be one of: cpu, memory, storage, database, api, all'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: errors.array()
        }
      };
      return res.status(400).json(response);
    }
    next();
  }
];

/**
 * Custom validation to ensure admin cannot perform certain actions on themselves
 */
export const validateNotSelfAction = (req: Request, res: Response, next: NextFunction) => {
  const targetUserId = req.params.id;
  const adminUser = (req as any).user;

  if (adminUser.id === targetUserId) {
    const action = req.body.action || req.method;
    const restrictedActions = ['deactivate', 'DELETE', 'change_role'];
    
    if (restrictedActions.some(restricted => 
      action.toLowerCase().includes(restricted.toLowerCase()) || 
      req.path.includes('status') && req.body.isActive === false
    )) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SELF_ACTION_FORBIDDEN',
          message: 'You cannot perform this action on your own account',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          suggestions: ['Ask another admin to perform this action', 'Use a different admin account']
        }
      };
      return res.status(403).json(response);
    }
  }

  next();
};

/**
 * Validation to ensure at least one admin remains active
 */
export const validateAdminCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.params.id;
    const action = req.body.action;
    const isDeactivating = req.body.isActive === false || action === 'deactivate';
    const isRoleChange = req.body.role && req.body.role !== 'admin';

    if (isDeactivating || isRoleChange) {
      // Check if target user is an admin
      const userQuery = 'SELECT role FROM users WHERE id = $1';
      const userResult = await (req as any).db.query(userQuery, [targetUserId]);
      
      if (userResult.rows.length > 0 && userResult.rows[0].role === 'admin') {
        // Count remaining active admins
        const adminCountQuery = `
          SELECT COUNT(*) as admin_count 
          FROM users 
          WHERE role = 'admin' AND is_active = true AND id != $1
        `;
        const adminResult = await (req as any).db.query(adminCountQuery, [targetUserId]);
        const remainingAdmins = parseInt(adminResult.rows[0].admin_count);

        if (remainingAdmins === 0) {
          const response: ApiResponse = {
            success: false,
            error: {
              code: 'LAST_ADMIN_ERROR',
              message: 'Cannot deactivate or change role of the last admin user',
              timestamp: new Date(),
              requestId: req.headers['x-request-id'] as string || 'unknown',
              suggestions: ['Create another admin user first', 'Assign admin role to another user']
            }
          };
          return res.status(400).json(response);
        }
      }
    }

    next();
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Failed to validate admin count',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
};