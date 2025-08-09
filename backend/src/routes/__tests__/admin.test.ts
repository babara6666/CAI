import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import adminRoutes from '../admin';
import { AdminService } from '../../services/AdminService';
import { auth, requireRole } from '../../middleware/auth';

// Mock dependencies
vi.mock('../../services/AdminService');
vi.mock('../../middleware/auth');
vi.mock('../../database/connection');

const MockedAdminService = AdminService as any;
const mockAuth = auth as any;
const mockRequireRole = requireRole as any;

describe('Admin Routes', () => {
  let app: express.Application;
  let mockAdminService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    mockAuth.mockImplementation((req: any, res: any, next: any) => {
      req.user = { id: 'admin-123', email: 'admin@test.com', role: 'admin' };
      next();
    });
    
    mockRequireRole.mockImplementation(() => (req: any, res: any, next: any) => next());
    
    // Mock AdminService
    mockAdminService = {
      getAllUsers: vi.fn(),
      updateUserRole: vi.fn(),
      toggleUserStatus: vi.fn(),
      getDashboardStats: vi.fn(),
      getSystemMetrics: vi.fn(),
      recordSystemMetric: vi.fn(),
      getSystemAlerts: vi.fn(),
      createSystemAlert: vi.fn(),
      resolveAlert: vi.fn(),
      getResourceUsage: vi.fn(),
      updateResourceQuota: vi.fn(),
      getUserActivity: vi.fn(),
      recordUserActivity: vi.fn(),
      getAuditLogs: vi.fn()
    };
    
    MockedAdminService.mockImplementation(() => mockAdminService);
    
    app.use('/admin', adminRoutes);
  });

  describe('GET /admin/users', () => {
    it('should return paginated users', async () => {
      const mockUsers = {
        users: [
          { id: '1', email: 'user1@test.com', role: 'user', is_active: true },
          { id: '2', email: 'user2@test.com', role: 'admin', is_active: true }
        ],
        total: 2,
        page: 1,
        totalPages: 1
      };
      
      mockAdminService.getAllUsers.mockResolvedValue(mockUsers);

      const response = await request(app)
        .get('/admin/users')
        .query({ page: '1', limit: '20' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockUsers);
      expect(mockAdminService.getAllUsers).toHaveBeenCalledWith(1, 20, {
        role: undefined,
        status: undefined,
        search: undefined
      });
    });

    it('should handle filters', async () => {
      mockAdminService.getAllUsers.mockResolvedValue({
        users: [],
        total: 0,
        page: 1,
        totalPages: 0
      });

      await request(app)
        .get('/admin/users')
        .query({ role: 'admin', status: 'active', search: 'john' });

      expect(mockAdminService.getAllUsers).toHaveBeenCalledWith(1, 20, {
        role: 'admin',
        status: 'active',
        search: 'john'
      });
    });

    it('should handle service errors', async () => {
      mockAdminService.getAllUsers.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/admin/users');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to fetch users');
    });
  });

  describe('PUT /admin/users/:userId/role', () => {
    it('should update user role successfully', async () => {
      const updatedUser = { id: 'user-123', role: 'admin' };
      mockAdminService.updateUserRole.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/admin/users/user-123/role')
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updatedUser);
      expect(mockAdminService.updateUserRole).toHaveBeenCalledWith(
        'user-123',
        'admin',
        'admin-123'
      );
    });

    it('should validate role input', async () => {
      const response = await request(app)
        .put('/admin/users/user-123/role')
        .send({ role: 'invalid_role' });

      expect(response.status).toBe(400);
    });

    it('should handle service errors', async () => {
      mockAdminService.updateUserRole.mockRejectedValue(new Error('User not found'));

      const response = await request(app)
        .put('/admin/users/user-123/role')
        .send({ role: 'admin' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('PUT /admin/users/:userId/toggle-status', () => {
    it('should toggle user status successfully', async () => {
      const updatedUser = { id: 'user-123', is_active: false };
      mockAdminService.toggleUserStatus.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/admin/users/user-123/toggle-status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User deactivated successfully');
      expect(mockAdminService.toggleUserStatus).toHaveBeenCalledWith(
        'user-123',
        'admin-123'
      );
    });

    it('should handle activation message', async () => {
      const updatedUser = { id: 'user-123', is_active: true };
      mockAdminService.toggleUserStatus.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/admin/users/user-123/toggle-status');

      expect(response.body.message).toBe('User activated successfully');
    });
  });

  describe('GET /admin/dashboard/stats', () => {
    it('should return dashboard statistics', async () => {
      const mockStats = {
        totalUsers: 100,
        activeUsers: 85,
        totalFiles: 500,
        totalStorage: 1000000000,
        systemHealth: 'healthy',
        recentAlerts: 3
      };
      
      mockAdminService.getDashboardStats.mockResolvedValue(mockStats);

      const response = await request(app).get('/admin/dashboard/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });
  });

  describe('GET /admin/metrics', () => {
    it('should return system metrics', async () => {
      const mockMetrics = [
        {
          id: '1',
          metric_name: 'cpu_usage',
          metric_value: 75.5,
          category: 'performance'
        }
      ];
      
      mockAdminService.getSystemMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/admin/metrics')
        .query({ timeRange: '24h' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockMetrics);
      expect(mockAdminService.getSystemMetrics).toHaveBeenCalledWith('24h');
    });
  });

  describe('POST /admin/metrics', () => {
    it('should record system metric', async () => {
      const metricData = {
        metric_name: 'memory_usage',
        metric_value: 80.2,
        metric_unit: 'percent',
        category: 'performance'
      };
      
      const mockResult = { ...metricData, id: '1' };
      mockAdminService.recordSystemMetric.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/admin/metrics')
        .send(metricData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResult);
    });

    it('should validate metric data', async () => {
      const response = await request(app)
        .post('/admin/metrics')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /admin/alerts', () => {
    it('should return system alerts with filters', async () => {
      const mockAlerts = [
        {
          id: '1',
          alert_type: 'error',
          title: 'Database Error',
          severity: 8,
          is_resolved: false
        }
      ];
      
      mockAdminService.getSystemAlerts.mockResolvedValue(mockAlerts);

      const response = await request(app)
        .get('/admin/alerts')
        .query({ type: 'error', severity: '5', resolved: 'false' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockAlerts);
      expect(mockAdminService.getSystemAlerts).toHaveBeenCalledWith({
        type: 'error',
        severity: 5,
        resolved: false
      });
    });
  });

  describe('POST /admin/alerts', () => {
    it('should create system alert', async () => {
      const alertData = {
        alert_type: 'warning',
        title: 'High CPU Usage',
        message: 'CPU usage is above 90%',
        source: 'monitoring',
        severity: 6
      };
      
      const mockResult = { ...alertData, id: '1', is_resolved: false };
      mockAdminService.createSystemAlert.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/admin/alerts')
        .send(alertData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockAdminService.createSystemAlert).toHaveBeenCalledWith({
        ...alertData,
        is_resolved: false
      });
    });
  });

  describe('PUT /admin/alerts/:alertId/resolve', () => {
    it('should resolve alert', async () => {
      const mockAlert = { id: '1', is_resolved: true };
      mockAdminService.resolveAlert.mockResolvedValue(mockAlert);

      const response = await request(app)
        .put('/admin/alerts/alert-123/resolve');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Alert resolved successfully');
      expect(mockAdminService.resolveAlert).toHaveBeenCalledWith(
        'alert-123',
        'admin-123'
      );
    });
  });

  describe('GET /admin/resource-usage', () => {
    it('should return resource usage data', async () => {
      const mockUsage = [
        {
          id: '1',
          user_id: 'user-1',
          resource_type: 'storage',
          usage_amount: 1000000,
          quota_limit: 10000000
        }
      ];
      
      mockAdminService.getResourceUsage.mockResolvedValue(mockUsage);

      const response = await request(app)
        .get('/admin/resource-usage')
        .query({ userId: 'user-1', resourceType: 'storage', timeRange: '30d' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockUsage);
      expect(mockAdminService.getResourceUsage).toHaveBeenCalledWith(
        'user-1',
        'storage',
        '30d'
      );
    });
  });

  describe('PUT /admin/resource-usage/:userId/:resourceType/quota', () => {
    it('should update resource quota', async () => {
      mockAdminService.updateResourceQuota.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/admin/resource-usage/user-1/storage/quota')
        .send({ quota_limit: 20000000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Resource quota updated successfully');
      expect(mockAdminService.updateResourceQuota).toHaveBeenCalledWith(
        'user-1',
        'storage',
        20000000,
        'admin-123'
      );
    });
  });

  describe('GET /admin/activity', () => {
    it('should return user activity data', async () => {
      const mockActivity = [
        {
          id: '1',
          user_id: 'user-1',
          activity_type: 'LOGIN',
          activity_description: 'User logged in',
          timestamp: new Date()
        }
      ];
      
      mockAdminService.getUserActivity.mockResolvedValue(mockActivity);

      const response = await request(app)
        .get('/admin/activity')
        .query({ userId: 'user-1', timeRange: '7d', limit: '100' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockActivity);
      expect(mockAdminService.getUserActivity).toHaveBeenCalledWith(
        'user-1',
        '7d',
        100
      );
    });
  });

  describe('POST /admin/activity', () => {
    it('should record user activity', async () => {
      const activityData = {
        user_id: 'user-1',
        activity_type: 'FILE_UPLOAD',
        activity_description: 'Uploaded CAD file'
      };
      
      const mockResult = { ...activityData, id: '1' };
      mockAdminService.recordUserActivity.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/admin/activity')
        .send(activityData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResult);
    });
  });

  describe('GET /admin/audit-logs', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = {
        logs: [
          {
            id: '1',
            user_id: 'user-1',
            action: 'UPDATE_USER_ROLE',
            resource_type: 'user',
            created_at: new Date()
          }
        ],
        total: 1,
        page: 1,
        totalPages: 1
      };
      
      mockAdminService.getAuditLogs.mockResolvedValue(mockLogs);

      const response = await request(app)
        .get('/admin/audit-logs')
        .query({
          page: '1',
          limit: '50',
          userId: 'user-1',
          action: 'UPDATE_USER_ROLE',
          timeRange: '7d'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockLogs);
      expect(mockAdminService.getAuditLogs).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          action: 'UPDATE_USER_ROLE',
          resourceType: undefined,
          timeRange: '7d'
        },
        1,
        50
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', () => {
      expect(mockAuth).toHaveBeenCalled();
    });

    it('should require admin role', () => {
      expect(mockRequireRole).toHaveBeenCalledWith(['admin']);
    });
  });
});