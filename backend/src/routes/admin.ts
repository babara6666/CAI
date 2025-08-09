import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AdminService } from '../services/AdminService.js';
import { validateAdminUserUpdate, validateSystemConfig } from '../validation/adminValidation.js';
import { ApiResponse, UserFilters, AuditFilters } from '../types/index.js';

const router = Router();
const adminService = new AdminService();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard data
 *     description: Retrieve system overview data for admin dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *                         systemMetrics:
 *                           type: object
 *                         userStats:
 *                           type: object
 *                         resourceUsage:
 *                           type: object
 *                         recentActivity:
 *                           type: array
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/dashboard', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const dashboardData = await adminService.getDashboardData();
    
    const response: ApiResponse = {
      success: true,
      data: dashboardData
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: 'Failed to fetch dashboard data',
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
 * /api/admin/users/{id}/role:
 *   put:
 *     summary: Update user role (admin only)
 *     description: Update a user's role and permissions
 *     tags: [Admin]
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
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, engineer, viewer]
 *               reason:
 *                 type: string
 *                 description: Reason for role change
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/users/:id/role', authenticateToken, requireRole(['admin']), validateAdminUserUpdate, async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, reason } = req.body;
    const adminUser = (req as any).user;
    
    const result = await adminService.updateUserRole(userId, role, adminUser.id, reason);
    
    const response: ApiResponse = {
      success: true,
      data: result
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ROLE_UPDATE_ERROR',
        message: 'Failed to update user role',
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
 * /api/admin/users/{id}/status:
 *   put:
 *     summary: Update user status (admin only)
 *     description: Activate or deactivate a user account
 *     tags: [Admin]
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
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *               reason:
 *                 type: string
 *                 description: Reason for status change
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/users/:id/status', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const { isActive, reason } = req.body;
    const adminUser = (req as any).user;
    
    const result = await adminService.updateUserStatus(userId, isActive, adminUser.id, reason);
    
    const response: ApiResponse = {
      success: true,
      data: result
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'STATUS_UPDATE_ERROR',
        message: 'Failed to update user status',
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
 * /api/admin/system/metrics:
 *   get:
 *     summary: Get system metrics
 *     description: Retrieve detailed system performance and usage metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: timeRange
 *         in: query
 *         description: Time range for metrics (hours)
 *         schema:
 *           type: integer
 *           default: 24
 *     responses:
 *       200:
 *         description: System metrics retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/system/metrics', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const timeRange = parseInt(req.query.timeRange as string) || 24;
    const metrics = await adminService.getSystemMetrics(timeRange);
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: 'Failed to fetch system metrics',
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
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get audit logs (admin only)
 *     description: Retrieve system audit logs with filtering options
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: userId
 *         in: query
 *         description: Filter by user ID
 *         schema:
 *           type: string
 *       - name: action
 *         in: query
 *         description: Filter by action type
 *         schema:
 *           type: string
 *       - name: resourceType
 *         in: query
 *         description: Filter by resource type
 *         schema:
 *           type: string
 *       - name: startDate
 *         in: query
 *         description: Start date for audit logs
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         description: End date for audit logs
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/audit-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const filters: AuditFilters = {};
    if (req.query.userId) filters.userId = req.query.userId as string;
    if (req.query.action) filters.action = req.query.action as string;
    if (req.query.resourceType) filters.resourceType = req.query.resourceType as string;
    if (req.query.startDate && req.query.endDate) {
      filters.dateRange = {
        startDate: new Date(req.query.startDate as string),
        endDate: new Date(req.query.endDate as string)
      };
    }
    
    const result = await adminService.getAuditLogs(filters, { page, limit });
    
    const response: ApiResponse = {
      success: true,
      data: result.logs,
      pagination: result.pagination
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'AUDIT_LOGS_ERROR',
        message: 'Failed to fetch audit logs',
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
 * /api/admin/resource-usage:
 *   get:
 *     summary: Get resource usage statistics
 *     description: Retrieve system resource usage and quota information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resource usage retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/resource-usage', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const resourceUsage = await adminService.getResourceUsage();
    
    const response: ApiResponse = {
      success: true,
      data: resourceUsage
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RESOURCE_USAGE_ERROR',
        message: 'Failed to fetch resource usage',
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
 * /api/admin/users/bulk-actions:
 *   post:
 *     summary: Perform bulk actions on users
 *     description: Perform bulk operations like role updates or status changes on multiple users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *               - action
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               action:
 *                 type: string
 *                 enum: [activate, deactivate, change_role]
 *               role:
 *                 type: string
 *                 enum: [admin, engineer, viewer]
 *                 description: Required when action is change_role
 *               reason:
 *                 type: string
 *                 description: Reason for bulk action
 *     responses:
 *       200:
 *         description: Bulk action completed successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/users/bulk-actions', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userIds, action, role, reason } = req.body;
    const adminUser = (req as any).user;
    
    const result = await adminService.performBulkUserAction(userIds, action, adminUser.id, { role, reason });
    
    const response: ApiResponse = {
      success: true,
      data: result
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'BULK_ACTION_ERROR',
        message: 'Failed to perform bulk action',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(400).json(response);
  }
});

export default router;