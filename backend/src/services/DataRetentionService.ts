import { Pool } from 'pg';
import { BaseModel } from '../models/BaseModel.js';
import { AuditLogService, DataRetentionPolicy } from './AuditLogService.js';
import * as cron from 'node-cron';

export interface RetentionRule {
  id: string;
  name: string;
  description: string;
  tableName: string;
  dateColumn: string;
  retentionDays: number;
  archiveAfterDays?: number;
  conditions?: Record<string, any>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface RetentionJobResult {
  ruleId: string;
  ruleName: string;
  startTime: Date;
  endTime: Date;
  recordsProcessed: number;
  recordsArchived: number;
  recordsDeleted: number;
  errors: string[];
  success: boolean;
}

export class DataRetentionService extends BaseModel {
  private auditLogService: AuditLogService;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;

  constructor(private pool: Pool) {
    super();
    this.auditLogService = new AuditLogService(pool);
  }

  /**
   * Initialize the data retention service with default rules
   */
  async initialize(): Promise<void> {
    try {
      // Create retention rules table if it doesn't exist
      await this.createRetentionRulesTable();
      
      // Load default retention rules
      await this.loadDefaultRetentionRules();
      
      // Schedule retention jobs
      await this.scheduleRetentionJobs();
      
      console.log('Data retention service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize data retention service:', error);
      throw error;
    }
  }

