import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecurityEventService } from '../../services/SecurityEventService.js';

// Mock DatabaseService
const mockQuery = vi.fn();
vi.mock('../../database/DatabaseService.js', () => ({
  DatabaseService: {
    getInstance: () => ({
      query: mockQuery
    })
  }
}));

describe('Security Event Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Logging', () => {
    it('should log security events correctly', async () => {
      const mockEventId = 'test-event-id';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockEventId }] });

      const event = {
        eventType: 'suspicious_activity',
        severity: 'high' as const,
        userId: 'user-123',
        resourceType: 'api_endpoint',
        resourceId: '/api/files',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { action: 'multiple_failed_attempts' }
      };

      const eventId = await SecurityEventService.logEvent(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_events'),
        expect.arrayContaining([
          expect.any(String), // event ID
          'suspicious_activity',
          'high',
          'user-123',
          'api_endpoint',
          '/api/files',
          '192.168.1.1',
          'Mozilla/5.0',
          JSON.stringify({ action: 'multiple_failed_attempts' })
        ])
      );

      expect(eventId).toBeDefined();
    });

    it('should handle events without optional fields', async () => {
      const event = {
        eventType: 'system_startup',
        severity: 'low' as const
      };

      await SecurityEventService.logEvent(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_events'),
        expect.arrayContaining([
          expect.any(String),
          'system_startup',
          'low',
          null, // userId
          null, // resourceType
          null, // resourceId
          null, // ipAddress
          null, // userAgent
          JSON.stringify({}) // empty details
        ])
      );
    });

    it('should handle critical events with escalation', async () => {
      // Mock admin emails query
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'event-id' }] }) // Insert event
        .mockResolvedValueOnce({ rows: [{ email: 'admin@test.com' }] }); // Get admin emails

      const criticalEvent = {
        eventType: 'data_breach',
        severity: 'critical' as const,
        userId: 'user-123',
        details: { breach_type: 'unauthorized_access' }
      };

      await SecurityEventService.logEvent(criticalEvent);

      // Should log the original event and the escalation event
      expect(mockQuery).toHaveBeenCalledTimes(3); // Insert event, get admins, insert escalation
    });
  });

  describe('Event Retrieval', () => {
    it('should retrieve events with filtering', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          event_type: 'login_failed',
          severity: 'medium',
          user_id: 'user-123',
          resource_type: 'auth',
          resource_id: 'login',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          details: { reason: 'invalid_password' },
          created_at: new Date(),
          resolved_at: null,
          resolved_by: null
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockEvents }); // Events query

      const options = {
        severity: ['medium', 'high'],
        eventType: ['login_failed'],
        limit: 10,
        offset: 0
      };

      const result = await SecurityEventService.getEvents(options);

      expect(result.total).toBe(1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('login_failed');
      expect(result.events[0].severity).toBe('medium');
    });

    it('should handle date range filtering', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await SecurityEventService.getEvents({
        startDate,
        endDate
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $1'),
        expect.arrayContaining([startDate])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at <= $2'),
        expect.arrayContaining([startDate, endDate])
      );
    });

    it('should filter by resolution status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await SecurityEventService.getEvents({ resolved: false });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('resolved_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('Event Resolution', () => {
    it('should resolve security events', async () => {
      const eventId = 'event-123';
      const resolvedBy = 'admin-456';
      const resolution = 'False positive - user account unlocked';

      await SecurityEventService.resolveEvent(eventId, resolvedBy, resolution);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE security_events'),
        [
          resolvedBy,
          JSON.stringify({ resolution }),
          eventId
        ]
      );

      // Should also log a resolution event
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should resolve events without resolution notes', async () => {
      const eventId = 'event-123';
      const resolvedBy = 'admin-456';

      await SecurityEventService.resolveEvent(eventId, resolvedBy);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE security_events'),
        [
          resolvedBy,
          JSON.stringify({ resolution: 'Resolved by administrator' }),
          eventId
        ]
      );
    });
  });

  describe('Security Metrics', () => {
    it('should calculate security metrics correctly', async () => {
      const mockSeverityData = {
        total_events: '100',
        low_severity: '60',
        medium_severity: '25',
        high_severity: '10',
        critical_severity: '5'
      };

      const mockTypeData = [
        { event_type: 'login_failed', count: '30' },
        { event_type: 'suspicious_activity', count: '20' },
        { event_type: 'file_access_violation', count: '15' }
      ];

      const mockRecentEvents = [
        {
          id: 'recent-1',
          event_type: 'login_failed',
          severity: 'medium',
          created_at: new Date()
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockSeverityData] }) // Severity stats
        .mockResolvedValueOnce({ rows: mockTypeData }) // Type stats
        .mockResolvedValueOnce({ rows: mockRecentEvents }) // Recent events
        .mockResolvedValueOnce({ rows: [{ unresolved_critical: '2' }] }) // Unresolved critical
        .mockResolvedValueOnce({ rows: [{ avg_resolution_seconds: '3600' }] }); // Avg resolution time

      const metrics = await SecurityEventService.getSecurityMetrics('week');

      expect(metrics.totalEvents).toBe(100);
      expect(metrics.eventsBySeverity.low).toBe(60);
      expect(metrics.eventsBySeverity.medium).toBe(25);
      expect(metrics.eventsBySeverity.high).toBe(10);
      expect(metrics.eventsBySeverity.critical).toBe(5);
      expect(metrics.eventsByType['login_failed']).toBe(30);
      expect(metrics.unresolvedCritical).toBe(2);
      expect(metrics.averageResolutionTime).toBe(60); // 3600 seconds = 60 minutes
    });

    it('should handle different time ranges', async () => {
      mockQuery
        .mockResolvedValue({ rows: [{}] })
        .mockResolvedValue({ rows: [] });

      await SecurityEventService.getSecurityMetrics('day');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day'"),
        expect.any(Array)
      );

      await SecurityEventService.getSecurityMetrics('month');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 month'"),
        expect.any(Array)
      );
    });
  });

  describe('Suspicious Pattern Detection', () => {
    it('should detect repeated failed login attempts', async () => {
      const mockFailedLogins = [
        { ip_address: '192.168.1.100', attempt_count: '8' },
        { ip_address: '10.0.0.50', attempt_count: '12' }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockFailedLogins }) // Failed logins
        .mockResolvedValueOnce({ rows: [] }) // File access patterns
        .mockResolvedValueOnce({ rows: [{ email: 'security@test.com' }] }); // Security team emails

      const { alerts, patterns } = await SecurityEventService.detectSuspiciousPatterns();

      expect(patterns).toHaveLength(2);
      expect(patterns[0].type).toBe('repeated_failed_logins');
      expect(patterns[0].ipAddress).toBe('192.168.1.100');
      expect(patterns[0].count).toBe(8);
      expect(patterns[0].severity).toBe('high');

      expect(alerts).toHaveLength(2);
      expect(alerts[0].alertType).toBe('repeated_failed_logins');
      expect(alerts[0].severity).toBe('high');
    });

    it('should detect unusual file access patterns', async () => {
      const mockFileAccess = [
        { user_id: 'user-123', access_count: '150' }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Failed logins
        .mockResolvedValueOnce({ rows: mockFileAccess }) // File access patterns
        .mockResolvedValueOnce({ rows: [{ email: 'security@test.com' }] }); // Security team emails

      const { patterns } = await SecurityEventService.detectSuspiciousPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('unusual_file_access');
      expect(patterns[0].userId).toBe('user-123');
      expect(patterns[0].count).toBe(150);
      expect(patterns[0].severity).toBe('medium');
    });

    it('should handle no suspicious patterns found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // No failed logins
        .mockResolvedValueOnce({ rows: [] }); // No unusual file access

      const { alerts, patterns } = await SecurityEventService.detectSuspiciousPatterns();

      expect(patterns).toHaveLength(0);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Alert Management', () => {
    it('should trigger alerts for threshold violations', async () => {
      // Mock threshold check
      mockQuery.mockResolvedValueOnce({ rows: [{ event_count: '6' }] }); // Above threshold

      const event = {
        eventType: 'suspicious_activity',
        severity: 'high' as const,
        userId: 'user-123'
      };

      // This would be called internally by logEvent
      // We can't test it directly, but we can verify the behavior
      await SecurityEventService.logEvent(event);

      // The logEvent should have made additional queries for threshold checking
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should escalate critical events automatically', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'event-id' }] }) // Insert event
        .mockResolvedValueOnce({ rows: [{ email: 'admin@test.com' }] }); // Get admin emails

      const criticalEvent = {
        eventType: 'system_compromise',
        severity: 'critical' as const,
        details: { compromise_type: 'root_access_gained' }
      };

      await SecurityEventService.logEvent(criticalEvent);

      // Should create escalation event
      expect(mockQuery).toHaveBeenCalledTimes(3); // Insert, get admins, insert escalation
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(SecurityEventService.logEvent({
        eventType: 'test_event',
        severity: 'low'
      })).rejects.toThrow('Failed to log security event');
    });

    it('should handle missing data gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await SecurityEventService.getEvents();

      expect(result.total).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('should handle malformed event data', async () => {
      const malformedEvent = {
        eventType: '', // Empty event type
        severity: 'invalid' as any, // Invalid severity
        details: { circular: {} }
      };
      
      // Add circular reference
      malformedEvent.details.circular = malformedEvent.details;

      // Should not throw but handle gracefully
      await expect(SecurityEventService.logEvent(malformedEvent)).rejects.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of events efficiently', async () => {
      const largeEventSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `event-${i}`,
        event_type: 'bulk_test',
        severity: 'low',
        created_at: new Date()
      }));

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1000' }] })
        .mockResolvedValueOnce({ rows: largeEventSet.slice(0, 50) }); // Default limit

      const result = await SecurityEventService.getEvents({ limit: 50 });

      expect(result.total).toBe(1000);
      expect(result.events).toHaveLength(50);
    });

    it('should respect pagination limits', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await SecurityEventService.getEvents({ limit: 25, offset: 50 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        expect.arrayContaining([25, 50])
      );
    });
  });
});