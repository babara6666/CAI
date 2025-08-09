import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DataRetentionService, RetentionRule } from '../DataRetentionService.js';
import { AuditLogService } from '../AuditLogService.js';
import * as cron from 'node-cron';

// Mock dependencies
vi.mock('../AuditLogService.js');
vi.mock('node-cron');

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery
} as unknown as Pool;

const mockAuditLogService = {
  logSystemAction: vi.fn()
};

const mockCronTask = {
  destroy: vi.fn()
};

const mockCronSchedule = vi.fn().mockReturnValue(mockCronTask);

describe('DataRetentionService', () => {
  let retentionService: DataRetentionService;

  beforeEach(() => {
    retentionService = new DataRetentionService(mockPool);
    // Replace the audit log service with our mock
    (retentionService as any).auditLogService = mockAuditLogService;
    
    mockQuery.mockClear();
    mockAuditLogService.logSystemAction.mockClear();
    mockCronSchedule.mockClear();
    mockCronTask.destroy.mockClear();
    
    // Mock cron.schedule
    vi.mocked(cron.schedule).mockImplementation(mockCronSchedule);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with default retention rules', async () => {
      // Mock table creation and rule loading
      mockQuery
        .mockResolvedValueOnce({}) // create retention_rules table
        .mockResolvedValueOnce({}) // create retention_job_history table
        .mockResolvedValueOnce({ rows: [] }) // check existing rules
        .mockResolvedValueOnce({ rows: [{ id: 'rule-1' }] }) // create rule 1
        .mockResolvedValueOnce({ rows: [] }) // check existing rules
        .mockResolvedValueOnce({ rows: [{ id: 'rule-2' }] }) // create rule 2
        .mockResolvedValueOnce({ rows: [] }) // check existing rules
        .mockResolvedValueOnce({ rows: [{ id: 'rule-3' }] }) // create rule 3
        .mockResolvedValueOnce({ rows: [] }) // get retention rules for scheduling
        .mockResolvedValueOnce({}); // update next_run

      await retentionService.initialize();

      // Should create tables
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS retention_rules')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS retention_job_history')
      );

      // Should create default rules
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO retention_rules'),
        expect.arrayContaining(['Audit Logs Retention'])
      );
    });

    it('should not create duplicate default rules', async () => {
      // Mock existing rule
      mockQuery
        .mockResolvedValueOnce({}) // create tables
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'existing-rule' }] }) // rule exists
        .mockResolvedValueOnce({ rows: [] }) // other rules don't exist
        .mockResolvedValueOnce({ rows: [{ id: 'rule-2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'rule-3' }] })
        .mockResolvedValueOnce({ rows: [] }); // get rules for scheduling

      await retentionService.initialize();

      // Should only create non-existing rules
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO retention_rules'),
        expect.arrayContaining(['Audit Logs Retention'])
      );
    });
  });

  describe('createRetentionRule', () => {
    it('should create a new retention rule', async () => {
      const ruleData = {
        name: 'Test Rule',
        description: 'Test retention rule',
        tableName: 'test_table',
        dateColumn: 'created_at',
        retentionDays: 30,
        enabled: true
      };

      const mockCreatedRule = {
        id: 'rule-123',
        name: 'Test Rule',
        description: 'Test retention rule',
        table_name: 'test_table',
        date_column: 'created_at',
        retention_days: 30,
        archive_after_days: null,
        conditions: '{}',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreatedRule] }) // create rule
        .mockResolvedValueOnce({}); // update next_run for scheduling

      const result = await retentionService.createRetentionRule(ruleData);

      expect(result.id).toBe('rule-123');
      expect(result.name).toBe('Test Rule');
      expect(result.tableName).toBe('test_table');
      expect(result.retentionDays).toBe(30);

      // Should log the rule creation
      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'retention_rule_created',
        'data_retention',
        'rule-123',
        expect.objectContaining({ rule: result }),
        'medium'
      );

      // Should schedule the job if enabled
      expect(mockCronSchedule).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function),
        expect.objectContaining({ scheduled: true, timezone: 'UTC' })
      );
    });

    it('should validate required fields', async () => {
      const invalidRuleData = {
        description: 'Missing required fields',
        tableName: 'test_table',
        dateColumn: 'created_at',
        retentionDays: 30,
        enabled: true
      } as any;

      await expect(
        retentionService.createRetentionRule(invalidRuleData)
      ).rejects.toThrow();
    });
  });

  describe('getRetentionRules', () => {
    it('should return all retention rules', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          name: 'Rule 1',
          description: 'First rule',
          table_name: 'table1',
          date_column: 'created_at',
          retention_days: 30,
          archive_after_days: null,
          conditions: '{}',
          enabled: true,
          last_run: null,
          next_run: null
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          description: 'Second rule',
          table_name: 'table2',
          date_column: 'updated_at',
          retention_days: 60,
          archive_after_days: 30,
          conditions: '{"status": "inactive"}',
          enabled: false,
          last_run: new Date(),
          next_run: new Date()
        }
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRules });

      const result = await retentionService.getRetentionRules();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rule-1');
      expect(result[0].tableName).toBe('table1');
      expect(result[1].conditions).toEqual({ status: 'inactive' });
    });
  });

  describe('updateRetentionRule', () => {
    it('should update a retention rule', async () => {
      const updates = {
        name: 'Updated Rule',
        retentionDays: 45,
        enabled: false
      };

      const mockUpdatedRule = {
        id: 'rule-123',
        name: 'Updated Rule',
        description: 'Test rule',
        table_name: 'test_table',
        date_column: 'created_at',
        retention_days: 45,
        archive_after_days: null,
        conditions: '{}',
        enabled: false,
        updated_at: new Date()
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedRule] });

      const result = await retentionService.updateRetentionRule('rule-123', updates);

      expect(result.name).toBe('Updated Rule');
      expect(result.retentionDays).toBe(45);
      expect(result.enabled).toBe(false);

      // Should log the update
      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'retention_rule_updated',
        'data_retention',
        'rule-123',
        expect.objectContaining({ updates }),
        'medium'
      );
    });

    it('should handle rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        retentionService.updateRetentionRule('nonexistent', { name: 'New Name' })
      ).rejects.toThrow('Retention rule not found');
    });

    it('should handle no valid updates', async () => {
      await expect(
        retentionService.updateRetentionRule('rule-123', {})
      ).rejects.toThrow('No valid updates provided');
    });
  });

  describe('deleteRetentionRule', () => {
    it('should delete a retention rule and unschedule job', async () => {
      const mockDeletedRule = {
        id: 'rule-123',
        name: 'Deleted Rule'
      };

      // Set up scheduled job
      (retentionService as any).scheduledJobs.set('rule-123', mockCronTask);

      mockQuery.mockResolvedValueOnce({ rows: [mockDeletedRule] });

      await retentionService.deleteRetentionRule('rule-123');

      // Should unschedule the job
      expect(mockCronTask.destroy).toHaveBeenCalled();

      // Should delete from database
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM retention_rules WHERE id = $1 RETURNING *',
        ['rule-123']
      );

      // Should log the deletion
      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'retention_rule_deleted',
        'data_retention',
        'rule-123',
        expect.objectContaining({ deletedRule: mockDeletedRule }),
        'medium'
      );
    });

    it('should handle rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        retentionService.deleteRetentionRule('nonexistent')
      ).rejects.toThrow('Retention rule not found');
    });
  });

  describe('executeRetentionRule', () => {
    it('should execute a specific retention rule', async () => {
      const mockRule = {
        id: 'rule-123',
        name: 'Test Rule',
        tableName: 'test_table',
        dateColumn: 'created_at',
        retentionDays: 30,
        enabled: true
      };

      // Mock getting the rule
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRule] }) // get rule
        .mockResolvedValueOnce({ rowCount: 10 }) // delete operation
        .mockResolvedValueOnce({}) // update last_run
        .mockResolvedValueOnce({}); // save job history

      const result = await retentionService.executeRetentionRule('rule-123');

      expect(result.ruleId).toBe('rule-123');
      expect(result.ruleName).toBe('Test Rule');
      expect(result.recordsDeleted).toBe(10);
      expect(result.success).toBe(true);

      // Should log the execution
      expect(mockAuditLogService.logSystemAction).toHaveBeenCalledWith(
        'retention_job_executed',
        'data_retention',
        'rule-123',
        expect.objectContaining({
          rule: 'Test Rule',
          recordsDeleted: 10
        }),
        'medium'
      );
    });

    it('should handle rule with archival', async () => {
      const mockRule = {
        id: 'rule-123',
        name: 'Test Rule',
        tableName: 'test_table',
        dateColumn: 'created_at',
        retentionDays: 60,
        archiveAfterDays: 30,
        enabled: true
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockRule] }) // get rule
        .mockResolvedValueOnce({ rowCount: 5 }) // archive operation
        .mockResolvedValueOnce({ rowCount: 3 }) // delete operation
        .mockResolvedValueOnce({}) // update last_run
        .mockResolvedValueOnce({}); // save job history

      const result = await retentionService.executeRetentionRule('rule-123');

      expect(result.recordsArchived).toBe(5);
      expect(result.recordsDeleted).toBe(3);
      expect(result.recordsProcessed).toBe(8);
    });

    it('should handle execution errors', async () => {
      const mockRule = {
        id: 'rule-123',
        name: 'Test Rule',
        tableName: 'test_table',
        dateColumn: 'created_at',
        retentionDays: 30,
        enabled: true
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockRule] }) // get rule
        .mockRejectedValueOnce(new Error('Database error')) // delete fails
        .mockResolvedValueOnce({}); // save job history

      const result = await retentionService.executeRetentionRule('rule-123');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database error');
    });
  });

  describe('executeAllRetentionRules', () => {
    it('should execute all enabled retention rules', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          name: 'Rule 1',
          tableName: 'table1',
          dateColumn: 'created_at',
          retentionDays: 30,
          enabled: true
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          tableName: 'table2',
          dateColumn: 'created_at',
          retentionDays: 60,
          enabled: false // disabled
        },
        {
          id: 'rule-3',
          name: 'Rule 3',
          tableName: 'table3',
          dateColumn: 'created_at',
          retentionDays: 90,
          enabled: true
        }
      ];

      // Mock getting rules
      mockQuery
        .mockResolvedValueOnce({ rows: mockRules }) // get all rules
        .mockResolvedValueOnce({ rowCount: 5 }) // rule 1 delete
        .mockResolvedValueOnce({}) // rule 1 update last_run
        .mockResolvedValueOnce({}) // rule 1 save history
        .mockResolvedValueOnce({ rowCount: 8 }) // rule 3 delete
        .mockResolvedValueOnce({}) // rule 3 update last_run
        .mockResolvedValueOnce({}); // rule 3 save history

      const results = await retentionService.executeAllRetentionRules();

      expect(results).toHaveLength(2); // only enabled rules
      expect(results[0].ruleId).toBe('rule-1');
      expect(results[1].ruleId).toBe('rule-3');
      expect(results[0].recordsDeleted).toBe(5);
      expect(results[1].recordsDeleted).toBe(8);
    });

    it('should handle concurrent execution prevention', async () => {
      // Set service as running
      (retentionService as any).isRunning = true;

      await expect(
        retentionService.executeAllRetentionRules()
      ).rejects.toThrow('Retention jobs are already running');
    });

    it('should handle individual rule failures', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          name: 'Rule 1',
          tableName: 'table1',
          dateColumn: 'created_at',
          retentionDays: 30,
          enabled: true
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockRules }) // get rules
        .mockRejectedValueOnce(new Error('Execution failed')) // rule fails
        .mockResolvedValueOnce({}); // save history

      const results = await retentionService.executeAllRetentionRules();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].errors).toContain('Execution failed');
    });
  });

  describe('getRetentionJobHistory', () => {
    it('should return job execution history', async () => {
      const mockHistory = [
        {
          rule_id: 'rule-1',
          rule_name: 'Rule 1',
          start_time: new Date('2024-01-15T02:00:00Z'),
          end_time: new Date('2024-01-15T02:05:00Z'),
          records_processed: '100',
          records_archived: '50',
          records_deleted: '50',
          errors: [],
          success: true
        },
        {
          rule_id: 'rule-2',
          rule_name: 'Rule 2',
          start_time: new Date('2024-01-14T02:00:00Z'),
          end_time: new Date('2024-01-14T02:02:00Z'),
          records_processed: '25',
          records_archived: '0',
          records_deleted: '25',
          errors: ['Minor warning'],
          success: true
        }
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockHistory });

      const result = await retentionService.getRetentionJobHistory(10);

      expect(result).toHaveLength(2);
      expect(result[0].ruleId).toBe('rule-1');
      expect(result[0].recordsProcessed).toBe(100);
      expect(result[0].success).toBe(true);
      expect(result[1].errors).toContain('Minor warning');
    });
  });

  describe('getRetentionStatistics', () => {
    it('should return comprehensive retention statistics', async () => {
      const mockRules = [
        { id: 'rule-1', name: 'Rule 1', enabled: true, next_run: new Date() },
        { id: 'rule-2', name: 'Rule 2', enabled: false, next_run: null }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '2', enabled: '1' }] }) // rules count
        .mockResolvedValueOnce({ 
          rows: [{ 
            last_run_time: new Date(),
            total_processed: '1000',
            total_archived: '500',
            total_deleted: '500'
          }] 
        }) // history stats
        .mockResolvedValueOnce({ rows: mockRules }); // rules for upcoming jobs

      const result = await retentionService.getRetentionStatistics();

      expect(result.totalRules).toBe(2);
      expect(result.enabledRules).toBe(1);
      expect(result.totalRecordsProcessed).toBe(1000);
      expect(result.totalRecordsArchived).toBe(500);
      expect(result.totalRecordsDeleted).toBe(500);
      expect(result.upcomingJobs).toHaveLength(1);
      expect(result.upcomingJobs[0].ruleId).toBe('rule-1');
    });
  });

  describe('shutdown', () => {
    it('should cleanup scheduled jobs on shutdown', () => {
      // Set up some scheduled jobs
      (retentionService as any).scheduledJobs.set('rule-1', mockCronTask);
      (retentionService as any).scheduledJobs.set('rule-2', mockCronTask);

      retentionService.shutdown();

      expect(mockCronTask.destroy).toHaveBeenCalledTimes(2);
      expect((retentionService as any).scheduledJobs.size).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should convert camelCase to snake_case', () => {
      const camelToSnake = (retentionService as any).camelToSnake;
      
      expect(camelToSnake('retentionDays')).toBe('retention_days');
      expect(camelToSnake('archiveAfterDays')).toBe('archive_after_days');
      expect(camelToSnake('tableName')).toBe('table_name');
    });

    it('should map database row to RetentionRule object', () => {
      const mockRow = {
        id: 'rule-123',
        name: 'Test Rule',
        description: 'Test description',
        table_name: 'test_table',
        date_column: 'created_at',
        retention_days: 30,
        archive_after_days: 15,
        conditions: '{"status": "inactive"}',
        enabled: true,
        last_run: new Date(),
        next_run: new Date()
      };

      const mapRowToRetentionRule = (retentionService as any).mapRowToRetentionRule;
      const result = mapRowToRetentionRule(mockRow);

      expect(result.id).toBe('rule-123');
      expect(result.tableName).toBe('test_table');
      expect(result.dateColumn).toBe('created_at');
      expect(result.retentionDays).toBe(30);
      expect(result.archiveAfterDays).toBe(15);
      expect(result.conditions).toEqual({ status: 'inactive' });
    });
  });
});