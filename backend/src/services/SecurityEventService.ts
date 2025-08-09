import { DatabaseService } from '../database/DatabaseService.js';
import { v4 as uuidv4 } from 'uuid';

export interface SecurityEvent {
  id?: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
  createdAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface SecurityAlert {
  id: string;
  eventId: string;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recipients: string[];
  sentAt?: Date;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  recentEvents: SecurityEvent[];
  unresolvedCritical: number;
  averageResolutionTime: number;
}

/**
 * Service for monitoring and managing security events
 */
export class SecurityEventService {
  private static readonly ALERT_THRESHOLDS = {
    suspicious_activity: { count: 5, window: 300 }, // 5 events in 5 minutes
    unauthorized_access: { count: 3, window: 300 }, // 3 events in 5 minutes
    failed_login: { count: 10, window: 900 }, // 10 events in 15 minutes
    file_access_violation: { count: 5, window: 600 } // 5 events in 10 minutes
  };

  private static readonly CRITICAL_EVENT_TYPES = [
    'data_breach',
    'unauthorized_admin_access',
    'system_compromise',
    'malware_detected',
    'encryption_key_compromise'
  ];

  /**
   * Log a security event
   */
  static async logEvent(event: SecurityEvent): Promise<string> {
    try {
      const db = DatabaseService.getInstance();
      const eventId = uuidv4();

      await db.query(`
        INSERT INTO security_events (
          id, event_type, severity, user_id, resource_type, resource_id,
          ip_address, user_agent, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        eventId,
        event.eventType,
        event.severity,
        event.userId || null,
        event.resourceType || null,
        event.resourceId || null,
        event.ipAddress || null,
        event.userAgent || null,
        JSON.stringify(event.details || {})
      ]);

      // Check if this event should trigger an alert
      await this.checkAndTriggerAlerts(eventId, event);

      // Auto-escalate critical events
      if (this.CRITICAL_EVENT_TYPES.includes(event.eventType) || event.severity === 'critical') {
        await this.escalateCriticalEvent(eventId, event);
      }

      return eventId;
    } catch (error) {
      console.error('Failed to log security event:', error);
      throw new Error('Failed to log security event');
    }
  }

  /**
   * Get security events with filtering and pagination
   */
  static async getEvents(options: {
    severity?: string[];
    eventType?: string[];
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ events: SecurityEvent[]; total: number }> {
    try {
      const db = DatabaseService.getInstance();
      
      let whereConditions: string[] = [];
      let params: any[] = [];
      let paramIndex = 1;

      if (options.severity && options.severity.length > 0) {
        whereConditions.push(`severity = ANY($${paramIndex})`);
        params.push(options.severity);
        paramIndex++;
      }

      if (options.eventType && options.eventType.length > 0) {
        whereConditions.push(`event_type = ANY($${paramIndex})`);
        params.push(options.eventType);
        paramIndex++;
      }

      if (options.userId) {
        whereConditions.push(`user_id = $${paramIndex}`);
        params.push(options.userId);
        paramIndex++;
      }

      if (options.startDate) {
        whereConditions.push(`created_at >= $${paramIndex}`);
        params.push(options.startDate);
        paramIndex++;
      }

      if (options.endDate) {
        whereConditions.push(`created_at <= $${paramIndex}`);
        params.push(options.endDate);
        paramIndex++;
      }

      if (options.resolved !== undefined) {
        if (options.resolved) {
          whereConditions.push('resolved_at IS NOT NULL');
        } else {
          whereConditions.push('resolved_at IS NULL');
        }
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM security_events ${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get events
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      
      const eventsQuery = `
        SELECT 
          id, event_type, severity, user_id, resource_type, resource_id,
          ip_address, user_agent, details, created_at, resolved_at, resolved_by
        FROM security_events 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      params.push(limit, offset);
      const eventsResult = await db.query(eventsQuery, params);

      const events: SecurityEvent[] = eventsResult.rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        severity: row.severity,
        userId: row.user_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        details: row.details,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by
      }));