  /**
   * Create a new retention rule
   */
  async createRetentionRule(rule: Omit<RetentionRule, 'id' | 'lastRun' | 'nextRun'>): Promise<RetentionRule> {
    try {
      const query = `
        INSERT INTO retention_rules (
          name, description, table_name, date_column, 
          retention_days, archive_after_days, conditions, enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        rule.name,
        rule.description,
        rule.tableName,
        rule.dateColumn,
        rule.retentionDays,
        rule.archiveAfterDays || null,
        JSON.stringify(rule.conditions || {}),
        rule.enabled
      ];

      const result = await this.query(query, values);
      const createdRule = this.mapRowToRetentionRule(result.rows[0]);

      // Schedule the job if enabled
      if (createdRule.enabled) {
        await this.scheduleRetentionJob(createdRule);
      }

      // Log the rule creation
      await this.auditLogService.logSystemAction(
        'retention_rule_created',
        'data_retention',
        createdRule.id,
        { rule: createdRule },
        'medium'
      );

      return createdRule;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Get all retention rules
   */
  async getRetentionRules(): Promise<RetentionRule[]> {
    try {
      const query = 'SELECT * FROM retention_rules ORDER BY name';
      const result = await this.query(query);
      
      return result.rows.map(row => this.mapRowToRetentionRule(row));
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Update a retention rule
   */
  async updateRetentionRule(id: string, updates: Partial<RetentionRule>): Promise<RetentionRule> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          const columnName = this.camelToSnake(key);
          setClause.push(`${columnName} = $${paramIndex}`);
          values.push(key === 'conditions' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        throw new Error('No valid updates provided');
      }

      const query = `
        UPDATE retention_rules 
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      values.push(id);
      const result = await this.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Retention rule not found');
      }

      const updatedRule = this.mapRowToRetentionRule(result.rows[0]);

      // Reschedule the job
      await this.rescheduleRetentionJob(updatedRule);

      // Log the rule update
      await this.auditLogService.logSystemAction(
        'retention_rule_updated',
        'data_retention',
        updatedRule.id,
        { updates, rule: updatedRule },
        'medium'
      );

      return updatedRule;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Delete a retention rule
   */
  async deleteRetentionRule(id: string): Promise<void> {
    try {
      // Unschedule the job first
      if (this.scheduledJobs.has(id)) {
        this.scheduledJobs.get(id)?.destroy();
        this.scheduledJobs.delete(id);
      }

      const query = 'DELETE FROM retention_rules WHERE id = $1 RETURNING *';
      const result = await this.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error('Retention rule not found');
      }

      // Log the rule deletion
      await this.auditLogService.logSystemAction(
        'retention_rule_deleted',
        'data_retention',
        id,
        { deletedRule: result.rows[0] },
        'medium'
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Execute a specific retention rule manually
   */
  async executeRetentionRule(ruleId: string): Promise<RetentionJobResult> {
    try {
      const rule = await this.getRetentionRuleById(ruleId);
      if (!rule) {
        throw new Error('Retention rule not found');
      }

      return await this.runRetentionJob(rule);
    } catch (error) {
      console.error(`Failed to execute retention rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Execute all enabled retention rules
   */
  async executeAllRetentionRules(): Promise<RetentionJobResult[]> {
    try {
      if (this.isRunning) {
        throw new Error('Retention jobs are already running');
      }

      this.isRunning = true;
      const rules = await this.getRetentionRules();
      const enabledRules = rules.filter(rule => rule.enabled);
      const results: RetentionJobResult[] = [];

      for (const rule of enabledRules) {
        try {
          const result = await this.runRetentionJob(rule);
          results.push(result);
        } catch (error) {
          console.error(`Failed to execute retention rule ${rule.id}:`, error);
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            startTime: new Date(),
            endTime: new Date(),
            recordsProcessed: 0,
            recordsArchived: 0,
            recordsDeleted: 0,
            errors: [error.message],
            success: false
          });
        }
      }

      this.isRunning = false;
      return results;
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Get retention job history
   */
  async getRetentionJobHistory(limit: number = 50): Promise<RetentionJobResult[]> {
    try {
      const query = `
        SELECT * FROM retention_job_history 
        ORDER BY start_time DESC 
        LIMIT $1
      `;

      const result = await this.query(query, [limit]);
      
      return result.rows.map(row => ({
        ruleId: row.rule_id,
        ruleName: row.rule_name,
        startTime: row.start_time,
        endTime: row.end_time,
        recordsProcessed: parseInt(row.records_processed),
        recordsArchived: parseInt(row.records_archived),
        recordsDeleted: parseInt(row.records_deleted),
        errors: row.errors || [],
        success: row.success
      }));
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Get data retention statistics
   */
  async getRetentionStatistics(): Promise<{
    totalRules: number;
    enabledRules: number;
    lastRunTime?: Date;
    totalRecordsProcessed: number;
    totalRecordsArchived: number;
    totalRecordsDeleted: number;
    upcomingJobs: Array<{ ruleId: string; ruleName: string; nextRun: Date }>;
  }> {
    try {
      const [rulesResult, historyResult] = await Promise.all([
        this.query('SELECT COUNT(*) as total, COUNT(CASE WHEN enabled THEN 1 END) as enabled FROM retention_rules'),
        this.query(`
          SELECT 
            MAX(end_time) as last_run_time,
            SUM(records_processed) as total_processed,
            SUM(records_archived) as total_archived,
            SUM(records_deleted) as total_deleted
          FROM retention_job_history
          WHERE start_time >= NOW() - INTERVAL '30 days'
        `)
      ]);

      const rules = await this.getRetentionRules();
      const upcomingJobs = rules
        .filter(rule => rule.enabled && rule.nextRun)
        .map(rule => ({
          ruleId: rule.id,
          ruleName: rule.name,
          nextRun: rule.nextRun!
        }))
        .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
        .slice(0, 10);

      return {
        totalRules: parseInt(rulesResult.rows[0].total),
        enabledRules: parseInt(rulesResult.rows[0].enabled),
        lastRunTime: historyResult.rows[0].last_run_time,
        totalRecordsProcessed: parseInt(historyResult.rows[0].total_processed) || 0,
        totalRecordsArchived: parseInt(historyResult.rows[0].total_archived) || 0,
        totalRecordsDeleted: parseInt(historyResult.rows[0].total_deleted) || 0,
        upcomingJobs
      };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Create the retention rules table
   */
  private async createRetentionRulesTable(): Promise<void> {
    const createRulesTableQuery = `
      CREATE TABLE IF NOT EXISTS retention_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        table_name VARCHAR(255) NOT NULL,
        date_column VARCHAR(255) NOT NULL,
        retention_days INTEGER NOT NULL,
        archive_after_days INTEGER,
        conditions JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_run TIMESTAMP,
        next_run TIMESTAMP
      )
    `;

    const createHistoryTableQuery = `
      CREATE TABLE IF NOT EXISTS retention_job_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id UUID REFERENCES retention_rules(id) ON DELETE CASCADE,
        rule_name VARCHAR(255) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        records_processed INTEGER DEFAULT 0,
        records_archived INTEGER DEFAULT 0,
        records_deleted INTEGER DEFAULT 0,
        errors TEXT[],
        success BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await this.query(createRulesTableQuery);
    await this.query(createHistoryTableQuery);
  }

  /**
   * Load default retention rules
   */
  private async loadDefaultRetentionRules(): Promise<void> {
    const defaultRules: Omit<RetentionRule, 'id' | 'lastRun' | 'nextRun'>[] = [
      {
        name: 'Audit Logs Retention',
        description: 'Archive audit logs after 90 days, delete after 365 days',
        tableName: 'audit_logs',
        dateColumn: 'timestamp',
        retentionDays: 365,
        archiveAfterDays: 90,
        enabled: true
      },
      {
        name: 'Search Query Logs Retention',
        description: 'Delete search query logs after 180 days',
        tableName: 'search_queries',
        dateColumn: 'timestamp',
        retentionDays: 180,
        enabled: true
      },
      {
        name: 'User Activity Logs Retention',
        description: 'Archive user activity logs after 30 days, delete after 90 days',
        tableName: 'user_activities',
        dateColumn: 'timestamp',
        retentionDays: 90,
        archiveAfterDays: 30,
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      try {
        // Check if rule already exists
        const existingRule = await this.query(
          'SELECT id FROM retention_rules WHERE name = $1',
          [rule.name]
        );

        if (existingRule.rows.length === 0) {
          await this.createRetentionRule(rule);
        }
      } catch (error) {
        console.error(`Failed to create default retention rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Schedule all retention jobs
   */
  private async scheduleRetentionJobs(): Promise<void> {
    const rules = await this.getRetentionRules();
    const enabledRules = rules.filter(rule => rule.enabled);

    for (const rule of enabledRules) {
      await this.scheduleRetentionJob(rule);
    }
  }

  /**
   * Schedule a single retention job
   */
  private async scheduleRetentionJob(rule: RetentionRule): Promise<void> {
    try {
      // Unschedule existing job if it exists
      if (this.scheduledJobs.has(rule.id)) {
        this.scheduledJobs.get(rule.id)?.destroy();
      }

      // Schedule to run daily at 2 AM
      const task = cron.schedule('0 2 * * *', async () => {
        try {
          console.log(`Running retention job for rule: ${rule.name}`);
          await this.runRetentionJob(rule);
        } catch (error) {
          console.error(`Retention job failed for rule ${rule.name}:`, error);
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.scheduledJobs.set(rule.id, task);

      // Update next run time
      const nextRun = new Date();
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(2, 0, 0, 0);

      await this.query(
        'UPDATE retention_rules SET next_run = $1 WHERE id = $2',
        [nextRun, rule.id]
      );

      console.log(`Scheduled retention job for rule: ${rule.name}`);
    } catch (error) {
      console.error(`Failed to schedule retention job for rule ${rule.name}:`, error);
    }
  }

  /**
   * Reschedule a retention job
   */
  private async rescheduleRetentionJob(rule: RetentionRule): Promise<void> {
    // Unschedule existing job
    if (this.scheduledJobs.has(rule.id)) {
      this.scheduledJobs.get(rule.id)?.destroy();
      this.scheduledJobs.delete(rule.id);
    }

    // Schedule new job if enabled
    if (rule.enabled) {
      await this.scheduleRetentionJob(rule);
    }
  }

  /**
   * Run a retention job for a specific rule
   */
  private async runRetentionJob(rule: RetentionRule): Promise<RetentionJobResult> {
    const startTime = new Date();
    const result: RetentionJobResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      startTime,
      endTime: startTime,
      recordsProcessed: 0,
      recordsArchived: 0,
      recordsDeleted: 0,
      errors: [],
      success: false
    };

    try {
      // Build conditions
      let whereClause = `WHERE ${rule.dateColumn} < NOW() - INTERVAL '${rule.retentionDays} days'`;
      const conditionValues: any[] = [];

      if (rule.conditions && Object.keys(rule.conditions).length > 0) {
        Object.entries(rule.conditions).forEach(([key, value], index) => {
          whereClause += ` AND ${key} = $${index + 1}`;
          conditionValues.push(value);
        });
      }

      // Archive records if archival is configured
      if (rule.archiveAfterDays) {
        const archiveWhereClause = whereClause.replace(
          `'${rule.retentionDays} days'`,
          `'${rule.archiveAfterDays} days'`
        );

        const archiveQuery = `
          UPDATE ${rule.tableName} 
          SET archived = true, archived_at = NOW()
          ${archiveWhereClause}
          AND (archived IS NULL OR archived = false)
        `;

        const archiveResult = await this.query(archiveQuery, conditionValues);
        result.recordsArchived = archiveResult.rowCount || 0;
      }

      // Delete old records
      const deleteQuery = `DELETE FROM ${rule.tableName} ${whereClause}`;
      const deleteResult = await this.query(deleteQuery, conditionValues);
      result.recordsDeleted = deleteResult.rowCount || 0;

      result.recordsProcessed = result.recordsArchived + result.recordsDeleted;
      result.success = true;
      result.endTime = new Date();

      // Update last run time
      await this.query(
        'UPDATE retention_rules SET last_run = $1 WHERE id = $2',
        [result.endTime, rule.id]
      );

      // Log the job execution
      await this.auditLogService.logSystemAction(
        'retention_job_executed',
        'data_retention',
        rule.id,
        {
          rule: rule.name,
          recordsProcessed: result.recordsProcessed,
          recordsArchived: result.recordsArchived,
          recordsDeleted: result.recordsDeleted,
          duration: result.endTime.getTime() - result.startTime.getTime()
        },
        'medium'
      );

    } catch (error) {
      result.errors.push(error.message);
      result.endTime = new Date();
      console.error(`Retention job failed for rule ${rule.name}:`, error);
    }

    // Save job history
    await this.saveJobHistory(result);

    return result;
  }

  /**
   * Save job execution history
   */
  private async saveJobHistory(result: RetentionJobResult): Promise<void> {
    try {
      const query = `
        INSERT INTO retention_job_history (
          rule_id, rule_name, start_time, end_time,
          records_processed, records_archived, records_deleted,
          errors, success
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        result.ruleId,
        result.ruleName,
        result.startTime,
        result.endTime,
        result.recordsProcessed,
        result.recordsArchived,
        result.recordsDeleted,
        result.errors,
        result.success
      ];

      await this.query(query, values);
    } catch (error) {
      console.error('Failed to save job history:', error);
    }
  }

  /**
   * Get retention rule by ID
   */
  private async getRetentionRuleById(id: string): Promise<RetentionRule | null> {
    try {
      const query = 'SELECT * FROM retention_rules WHERE id = $1';
      const result = await this.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToRetentionRule(result.rows[0]);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  /**
   * Map database row to RetentionRule object
   */
  private mapRowToRetentionRule(row: any): RetentionRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tableName: row.table_name,
      dateColumn: row.date_column,
      retentionDays: row.retention_days,
      archiveAfterDays: row.archive_after_days,
      conditions: row.conditions || {},
      enabled: row.enabled,
      lastRun: row.last_run,
      nextRun: row.next_run
    };
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Shutdown the service and cleanup scheduled jobs
   */
  shutdown(): void {
    console.log('Shutting down data retention service...');
    
    this.scheduledJobs.forEach((task, ruleId) => {
      task.destroy();
      console.log(`Unscheduled retention job for rule: ${ruleId}`);
    });
    
    this.scheduledJobs.clear();
    console.log('Data retention service shutdown complete');
  }
}