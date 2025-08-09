import { Pool } from 'pg';
import { AuditLogModel, AuditLog, AuditLogCreateData } from '../models/AuditLog.js';
import { DateRange, AuditFilters, Pagination } from '../types/index.js';
import { BaseModel } from '../models/BaseModel.js';

export interface AuditLogEntry {
  id: string;
  userId?: string;
  username?: string;
  email?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data' | 'system' | 'security';
}

export interface AuditStatistics {
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByCategory: Record<string, number>;
  userActivity: Record<string, number>;
  securityEvents: number;
  recentActivity: number;
  topActions: Array<{ action: string; count: number }>;
  riskEvents: Array<{
    id: string;
    timestamp: Date;
    userId?: string;
    action: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
}

export interface DataRetentionPolicy {
  retentionDays: number;
  archiveAfterDays?: number;
  categories?: string[];
  autoDelete: boolean;
}

export class AuditLogService extends BaseModel {
  constructor(private pool: Pool) {
    super();
  }

  /**
   * Log user action with enhanced metadata
   */
  async logUserAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    try {
      const category = this.categorizeAction(action);
      const enhancedDetails = {
        ...details,
        severity,
        category,
        timestamp: new Date().toISOString(),
        sessionInfo: {
          ipAddress,
          userAgent
        }
      };

      await AuditLogModel.create({
        userId,
        action,
        resourceType,
        resourceId,
        details: enhancedDetails,
        ipAddress,
        userAgent
      });

      // Check for suspicious activity patterns
      await this.checkSuspiciousActivity(userId, action, ipAddress);
    } catch (error) {
      console.error('Failed to log user action:', error);
      // Don't throw to avoid breaking main functionality
    }
  }

