import { AdminService } from '../AdminService.js';
import { UserService } from '../UserService.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { BaseModel } from '../../models/BaseModel.js';
import { vi } from 'vitest';

// Mock dependencies
vi.mock('../UserService.js');
vi.mock('../../models/AuditLog.js');
vi.mock('../../models/BaseModel.js');

const MockedUserService = UserService as any;
const MockedAuditLogModel = AuditLogModel as any;

describe('AdminService', () => {
  let adminService: AdminService;
  let mockUserService: any;

  const mockUser = {
    id: 'user-123',
    email: 'user@test.com',
    username: 'testuser',
    role: 'viewer' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    
    // Mock BaseModel query method
    const mockQuery = vi.fn();
    (BaseModel.prototype as any).query = mockQuery;
    
    adminService = new AdminService();
    mockUserService = new MockedUserService();
    
    // Setup UserService mock
    (adminService as any).userService = mockUserService;
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      const updatedUser = { ...mockUser, role: 'engineer' as const };
      
      mockUserService.getUserById.mockResolvedValue(mockUser);
      mockUserService.updateUser.mockResolvedValue(updatedUser);
      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      const result = await adminService.updateUserRole('user-123', 'engineer', 'admin-123', 'Promotion');

      expect(result).toEqual(updatedUser);
      expect(mockUserService.getUserById).toHaveBeenCalledWith('user-123');
      expect(mockUserService.updateUser).toHaveBeenCalledWith('user-123', { role: 'engineer' });
      expect(MockedAuditLogModel.logUserAction).toHaveBeenCalledWith(
        'admin-123',
        'user_role_changed',
        'user',
        'user-123',
        expect.objectContaining({
          previousRole: 'viewer',
          newRole: 'engineer',
          reason: 'Promotion'
        })
      );
    });

    it('should throw error if user not found', async () => {
      mockUserService.getUserById.mockResolvedValue(null);

      await expect(
        adminService.updateUserRole('nonexistent', 'engineer', 'admin-123')
      ).rejects.toThrow('User not found');
    });

    it('should throw error if user already has the role', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);

      await expect(
        adminService.updateUserRole('user-123', 'viewer', 'admin-123')
      ).rejects.toThrow('User already has this role');
    });

    it('should throw error if update fails', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);
      mockUserService.updateUser.mockResolvedValue(null);

      await expect(
        adminService.updateUserRole('user-123', 'engineer', 'admin-123')
      ).rejects.toThrow('Failed to update user role');
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status successfully', async () => {
      const updatedUser = { ...mockUser, isActive: false };
      
      mockUserService.getUserById.mockResolvedValue(mockUser);
      mockUserService.updateUser.mockResolvedValue(updatedUser);
      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      const result = await adminService.updateUserStatus('user-123', false, 'admin-123', 'Policy violation');

      expect(result).toEqual(updatedUser);
      expect(mockUserService.updateUser).toHaveBeenCalledWith('user-123', { isActive: false });
      expect(MockedAuditLogModel.logUserAction).toHaveBeenCalledWith(
        'admin-123',
        'user_deactivated',
        'user',
        'user-123',
        expect.objectContaining({
          previousStatus: true,
          newStatus: false,
          reason: 'Policy violation'
        })
      );
    });

    it('should throw error if user already has the status', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);

      await expect(
        adminService.updateUserStatus('user-123', true, 'admin-123')
      ).rejects.toThrow('User is already active');
    });

    it('should log activation correctly', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const activatedUser = { ...mockUser, isActive: true };
      
      mockUserService.getUserById.mockResolvedValue(inactiveUser);
      mockUserService.updateUser.mockResolvedValue(activatedUser);
      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      await adminService.updateUserStatus('user-123', true, 'admin-123', 'Reactivation');

      expect(MockedAuditLogModel.logUserAction).toHaveBeenCalledWith(
        'admin-123',
        'user_activated',
        'user',
        'user-123',
        expect.objectContaining({
          previousStatus: false,
          newStatus: true,
          reason: 'Reactivation'
        })
      );
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockQuery = (adminService as any).query;
      
      // Mock query results
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '150' }] }) // total users
        .mockResolvedValueOnce({ rows: [{ active: '140' }] }) // active users
        .mockResolvedValueOnce({ rows: [{ new_today: '5' }] }) // new users today
        .mockResolvedValueOnce({ // users by role
          rows: [
            { role: 'admin', count: '3' },
            { role: 'engineer', count: '47' },
            { role: 'viewer', count: '90' }
          ]
        });

      const result = await adminService.getUserStats();

      expect(result).toEqual({
        totalUsers: 150,
        activeUsers: 140,
        newUsersToday: 5,
        usersByRole: {
          admin: 3,
          engineer: 47,
          viewer: 90
        }
      });
    });

    it('should handle missing roles in statistics', async () => {
      const mockQuery = (adminService as any).query;
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [{ active: '95' }] })
        .mockResolvedValueOnce({ rows: [{ new_today: '2' }] })
        .mockResolvedValueOnce({ 
          rows: [
            { role: 'admin', count: '2' }
            // Missing engineer and viewer roles
          ]
        });

      const result = await adminService.getUserStats();

      expect(result.usersByRole).toEqual({
        admin: 2,
        engineer: 0,
        viewer: 0
      });
    });
  });

  describe('performBulkUserAction', () => {
    it('should perform bulk activation successfully', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];
      
      // Mock successful updates
      jest.spyOn(adminService, 'updateUserStatus')
        .mockResolvedValueOnce({ ...mockUser, id: 'user-1', isActive: true })
        .mockResolvedValueOnce({ ...mockUser, id: 'user-2', isActive: true })
        .mockResolvedValueOnce({ ...mockUser, id: 'user-3', isActive: true });

      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      const result = await adminService.performBulkUserAction(
        userIds,
        'activate',
        'admin-123',
        { reason: 'Bulk activation' }
      );

      expect(result.summary).toEqual({
        total: 3,
        successful: 3,
        failed: 0
      });
      expect(result.successful).toEqual(userIds);
      expect(result.failed).toEqual([]);
    });

    it('should handle partial failures in bulk actions', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];
      
      jest.spyOn(adminService, 'updateUserStatus')
        .mockResolvedValueOnce({ ...mockUser, id: 'user-1', isActive: true })
        .mockRejectedValueOnce(new Error('User not found'))
        .mockResolvedValueOnce({ ...mockUser, id: 'user-3', isActive: true });

      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      const result = await adminService.performBulkUserAction(
        userIds,
        'activate',
        'admin-123'
      );

      expect(result.summary).toEqual({
        total: 3,
        successful: 2,
        failed: 1
      });
      expect(result.successful).toEqual(['user-1', 'user-3']);
      expect(result.failed).toEqual([
        {
          userId: 'user-2',
          error: 'User not found'
        }
      ]);
    });

    it('should perform bulk role changes', async () => {
      const userIds = ['user-1', 'user-2'];
      
      jest.spyOn(adminService, 'updateUserRole')
        .mockResolvedValueOnce({ ...mockUser, id: 'user-1', role: 'engineer' })
        .mockResolvedValueOnce({ ...mockUser, id: 'user-2', role: 'engineer' });

      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      const result = await adminService.performBulkUserAction(
        userIds,
        'change_role',
        'admin-123',
        { role: 'engineer', reason: 'Promotion' }
      );

      expect(result.summary.successful).toBe(2);
      expect(adminService.updateUserRole).toHaveBeenCalledTimes(2);
    });

    it('should throw error for unknown action', async () => {
      const userIds = ['user-1'];

      jest.spyOn(adminService, 'updateUserStatus').mockImplementation(() => {
        throw new Error('Unknown action: invalid_action');
      });

      const result = await adminService.performBulkUserAction(
        userIds,
        'invalid_action' as any,
        'admin-123'
      );

      expect(result.summary.failed).toBe(1);
      expect(result.failed[0].error).toContain('Unknown action');
    });

    it('should log bulk action', async () => {
      const userIds = ['user-1'];
      
      jest.spyOn(adminService, 'updateUserStatus')
        .mockResolvedValue({ ...mockUser, isActive: true });

      MockedAuditLogModel.logUserAction.mockResolvedValue(undefined);

      await adminService.performBulkUserAction(userIds, 'activate', 'admin-123');

      expect(MockedAuditLogModel.logUserAction).toHaveBeenCalledWith(
        'admin-123',
        'bulk_user_action',
        'user',
        undefined,
        expect.objectContaining({
          action: 'activate',
          userIds,
          result: expect.any(Object)
        })
      );
    });
  });

  describe('getAuditLogs', () => {
    it('should delegate to AuditLogModel.findAll', async () => {
      const mockLogs = {
        logs: [
          {
            id: 'log-1',
            userId: 'user-123',
            action: 'login',
            resourceType: 'user',
            timestamp: new Date(),
            details: {}
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        }
      };

      MockedAuditLogModel.findAll.mockResolvedValue(mockLogs);

      const filters = { userId: 'user-123' };
      const options = { page: 1, limit: 20 };

      const result = await adminService.getAuditLogs(filters, options);

      expect(result).toEqual(mockLogs);
      expect(MockedAuditLogModel.findAll).toHaveBeenCalledWith(
        filters,
        {
          limit: 20,
          offset: 0,
          orderBy: 'timestamp',
          orderDirection: 'desc'
        }
      );
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics with simulated data', async () => {
      const mockQuery = (adminService as any).query;
      
      // Mock database metrics query
      mockQuery.mockResolvedValue({
        rows: [{ connections: '10', max_connections: '100' }]
      });

      const result = await adminService.getSystemMetrics(24);

      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('storage');
      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('api');
      
      expect(result.cpu).toHaveProperty('usage');
      expect(result.cpu).toHaveProperty('cores');
      expect(result.database.connections).toBe(10);
      expect(result.database.maxConnections).toBe(100);
    });

    it('should handle database query errors gracefully', async () => {
      const mockQuery = (adminService as any).query;
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await adminService.getSystemMetrics(24);

      // Should still return metrics with default values
      expect(result.database.connections).toBe(0);
      expect(result.database.maxConnections).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should wrap errors with descriptive messages', async () => {
      mockUserService.getUserById.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        adminService.updateUserRole('user-123', 'engineer', 'admin-123')
      ).rejects.toThrow('Failed to update user role: Database connection failed');
    });

    it('should handle unknown errors', async () => {
      mockUserService.getUserById.mockRejectedValue('Unknown error');

      await expect(
        adminService.updateUserRole('user-123', 'engineer', 'admin-123')
      ).rejects.toThrow('Failed to update user role: Unknown error');
    });
  });
});