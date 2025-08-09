import { DateRange, UsageReport, PerformanceReport, AuditReport } from '../types/index.js';
import { BaseModel } from '../models/BaseModel.js';
import { AuditLogService } from './AuditLogService.js';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import PDFDocument from 'pdfkit';

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

export class ReportService extends BaseModel {
  private auditLogService: AuditLogService;

  constructor(private pool: Pool) {
    super();
    this.auditLogService = new AuditLogService(pool);
  }
  async generateUsageReport(dateRange: DateRange, granularity: string = 'day'): Promise<UsageReport> {
    const { startDate, endDate } = dateRange;
    
    // Get basic metrics
    const [
      totalUsersResult,
      activeUsersResult,
      totalFilesResult,
      totalStorageResult,
      searchQueriesResult,
      modelTrainingsResult
    ] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM users'),
      this.query('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [startDate]),
      this.query('SELECT COUNT(*) as count FROM cad_files WHERE created_at BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COALESCE(SUM(file_size), 0) as total FROM cad_files WHERE created_at BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COUNT(*) as count FROM search_queries WHERE timestamp BETWEEN $1 AND $2', [startDate, endDate]),
      this.query('SELECT COUNT(*) as count FROM ai_models WHERE created_at BETWEEN $1 AND $2', [startDate, endDate])
    ]);
    
    // Get trend data based on granularity
    const dateFormat = this.getDateFormat(granularity);
    const trendQueries = await Promise.all([
      this.getTrendData('users', 'created_at', dateFormat, startDate, endDate),
      this.getTrendData('cad_files', 'created_at', dateFormat, startDate, endDate),
      this.getTrendData('search_queries', 'timestamp', dateFormat, startDate, endDate)
    ]);
    