  /**
   * Log system action
   */
  async logSystemAction(
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    try {
      const category = this.categorizeAction(action);
      const enhancedDetails = {
        ...details,
        severity,
        category,
        timestamp: new Date().toISOString(),
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime()
        }
      };

      await AuditLogModel.create({
        action,
        resourceType,
        resourceId,
        details: enhancedDetails
      });
    } catch (error) {
      console.error('Failed to log system action:', error);
    }
  }

  /**
   * Log security event with high priority
   */
  async logSecurityEvent(
    userId: string | undefined,
    action: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      const enhancedDetails = {
        ...details,
        severity: 'critical',
        category: 'security',
        timestamp: new Date().toISOString(),
        securityContext: {
          threatLevel: this.assessThreatLevel(action),
          requiresInvestigation: true
        }
      };

      await AuditLogModel.create({
        userId,
        action,
        resourceType: 'security',
        details: enhancedDetails,
        ipAddress,
        userAgent
      });

      // Trigger security alerts if needed
      await this.triggerSecurityAlert(action, userId, ipAddress, details);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get comprehensive audit logs with enhanced filtering
   */
  async getAuditLogs(
    filters: AuditFilters & {
      severity?: string;
      category?: string;
      riskLevel?: string;
    } = {},
    pagination: { page?: number; limit?: number; offset?: number } = {}
  ): Promise<{ logs: AuditLogEntry[]; pagination: Pagination }> {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build WHERE conditions
      if (filters.userId) {
        conditions.push(`al.user_id = $${paramIndex}`);
        values.push(filters.userId);
        paramIndex++;
      }

      if (filters.action) {
        conditions.push(`al.action ILIKE $${paramIndex}`);
        values.push(`%${filters.action}%`);
        paramIndex++;
      }

      if (filters.resourceType) {
        conditions.push(`al.resource_type = $${paramIndex}`);
        values.push(filters.resourceType);
        paramIndex++;
      }

      if (filters.severity) {
        conditions.push(`al.details->>'severity' = $${paramIndex}`);
        values.push(filters.severity);
        paramIndex++;
      }

      if (filters.category) {
        conditions.push(`al.details->>'category' = $${paramIndex}`);
        values.push(filters.category);
        paramIndex++;
      }

      if (filters.dateRange) {
        conditions.push(`al.timestamp >= $${paramIndex}`);
        values.push(filters.dateRange.startDate);
        paramIndex++;
        conditions.push(`al.timestamp <= $${paramIndex}`);
        values.push(filters.dateRange.endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM audit_logs al ${whereClause}`;
      const countResult = await this.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      const limit = pagination.limit || 50;
      const offset = pagination.offset || 0;
      
      const dataQuery = `
        SELECT 
          al.*,
          u.username,
          u.email,
          al.details->>'severity' as severity,
          al.details->>'category' as category
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const dataResult = await this.query(dataQuery, [...values, limit, offset]);
      
      const logs: AuditLogEntry[] = dataResult.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        email: row.email,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        details: row.details || {},
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        timestamp: row.timestamp,
        severity: row.severity || 'low',
        category: row.category || 'system'
      }));

      const page = Math.floor(offset / limit) + 1;
      const paginationInfo = this.calculatePagination(total, page, limit);

      return { logs, pagination: paginationInfo };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Get comprehensive audit statistics
   */
  async getAuditStatistics(dateRange?: DateRange): Promise<AuditStatistics> {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (dateRange) {
        conditions.push(`timestamp >= $${paramIndex}`);
        values.push(dateRange.startDate);
        paramIndex++;
        conditions.push(`timestamp <= $${paramIndex}`);
        values.push(dateRange.endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get comprehensive statistics
      const [
        totalResult,
        actionsByTypeResult,
        actionsByCategoryResult,
        userActivityResult,
        securityEventsResult,
        recentActivityResult,
        topActionsResult,
        riskEventsResult
      ] = await Promise.all([
        this.query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, values),
        
        this.query(`
          SELECT action, COUNT(*) as count
          FROM audit_logs ${whereClause}
          GROUP BY action
          ORDER BY count DESC
          LIMIT 20
        `, values),
        
        this.query(`
          SELECT 
            details->>'category' as category, 
            COUNT(*) as count
          FROM audit_logs ${whereClause}
          GROUP BY details->>'category'
          ORDER BY count DESC
        `, values),
        
        this.query(`
          SELECT 
            u.username, 
            COUNT(al.id) as count
          FROM audit_logs al
          LEFT JOIN users u ON al.user_id = u.id
          ${whereClause}
          GROUP BY u.username
          ORDER BY count DESC
          LIMIT 10
        `, values),
        
        this.query(`
          SELECT COUNT(*) as count
          FROM audit_logs
          ${whereClause ? whereClause + ' AND' : 'WHERE'} 
          details->>'category' = 'security'
        `, values),
        
        this.query(`
          SELECT COUNT(*) as count
          FROM audit_logs
          ${whereClause ? whereClause + ' AND' : 'WHERE'} 
          timestamp >= NOW() - INTERVAL '24 hours'
        `, values),
        
        this.query(`
          SELECT 
            action,
            COUNT(*) as count,
            details->>'category' as category,
            AVG(CASE WHEN details->>'severity' = 'critical' THEN 4
                     WHEN details->>'severity' = 'high' THEN 3
                     WHEN details->>'severity' = 'medium' THEN 2
                     ELSE 1 END) as avg_severity
          FROM audit_logs ${whereClause}
          GROUP BY action, details->>'category'
          ORDER BY count DESC, avg_severity DESC
          LIMIT 15
        `, values),
        
        this.query(`
          SELECT 
            id,
            timestamp,
            user_id,
            action,
            details->>'severity' as risk_level,
            COALESCE(details->>'description', action) as description
          FROM audit_logs
          ${whereClause ? whereClause + ' AND' : 'WHERE'} 
          (details->>'severity' IN ('high', 'critical') OR 
           details->>'category' = 'security' OR
           action IN ('login_failed', 'unauthorized_access', 'suspicious_activity', 'rate_limit_exceeded'))
          ORDER BY timestamp DESC
          LIMIT 50
        `, values)
      ]);

      // Process results
      const actionsByType: Record<string, number> = {};
      actionsByTypeResult.rows.forEach(row => {
        actionsByType[row.action] = parseInt(row.count);
      });

      const actionsByCategory: Record<string, number> = {};
      actionsByCategoryResult.rows.forEach(row => {
        actionsByCategory[row.category || 'unknown'] = parseInt(row.count);
      });

      const userActivity: Record<string, number> = {};
      userActivityResult.rows.forEach(row => {
        if (row.username) {
          userActivity[row.username] = parseInt(row.count);
        }
      });

      const topActions = topActionsResult.rows.map(row => ({
        action: row.action,
        count: parseInt(row.count)
      }));

      const riskEvents = riskEventsResult.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        userId: row.user_id,
        action: row.action,
        riskLevel: (row.risk_level || 'medium') as 'low' | 'medium' | 'high' | 'critical',
        description: row.description
      }));

      return {
        totalActions: parseInt(totalResult.rows[0].total),
        actionsByType,
        actionsByCategory,
        userActivity,
        securityEvents: parseInt(securityEventsResult.rows[0].count),
        recentActivity: parseInt(recentActivityResult.rows[0].count),
        topActions,
        riskEvents
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Apply data retention policy
   */
  async applyDataRetentionPolicy(policy: DataRetentionPolicy): Promise<{
    deletedCount: number;
    archivedCount: number;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];
      let deletedCount = 0;
      let archivedCount = 0;

      // Archive old logs if archival is configured
      if (policy.archiveAfterDays) {
        try {
          const archiveResult = await this.archiveOldLogs(policy.archiveAfterDays, policy.categories);
          archivedCount = archiveResult;
        } catch (error) {
          errors.push(`Archive failed: ${error.message}`);
        }
      }

      // Delete very old logs if auto-delete is enabled
      if (policy.autoDelete) {
        try {
          const deleteResult = await this.deleteOldLogs(policy.retentionDays, policy.categories);
          deletedCount = deleteResult;
        } catch (error) {
          errors.push(`Deletion failed: ${error.message}`);
        }
      }

      // Log the retention policy execution
      await this.logSystemAction(
        'data_retention_applied',
        'audit_logs',
        undefined,
        {
          policy,
          deletedCount,
          archivedCount,
          errors
        },
        'medium'
      );

      return { deletedCount, archivedCount, errors };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Export audit logs in various formats
   */
  async exportAuditLogs(
    filters: AuditFilters,
    format: 'csv' | 'json' | 'pdf',
    includeDetails: boolean = true
  ): Promise<{
    data: string | Buffer;
    filename: string;
    mimeType: string;
  }> {
    try {
      const { logs } = await this.getAuditLogs(filters, { limit: 10000 });

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `audit_logs_${timestamp}.${format}`;

      switch (format) {
        case 'csv':
          return {
            data: this.generateCSVExport(logs, includeDetails),
            filename,
            mimeType: 'text/csv'
          };
        
        case 'json':
          return {
            data: JSON.stringify({
              exportDate: new Date().toISOString(),
              filters,
              totalRecords: logs.length,
              logs: includeDetails ? logs : logs.map(log => ({
                id: log.id,
                timestamp: log.timestamp,
                userId: log.userId,
                username: log.username,
                action: log.action,
                resourceType: log.resourceType,
                severity: log.severity,
                category: log.category
              }))
            }, null, 2),
            filename: filename.replace('.json', '.json'),
            mimeType: 'application/json'
          };
        
        case 'pdf':
          return {
            data: await this.generatePDFExport(logs, includeDetails),
            filename,
            mimeType: 'application/pdf'
          };
        
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Get user activity timeline
   */
  async getUserActivityTimeline(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; count: number; actions: Record<string, number> }>> {
    try {
      const query = `
        SELECT 
          DATE(timestamp) as date,
          action,
          COUNT(*) as count
        FROM audit_logs
        WHERE user_id = $1 
        AND timestamp >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(timestamp), action
        ORDER BY date DESC, count DESC
      `;

      const result = await this.query(query, [userId]);
      
      // Group by date
      const timeline: Record<string, { count: number; actions: Record<string, number> }> = {};
      
      result.rows.forEach(row => {
        const date = row.date;
        if (!timeline[date]) {
          timeline[date] = { count: 0, actions: {} };
        }
        timeline[date].count += parseInt(row.count);
        timeline[date].actions[row.action] = parseInt(row.count);
      });

      return Object.entries(timeline).map(([date, data]) => ({
        date,
        count: data.count,
        actions: data.actions
      }));
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Detect suspicious activity patterns
   */
  private async checkSuspiciousActivity(
    userId: string,
    action: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Check for rapid repeated actions
      const recentActionsQuery = `
        SELECT COUNT(*) as count
        FROM audit_logs
        WHERE user_id = $1 
        AND action = $2 
        AND timestamp >= $3
      `;

      const recentActionsResult = await this.query(recentActionsQuery, [userId, action, oneHourAgo]);
      const recentActionCount = parseInt(recentActionsResult.rows[0].count);

      // Define suspicious thresholds
      const suspiciousThresholds: Record<string, number> = {
        'login_attempt': 5,
        'file_download': 50,
        'search_query': 100,
        'api_call': 200
      };

      const threshold = suspiciousThresholds[action] || 20;

      if (recentActionCount > threshold) {
        await this.logSecurityEvent(
          userId,
          'suspicious_activity',
          {
            description: `Suspicious activity detected: ${recentActionCount} ${action} actions in the last hour`,
            threshold,
            actualCount: recentActionCount,
            timeWindow: '1 hour'
          },
          ipAddress
        );
      }

      // Check for unusual IP address patterns
      if (ipAddress) {
        const ipHistoryQuery = `
          SELECT DISTINCT ip_address
          FROM audit_logs
          WHERE user_id = $1 
          AND timestamp >= NOW() - INTERVAL '7 days'
          AND ip_address IS NOT NULL
        `;

        const ipHistoryResult = await this.query(ipHistoryQuery, [userId]);
        const knownIPs = ipHistoryResult.rows.map(row => row.ip_address);

        if (!knownIPs.includes(ipAddress) && knownIPs.length > 0) {
          await this.logSecurityEvent(
            userId,
            'unusual_ip_access',
            {
              description: `Access from new IP address: ${ipAddress}`,
              newIP: ipAddress,
              knownIPs: knownIPs.slice(0, 5) // Limit for privacy
            },
            ipAddress
          );
        }
      }
    } catch (error) {
      console.error('Failed to check suspicious activity:', error);
    }
  }

  /**
   * Categorize actions for better organization
   */
  private categorizeAction(action: string): string {
    const categories: Record<string, string> = {
      'login': 'authentication',
      'logout': 'authentication',
      'login_failed': 'authentication',
      'password_change': 'authentication',
      'mfa_enabled': 'authentication',
      'permission_denied': 'authorization',
      'unauthorized_access': 'authorization',
      'role_changed': 'authorization',
      'file_upload': 'data',
      'file_download': 'data',
      'file_delete': 'data',
      'dataset_created': 'data',
      'model_trained': 'data',
      'search_query': 'data',
      'system_startup': 'system',
      'system_shutdown': 'system',
      'backup_created': 'system',
      'maintenance_mode': 'system',
      'suspicious_activity': 'security',
      'rate_limit_exceeded': 'security',
      'unusual_ip_access': 'security'
    };

    return categories[action] || 'system';
  }

  /**
   * Assess threat level for security events
   */
  private assessThreatLevel(action: string): 'low' | 'medium' | 'high' | 'critical' {
    const threatLevels: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'login_failed': 'medium',
      'unauthorized_access': 'high',
      'suspicious_activity': 'high',
      'rate_limit_exceeded': 'medium',
      'unusual_ip_access': 'medium',
      'permission_denied': 'low',
      'data_breach_attempt': 'critical',
      'malware_detected': 'critical'
    };

    return threatLevels[action] || 'low';
  }

  /**
   * Trigger security alerts for critical events
   */
  private async triggerSecurityAlert(
    action: string,
    userId?: string,
    ipAddress?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const criticalActions = [
        'unauthorized_access',
        'data_breach_attempt',
        'malware_detected',
        'suspicious_activity'
      ];

      if (criticalActions.includes(action)) {
        // In a real implementation, this would send alerts via email, Slack, etc.
        console.warn(`SECURITY ALERT: ${action}`, {
          userId,
          ipAddress,
          timestamp: new Date().toISOString(),
          details
        });

        // Log the alert
        await this.logSystemAction(
          'security_alert_triggered',
          'security',
          undefined,
          {
            originalAction: action,
            userId,
            ipAddress,
            alertLevel: 'critical',
            details
          },
          'critical'
        );
      }
    } catch (error) {
      console.error('Failed to trigger security alert:', error);
    }
  }

  /**
   * Archive old logs to separate storage
   */
  private async archiveOldLogs(
    archiveAfterDays: number,
    categories?: string[]
  ): Promise<number> {
    try {
      let whereClause = `WHERE timestamp < NOW() - INTERVAL '${archiveAfterDays} days'`;
      const values: any[] = [];

      if (categories && categories.length > 0) {
        whereClause += ` AND details->>'category' = ANY($1)`;
        values.push(categories);
      }

      // In a real implementation, this would move data to archive storage
      // For now, we'll just mark them as archived
      const query = `
        UPDATE audit_logs 
        SET details = details || '{"archived": true, "archivedAt": "${new Date().toISOString()}"}'
        ${whereClause}
        AND (details->>'archived' IS NULL OR details->>'archived' = 'false')
      `;

      const result = await this.query(query, values);
      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to archive logs: ${error.message}`);
    }
  }

  /**
   * Delete old logs based on retention policy
   */
  private async deleteOldLogs(
    retentionDays: number,
    categories?: string[]
  ): Promise<number> {
    try {
      let whereClause = `WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'`;
      const values: any[] = [];

      if (categories && categories.length > 0) {
        whereClause += ` AND details->>'category' = ANY($1)`;
        values.push(categories);
      }

      // Only delete non-critical security events
      whereClause += ` AND NOT (details->>'category' = 'security' AND details->>'severity' = 'critical')`;

      const query = `DELETE FROM audit_logs ${whereClause}`;
      const result = await this.query(query, values);
      
      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to delete old logs: ${error.message}`);
    }
  }

  /**
   * Generate CSV export
   */
  private generateCSVExport(logs: AuditLogEntry[], includeDetails: boolean): string {
    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Username',
      'Action',
      'Resource Type',
      'Resource ID',
      'Severity',
      'Category',
      'IP Address'
    ];

    if (includeDetails) {
      headers.push('Details');
    }

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.id,
        log.timestamp.toISOString(),
        log.userId || '',
        log.username || '',
        log.action,
        log.resourceType,
        log.resourceId || '',
        log.severity,
        log.category,
        log.ipAddress || ''
      ];

      if (includeDetails) {
        row.push(JSON.stringify(log.details).replace(/"/g, '""'));
      }

      csvRows.push(row.map(field => `"${field}"`).join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Generate PDF export (placeholder - would use a PDF library)
   */
  private async generatePDFExport(logs: AuditLogEntry[], includeDetails: boolean): Promise<Buffer> {
    // This would use a library like puppeteer, pdfkit, or jsPDF
    // For now, return a placeholder
    const content = `
      Audit Log Report
      Generated: ${new Date().toISOString()}
      Total Records: ${logs.length}
      
      ${logs.slice(0, 10).map(log => 
        `${log.timestamp.toISOString()} - ${log.username || 'System'} - ${log.action} - ${log.resourceType}`
      ).join('\n')}
      
      ${logs.length > 10 ? `... and ${logs.length - 10} more records` : ''}
    `;

    return Buffer.from(content, 'utf-8');
  }
}