      return { events, total };
    } catch (error) {
      console.error('Failed to get security events:', error);
      throw new Error('Failed to retrieve security events');
    }
  }

  /**
   * Resolve a security event
   */
  static async resolveEvent(eventId: string, resolvedBy: string, resolution?: string): Promise<void> {
    try {
      const db = DatabaseService.getInstance();
      
      await db.query(`
        UPDATE security_events
        SET resolved_at = NOW(), resolved_by = $1, details = details || $2
        WHERE id = $3
      `, [
        resolvedBy,
        JSON.stringify({ resolution: resolution || 'Resolved by administrator' }),
        eventId
      ]);

      // Log resolution event
      await this.logEvent({
        eventType: 'security_event_resolved',
        severity: 'low',
        userId: resolvedBy,
        resourceType: 'security_event',
        resourceId: eventId,
        details: { resolution }
      });
    } catch (error) {
      console.error('Failed to resolve security event:', error);
      throw new Error('Failed to resolve security event');
    }
  }

  /**
   * Get security metrics and statistics
   */
  static async getSecurityMetrics(timeRange: 'day' | 'week' | 'month' = 'week'): Promise<SecurityMetrics> {
    try {
      const db = DatabaseService.getInstance();
      
      let timeCondition = '';
      switch (timeRange) {
        case 'day':
          timeCondition = "created_at >= NOW() - INTERVAL '1 day'";
          break;
        case 'week':
          timeCondition = "created_at >= NOW() - INTERVAL '1 week'";
          break;
        case 'month':
          timeCondition = "created_at >= NOW() - INTERVAL '1 month'";
          break;
      }

      // Get total events and events by severity
      const severityResult = await db.query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_severity
        FROM security_events
        WHERE ${timeCondition}
      `);

      // Get events by type
      const typeResult = await db.query(`
        SELECT event_type, COUNT(*) as count
        FROM security_events
        WHERE ${timeCondition}
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `);

      // Get recent events
      const recentResult = await db.query(`
        SELECT 
          id, event_type, severity, user_id, resource_type, resource_id,
          ip_address, user_agent, details, created_at, resolved_at, resolved_by
        FROM security_events
        WHERE ${timeCondition}
        ORDER BY created_at DESC
        LIMIT 20
      `);

      // Get unresolved critical events
      const criticalResult = await db.query(`
        SELECT COUNT(*) as unresolved_critical
        FROM security_events
        WHERE severity = 'critical' AND resolved_at IS NULL
      `);

      // Calculate average resolution time
      const resolutionResult = await db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_seconds
        FROM security_events
        WHERE resolved_at IS NOT NULL AND ${timeCondition}
      `);

      const severityRow = severityResult.rows[0];
      const eventsBySeverity = {
        low: parseInt(severityRow.low_severity) || 0,
        medium: parseInt(severityRow.medium_severity) || 0,
        high: parseInt(severityRow.high_severity) || 0,
        critical: parseInt(severityRow.critical_severity) || 0
      };

      const eventsByType: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        eventsByType[row.event_type] = parseInt(row.count);
      });

      const recentEvents: SecurityEvent[] = recentResult.rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        severity: row.severity,
        userId: row.user_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        details: row.details,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by
      }));

      const avgResolutionSeconds = parseFloat(resolutionResult.rows[0]?.avg_resolution_seconds) || 0;
      const averageResolutionTime = Math.round(avgResolutionSeconds / 60); // Convert to minutes

      return {
        totalEvents: parseInt(severityRow.total_events) || 0,
        eventsBySeverity,
        eventsByType,
        recentEvents,
        unresolvedCritical: parseInt(criticalResult.rows[0].unresolved_critical) || 0,
        averageResolutionTime
      };
    } catch (error) {
      console.error('Failed to get security metrics:', error);
      throw new Error('Failed to retrieve security metrics');
    }
  }

  /**
   * Check for suspicious patterns and trigger alerts
   */
  static async detectSuspiciousPatterns(): Promise<{ alerts: SecurityAlert[]; patterns: any[] }> {
    try {
      const db = DatabaseService.getInstance();
      const alerts: SecurityAlert[] = [];
      const patterns: any[] = [];

      // Check for repeated failed login attempts from same IP
      const failedLoginResult = await db.query(`
        SELECT ip_address, COUNT(*) as attempt_count
        FROM security_events
        WHERE event_type = 'failed_login'
        AND created_at >= NOW() - INTERVAL '15 minutes'
        GROUP BY ip_address
        HAVING COUNT(*) >= 5
      `);

      for (const row of failedLoginResult.rows) {
        const pattern = {
          type: 'repeated_failed_logins',
          ipAddress: row.ip_address,
          count: parseInt(row.attempt_count),
          severity: 'high' as const
        };
        patterns.push(pattern);

        const alert = await this.createAlert({
          eventId: uuidv4(),
          alertType: 'repeated_failed_logins',
          severity: 'high',
          message: `Multiple failed login attempts detected from IP ${row.ip_address} (${row.attempt_count} attempts)`,
          recipients: await this.getSecurityTeamEmails()
        });
        alerts.push(alert);
      }

      // Check for unusual file access patterns
      const fileAccessResult = await db.query(`
        SELECT user_id, COUNT(*) as access_count
        FROM security_events
        WHERE event_type = 'file_accessed'
        AND created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY user_id
        HAVING COUNT(*) >= 100
      `);

      for (const row of fileAccessResult.rows) {
        const pattern = {
          type: 'unusual_file_access',
          userId: row.user_id,
          count: parseInt(row.access_count),
          severity: 'medium' as const
        };
        patterns.push(pattern);

        const alert = await this.createAlert({
          eventId: uuidv4(),
          alertType: 'unusual_file_access',
          severity: 'medium',
          message: `Unusual file access pattern detected for user ${row.user_id} (${row.access_count} accesses in 1 hour)`,
          recipients: await this.getSecurityTeamEmails()
        });
        alerts.push(alert);
      }

      return { alerts, patterns };
    } catch (error) {
      console.error('Failed to detect suspicious patterns:', error);
      throw new Error('Failed to detect suspicious patterns');
    }
  }

  // Private helper methods

  private static async checkAndTriggerAlerts(eventId: string, event: SecurityEvent): Promise<void> {
    const threshold = this.ALERT_THRESHOLDS[event.eventType as keyof typeof this.ALERT_THRESHOLDS];
    if (!threshold) return;

    const db = DatabaseService.getInstance();
    
    // Check if threshold is exceeded
    const result = await db.query(`
      SELECT COUNT(*) as event_count
      FROM security_events
      WHERE event_type = $1
      AND created_at >= NOW() - INTERVAL '${threshold.window} seconds'
    `, [event.eventType]);

    const eventCount = parseInt(result.rows[0].event_count);
    
    if (eventCount >= threshold.count) {
      await this.createAlert({
        eventId,
        alertType: `threshold_exceeded_${event.eventType}`,
        severity: event.severity,
        message: `Security threshold exceeded: ${eventCount} ${event.eventType} events in ${threshold.window} seconds`,
        recipients: await this.getSecurityTeamEmails()
      });
    }
  }

  private static async escalateCriticalEvent(eventId: string, event: SecurityEvent): Promise<void> {
    await this.createAlert({
      eventId,
      alertType: 'critical_security_event',
      severity: 'critical',
      message: `CRITICAL SECURITY EVENT: ${event.eventType} - Immediate attention required`,
      recipients: await this.getAdminEmails()
    });

    // Log escalation
    await this.logEvent({
      eventType: 'security_event_escalated',
      severity: 'high',
      resourceType: 'security_event',
      resourceId: eventId,
      details: { originalEvent: event.eventType, escalationReason: 'Critical event auto-escalation' }
    });
  }

  private static async createAlert(alertData: Omit<SecurityAlert, 'id' | 'sentAt'>): Promise<SecurityAlert> {
    const alert: SecurityAlert = {
      id: uuidv4(),
      ...alertData,
      sentAt: new Date(),
      acknowledged: false
    };

    // In a real implementation, this would send emails/notifications
    console.log(`SECURITY ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    
    // Store alert in database (would need to create alerts table)
    // For now, just log it as a security event
    await this.logEvent({
      eventType: 'security_alert_created',
      severity: alert.severity,
      resourceType: 'security_alert',
      resourceId: alert.id,
      details: {
        alertType: alert.alertType,
        message: alert.message,
        recipients: alert.recipients
      }
    });

    return alert;
  }

  private static async getSecurityTeamEmails(): Promise<string[]> {
    // In a real implementation, this would query the database for security team members
    return [
      process.env.SECURITY_TEAM_EMAIL || 'security@cad-ai-platform.com',
      process.env.ADMIN_EMAIL || 'admin@cad-ai-platform.com'
    ];
  }

  private static async getAdminEmails(): Promise<string[]> {
    try {
      const db = DatabaseService.getInstance();
      const result = await db.query(`
        SELECT email FROM users WHERE role = 'admin' AND is_active = true
      `);
      
      const adminEmails = result.rows.map(row => row.email);
      return adminEmails.length > 0 ? adminEmails : [process.env.ADMIN_EMAIL || 'admin@cad-ai-platform.com'];
    } catch (error) {
      console.error('Failed to get admin emails:', error);
      return [process.env.ADMIN_EMAIL || 'admin@cad-ai-platform.com'];
    }
  }
}