    return {
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      activeUsers: parseInt(activeUsersResult.rows[0].count),
      totalFiles: parseInt(totalFilesResult.rows[0].count),
      totalStorage: parseInt(totalStorageResult.rows[0].total),
      searchQueries: parseInt(searchQueriesResult.rows[0].count),
      modelTrainings: parseInt(modelTrainingsResult.rows[0].count),
      period: dateRange,
      trends: {
        userGrowth: trendQueries[0],
        fileUploads: trendQueries[1],
        searchActivity: trendQueries[2]
      }
    };
  }
  
  async generatePerformanceReport(dateRange: DateRange, modelId?: string): Promise<PerformanceReport> {
    const { startDate, endDate } = dateRange;
    
    let modelFilter = '';
    const params: any[] = [startDate, endDate];
    
    if (modelId) {
      modelFilter = 'AND sq.model_id = $3';
      params.push(modelId);
    }
    
    // Get performance metrics
    const performanceQuery = `
      SELECT 
        AVG(sq.response_time) as avg_search_time,
        COUNT(*) as total_queries,
        AVG(CASE WHEN uf.rating IS NOT NULL THEN uf.rating ELSE 3 END) as user_satisfaction
      FROM search_queries sq
      LEFT JOIN search_results sr ON sq.id = sr.query_id
      LEFT JOIN user_feedback uf ON sr.id = uf.result_id
      WHERE sq.timestamp BETWEEN $1 AND $2 ${modelFilter}
    `;
    
    const performanceResult = await this.query(performanceQuery, params);
    const perf = performanceResult.rows[0];
    
    // Get model-specific performance
    const modelPerformanceQuery = `
      SELECT 
        m.id as model_id,
        m.name as model_name,
        m.performance->>'accuracy' as accuracy,
        AVG(sq.response_time) as avg_response_time,
        COUNT(sq.id) as query_count,
        AVG(CASE WHEN uf.rating IS NOT NULL THEN uf.rating ELSE 3 END) as user_rating
      FROM ai_models m
      LEFT JOIN search_queries sq ON m.id = sq.model_id AND sq.timestamp BETWEEN $1 AND $2
      LEFT JOIN search_results sr ON sq.id = sr.query_id
      LEFT JOIN user_feedback uf ON sr.id = uf.result_id
      WHERE m.status = 'ready'
      GROUP BY m.id, m.name, m.performance
      ORDER BY query_count DESC
    `;
    
    const modelPerformanceResult = await this.query(modelPerformanceQuery, [startDate, endDate]);
    
    return {
      averageSearchTime: parseFloat(perf.avg_search_time) || 0,
      searchAccuracy: 0.85, // This would be calculated based on user feedback and model metrics
      userSatisfaction: parseFloat(perf.user_satisfaction) || 3,
      totalQueries: parseInt(perf.total_queries),
      period: dateRange,
      modelPerformance: modelPerformanceResult.rows.map(row => ({
        modelId: row.model_id,
        modelName: row.model_name,
        accuracy: parseFloat(row.accuracy) || 0,
        averageResponseTime: parseFloat(row.avg_response_time) || 0,
        queryCount: parseInt(row.query_count) || 0,
        userRating: parseFloat(row.user_rating) || 3
      }))
    };
  }
  
  async generateAuditReport(dateRange: DateRange, filters: any = {}): Promise<AuditReport> {
    const { startDate, endDate } = dateRange;
    
    let whereClause = 'WHERE timestamp BETWEEN $1 AND $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;
    
    if (filters.userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }
    
    if (filters.action) {
      whereClause += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }
    
    if (filters.resourceType) {
      whereClause += ` AND resource_type = $${paramIndex}`;
      params.push(filters.resourceType);
      paramIndex++;
    }
    
    // Get basic audit metrics
    const [
      totalActionsResult,
      actionsByTypeResult,
      userActivityResult,
      securityEventsResult
    ] = await Promise.all([
      this.query(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`, params),
      this.query(`
        SELECT action, COUNT(*) as count 
        FROM audit_logs ${whereClause}
        GROUP BY action 
        ORDER BY count DESC
      `, params),
      this.query(`
        SELECT u.username, COUNT(al.id) as count
        FROM audit_logs al
        JOIN users u ON al.user_id = u.id
        ${whereClause}
        GROUP BY u.id, u.username
        ORDER BY count DESC
        LIMIT 10
      `, params),
      this.query(`
        SELECT COUNT(*) as count 
        FROM audit_logs ${whereClause}
        AND action IN ('login_failed', 'unauthorized_access', 'suspicious_activity')
      `, params)
    ]);
    
    // Get top users and risk events
    const topUsersResult = await this.query(`
      SELECT 
        u.id as user_id,
        u.username,
        COUNT(al.id) as action_count
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.username
      ORDER BY action_count DESC
      LIMIT 10
    `, params);
    
    const riskEventsResult = await this.query(`
      SELECT 
        timestamp,
        user_id,
        action,
        CASE 
          WHEN action IN ('login_failed', 'unauthorized_access') THEN 'high'
          WHEN action IN ('suspicious_activity', 'rate_limit_exceeded') THEN 'medium'
          ELSE 'low'
        END as risk_level,
        details->>'description' as description
      FROM audit_logs
      ${whereClause}
      AND action IN ('login_failed', 'unauthorized_access', 'suspicious_activity', 'rate_limit_exceeded')
      ORDER BY timestamp DESC
      LIMIT 50
    `, params);
    
    // Process results
    const actionsByType: Record<string, number> = {};
    actionsByTypeResult.rows.forEach(row => {
      actionsByType[row.action] = parseInt(row.count);
    });
    
    const userActivity: Record<string, number> = {};
    userActivityResult.rows.forEach(row => {
      userActivity[row.username] = parseInt(row.count);
    });
    
    return {
      totalActions: parseInt(totalActionsResult.rows[0].count),
      actionsByType,
      userActivity,
      securityEvents: parseInt(securityEventsResult.rows[0].count),
      period: dateRange,
      topUsers: topUsersResult.rows.map(row => ({
        userId: row.user_id,
        username: row.username,
        actionCount: parseInt(row.action_count)
      })),
      riskEvents: riskEventsResult.rows.map(row => ({
        timestamp: row.timestamp,
        userId: row.user_id,
        action: row.action,
        riskLevel: row.risk_level,
        description: row.description || `${row.action} event`
      }))
    };
  }
  
  async exportReport(
    reportType: string, 
    format: string, 
    dateRange: DateRange, 
    filters: any = {}
  ): Promise<{ downloadUrl: string; expiresAt: Date; fileSize: number }> {
    // Generate the report data
    let reportData: any;
    
    switch (reportType) {
      case 'usage':
        reportData = await this.generateUsageReport(dateRange, filters.granularity);
        break;
      case 'performance':
        reportData = await this.generatePerformanceReport(dateRange, filters.modelId);
        break;
      case 'audit':
        reportData = await this.generateAuditReport(dateRange, filters);
        break;
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
    
    // Generate export file (this would typically use a file generation service)
    const filename = `${reportType}_report_${Date.now()}.${format}`;
    const exportPath = `/tmp/exports/${filename}`;
    
    if (format === 'csv') {
      await this.generateCSVExport(reportData, exportPath, reportType);
    } else if (format === 'pdf') {
      await this.generatePDFExport(reportData, exportPath, reportType);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
    
    // In a real implementation, this would upload to S3 or similar storage
    const downloadUrl = `${process.env.API_BASE_URL}/api/reports/download/${filename}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    return {
      downloadUrl,
      expiresAt,
      fileSize: 1024 // This would be the actual file size
    };
  }
  
  async getDashboardMetrics(): Promise<any> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const [
      systemHealthResult,
      activeUsersResult,
      recentActivityResult,
      alertsResult
    ] = await Promise.all([
      this.getSystemHealth(),
      this.query('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [last24Hours]),
      this.getRecentActivity(last24Hours),
      this.getSystemAlerts()
    ]);
    
    return {
      systemHealth: systemHealthResult,
      activeUsers: parseInt(activeUsersResult.rows[0].count),
      recentActivity: recentActivityResult,
      alerts: alertsResult
    };
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
    const [fileUploads, searchQueries, modelTrainings] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM cad_files WHERE created_at >= $1', [since]),
      this.query('SELECT COUNT(*) as count FROM search_queries WHERE timestamp >= $1', [since]),
      this.query('SELECT COUNT(*) as count FROM ai_models WHERE created_at >= $1', [since])
    ]);
    
    return {
      fileUploads: parseInt(fileUploads.rows[0].count),
      searchQueries: parseInt(searchQueries.rows[0].count),
      modelTrainings: parseInt(modelTrainings.rows[0].count)
    };
  }
  
  private async getSystemAlerts(): Promise<any[]> {
    // This would typically check various system conditions
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
    
    return alerts;
  }
  
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
  
  private async generateCSVExport(data: any, filePath: string, reportType: string): Promise<void> {
    // This would generate a CSV file from the report data
    // Implementation would depend on the specific report structure
    console.log(`Generating CSV export for ${reportType} at ${filePath}`);
  }
  
  private async generatePDFExport(data: any, filePath: string, reportType: string): Promise<void> {
    // This would generate a PDF file from the report data
    // Implementation would use a library like puppeteer or pdfkit
    console.log(`Generating PDF export for ${reportType} at ${filePath}`);
  }
}