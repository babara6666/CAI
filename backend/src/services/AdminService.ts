import { UserService } from './UserService.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { BaseModel } from '../models/BaseModel.js';
import { 
  User, 
  UserRole, 
  AuditFilters, 
  Pagination,
  UserActivity,
  ApiResponse
} from '../types/index.js';

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  storage: {
    used: number;
    total: number;
    percentage: number;
  };
  database: {
    connections: number;
    maxConnections: number;
    queryTime: number;
  };
  api: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

export interface DashboardData {
  systemMetrics: SystemMetrics;
  userStats: {
    totalUsers: number;
    activeUsers: number;
    newUsersToday: number;
    usersByRole: Record<UserRole, number>;
  };
  resourceUsage: {
    totalFiles: number;
    totalStorage: number;
    totalDatasets: number;
    totalModels: number;
    trainingJobsActive: number;
  };
  recentActivity: UserActivity[];
  alerts: SystemAlert[];
}

export interface SystemAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface ResourceUsage {
  storage: {
    totalUsed: number;
    totalAvailable: number;
    byUser: Array<{
      userId: string;
      username: string;
      storageUsed: number;
      fileCount: number;
    }>;
    byFileType: Record<string, number>;
  };
  compute: {
    activeTrainingJobs: number;
    queuedJobs: number;
    totalGpuHours: number;
    averageJobDuration: number;
  };
  api: {
    requestsToday: number;
    requestsThisMonth: number;
    topEndpoints: Array<{
      endpoint: string;
      requests: number;
      averageResponseTime: number;
    }>;
  };
}

