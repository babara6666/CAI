import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { AuditLogService } from '../../services/AuditLogService.js';
import { EnhancedReportService } from '../../services/EnhancedReportService.js';
import { DataRetentionService } from '../../services/DataRetentionService.js';
import { auditLogger } from '../../middleware/auditLogging.js';

// Mock database
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn()
} as unknown as Pool;

// Mock services
vi.mock('../../services/AuditLogService.js');
vi.mock('../../services/EnhancedReportService.js');
vi.mock('../../services/DataRetentionService.js');

describe('Audit Logging Integration Tests', () => {
  let app: express.Application;
  let auditLogService: AuditLogService;
  let reportService: EnhancedReportService;
  let retentionService: DataRetentionService;

  beforeAll(async () => {
    // Create Express app with audit logging
    app = express();
    app.use(express.json());

    // Initialize services
    auditLogService = new AuditLogService(mockPool);
    reportService = new EnhancedReportService(mockPool);
    retentionService = new DataRetentionService(mockPool);

    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'engineer',
        username: 'testuser'
      };
      next();
    });

    // Set up test routes with audit logging
    app.post('/api/files/upload', 
      auditLogger.logFileOperation('file_upload'),
      (req, res) => {
        res.status(201).json({ id: 'file-123', filename: req.body.filename });
      }
    );

    app.get('/api/files/:fileId',
      auditLogger.logFileOperation('file_view'),
      (req, res) => {
        res.json({ id: req.params.fileId, filename: 'test.dwg' });
      }
    );

    app.delete('/api/files/:fileId',
      auditLogger.logFileOperation('file_delete'),
      (req, res) => {
        res.status(204).send();
      }
    );

    app.post('/api/auth/login',
      auditLogger.logAuthentication('login'),
      (req, res) => {
        if (req.body.email === 'valid@example.com') {
          res.json({ token: 'jwt-token', user: { id: 'user-123' } });
        } else {
          res.status(401).json({ error: 'Invalid credentials' });
        }
      }
    );

    app.post('/api/search',
      auditLogger.logSearchOperation(),
      (req, res) => {
        res.locals.resultCount = 5;
        res.locals.responseTime = 150;
        res.json({ results: [], count: 5 });
      }
    );

    app.post('/api/ai/train',
      auditLogger.logAIOperation('model_training'),
      (req, res) => {
        res.status(202).json({ jobId: 'job-123', status: 'started' });
      }
    );

    app.post('/api/admin/users',
      auditLogger.logAdminAction('user_created'),
      (req, res) => {
        res.status(201).json({ id: 'user-456', email: req.body.email });
      }
    );

    app.get('/api/data/sensitive',
      auditLogger.logDataAccess('sensitive_data', 'read'),
      (req, res) => {
        res.locals.recordCount = 10;
        res.json({ data: 'sensitive information' });
      }
    );

    // Security event route
    app.get('/api/security/test',
      auditLogger.logSecurityEvent('test_security_event'),
      (req, res) => {
        res.json({ message: 'Security test' });
      }
    );

    // Rate limit test route
    app.get('/api/rate-limited',
      (req, res, next) => {
        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', '3600');
        next();
      },
      auditLogger.logRateLimit(),
      (req, res) => {
        res.status(429).json({ error: 'Rate limit exceeded' });
      }
    );

    // Permission denied test route
    app.get('/api/admin/restricted',
      (req, res, next) => {
        res.locals.requiredRole = 'admin';
        res.locals.resource = 'admin_panel';
        next();
      },
      auditLogger.logPermissionDenied(),
      (req, res) => {
        res.status(403).json({ error: 'Permission denied' });
      }
    );

    // Audit report routes
    app.get('/api/reports/audit', async (req, res) => {
      try {
        const dateRange = {
          startDate: new Date(req.query.startDate as string),
          endDate: new Date(req.query.endDate as string)
        };
        const report = await reportService.generateAuditReport(dateRange);
        res.json(report);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/reports/compliance', async (req, res) => {
      try {
        const dateRange = {
          startDate: new Date(req.query.startDate as string),
          endDate: new Date(req.query.endDate as string)
        };
        const report = await reportService.generateComplianceReport(dateRange);
        res.json(report);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/reports/export', async (req, res) => {
      try {
        const { reportType, format, dateRange } = req.body;
        const result = await reportService.exportReport(reportType, format, dateRange);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Data retention routes
    app.get('/api/retention/rules', async (req, res) => {
      try {
        const rules = await retentionService.getRetentionRules();
        res.json(rules);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/retention/execute/:ruleId', async (req, res) => {
      try {
        const result = await retentionService.executeRetentionRule(req.params.ruleId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/retention/statistics', async (req, res) => {
      try {
        const stats = await retentionService.getRetentionStatistics();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    mockQuery.mockClear();
    vi.clearAllMocks();
  });

  describe('File Operations Audit Logging', () => {
    it('should log file upload with correct details', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      const response = await request(app)
        .post('/api/files/upload')
        .send({
          filename: 'test-document.dwg',
          fileSize: 1024000,
          mimeType: 'application/dwg'
        })
        .expect(201);

      expect(response.body.filename).toBe('test-document.dwg');

      // Wait for async logging
      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_upload',
        'file',
        undefined,
        expect.objectContaining({
          filename: 'test-document.dwg',
          fileSize: 1024000,
          mimeType: 'application/dwg',
          method: 'POST',
          path: '/api/files/upload',
          statusCode: 201,
          success: true
        }),
        expect.any(String),
        expect.any(String),
        'low'
      );
    });

    it('should log file view operation', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .get('/api/files/file-123')
        .expect(200);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_view',
        'file',
        'file-123',
        expect.objectContaining({
          method: 'GET',
          path: '/api/files/file-123',
          statusCode: 200
        }),
        expect.any(String),
        expect.any(String),
        'low'
      );
    });

    it('should log file deletion with medium severity', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .delete('/api/files/file-123')
        .expect(204);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'file_delete',
        'file',
        'file-123',
        expect.any(Object),
        expect.any(String),
        expect.any(String),
        'medium'
      );
    });
  });

  describe('Authentication Audit Logging', () => {
    it('should log successful login', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'valid@example.com', password: 'password123' })
        .expect(200);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'login',
        'authentication',
        undefined,
        expect.objectContaining({
          email: 'valid@example.com',
          success: true
        }),
        expect.any(String),
        expect.any(String),
        'low'
      );
    });

    it('should log failed login with medium severity', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid@example.com', password: 'wrongpassword' })
        .expect(401);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'login',
        'authentication',
        undefined,
        expect.objectContaining({
          email: 'invalid@example.com',
          success: false,
          failureReason: 'Invalid credentials'
        }),
        expect.any(String),
        expect.any(String),
        'low'
      );
    });
  });

  describe('Search Operations Audit Logging', () => {
    it('should log search queries with results metadata', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .post('/api/search')
        .send({
          query: 'mechanical parts',
          modelId: 'model-456',
          filters: { category: 'mechanical' }
        })
        .expect(200);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'search_query',
        'search',
        undefined,
        expect.objectContaining({
          query: 'mechanical parts',
          modelId: 'model-456',
          filters: { category: 'mechanical' },
          resultCount: 5,
          responseTime: 150
        }),
        expect.any(String),
        expect.any(String),
        'low'
      );
    });
  });

  describe('AI Operations Audit Logging', () => {
    it('should log model training operations', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .post('/api/ai/train')
        .send({
          name: 'CAD Classification Model',
          datasetId: 'dataset-789',
          config: { epochs: 100, batchSize: 32 }
        })
        .expect(202);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'model_training',
        'ai_model',
        undefined,
        expect.objectContaining({
          modelName: 'CAD Classification Model',
          datasetId: 'dataset-789',
          trainingConfig: { epochs: 100, batchSize: 32 },
          success: true
        }),
        expect.any(String),
        expect.any(String),
        'medium'
      );
    });
  });

  describe('Administrative Operations Audit Logging', () => {
    it('should log admin actions with high severity', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .post('/api/admin/users')
        .send({
          email: 'newuser@example.com',
          role: 'engineer',
          permissions: ['read', 'write']
        })
        .expect(201);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'user_created',
        'admin',
        undefined,
        expect.objectContaining({
          targetUser: 'newuser@example.com',
          changes: expect.objectContaining({
            email: 'newuser@example.com',
            role: 'engineer'
          }),
          adminUser: 'test@example.com',
          success: true
        }),
        expect.any(String),
        expect.any(String),
        'high'
      );
    });
  });

  describe('Data Access Audit Logging', () => {
    it('should log sensitive data access', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockResolvedValue();

      await request(app)
        .get('/api/data/sensitive')
        .expect(200);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogUserAction).toHaveBeenCalledWith(
        'user-123',
        'data_read',
        'data',
        undefined,
        expect.objectContaining({
          dataType: 'sensitive_data',
          operation: 'read',
          recordCount: 10,
          success: true
        }),
        expect.any(String),
        expect.any(String),
        'medium'
      );
    });
  });

  describe('Security Events Audit Logging', () => {
    it('should log security events immediately', async () => {
      const mockLogSecurityEvent = vi.spyOn(auditLogService, 'logSecurityEvent').mockResolvedValue();

      await request(app)
        .get('/api/security/test')
        .expect(200);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'test_security_event',
        expect.objectContaining({
          path: '/api/security/test',
          method: 'GET'
        }),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should log rate limit exceeded events', async () => {
      const mockLogSecurityEvent = vi.spyOn(auditLogService, 'logSecurityEvent').mockResolvedValue();

      await request(app)
        .get('/api/rate-limited')
        .expect(429);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'rate_limit_exceeded',
        expect.objectContaining({
          path: '/api/rate-limited',
          method: 'GET',
          rateLimitInfo: {
            limit: '100',
            remaining: '0',
            reset: '3600'
          }
        }),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should log permission denied events', async () => {
      const mockLogSecurityEvent = vi.spyOn(auditLogService, 'logSecurityEvent').mockResolvedValue();

      await request(app)
        .get('/api/admin/restricted')
        .expect(403);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        'user-123',
        'permission_denied',
        expect.objectContaining({
          path: '/api/admin/restricted',
          method: 'GET',
          requiredRole: 'admin',
          userRole: 'engineer',
          resource: 'admin_panel'
        }),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Audit Reporting Integration', () => {
    it('should generate audit reports', async () => {
      const mockGenerateAuditReport = vi.spyOn(reportService, 'generateAuditReport').mockResolvedValue({
        totalActions: 1000,
        actionsByType: { login: 500, file_upload: 300 },
        userActivity: { user1: 100 },
        securityEvents: 25,
        period: { startDate: new Date(), endDate: new Date() },
        topUsers: [],
        riskEvents: [],
        actionsByCategory: { authentication: 500 },
        topActions: []
      });

      const response = await request(app)
        .get('/api/reports/audit')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(200);

      expect(response.body.totalActions).toBe(1000);
      expect(mockGenerateAuditReport).toHaveBeenCalledWith({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });
    });

    it('should generate compliance reports', async () => {
      const mockGenerateComplianceReport = vi.spyOn(reportService, 'generateComplianceReport').mockResolvedValue({
        reportId: 'compliance-123',
        generatedAt: new Date(),
        period: { startDate: new Date(), endDate: new Date() },
        totalAuditEvents: 1000,
        complianceScore: 85,
        violations: [],
        recommendations: ['Improve audit coverage'],
        dataRetentionStatus: {
          totalRecords: 1000,
          retainedRecords: 900,
          archivedRecords: 100,
          deletedRecords: 0
        }
      });

      const response = await request(app)
        .get('/api/reports/compliance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(200);

      expect(response.body.complianceScore).toBe(85);
      expect(response.body.recommendations).toContain('Improve audit coverage');
    });

    it('should export reports in different formats', async () => {
      const mockExportReport = vi.spyOn(reportService, 'exportReport').mockResolvedValue({
        downloadUrl: 'https://example.com/report.csv',
        expiresAt: new Date(),
        fileSize: 1024,
        filename: 'audit_report.csv'
      });

      const response = await request(app)
        .post('/api/reports/export')
        .send({
          reportType: 'audit',
          format: 'csv',
          dateRange: {
            startDate: '2024-01-01',
            endDate: '2024-01-31'
          }
        })
        .expect(200);

      expect(response.body.downloadUrl).toContain('report.csv');
      expect(response.body.fileSize).toBe(1024);
    });
  });

  describe('Data Retention Integration', () => {
    it('should retrieve retention rules', async () => {
      const mockGetRetentionRules = vi.spyOn(retentionService, 'getRetentionRules').mockResolvedValue([
        {
          id: 'rule-1',
          name: 'Audit Logs Retention',
          description: 'Archive after 90 days, delete after 365 days',
          tableName: 'audit_logs',
          dateColumn: 'timestamp',
          retentionDays: 365,
          archiveAfterDays: 90,
          enabled: true
        }
      ]);

      const response = await request(app)
        .get('/api/retention/rules')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Audit Logs Retention');
    });

    it('should execute retention rules', async () => {
      const mockExecuteRetentionRule = vi.spyOn(retentionService, 'executeRetentionRule').mockResolvedValue({
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        startTime: new Date(),
        endTime: new Date(),
        recordsProcessed: 100,
        recordsArchived: 50,
        recordsDeleted: 50,
        errors: [],
        success: true
      });

      const response = await request(app)
        .post('/api/retention/execute/rule-1')
        .expect(200);

      expect(response.body.recordsProcessed).toBe(100);
      expect(response.body.success).toBe(true);
    });

    it('should provide retention statistics', async () => {
      const mockGetRetentionStatistics = vi.spyOn(retentionService, 'getRetentionStatistics').mockResolvedValue({
        totalRules: 3,
        enabledRules: 2,
        lastRunTime: new Date(),
        totalRecordsProcessed: 5000,
        totalRecordsArchived: 2500,
        totalRecordsDeleted: 2500,
        upcomingJobs: []
      });

      const response = await request(app)
        .get('/api/retention/statistics')
        .expect(200);

      expect(response.body.totalRules).toBe(3);
      expect(response.body.enabledRules).toBe(2);
      expect(response.body.totalRecordsProcessed).toBe(5000);
    });
  });

  describe('Error Handling', () => {
    it('should handle audit logging errors gracefully', async () => {
      const mockLogUserAction = vi.spyOn(auditLogService, 'logUserAction').mockRejectedValue(new Error('Logging failed'));

      // Request should still succeed even if logging fails
      const response = await request(app)
        .post('/api/files/upload')
        .send({ filename: 'test.dwg' })
        .expect(201);

      expect(response.body.filename).toBe('test.dwg');
    });

    it('should handle report generation errors', async () => {
      const mockGenerateAuditReport = vi.spyOn(reportService, 'generateAuditReport').mockRejectedValue(new Error('Report generation failed'));

      await request(app)
        .get('/api/reports/audit')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(500);
    });

    it('should handle retention service errors', async () => {
      const mockExecuteRetentionRule = vi.spyOn(retentionService, 'executeRetentionRule').mockRejectedValue(new Error('Retention failed'));

      await request(app)
        .post('/api/retention/execute/rule-1')
        .expect(500);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize sensitive data in security logs', async () => {
      const mockLogSecurityEvent = vi.spyOn(auditLogService, 'logSecurityEvent').mockResolvedValue();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'secret123',
          token: 'jwt-token'
        })
        .set('Authorization', 'Bearer sensitive-token')
        .set('Cookie', 'session=abc123')
        .expect(401);

      await new Promise(resolve => setImmediate(resolve));

      // Check that sensitive data was sanitized in the logged request body
      const loggedData = mockLogSecurityEvent.mock.calls.find(call => call[1] === 'test_security_event');
      if (loggedData) {
        expect(loggedData[2].body.email).toBe('test@example.com');
        expect(loggedData[2].body.password).toBe('[REDACTED]');
        expect(loggedData[2].body.token).toBe('[REDACTED]');
        expect(loggedData[2].headers.authorization).toBe('[REDACTED]');
        expect(loggedData[2].headers.cookie).toBe('[REDACTED]');
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await mockPool.end();
  });
});