import { DateRange, UsageReport, PerformanceReport, AuditReport } from '../types/index.js';
import { BaseModel } from '../models/BaseModel.js';
import { AuditLogService, DataRetentionPolicy } from './AuditLogService.js';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  period: DateRange;
  totalAuditEvents: number;
  complianceScore: number;
  violations: Array<{
    type: string;
    count: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  recommendations: string[];
  dataRetentionStatus: {
    totalRecords: number;
    retainedRecords: number;
    archivedRecords: number;
    deletedRecords: number;
  };
}

export interface ReportExportOptions {
  format: 'csv' | 'pdf' | 'json';
  includeDetails: boolean;
  includeCharts: boolean;
  customFields?: string[];
}

export interface ComplianceMetrics {
  overallScore: number;
  auditCoverage: number;
  dataRetentionCompliance: number;
  securityEventResponse: number;
  userAccessCompliance: number;
}

export class EnhancedReportService extends BaseModel {
  private auditLogService: AuditLogService;

  constructor(private pool: Pool) {
    super();
    this.auditLogService = new AuditLogService(pool);
  }

  /**
   * Generate comprehensive usage report with audit integration
   */
  async generateUsageReport(dateRange: DateRange, granularity: string = 'day'): Promise<UsageReport> {
    const { startDate, endDate } = dateRange;
    
    // Get basic metrics
    const [
      totalUsersResult,
      activeUsersResult,
      totalFilesResult,
      totalStorageResult,
      searchQueriesResult,
      modelTrainingsResult,
      auditEventsResult
    ] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM users'),
      this.query('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [startDate]),
      this.query('SELECT COUNT(*) as count FROM cad_files WHERE created_at BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COALESCE(SUM(file_size), 0) as total FROM cad_files WHERE created_at BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COUNT(*) as count FROM search_queries WHERE timestamp BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COUNT(*) as count FROM ai_models WHERE created_at BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COUNT(*) as count FROM audit_logs WHERE timestamp BETWEEN $1 AND $2', [startDate, endDate])
    ]);
    
    // Get trend data based on granularity
    const dateFormat = this.getDateFormat(granularity);
    const trendQueries = await Promise.all([
      this.getTrendData('users', 'created_at', dateFormat, startDate, endDate),
      this.getTrendData('cad_files', 'created_at', dateFormat, startDate, endDate),
      this.getTrendData('search_queries', 'timestamp', dateFormat, startDate, endDate),
      this.getTrendData('audit_logs', 'timestamp', dateFormat, startDate, endDate)
    ]);
    