export interface BulkActionResult {
  successful: string[];
  failed: Array<{
    userId: string;
    error: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export class AdminService extends BaseModel {
  private userService: UserService;

  constructor() {
    super();
    this.userService = new UserService();
  }

  async getDashboardData(): Promise<DashboardData> {
    try {
      const [systemMetrics, userStats, resourceUsage, recentActivity, alerts] = await Promise.all([
        this.getSystemMetrics(24),
        this.getUserStats(),
        this.getResourceUsage(),
        this.getRecentActivity(10),
        this.getSystemAlerts()
      ]);

      return {
        systemMetrics,
        userStats,
        resourceUsage,
        recentActivity,
        alerts
      };
    } catch (error) {
      throw new Error(`Failed to fetch dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSystemMetrics(timeRangeHours: number = 24): Promise<SystemMetrics> {
    try {
      // In a real implementation, these would come from monitoring systems
      // For now, we'll simulate the data
      
      const [apiMetrics, dbMetrics] = await Promise.all([
        this.getApiMetrics(timeRangeHours),
        this.getDatabaseMetrics()
      ]);

      return {
        cpu: {
          usage: Math.random() * 100, // Simulated
          cores: 8 // Simulated
        },
        memory: {
          used: Math.random() * 16000, // Simulated MB
          total: 16000,
          percentage: Math.random() * 100
        },
        storage: {
          used: Math.random() * 1000000, // Simulated MB
          total: 2000000,
          percentage: Math.random() * 100
        },
        database: dbMetrics,
        api: apiMetrics
      };
    } catch (error) {
      throw new Error(`Failed to fetch system metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserStats(): Promise<DashboardData['userStats']> {
    try {
      const totalUsersQuery = 'SELECT COUNT(*) as total FROM users';
      const activeUsersQuery = 'SELECT COUNT(*) as active FROM users WHERE is_active = true';
      const newUsersTodayQuery = `
        SELECT COUNT(*) as new_today 
        FROM users 
        WHERE created_at >= CURRENT_DATE
      `;
      const usersByRoleQuery = `
        SELECT role, COUNT(*) as count 
        FROM users 
        WHERE is_active = true 
        GROUP BY role
      `;

      const [totalResult, activeResult, newTodayResult, roleResult] = await Promise.all([
        this.query(totalUsersQuery),
        this.query(activeUsersQuery),
        this.query(newUsersTodayQuery),
        this.query(usersByRoleQuery)
      ]);

      const usersByRole: Record<UserRole, number> = {
        admin: 0,
        engineer: 0,
        viewer: 0
      };

      roleResult.rows.forEach((row: any) => {
        usersByRole[row.role as UserRole] = parseInt(row.count);
      });

      return {
        totalUsers: parseInt(totalResult.rows[0].total),
        activeUsers: parseInt(activeResult.rows[0].active),
        newUsersToday: parseInt(newTodayResult.rows[0].new_today),
        usersByRole
      };
    } catch (error) {
      throw new Error(`Failed to fetch user stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getResourceUsage(): Promise<ResourceUsage> {
    try {
      const [storageData, computeData, apiData] = await Promise.all([
        this.getStorageUsage(),
        this.getComputeUsage(),
        this.getApiUsage()
      ]);

      return {
        storage: storageData,
        compute: computeData,
        api: apiData
      };
    } catch (error) {
      throw new Error(`Failed to fetch resource usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateUserRole(userId: string, newRole: UserRole, adminId: string, reason?: string): Promise<User> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === newRole) {
        throw new Error('User already has this role');
      }

      const updatedUser = await this.userService.updateUser(userId, { role: newRole });
      if (!updatedUser) {
        throw new Error('Failed to update user role');
      }

      // Log the role change
      await AuditLogModel.logUserAction(
        adminId,
        'user_role_changed',
        'user',
        userId,
        {
          previousRole: user.role,
          newRole,
          reason: reason || 'No reason provided',
          targetUserId: userId,
          targetUsername: user.username
        }
      );

      return updatedUser;
    } catch (error) {
      throw new Error(`Failed to update user role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateUserStatus(userId: string, isActive: boolean, adminId: string, reason?: string): Promise<User> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.isActive === isActive) {
        throw new Error(`User is already ${isActive ? 'active' : 'inactive'}`);
      }

      const updatedUser = await this.userService.updateUser(userId, { isActive });
      if (!updatedUser) {
        throw new Error('Failed to update user status');
      }

      // Log the status change
      await AuditLogModel.logUserAction(
        adminId,
        isActive ? 'user_activated' : 'user_deactivated',
        'user',
        userId,
        {
          previousStatus: user.isActive,
          newStatus: isActive,
          reason: reason || 'No reason provided',
          targetUserId: userId,
          targetUsername: user.username
        }
      );

      return updatedUser;
    } catch (error) {
      throw new Error(`Failed to update user status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAuditLogs(
    filters: AuditFilters,
    options: { page: number; limit: number }
  ): Promise<{ logs: any[]; pagination: Pagination }> {
    try {
      return await AuditLogModel.findAll(filters, {
        limit: options.limit,
        offset: (options.page - 1) * options.limit,
        orderBy: 'timestamp',
        orderDirection: 'desc'
      });
    } catch (error) {
      throw new Error(`Failed to fetch audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async performBulkUserAction(
    userIds: string[],
    action: 'activate' | 'deactivate' | 'change_role',
    adminId: string,
    options: { role?: UserRole; reason?: string } = {}
  ): Promise<BulkActionResult> {
    const result: BulkActionResult = {
      successful: [],
      failed: [],
      summary: {
        total: userIds.length,
        successful: 0,
        failed: 0
      }
    };

    for (const userId of userIds) {
      try {
        switch (action) {
          case 'activate':
            await this.updateUserStatus(userId, true, adminId, options.reason);
            break;
          case 'deactivate':
            await this.updateUserStatus(userId, false, adminId, options.reason);
            break;
          case 'change_role':
            if (!options.role) {
              throw new Error('Role is required for change_role action');
            }
            await this.updateUserRole(userId, options.role, adminId, options.reason);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        result.successful.push(userId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.summary.failed++;
      }
    }

    // Log the bulk action
    await AuditLogModel.logUserAction(
      adminId,
      'bulk_user_action',
      'user',
      undefined,
      {
        action,
        userIds,
        options,
        result: result.summary
      }
    );

    return result;
  }

  private async getApiMetrics(timeRangeHours: number): Promise<SystemMetrics['api']> {
    try {
      // In a real implementation, this would query API logs or monitoring data
      // For now, we'll simulate based on audit logs
      const query = `
        SELECT 
          COUNT(*) as total_requests,
          AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp)))) as avg_response_time
        FROM audit_logs 
        WHERE action LIKE '%_request' 
        AND timestamp >= NOW() - INTERVAL '${timeRangeHours} hours'
      `;

      const result = await this.query(query);
      const row = result.rows[0];

      return {
        requestsPerMinute: Math.round((parseInt(row.total_requests) || 0) / (timeRangeHours * 60)),
        averageResponseTime: parseFloat(row.avg_response_time) || 0,
        errorRate: Math.random() * 5 // Simulated error rate percentage
      };
    } catch (error) {
      // Return default values if query fails
      return {
        requestsPerMinute: 0,
        averageResponseTime: 0,
        errorRate: 0
      };
    }
  }

  private async getDatabaseMetrics(): Promise<SystemMetrics['database']> {
    try {
      const query = `
        SELECT 
          numbackends as connections,
          setting::int as max_connections
        FROM pg_stat_database 
        JOIN pg_settings ON name = 'max_connections'
        WHERE datname = current_database()
      `;

      const result = await this.query(query);
      const row = result.rows[0];

      // Simulate query time
      const start = Date.now();
      await this.query('SELECT 1');
      const queryTime = Date.now() - start;

      return {
        connections: parseInt(row?.connections) || 0,
        maxConnections: parseInt(row?.max_connections) || 100,
        queryTime
      };
    } catch (error) {
      return {
        connections: 0,
        maxConnections: 100,
        queryTime: 0
      };
    }
  }

  private async getStorageUsage(): Promise<ResourceUsage['storage']> {
    try {
      const totalStorageQuery = `
        SELECT 
          COALESCE(SUM(file_size), 0) as total_used,
          COUNT(*) as total_files
        FROM cad_files
      `;

      const storageByUserQuery = `
        SELECT 
          u.id as user_id,
          u.username,
          COALESCE(SUM(cf.file_size), 0) as storage_used,
          COUNT(cf.id) as file_count
        FROM users u
        LEFT JOIN cad_files cf ON u.id = cf.uploaded_by
        WHERE u.is_active = true
        GROUP BY u.id, u.username
        ORDER BY storage_used DESC
        LIMIT 10
      `;

      const storageByTypeQuery = `
        SELECT 
          mime_type,
          SUM(file_size) as total_size
        FROM cad_files
        GROUP BY mime_type
        ORDER BY total_size DESC
      `;

      const [totalResult, userResult, typeResult] = await Promise.all([
        this.query(totalStorageQuery),
        this.query(storageByUserQuery),
        this.query(storageByTypeQuery)
      ]);

      const byUser = userResult.rows.map((row: any) => ({
        userId: row.user_id,
        username: row.username,
        storageUsed: parseInt(row.storage_used),
        fileCount: parseInt(row.file_count)
      }));

      const byFileType: Record<string, number> = {};
      typeResult.rows.forEach((row: any) => {
        byFileType[row.mime_type] = parseInt(row.total_size);
      });

      return {
        totalUsed: parseInt(totalResult.rows[0].total_used),
        totalAvailable: 2000000000, // 2GB simulated limit
        byUser,
        byFileType
      };
    } catch (error) {
      return {
        totalUsed: 0,
        totalAvailable: 2000000000,
        byUser: [],
        byFileType: {}
      };
    }
  }

  private async getComputeUsage(): Promise<ResourceUsage['compute']> {
    try {
      // This would typically query training job data
      // For now, we'll simulate the data
      return {
        activeTrainingJobs: Math.floor(Math.random() * 5),
        queuedJobs: Math.floor(Math.random() * 10),
        totalGpuHours: Math.floor(Math.random() * 1000),
        averageJobDuration: Math.floor(Math.random() * 120) + 30 // 30-150 minutes
      };
    } catch (error) {
      return {
        activeTrainingJobs: 0,
        queuedJobs: 0,
        totalGpuHours: 0,
        averageJobDuration: 0
      };
    }
  }

  private async getApiUsage(): Promise<ResourceUsage['api']> {
    try {
      const todayQuery = `
        SELECT COUNT(*) as requests_today
        FROM audit_logs
        WHERE DATE(timestamp) = CURRENT_DATE
        AND action LIKE '%_request'
      `;

      const monthQuery = `
        SELECT COUNT(*) as requests_month
        FROM audit_logs
        WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
        AND action LIKE '%_request'
      `;

      const [todayResult, monthResult] = await Promise.all([
        this.query(todayQuery),
        this.query(monthQuery)
      ]);

      // Simulate top endpoints data
      const topEndpoints = [
        { endpoint: '/api/search', requests: Math.floor(Math.random() * 1000), averageResponseTime: Math.random() * 500 },
        { endpoint: '/api/files', requests: Math.floor(Math.random() * 800), averageResponseTime: Math.random() * 300 },
        { endpoint: '/api/users', requests: Math.floor(Math.random() * 600), averageResponseTime: Math.random() * 200 }
      ];

      return {
        requestsToday: parseInt(todayResult.rows[0].requests_today) || 0,
        requestsThisMonth: parseInt(monthResult.rows[0].requests_month) || 0,
        topEndpoints
      };
    } catch (error) {
      return {
        requestsToday: 0,
        requestsThisMonth: 0,
        topEndpoints: []
      };
    }
  }

  private async getRecentActivity(limit: number = 10): Promise<UserActivity[]> {
    try {
      const query = `
        SELECT 
          al.id,
          al.user_id,
          al.action,
          al.resource_type,
          al.resource_id,
          al.timestamp,
          al.details,
          u.username
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.timestamp DESC
        LIMIT $1
      `;

      const result = await this.query(query, [limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        timestamp: row.timestamp,
        details: row.details || {}
      }));
    } catch (error) {
      return [];
    }
  }

  private async getSystemAlerts(): Promise<SystemAlert[]> {
    try {
      // In a real implementation, this would check various system conditions
      // For now, we'll create some sample alerts based on system state
      const alerts: SystemAlert[] = [];

      // Check for high storage usage
      const storageUsage = await this.getStorageUsage();
      const storagePercentage = (storageUsage.totalUsed / storageUsage.totalAvailable) * 100;
      
      if (storagePercentage > 80) {
        alerts.push({
          id: 'storage-high',
          type: 'warning',
          title: 'High Storage Usage',
          message: `Storage usage is at ${storagePercentage.toFixed(1)}%`,
          timestamp: new Date(),
          resolved: false
        });
      }

      // Check for failed login attempts
      const failedLoginsQuery = `
        SELECT COUNT(*) as failed_logins
        FROM audit_logs
        WHERE action = 'login_failed'
        AND timestamp >= NOW() - INTERVAL '1 hour'
      `;

      const failedLoginsResult = await this.query(failedLoginsQuery);
      const failedLogins = parseInt(failedLoginsResult.rows[0].failed_logins);

      if (failedLogins > 10) {
        alerts.push({
          id: 'failed-logins',
          type: 'error',
          title: 'High Failed Login Attempts',
          message: `${failedLogins} failed login attempts in the last hour`,
          timestamp: new Date(),
          resolved: false
        });
      }

      return alerts;
    } catch (error) {
      return [];
    }
  }
}