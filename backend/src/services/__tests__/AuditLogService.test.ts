import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { AuditLogService, DataRetentionPolicy } from '../AuditLogService.js';

// Mock the database connection
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery
} as unknown as Pool;

describe('AuditLogService', () => {
  let auditLogService: AuditLogService;

  beforeEach(() => {
    auditLogService = new AuditLogService(mockPool);
    mockQuery.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('logUserAction', () => {
    it('should log user action with basic information', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id' }] });

      await auditLogService.logUserAction(
        'user-123',
        'file_upload',
        'file',
        'file-456',
        { filename: 'test.dwg' },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'user-123',
          'file_upload',
          'file',
          'file-456',
          expect.stringContaining('filename'),
          '192.168.1.1',
          'Mozilla/5.0',
          expect.any(Date)
        ])
      );
    });

    it('should categorize actions correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id' }] });

      await auditLogService.logUserAction(
        'user-123',
        'login',
        'authentication',
        undefined,
        {},
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'user-123',
          'login',
          'authentication',
          null,
          expect.stringContaining('authentication'),
          '192.168.1.1',
          'Mozilla/5.0',
          expect.any(Date)
        ])
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      await expect(
        auditLogService.logUserAction(
          'user-123',
          'test_action',
          'test_resource'
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('logSystemAction', () => {
    it('should log system action with enhanced details', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id' }] });

      await auditLogService.logSystemAction(
        'backup_created',
        'system',
        'backup-123',
        { size: '1GB', duration: '5min' },
        'medium'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          null, // no user ID for system actions
          'backup_created',
          'system',
          'backup-123',
          expect.stringContaining('medium'),
          null, // no IP for system actions
          null, // no user agent for system actions
          expect.any(Date)
        ])
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event with critical severity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id' }] });

      await auditLogService.logSecurityEvent(
        'user-123',
        'suspicious_activity',
        { description: 'Multiple failed login attempts' },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'user-123',
          'suspicious_activity',
          'security',
          expect.stringContaining('critical'),
          '192.168.1.1',
          'Mozilla/5.0',
          expect.any(Date)
        ])
      );
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
          action: 'file_upload',
          resource_type: 'file',
          resource_id: 'file-456',
          details: { filename: 'test.dwg' },
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          timestamp: new Date(),
          severity: 'low',
          category: 'data'
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: mockLogs }); // data query

      const result = await auditLogService.getAuditLogs(
        { userId: 'user-123' },
        { page: 1, limit: 10 }
      );

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe('log-1');
      expect(result.logs[0].action).toBe('file_upload');
      expect(result.pagination.total).toBe(1);
    });

    it('should filter logs by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await auditLogService.getAuditLogs({
        dateRange: { startDate, endDate }
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('al.timestamp >= $1'),
        expect.arrayContaining([startDate, endDate])
      );
    });
  });

  describe('getAuditStatistics', () => {
    it('should return comprehensive audit statistics', async () => {
      const mockStats = {
        total: '100',
        actionsByType: [
          { action: 'login', count: '50' },
          { action: 'file_upload', count: '30' }
        ],
        actionsByCategory: [
          { category: 'authentication', count: '50' },
          { category: 'data', count: '30' }
        ],
        userActivity: [
          { username: 'user1', count: '25' }
        ],
        securityEvents: '5',
        recentActivity: '10',
        topActions: [
          { action: 'login', count: '50', category: 'authentication', avg_severity: '1' }
        ],
        riskEvents: [
          {
            id: 'risk-1',
            timestamp: new Date(),
            user_id: 'user-123',
            action: 'login_failed',
            risk_level: 'medium',
            description: 'Failed login attempt'
          }
        ]
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: mockStats.total }] })
        .mockResolvedValueOnce({ rows: mockStats.actionsByType })
        .mockResolvedValueOnce({ rows: mockStats.actionsByCategory })
        .mockResolvedValueOnce({ rows: mockStats.userActivity })
        .mockResolvedValueOnce({ rows: [{ count: mockStats.securityEvents }] })
        .mockResolvedValueOnce({ rows: [{ count: mockStats.recentActivity }] })
        .mockResolvedValueOnce({ rows: mockStats.topActions })
        .mockResolvedValueOnce({ rows: mockStats.riskEvents });

      const result = await auditLogService.getAuditStatistics();

      expect(result.totalActions).toBe(100);
      expect(result.actionsByType.login).toBe(50);
      expect(result.actionsByCategory.authentication).toBe(50);
      expect(result.securityEvents).toBe(5);
      expect(result.riskEvents).toHaveLength(1);
    });
  });

  describe('applyDataRetentionPolicy', () => {
    it('should apply data retention policy and return results', async () => {
      const policy: DataRetentionPolicy = {
        retentionDays: 365,
        archiveAfterDays: 90,
        autoDelete: true
      };

      // Mock archive and delete operations
      mockQuery
        .mockResolvedValueOnce({ rowCount: 50 }) // archive
        .mockResolvedValueOnce({ rowCount: 10 }) // delete
        .mockResolvedValueOnce({ rows: [{ id: 'log-id' }] }); // log action

      const result = await auditLogService.applyDataRetentionPolicy(policy);

      expect(result.archivedCount).toBe(50);
      expect(result.deletedCount).toBe(10);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle errors during retention policy application', async () => {
      const policy: DataRetentionPolicy = {
        retentionDays: 365,
        autoDelete: true
      };

      mockQuery
        .mockRejectedValueOnce(new Error('Archive failed'))
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: 'log-id' }] });

      const result = await auditLogService.applyDataRetentionPolicy(policy);

      expect(result.errors).toContain('Deletion failed: Archive failed');
    });
  });

  describe('exportAuditLogs', () => {
    it('should export audit logs in CSV format', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          timestamp: new Date(),
          userId: 'user-123',
          username: 'testuser',
          action: 'file_upload',
          resourceType: 'file',
          severity: 'low',
          category: 'data',
          details: { filename: 'test.dwg' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLogs[0]] });

      const result = await auditLogService.exportAuditLogs(
        {},
        'csv',
        true
      );

      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toMatch(/audit_logs_\d{4}-\d{2}-\d{2}\.csv/);
      expect(result.data).toContain('ID,Timestamp,User ID');
      expect(result.data).toContain('log-1');
    });

    it('should export audit logs in JSON format', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          timestamp: new Date(),
          userId: 'user-123',
          username: 'testuser',
          action: 'file_upload',
          resourceType: 'file',
          severity: 'low',
          category: 'data',
          details: { filename: 'test.dwg' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLogs[0]] });

      const result = await auditLogService.exportAuditLogs(
        {},
        'json',
        true
      );

      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toMatch(/audit_logs_\d{4}-\d{2}-\d{2}\.json/);
      
      const exportData = JSON.parse(result.data as string);
      expect(exportData.totalRecords).toBe(1);
      expect(exportData.logs).toHaveLength(1);
    });
  });

  describe('getUserActivityTimeline', () => {
    it('should return user activity timeline', async () => {
      const mockTimeline = [
        { date: '2024-01-15', action: 'login', count: '5' },
        { date: '2024-01-15', action: 'file_upload', count: '3' },
        { date: '2024-01-14', action: 'login', count: '2' }
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockTimeline });

      const result = await auditLogService.getUserActivityTimeline('user-123', 30);

      expect(result).toHaveLength(2); // grouped by date
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].count).toBe(8); // 5 + 3
      expect(result[0].actions.login).toBe(5);
      expect(result[0].actions.file_upload).toBe(3);
    });
  });

  describe('suspicious activity detection', () => {
    it('should detect rapid repeated actions', async () => {
      // Mock recent actions count
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // recent actions
        .mockResolvedValueOnce({ rows: [{ id: 'security-log' }] }); // security log

      await auditLogService.logUserAction(
        'user-123',
        'login_attempt',
        'authentication',
        undefined,
        {},
        '192.168.1.1'
      );

      // Should log security event for suspicious activity
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'user-123',
          'suspicious_activity',
          'security',
          expect.stringContaining('Suspicious activity detected')
        ])
      );
    });

    it('should detect unusual IP address access', async () => {
      // Mock IP history
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // normal action count
        .mockResolvedValueOnce({ 
          rows: [
            { ip_address: '192.168.1.100' },
            { ip_address: '192.168.1.101' }
          ] 
        }) // known IPs
        .mockResolvedValueOnce({ rows: [{ id: 'security-log' }] }); // security log

      await auditLogService.logUserAction(
        'user-123',
        'file_download',
        'file',
        'file-123',
        {},
        '10.0.0.1' // new IP
      );

      // Should log security event for unusual IP
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'user-123',
          'unusual_ip_access',
          'security',
          expect.stringContaining('Access from new IP address')
        ])
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      // Should not throw for user actions
      await expect(
        auditLogService.logUserAction('user-123', 'test', 'test')
      ).resolves.toBeUndefined();

      // Should throw for data retrieval
      await expect(
        auditLogService.getAuditLogs()
      ).rejects.toThrow();
    });

    it('should sanitize sensitive data in logs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id' }] });

      await auditLogService.logUserAction(
        'user-123',
        'password_change',
        'authentication',
        undefined,
        { 
          oldPassword: 'secret123',
          newPassword: 'newsecret456',
          email: 'user@example.com'
        }
      );

      const loggedDetails = mockQuery.mock.calls[0][1][4];
      const parsedDetails = JSON.parse(loggedDetails);
      
      // Should contain email but not passwords
      expect(parsedDetails.email).toBe('user@example.com');
      expect(parsedDetails.oldPassword).toBeUndefined();
      expect(parsedDetails.newPassword).toBeUndefined();
    });
  });
});