    return {
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      activeUsers: parseInt(activeUsersResult.rows[0].count),
      totalFiles: parseInt(totalFilesResult.rows[0].count),
      totalStorage: parseInt(totalStorageResult.rows[0].total),
      searchQueries: parseInt(searchQueriesResult.rows[0].count),
      modelTrainings: parseInt(modelTrainingsResult.rows[0].count),
      auditEvents: parseInt(auditEventsResult.rows[0].count),
      period: dateRange,
      trends: {
        userGrowth: trendQueries[0],
        fileUploads: trendQueries[1],
        searchActivity: trendQueries[2],
        auditActivity: trendQueries[3]
      }
    };
  }

  /**
   * Generate enhanced audit report with comprehensive analytics
   */
  async generateAuditReport(dateRange: DateRange, filters: any = {}): Promise<AuditReport> {
    try {
      // Use the enhanced audit log service for comprehensive reporting
      const statistics = await this.auditLogService.getAuditStatistics(dateRange);
      
      // Get additional audit-specific metrics
      const { startDate, endDate } = dateRange;
      
      // Get top users with enhanced information
      const topUsersResult = await this.query(`
        SELECT 
          u.id as user_id,
          u.username,
          u.email,
          u.role,
          COUNT(al.id) as action_count,
          COUNT(CASE WHEN al.details->>'severity' = 'critical' THEN 1 END) as critical_actions,
          COUNT(CASE WHEN al.details->>'category' = 'security' THEN 1 END) as security_actions,
          MAX(al.timestamp) as last_activity
        FROM audit_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.timestamp BETWEEN $1 AND $2
        GROUP BY u.id, u.username, u.email, u.role
        ORDER BY action_count DESC
        LIMIT 15
      `, [startDate, endDate]);
      
      return {
        totalActions: statistics.totalActions,
        actionsByType: statistics.actionsByType,
        userActivity: statistics.userActivity,
        securityEvents: statistics.securityEvents,
        period: dateRange,
        topUsers: topUsersResult.rows.map(row => ({
          userId: row.user_id,
          username: row.username,
          email: row.email,
          role: row.role,
          actionCount: parseInt(row.action_count),
          criticalActions: parseInt(row.critical_actions),
          securityActions: parseInt(row.security_actions),
          lastActivity: row.last_activity
        })),
        riskEvents: statistics.riskEvents,
        actionsByCategory: statistics.actionsByCategory,
        topActions: statistics.topActions
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(dateRange: DateRange): Promise<ComplianceReport> {
    try {
      const reportId = `compliance_${Date.now()}`;
      
      // Get audit statistics
      const auditStats = await this.auditLogService.getAuditStatistics(dateRange);
      
      // Calculate compliance score based on various factors
      const complianceMetrics = await this.calculateComplianceMetrics(dateRange);
      
      // Get data retention status
      const dataRetentionStatus = await this.getDataRetentionStatus();
      
      // Identify compliance violations
      const violations = await this.identifyComplianceViolations(dateRange);
      
      // Generate recommendations
      const recommendations = this.generateComplianceRecommendations(violations, complianceMetrics);
      
      return {
        reportId,
        generatedAt: new Date(),
        period: dateRange,
        totalAuditEvents: auditStats.totalActions,
        complianceScore: complianceMetrics.overallScore,
        violations,
        recommendations,
        dataRetentionStatus
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Export comprehensive reports with multiple formats
   */
  async exportReport(
    reportType: string,
    format: 'csv' | 'pdf' | 'json',
    dateRange: DateRange,
    filters: any = {},
    options: ReportExportOptions = { format, includeDetails: true, includeCharts: false }
  ): Promise<{ downloadUrl: string; expiresAt: Date; fileSize: number; filename: string }> {
    try {
      // Generate the report data
      let reportData: any;
      
      switch (reportType) {
        case 'usage':
          reportData = await this.generateUsageReport(dateRange, filters.granularity);
          break;
        case 'audit':
          reportData = await this.generateAuditReport(dateRange, filters);
          break;
        case 'compliance':
          reportData = await this.generateComplianceReport(dateRange);
          break;
        default:
          throw new Error(`Unsupported report type: ${reportType}`);
      }
      
      // Generate export file
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${reportType}_report_${timestamp}.${format}`;
      const exportPath = path.join(process.cwd(), 'tmp', 'exports', filename);
      
      // Ensure export directory exists
      await fs.mkdir(path.dirname(exportPath), { recursive: true });
      
      let fileSize = 0;
      
      switch (format) {
        case 'csv':
          await this.generateCSVExport(reportData, exportPath, reportType, options);
          break;
        case 'pdf':
          await this.generatePDFExport(reportData, exportPath, reportType, options);
          break;
        case 'json':
          await this.generateJSONExport(reportData, exportPath, reportType, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Get file size
      const stats = await fs.stat(exportPath);
      fileSize = stats.size;
      
      // In a real implementation, this would upload to S3 or similar storage
      const downloadUrl = `${process.env.API_BASE_URL}/api/reports/download/${filename}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Log the export action
      await this.auditLogService.logSystemAction(
        'report_exported',
        'report',
        reportId,
        {
          reportType,
          format,
          dateRange,
          fileSize,
          filename
        },
        'low'
      );
      
      return {
        downloadUrl,
        expiresAt,
        fileSize,
        filename
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Apply data retention policies with comprehensive logging
   */
  async applyDataRetentionPolicy(policy: DataRetentionPolicy): Promise<{
    deletedCount: number;
    archivedCount: number;
    errors: string[];
    summary: string;
  }> {
    try {
      const result = await this.auditLogService.applyDataRetentionPolicy(policy);
      
      const summary = `Data retention policy applied: ${result.deletedCount} records deleted, ${result.archivedCount} records archived`;
      
      return {
        ...result,
        summary
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Get real-time dashboard metrics with audit integration
   */
  async getDashboardMetrics(): Promise<any> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const [
      systemHealthResult,
      activeUsersResult,
      recentActivityResult,
      alertsResult,
      auditStatsResult,
      securityEventsResult
    ] = await Promise.all([
      this.getSystemHealth(),
      this.query('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [last24Hours]),
      this.getRecentActivity(last24Hours),
      this.getSystemAlerts(),
      this.auditLogService.getAuditStatistics({ startDate: last7Days, endDate: now }),
      this.query(`
        SELECT COUNT(*) as count 
        FROM audit_logs 
        WHERE timestamp >= $1 
        AND details->>'category' = 'security'
      `, [last24Hours])
    ]);
    
    return {
      systemHealth: systemHealthResult,
      activeUsers: parseInt(activeUsersResult.rows[0].count),
      recentActivity: recentActivityResult,
      alerts: alertsResult,
      auditStats: {
        totalActions: auditStatsResult.totalActions,
        securityEvents: auditStatsResult.securityEvents,
        recentSecurityEvents: parseInt(securityEventsResult.rows[0].count)
      }
    };
  }

  /**
   * Calculate compliance metrics based on audit data
   */
  private async calculateComplianceMetrics(dateRange: DateRange): Promise<ComplianceMetrics> {
    try {
      const { startDate, endDate } = dateRange;
      
      // Calculate audit coverage (percentage of actions that are logged)
      const totalActionsResult = await this.query(`
        SELECT COUNT(*) as total_actions FROM audit_logs 
        WHERE timestamp BETWEEN $1 AND $2
      `, [startDate, endDate]);
      
      const expectedActionsResult = await this.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE last_login_at BETWEEN $1 AND $2) +
          (SELECT COUNT(*) FROM cad_files WHERE created_at BETWEEN $1 AND $2) +
          (SELECT COUNT(*) FROM search_queries WHERE timestamp BETWEEN $1 AND $2) as expected_actions
      `, [startDate, endDate]);
      
      const totalActions = parseInt(totalActionsResult.rows[0].total_actions);
      const expectedActions = parseInt(expectedActionsResult.rows[0].expected_actions);
      const auditCoverage = expectedActions > 0 ? (totalActions / expectedActions) * 100 : 100;
      
      // Calculate data retention compliance
      const retentionPolicyDays = 365; // Example: 1 year retention
      const oldDataResult = await this.query(`
        SELECT COUNT(*) as old_data_count 
        FROM audit_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionPolicyDays} days'
      `);
      
      const oldDataCount = parseInt(oldDataResult.rows[0].old_data_count);
      const dataRetentionCompliance = oldDataCount === 0 ? 100 : Math.max(0, 100 - (oldDataCount / totalActions) * 100);
      
      // Calculate security event response time (placeholder)
      const securityEventResponse = 85; // This would be calculated based on actual response times
      
      // Calculate user access compliance
      const userAccessCompliance = 90; // This would be calculated based on access patterns
      
      // Calculate overall score
      const overallScore = Math.round(
        (auditCoverage * 0.3 + 
         dataRetentionCompliance * 0.25 + 
         securityEventResponse * 0.25 + 
         userAccessCompliance * 0.2)
      );
      
      return {
        overallScore: Math.min(100, overallScore),
        auditCoverage: Math.min(100, auditCoverage),
        dataRetentionCompliance,
        securityEventResponse,
        userAccessCompliance
      };
    } catch (error) {
      console.error('Failed to calculate compliance metrics:', error);
      return {
        overallScore: 0,
        auditCoverage: 0,
        dataRetentionCompliance: 0,
        securityEventResponse: 0,
        userAccessCompliance: 0
      };
    }
  }

  /**
   * Get data retention status
   */
  private async getDataRetentionStatus(): Promise<{
    totalRecords: number;
    retainedRecords: number;
    archivedRecords: number;
    deletedRecords: number;
  }> {
    try {
      const [totalResult, archivedResult] = await Promise.all([
        this.query('SELECT COUNT(*) as count FROM audit_logs'),
        this.query(`SELECT COUNT(*) as count FROM audit_logs WHERE details->>'archived' = 'true'`)
      ]);
      
      const totalRecords = parseInt(totalResult.rows[0].count);
      const archivedRecords = parseInt(archivedResult.rows[0].count);
      const retainedRecords = totalRecords - archivedRecords;
      
      return {
        totalRecords,
        retainedRecords,
        archivedRecords,
        deletedRecords: 0 // This would track deleted records from a separate log
      };
    } catch (error) {
      console.error('Failed to get data retention status:', error);
      return {
        totalRecords: 0,
        retainedRecords: 0,
        archivedRecords: 0,
        deletedRecords: 0
      };
    }
  }

  /**
   * Identify compliance violations
   */
  private async identifyComplianceViolations(dateRange: DateRange): Promise<Array<{
    type: string;
    count: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>> {
    try {
      const { startDate, endDate } = dateRange;
      const violations = [];
      
      // Check for excessive failed login attempts
      const failedLoginsResult = await this.query(`
        SELECT COUNT(*) as count 
        FROM audit_logs 
        WHERE action = 'login_failed' 
        AND timestamp BETWEEN $1 AND $2
      `, [startDate, endDate]);
      
      const failedLogins = parseInt(failedLoginsResult.rows[0].count);
      if (failedLogins > 100) {
        violations.push({
          type: 'excessive_failed_logins',
          count: failedLogins,
          severity: failedLogins > 500 ? 'critical' : 'high',
          description: `${failedLogins} failed login attempts detected, indicating potential brute force attacks`
        });
      }
      
      // Check for unauthorized access attempts
      const unauthorizedAccessResult = await this.query(`
        SELECT COUNT(*) as count 
        FROM audit_logs 
        WHERE action = 'unauthorized_access' 
        AND timestamp BETWEEN $1 AND $2
      `, [startDate, endDate]);
      
      const unauthorizedAccess = parseInt(unauthorizedAccessResult.rows[0].count);
      if (unauthorizedAccess > 0) {
        violations.push({
          type: 'unauthorized_access_attempts',
          count: unauthorizedAccess,
          severity: 'high',
          description: `${unauthorizedAccess} unauthorized access attempts detected`
        });
      }
      
      // Check for missing audit logs (gaps in logging)
      const auditGapsResult = await this.query(`
        SELECT COUNT(*) as gap_count
        FROM (
          SELECT 
            timestamp,
            LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
          FROM audit_logs 
          WHERE timestamp BETWEEN $1 AND $2
        ) t
        WHERE EXTRACT(EPOCH FROM (timestamp - prev_timestamp)) > 3600
      `, [startDate, endDate]);
      
      const auditGaps = parseInt(auditGapsResult.rows[0].gap_count);
      if (auditGaps > 5) {
        violations.push({
          type: 'audit_logging_gaps',
          count: auditGaps,
          severity: 'medium',
          description: `${auditGaps} gaps in audit logging detected, indicating potential logging failures`
        });
      }
      
      return violations;
    } catch (error) {
      console.error('Failed to identify compliance violations:', error);
      return [];
    }
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(
    violations: Array<{ type: string; count: number; severity: string; description: string }>,
    metrics: ComplianceMetrics
  ): string[] {
    const recommendations = [];
    
    // Recommendations based on violations
    violations.forEach(violation => {
      switch (violation.type) {
        case 'excessive_failed_logins':
          recommendations.push('Implement account lockout policies and CAPTCHA for repeated failed login attempts');
          recommendations.push('Consider implementing IP-based rate limiting for login attempts');
          break;
        case 'unauthorized_access_attempts':
          recommendations.push('Review and strengthen access control policies');
          recommendations.push('Implement additional authentication factors for sensitive operations');
          break;
        case 'audit_logging_gaps':
          recommendations.push('Review audit logging infrastructure for reliability issues');
          recommendations.push('Implement monitoring alerts for audit logging failures');
          break;
      }
    });
    
    // Recommendations based on metrics
    if (metrics.auditCoverage < 90) {
      recommendations.push('Improve audit logging coverage by ensuring all critical actions are logged');
    }
    
    if (metrics.dataRetentionCompliance < 95) {
      recommendations.push('Implement automated data retention policies to ensure compliance');
    }
    
    if (metrics.securityEventResponse < 80) {
      recommendations.push('Improve security incident response times through automation and alerting');
    }
    
    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring compliance metrics and maintain current security practices');
      recommendations.push('Consider implementing additional security monitoring tools for enhanced visibility');
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  // Helper methods (keeping existing ones and adding new ones)
  private getDateFormat(granularity: string): string {
    switch (granularity) {
      case 'hour':
        return 'YYYY-MM-DD HH24:00:00';
      case 'day':
        return 'YYYY-MM-DD';
      case 'week':
        return 'YYYY-"W"WW';
      case 'month':
        return 'YYYY-MM';
      default:
        return 'YYYY-MM-DD';
    }
  }

  private async getTrendData(
    table: string,
    dateColumn: string,
    dateFormat: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; count: number }>> {
    const query = `
      SELECT 
        TO_CHAR(${dateColumn}, '${dateFormat}') as date,
        COUNT(*) as count
      FROM ${table}
      WHERE ${dateColumn} BETWEEN $1 AND $2
      GROUP BY TO_CHAR(${dateColumn}, '${dateFormat}')
      ORDER BY date
    `;

    const result = await this.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count)
    }));
  }

  private async getSystemHealth(): Promise<any> {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status = 'healthy';
    if (memUsagePercent > 80) status = 'critical';
    else if (memUsagePercent > 60) status = 'warning';

    return {
      status,
      uptime,
      memoryUsage: memUsagePercent,
      cpuUsage: 0 // This would require additional monitoring
    };
  }

  private async getRecentActivity(since: Date): Promise<any> {
    const [fileUploads, searchQueries, modelTrainings, auditEvents] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM cad_files WHERE created_at >= $1', [since]),
      this.query('SELECT COUNT(*) as count FROM search_queries WHERE timestamp >= $1', [since]),
      this.query('SELECT COUNT(*) as count FROM ai_models WHERE created_at >= $1', [since]),
      this.query('SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= $1', [since])
    ]);

    return {
      fileUploads: parseInt(fileUploads.rows[0].count),
      searchQueries: parseInt(searchQueries.rows[0].count),
      modelTrainings: parseInt(modelTrainings.rows[0].count),
      auditEvents: parseInt(auditEvents.rows[0].count)
    };
  }

  private async getSystemAlerts(): Promise<any[]> {
    const alerts = [];

    const memUsage = process.memoryUsage();
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (memUsagePercent > 80) {
      alerts.push({
        id: 'high-memory-usage',
        severity: 'error',
        message: `High memory usage: ${memUsagePercent.toFixed(1)}%`,
        timestamp: new Date()
      });
    }

    // Check for recent security events
    const recentSecurityEvents = await this.query(`
      SELECT COUNT(*) as count 
      FROM audit_logs 
      WHERE timestamp >= NOW() - INTERVAL '1 hour' 
      AND details->>'category' = 'security'
    `);

    const securityEventCount = parseInt(recentSecurityEvents.rows[0].count);
    if (securityEventCount > 10) {
      alerts.push({
        id: 'high-security-activity',
        severity: 'warning',
        message: `High security event activity: ${securityEventCount} events in the last hour`,
        timestamp: new Date()
      });
    }

    return alerts;
  }

  private async generateCSVExport(data: any, filePath: string, reportType: string, options: ReportExportOptions): Promise<void> {
    try {
      let csvContent = '';
      
      switch (reportType) {
        case 'audit':
          csvContent = this.generateAuditCSV(data, options);
          break;
        case 'usage':
          csvContent = this.generateUsageCSV(data, options);
          break;
        case 'compliance':
          csvContent = this.generateComplianceCSV(data, options);
          break;
        default:
          throw new Error(`Unsupported report type for CSV export: ${reportType}`);
      }
      
      await fs.writeFile(filePath, csvContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to generate CSV export: ${error.message}`);
    }
  }

  private async generatePDFExport(data: any, filePath: string, reportType: string, options: ReportExportOptions): Promise<void> {
    try {
      // This would use a library like puppeteer or pdfkit
      // For now, create a simple text-based PDF placeholder
      const content = `
        ${reportType.toUpperCase()} REPORT
        Generated: ${new Date().toISOString()}
        
        Report Data Summary:
        ${JSON.stringify(data, null, 2)}
      `;
      
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to generate PDF export: ${error.message}`);
    }
  }

  private async generateJSONExport(data: any, filePath: string, reportType: string, options: ReportExportOptions): Promise<void> {
    try {
      const exportData = {
        reportType,
        generatedAt: new Date().toISOString(),
        options,
        data
      };
      
      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to generate JSON export: ${error.message}`);
    }
  }

  private generateAuditCSV(data: any, options: ReportExportOptions): string {
    const headers = ['Action', 'Count', 'Category'];
    const rows = [headers.join(',')];
    
    Object.entries(data.actionsByType).forEach(([action, count]) => {
      rows.push(`"${action}","${count}","audit"`);
    });
    
    return rows.join('\n');
  }

  private generateUsageCSV(data: any, options: ReportExportOptions): string {
    const headers = ['Metric', 'Value'];
    const rows = [headers.join(',')];
    
    rows.push(`"Total Users","${data.totalUsers}"`);
    rows.push(`"Active Users","${data.activeUsers}"`);
    rows.push(`"Total Files","${data.totalFiles}"`);
    rows.push(`"Search Queries","${data.searchQueries}"`);
    
    return rows.join('\n');
  }

  private generateComplianceCSV(data: any, options: ReportExportOptions): string {
    const headers = ['Report ID', 'Compliance Score', 'Total Audit Events', 'Violations Count'];
    const rows = [headers.join(',')];
    
    rows.push(`"${data.reportId}","${data.complianceScore}","${data.totalAuditEvents}","${data.violations.length}"`);
    
    return rows.join('\n');
  }
}