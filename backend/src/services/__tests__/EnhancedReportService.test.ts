import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { EnhancedReportService, ComplianceReport } from '../EnhancedReportService.js';
import { AuditLogService } from '../AuditLogService.js';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('../AuditLogService.js');
vi.mock('fs/promises');

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery
} as unknown as Pool;

const mockAuditLogService = {
  getAuditStatistics: vi.fn(),
  applyDataRetentionPolicy: vi.fn(),
  logSystemAction: vi.fn()
};

describe('EnhancedReportService', () => {
  let reportService: EnhancedReportService;

  beforeEach(() => {
    reportService = new EnhancedReportService(mockPool);
    // Replace the audit log service with our mock
    (reportService as any).auditLogService = mockAuditLogService;
    
    mockQuery.mockClear();
    Object.values(mockAuditLogService).forEach(mock => mock.mockClear());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateUsageReport', () => {
    it('should generate comprehensive usage report with audit integration', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      // Mock database queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // total users
        .mockResolvedValueOnce({ rows: [{ count: '75' }] }) // active users
        .mockResolvedValueOnce({ rows: [{ count: '500' }] }) // total files
        .mockResolvedValueOnce({ rows: [{ total: '1000000' }] }) // total storage
        .mockResolvedValueOnce({ rows: [{ count: '200' }] }) // search queries
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // model trainings
        .mockResolvedValueOnce({ rows: [{ count: '1500' }] }) // audit events
        .mockResolvedValueOnce({ rows: [{ date: '2024-01-15', count: '5' }] }) // user growth
        .mockResolvedValueOnce({ rows: [{ date: '2024-01-15', count: '25' }] }) // file uploads
        .mockResolvedValueOnce({ rows: [{ date: '2024-01-15', count: '15' }] }) // search activity
        .mockResolvedValueOnce({ rows: [{ date: '2024-01-15', count: '50' }] }); // audit activity

      const result = await reportService.generateUsageReport(dateRange);

      expect(result.totalUsers).toBe(100);
      expect(result.activeUsers).toBe(75);
      expect(result.totalFiles).toBe(500);
      expect(result.totalStorage).toBe(1000000);
      expect(result.searchQueries).toBe(200);
      expect(result.modelTrainings).toBe(10);
      expect(result.auditEvents).toBe(1500);
      expect(result.trends.userGrowth).toHaveLength(1);
      expect(result.trends.auditActivity).toHaveLength(1);
    });

    it('should handle different granularity options', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      // Mock all required queries
      mockQuery
        .mockResolvedValue({ rows: [{ count: '0' }] })
        .mockResolvedValue({ rows: [{ total: '0' }] })
        .mockResolvedValue({ rows: [] });

      await reportService.generateUsageReport(dateRange, 'hour');

      // Should use hourly date format
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('YYYY-MM-DD HH24:00:00'),
        expect.any(Array)
      );
    });
  });

  describe('generateAuditReport', () => {
    it('should generate enhanced audit report with comprehensive analytics', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      const mockAuditStats = {
        totalActions: 1000,
        actionsByType: { login: 500, file_upload: 300 },
        actionsByCategory: { authentication: 500, data: 300 },
        userActivity: { user1: 100, user2: 50 },
        securityEvents: 25,
        recentActivity: 50,
        topActions: [{ action: 'login', count: 500 }],
        riskEvents: [
          {
            id: 'risk-1',
            timestamp: new Date(),
            userId: 'user-123',
            action: 'login_failed',
            riskLevel: 'medium' as const,
            description: 'Failed login'
          }
        ]
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce(mockAuditStats);

      // Mock top users query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-123',
            username: 'testuser',
            email: 'test@example.com',
            role: 'engineer',
            action_count: '100',
            critical_actions: '5',
            security_actions: '10',
            last_activity: new Date()
          }
        ]
      });

      const result = await reportService.generateAuditReport(dateRange);

      expect(result.totalActions).toBe(1000);
      expect(result.actionsByType.login).toBe(500);
      expect(result.securityEvents).toBe(25);
      expect(result.topUsers).toHaveLength(1);
      expect(result.topUsers[0].username).toBe('testuser');
      expect(result.topUsers[0].criticalActions).toBe(5);
      expect(result.riskEvents).toHaveLength(1);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate comprehensive compliance report', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      const mockAuditStats = {
        totalActions: 1000,
        actionsByType: {},
        actionsByCategory: {},
        userActivity: {},
        securityEvents: 10,
        recentActivity: 50,
        topActions: [],
        riskEvents: []
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce(mockAuditStats);

      // Mock compliance metrics calculation queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_actions: '1000' }] }) // total actions
        .mockResolvedValueOnce({ rows: [{ expected_actions: '1100' }] }) // expected actions
        .mockResolvedValueOnce({ rows: [{ old_data_count: '50' }] }) // old data
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] }) // total records
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // archived records
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // failed logins
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // unauthorized access
        .mockResolvedValueOnce({ rows: [{ gap_count: '3' }] }); // audit gaps

      const result = await reportService.generateComplianceReport(dateRange);

      expect(result.reportId).toMatch(/compliance_\d+/);
      expect(result.totalAuditEvents).toBe(1000);
      expect(result.complianceScore).toBeGreaterThan(0);
      expect(result.violations).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.dataRetentionStatus).toBeDefined();
    });

    it('should identify compliance violations correctly', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce({
        totalActions: 1000,
        actionsByType: {},
        actionsByCategory: {},
        userActivity: {},
        securityEvents: 10,
        recentActivity: 50,
        topActions: [],
        riskEvents: []
      });

      // Mock queries for compliance violations
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_actions: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ expected_actions: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ old_data_count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '150' }] }) // excessive failed logins
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // unauthorized access
        .mockResolvedValueOnce({ rows: [{ gap_count: '2' }] }); // audit gaps

      const result = await reportService.generateComplianceReport(dateRange);

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          type: 'excessive_failed_logins',
          count: 150,
          severity: 'high'
        })
      );

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          type: 'unauthorized_access_attempts',
          count: 5,
          severity: 'high'
        })
      );
    });
  });

  describe('exportReport', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    });

    it('should export usage report in CSV format', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      // Mock usage report data
      mockQuery.mockResolvedValue({ rows: [{ count: '100' }] });

      const result = await reportService.exportReport(
        'usage',
        'csv',
        dateRange
      );

      expect(result.filename).toMatch(/usage_report_\d{4}-\d{2}-\d{2}\.csv/);
      expect(result.mimeType).toBe('text/csv');
      expect(result.fileSize).toBe(1024);
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'report_exported',
        'report',
        expect.any(String),
        expect.objectContaining({
          reportType: 'usage',
          format: 'csv'
        }),
        'low'
      );
    });

    it('should export audit report in JSON format', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce({
        totalActions: 1000,
        actionsByType: {},
        actionsByCategory: {},
        userActivity: {},
        securityEvents: 10,
        recentActivity: 50,
        topActions: [],
        riskEvents: []
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await reportService.exportReport(
        'audit',
        'json',
        dateRange
      );

      expect(result.filename).toMatch(/audit_report_\d{4}-\d{2}-\d{2}\.json/);
      expect(result.mimeType).toBe('application/json');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle unsupported report types', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      await expect(
        reportService.exportReport('unsupported', 'csv', dateRange)
      ).rejects.toThrow('Unsupported report type: unsupported');
    });

    it('should handle unsupported export formats', async () => {
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      mockQuery.mockResolvedValue({ rows: [{ count: '100' }] });

      await expect(
        reportService.exportReport('usage', 'xml' as any, dateRange)
      ).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('applyDataRetentionPolicy', () => {
    it('should apply data retention policy and return summary', async () => {
      const policy = {
        retentionDays: 365,
        archiveAfterDays: 90,
        autoDelete: true
      };

      mockAuditLogService.applyDataRetentionPolicy.mockResolvedValueOnce({
        deletedCount: 100,
        archivedCount: 50,
        errors: []
      });

      const result = await reportService.applyDataRetentionPolicy(policy);

      expect(result.deletedCount).toBe(100);
      expect(result.archivedCount).toBe(50);
      expect(result.summary).toContain('100 records deleted');
      expect(result.summary).toContain('50 records archived');
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return comprehensive dashboard metrics with audit integration', async () => {
      const mockAuditStats = {
        totalActions: 1000,
        actionsByType: {},
        actionsByCategory: {},
        userActivity: {},
        securityEvents: 25,
        recentActivity: 50,
        topActions: [],
        riskEvents: []
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce(mockAuditStats);

      // Mock dashboard queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // active users
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // file uploads
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // search queries
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // model trainings
        .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // audit events
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // recent security events

      const result = await reportService.getDashboardMetrics();

      expect(result.activeUsers).toBe(50);
      expect(result.recentActivity.fileUploads).toBe(10);
      expect(result.auditStats.totalActions).toBe(1000);
      expect(result.auditStats.securityEvents).toBe(25);
      expect(result.auditStats.recentSecurityEvents).toBe(3);
    });

    it('should include system health and alerts', async () => {
      mockAuditLogService.getAuditStatistics.mockResolvedValueOnce({
        totalActions: 1000,
        actionsByType: {},
        actionsByCategory: {},
        userActivity: {},
        securityEvents: 25,
        recentActivity: 50,
        topActions: [],
        riskEvents: []
      });

      mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      const result = await reportService.getDashboardMetrics();

      expect(result.systemHealth).toBeDefined();
      expect(result.systemHealth.status).toBeDefined();
      expect(result.alerts).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        reportService.generateUsageReport({
          startDate: new Date(),
          endDate: new Date()
        })
      ).rejects.toThrow();
    });

    it('should handle audit service errors', async () => {
      mockAuditLogService.getAuditStatistics.mockRejectedValueOnce(
        new Error('Audit service unavailable')
      );

      await expect(
        reportService.generateAuditReport({
          startDate: new Date(),
          endDate: new Date()
        })
      ).rejects.toThrow();
    });
  });

  describe('CSV generation', () => {
    it('should generate proper CSV format for audit reports', async () => {
      const mockData = {
        actionsByType: {
          login: 100,
          file_upload: 50,
          search_query: 25
        }
      };

      const csvContent = (reportService as any).generateAuditCSV(mockData, {
        format: 'csv',
        includeDetails: true,
        includeCharts: false
      });

      expect(csvContent).toContain('Action,Count,Category');
      expect(csvContent).toContain('"login","100","audit"');
      expect(csvContent).toContain('"file_upload","50","audit"');
    });

    it('should generate proper CSV format for usage reports', async () => {
      const mockData = {
        totalUsers: 100,
        activeUsers: 75,
        totalFiles: 500,
        searchQueries: 200
      };

      const csvContent = (reportService as any).generateUsageCSV(mockData, {
        format: 'csv',
        includeDetails: true,
        includeCharts: false
      });

      expect(csvContent).toContain('Metric,Value');
      expect(csvContent).toContain('"Total Users","100"');
      expect(csvContent).toContain('"Active Users","75"');
    });
  });
});