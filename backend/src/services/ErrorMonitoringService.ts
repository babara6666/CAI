import { logger } from '../utils/logger';
import { DatabaseService } from '../database/DatabaseService';

export interface ErrorEvent {
  id: string;
  timestamp: Date;
  level: 'error' | 'warning' | 'critical';
  category: string;
  message: string;
  stack?: string;
  context: {
    userId?: string;
    requestId?: string;
    operation?: string;
    userAgent?: string;
    ip?: string;
    url?: string;
    method?: string;
    statusCode?: number;
    responseTime?: number;
  };
  metadata?: any;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  tags: string[];
}

export interface ErrorPattern {
  id: string;
  pattern: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<string, number>;
  errorsByLevel: Record<string, number>;
  errorRate: number;
  averageResponseTime: number;
  topErrors: Array<{ message: string; count: number }>;
  errorTrends: Array<{ timestamp: Date; count: number }>;
}

export class ErrorMonitoringService {
  private static instance: ErrorMonitoringService;
  private errorBuffer: ErrorEvent[] = [];
  private bufferSize = 1000;
  private flushInterval = 30000; // 30 seconds
  private patterns: Map<string, ErrorPattern> = new Map();
  private alertThresholds = {
    errorRate: 10, // errors per minute
    criticalErrors: 1, // immediate alert
    patternOccurrences: 5 // alert when pattern occurs 5 times
  };

  public static getInstance(): ErrorMonitoringService {
    if (!ErrorMonitoringService.instance) {
      ErrorMonitoringService.instance = new ErrorMonitoringService();
    }
    return ErrorMonitoringService.instance;
  }

  constructor() {
    this.startPeriodicFlush();
    this.initializeErrorPatterns();
  }

  private startPeriodicFlush(): void {
    setInterval(() => {
      this.flushErrorBuffer();
    }, this.flushInterval);
  }

  private initializeErrorPatterns(): void {
    // Common error patterns to monitor
    const commonPatterns = [
      {
        pattern: /database.*connection.*failed/i,
        category: 'database',
        severity: 'critical' as const,
        description: 'Database connection failures'
      },
      {
        pattern: /timeout.*exceeded/i,
        category: 'performance',
        severity: 'high' as const,
        description: 'Request timeout errors'
      },
      {
        pattern: /out of memory/i,
        category: 'system',
        severity: 'critical' as const,
        description: 'Memory exhaustion errors'
      },
      {
        pattern: /authentication.*failed/i,
        category: 'security',
        severity: 'medium' as const,
        description: 'Authentication failures'
      },
      {
        pattern: /file.*not.*found/i,
        category: 'storage',
        severity: 'medium' as const,
        description: 'File not found errors'
      },
      {
        pattern: /ai.*service.*unavailable/i,
        category: 'ai-service',
        severity: 'high' as const,
        description: 'AI service unavailability'
      }
    ];

    commonPatterns.forEach(({ pattern, category, severity, description }) => {
      const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.patterns.set(id, {
        id,
        pattern: pattern.source,
        category,
        severity,
        description,
        occurrences: 0,
        firstSeen: new Date(),
        lastSeen: new Date(),
        isActive: true
      });
    });
  }

  public captureError(
    error: Error,
    level: 'error' | 'warning' | 'critical' = 'error',
    context: Partial<ErrorEvent['context']> = {},
    metadata?: any
  ): string {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorEvent: ErrorEvent = {
      id: errorId,
      timestamp: new Date(),
      level,
      category: this.categorizeError(error),
      message: error.message,
      stack: error.stack,
      context: {
        userId: context.userId,
        requestId: context.requestId,
        operation: context.operation,
        userAgent: context.userAgent,
        ip: context.ip,
        url: context.url,
        method: context.method,
        statusCode: context.statusCode,
        responseTime: context.responseTime
      },
      metadata,
      resolved: false,
      tags: this.generateTags(error, context)
    };

    // Add to buffer
    this.errorBuffer.push(errorEvent);

    // Maintain buffer size
    if (this.errorBuffer.length > this.bufferSize) {
      this.errorBuffer.shift();
    }

    // Check for patterns
    this.checkErrorPatterns(errorEvent);

    // Check for immediate alerts
    this.checkAlertConditions(errorEvent);

    // Log the error
    logger.error('Error captured by monitoring service', {
      errorId,
      level,
      category: errorEvent.category,
      message: error.message,
      context,
      metadata
    });

    return errorId;
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('database') || message.includes('connection')) {
      return 'database';
    }
    if (message.includes('timeout') || message.includes('slow')) {
      return 'performance';
    }
    if (message.includes('memory') || message.includes('heap')) {
      return 'system';
    }
    if (message.includes('auth') || message.includes('permission')) {
      return 'security';
    }
    if (message.includes('file') || message.includes('storage')) {
      return 'storage';
    }
    if (message.includes('ai') || message.includes('model')) {
      return 'ai-service';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }

    return 'general';
  }

  private generateTags(error: Error, context: Partial<ErrorEvent['context']>): string[] {
    const tags: string[] = [];

    // Add error type tags
    if (error.name) {
      tags.push(`error-type:${error.name.toLowerCase()}`);
    }

    // Add context tags
    if (context.method) {
      tags.push(`method:${context.method.toLowerCase()}`);
    }
    if (context.statusCode) {
      tags.push(`status:${context.statusCode}`);
    }
    if (context.operation) {
      tags.push(`operation:${context.operation}`);
    }

    // Add severity tags based on error characteristics
    if (error.message.includes('critical') || error.message.includes('fatal')) {
      tags.push('severity:critical');
    } else if (error.message.includes('warning') || error.message.includes('warn')) {
      tags.push('severity:warning');
    } else {
      tags.push('severity:error');
    }

    return tags;
  }

  private checkErrorPatterns(errorEvent: ErrorEvent): void {
    for (const [patternId, pattern] of this.patterns) {
      if (!pattern.isActive) continue;

      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(errorEvent.message)) {
        pattern.occurrences++;
        pattern.lastSeen = errorEvent.timestamp;

        logger.info('Error pattern detected', {
          patternId,
          pattern: pattern.description,
          occurrences: pattern.occurrences,
          errorId: errorEvent.id
        });

        // Check if pattern threshold is reached
        if (pattern.occurrences >= this.alertThresholds.patternOccurrences) {
          this.sendPatternAlert(pattern, errorEvent);
        }
      }
    }
  }

  private checkAlertConditions(errorEvent: ErrorEvent): void {
    // Immediate alert for critical errors
    if (errorEvent.level === 'critical') {
      this.sendImmediateAlert(errorEvent);
    }

    // Check error rate
    const recentErrors = this.getRecentErrors(60000); // Last minute
    if (recentErrors.length >= this.alertThresholds.errorRate) {
      this.sendErrorRateAlert(recentErrors);
    }
  }

  private async sendImmediateAlert(errorEvent: ErrorEvent): Promise<void> {
    logger.error('CRITICAL ERROR ALERT', {
      errorId: errorEvent.id,
      message: errorEvent.message,
      context: errorEvent.context,
      timestamp: errorEvent.timestamp
    });

    // In a real implementation, you would send this to:
    // - Slack/Teams webhook
    // - PagerDuty
    // - Email notifications
    // - SMS alerts
    
    await this.notifyAlertChannels({
      type: 'critical-error',
      title: 'Critical Error Detected',
      message: `Critical error occurred: ${errorEvent.message}`,
      errorId: errorEvent.id,
      context: errorEvent.context,
      timestamp: errorEvent.timestamp
    });
  }

  private async sendPatternAlert(pattern: ErrorPattern, errorEvent: ErrorEvent): Promise<void> {
    logger.warn('ERROR PATTERN ALERT', {
      patternId: pattern.id,
      description: pattern.description,
      occurrences: pattern.occurrences,
      severity: pattern.severity,
      latestError: errorEvent.id
    });

    await this.notifyAlertChannels({
      type: 'error-pattern',
      title: 'Error Pattern Detected',
      message: `Pattern "${pattern.description}" has occurred ${pattern.occurrences} times`,
      patternId: pattern.id,
      severity: pattern.severity,
      occurrences: pattern.occurrences
    });
  }

  private async sendErrorRateAlert(recentErrors: ErrorEvent[]): Promise<void> {
    logger.warn('ERROR RATE ALERT', {
      errorCount: recentErrors.length,
      timeWindow: '1 minute',
      threshold: this.alertThresholds.errorRate
    });

    await this.notifyAlertChannels({
      type: 'error-rate',
      title: 'High Error Rate Detected',
      message: `${recentErrors.length} errors in the last minute (threshold: ${this.alertThresholds.errorRate})`,
      errorCount: recentErrors.length,
      timeWindow: '1 minute'
    });
  }

  private async notifyAlertChannels(alert: any): Promise<void> {
    try {
      // Example: Send to Slack webhook
      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 ${alert.title}`,
            attachments: [{
              color: alert.type === 'critical-error' ? 'danger' : 'warning',
              fields: [
                { title: 'Message', value: alert.message, short: false },
                { title: 'Time', value: new Date().toISOString(), short: true },
                { title: 'Environment', value: process.env.NODE_ENV, short: true }
              ]
            }]
          })
        });
      }

      // Example: Send email notification
      if (process.env.ALERT_EMAIL) {
        // Implementation would depend on your email service
        logger.info('Email alert would be sent', { alert });
      }

      // Example: Send to monitoring service
      if (process.env.MONITORING_SERVICE_URL) {
        await fetch(process.env.MONITORING_SERVICE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert)
        });
      }
    } catch (notificationError) {
      logger.error('Failed to send alert notification', {
        error: (notificationError as Error).message,
        alert
      });
    }
  }

  private getRecentErrors(timeWindowMs: number): ErrorEvent[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.errorBuffer.filter(error => error.timestamp >= cutoff);
  }

  private async flushErrorBuffer(): Promise<void> {
    if (this.errorBuffer.length === 0) return;

    try {
      // In a real implementation, you would persist errors to database
      logger.info('Flushing error buffer', {
        errorCount: this.errorBuffer.length
      });

      // Example: Save to database
      // await this.saveErrorsToDatabase(this.errorBuffer);

      // Clear buffer after successful flush
      this.errorBuffer = [];
    } catch (error) {
      logger.error('Failed to flush error buffer', {
        error: (error as Error).message,
        bufferSize: this.errorBuffer.length
      });
    }
  }

  public async getErrorMetrics(timeRange: { start: Date; end: Date }): Promise<ErrorMetrics> {
    const errors = this.errorBuffer.filter(
      error => error.timestamp >= timeRange.start && error.timestamp <= timeRange.end
    );

    const errorsByCategory: Record<string, number> = {};
    const errorsByLevel: Record<string, number> = {};
    const errorMessages: Record<string, number> = {};

    errors.forEach(error => {
      // Count by category
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      
      // Count by level
      errorsByLevel[error.level] = (errorsByLevel[error.level] || 0) + 1;
      
      // Count by message
      errorMessages[error.message] = (errorMessages[error.message] || 0) + 1;
    });

    const topErrors = Object.entries(errorMessages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const timeRangeMs = timeRange.end.getTime() - timeRange.start.getTime();
    const errorRate = (errors.length / (timeRangeMs / 60000)); // errors per minute

    const averageResponseTime = errors
      .filter(error => error.context.responseTime)
      .reduce((sum, error) => sum + (error.context.responseTime || 0), 0) / errors.length || 0;

    // Generate error trends (hourly buckets)
    const errorTrends: Array<{ timestamp: Date; count: number }> = [];
    const hourMs = 60 * 60 * 1000;
    const startHour = Math.floor(timeRange.start.getTime() / hourMs) * hourMs;
    const endHour = Math.floor(timeRange.end.getTime() / hourMs) * hourMs;

    for (let hour = startHour; hour <= endHour; hour += hourMs) {
      const hourStart = new Date(hour);
      const hourEnd = new Date(hour + hourMs);
      const hourErrors = errors.filter(
        error => error.timestamp >= hourStart && error.timestamp < hourEnd
      );
      
      errorTrends.push({
        timestamp: hourStart,
        count: hourErrors.length
      });
    }

    return {
      totalErrors: errors.length,
      errorsByCategory,
      errorsByLevel,
      errorRate,
      averageResponseTime,
      topErrors,
      errorTrends
    };
  }

  public getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.patterns.values());
  }

  public resolveError(errorId: string, resolvedBy: string): boolean {
    const error = this.errorBuffer.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date();
      error.resolvedBy = resolvedBy;
      
      logger.info('Error resolved', {
        errorId,
        resolvedBy,
        resolvedAt: error.resolvedAt
      });
      
      return true;
    }
    return false;
  }

  public updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    
    logger.info('Alert thresholds updated', {
      newThresholds: this.alertThresholds
    });
  }

  public getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: {
      recentErrorCount: number;
      errorRate: number;
      criticalErrors: number;
      activePatterns: number;
    };
  } {
    const recentErrors = this.getRecentErrors(300000); // Last 5 minutes
    const criticalErrors = recentErrors.filter(e => e.level === 'critical').length;
    const errorRate = recentErrors.length / 5; // errors per minute
    const activePatterns = Array.from(this.patterns.values()).filter(p => p.isActive).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (criticalErrors > 0 || errorRate > this.alertThresholds.errorRate) {
      status = 'critical';
    } else if (errorRate > this.alertThresholds.errorRate / 2) {
      status = 'warning';
    }

    return {
      status,
      metrics: {
        recentErrorCount: recentErrors.length,
        errorRate,
        criticalErrors,
        activePatterns
      }
    };
  }
}

// Export singleton instance
export const errorMonitoringService = ErrorMonitoringService.getInstance();