import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { UserService } from '../services/UserService.js';
import { validateUserCreation, validateUserUpdate } from '../validation/userValidation.js';
import { ApiResponse, User, UserFilters } from '../types/index.js';

const router = Router();
const userService = new UserService();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (admin only)
 *     description: Retrieve a paginated list of all users with optional filtering
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: role
 *         in: query
 *         description: Filter by user role
 *         schema:
 *           type: string
 *           enum: [admin, engineer, viewer]
 *       - name: isActive
 *         in: query
 *         description: Filter by active status
 *         schema:
 *           type: boolean
 *       - name: search
 *         in: query
 *         description: Search by username or email
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string;
    
    const filters: UserFilters = {};
    if (req.query.role) filters.role = req.query.role as any;
    if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === 'true';
    
    const result = await userService.getUsers(filters, { page, limit, search });
    
    const response: ApiResponse = {
      success: true,
      data: result.users,
      pagination: result.pagination
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'USER_FETCH_ERROR',
        message: 'Failed to fetch users',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user (admin only)
 *     description: Create a new user account with specified role and permissions
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               password:
 *                 type: string
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [admin, engineer, viewer]
 *                 default: viewer
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', authenticateToken, requireRole(['admin']), validateUserCreation, async (req, res) => {
  try {
    const userData = req.body;
    const user = await userService.createUser(userData);
    
    const response: ApiResponse = {
      success: true,
      data: user
    };
    
    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'USER_CREATION_ERROR',
        message: 'Failed to create user',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user by their ID. Users can only access their own profile unless they are admin.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUser = (req as any).user;
    
    // Users can only access their own profile unless they are admin
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only access your own profile',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(403).json(response);
    }
    
    const user = await userService.getUserById(userId);
    
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: user
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'USER_FETCH_ERROR',
        message: 'Failed to fetch user',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     description: Update user information. Users can update their own profile, admins can update any user.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, engineer, viewer]
 *               isActive:
 *                 type: boolean
 *               preferences:
 *                 $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id', authenticateToken, validateUserUpdate, async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUser = (req as any).user;
    const updateData = req.body;
    
    // Users can only update their own profile unless they are admin
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own profile',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(403).json(response);
    }
    
    // Non-admin users cannot change role or isActive status
    if (requestingUser.role !== 'admin') {
      delete updateData.role;
      delete updateData.isActive;
    }
    
    const user = await userService.updateUser(userId, updateData);
    
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: user
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'USER_UPDATE_ERROR',
        message: 'Failed to update user',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (admin only)
 *     description: Delete a user account. This action is irreversible.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: User deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUser = (req as any).user;
    
    // Prevent admin from deleting themselves
    if (requestingUser.id === userId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CANNOT_DELETE_SELF',
          message: 'You cannot delete your own account',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          suggestions: ['Ask another admin to delete your account', 'Deactivate your account instead']
        }
      };
      return res.status(400).json(response);
    }
    
    const deleted = await userService.deleteUser(userId);
    
    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'User deleted successfully'
      }
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'USER_DELETE_ERROR',
        message: 'Failed to delete user',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/users/{id}/activity:
 *   get:
 *     summary: Get user activity log
 *     description: Retrieve activity log for a specific user. Users can only access their own activity unless they are admin.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: action
 *         in: query
 *         description: Filter by action type
 *         schema:
 *           type: string
 *       - name: startDate
 *         in: query
 *         description: Start date for activity log
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         description: End date for activity log
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: User activity retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           resourceType:
 *                             type: string
 *                           resourceId:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           details:
 *                             type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUser = (req as any).user;
    
    // Users can only access their own activity unless they are admin
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only access your own activity log',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(403).json(response);
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const filters: any = { userId };
    if (req.query.action) filters.action = req.query.action;
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
    
    const result = await userService.getUserActivity(userId, filters, { page, limit });
    
    const response: ApiResponse = {
      success: true,
      data: result.activities,
      pagination: result.pagination
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ACTIVITY_FETCH_ERROR',
        message: 'Failed to fetch user activity',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

export default router;