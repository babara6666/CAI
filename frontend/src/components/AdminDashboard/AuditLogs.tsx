import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Alert, AlertDescription } from '../ui/Alert';
import { Calendar } from '../ui/Calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { CalendarIcon } from 'lucide-react';

interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  details: Record<string, any>;
  username?: string;
  email?: string;
}

interface AuditFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [filters, pagination.page]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.action && { action: filters.action }),
        ...(filters.resourceType && { resourceType: filters.resourceType }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      });

      const response = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
        if (result.pagination) {
          setPagination(prev => ({ ...prev, ...result.pagination }));
        }
      } else {
        throw new Error(result.error?.message || 'Failed to fetch audit logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('login') || action.includes('auth')) return 'default';
    if (action.includes('create') || action.includes('upload')) return 'default';
    if (action.includes('update') || action.includes('modify')) return 'secondary';
    if (action.includes('delete') || action.includes('remove')) return 'destructive';
    if (action.includes('error') || action.includes('failed')) return 'destructive';
    return 'outline';
  };

  const getResourceTypeBadge = (resourceType: string) => {
    const colors = {
      user: 'bg-blue-100 text-blue-800',
      file: 'bg-green-100 text-green-800',
      dataset: 'bg-purple-100 text-purple-800',
      model: 'bg-orange-100 text-orange-800',
      system: 'bg-gray-100 text-gray-800'
    };
    return colors[resourceType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    };
  };

  const clearFilters = () => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Audit Logs</h2>
        <Button onClick={fetchAuditLogs} variant="outline">
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              placeholder="User ID..."
              value={filters.userId || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
            />
            
            <Input
              placeholder="Action..."
              value={filters.action || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
            />
            
            <Select 
              value={filters.resourceType || ''} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, resourceType: value || undefined }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Resource type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="file">File</SelectItem>
                <SelectItem value="dataset">Dataset</SelectItem>
                <SelectItem value="model">Model</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'Start date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.startDate ? new Date(filters.startDate) : undefined}
                  onSelect={(date) => setFilters(prev => ({ 
                    ...prev, 
                    startDate: date ? date.toISOString() : undefined 
                  }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'End date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.endDate ? new Date(filters.endDate) : undefined}
                  onSelect={(date) => setFilters(prev => ({ 
                    ...prev, 
                    endDate: date ? date.toISOString() : undefined 
                  }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button onClick={clearFilters} variant="outline">
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Logs ({pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logs.map((log) => {
              const { date, time } = formatTimestamp(log.timestamp);
              const isExpanded = expandedLog === log.id;
              
              return (
                <div key={log.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getResourceTypeBadge(log.resourceType)}`}>
                          {log.resourceType}
                        </span>
                        {log.resourceId && (
                          <span className="text-xs text-muted-foreground">
                            ID: {log.resourceId}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-1">
                        {log.username ? (
                          <span>
                            User: <span className="font-medium">{log.username}</span>
                            {log.email && <span className="ml-1">({log.email})</span>}
                          </span>
                        ) : log.userId ? (
                          <span>User ID: {log.userId}</span>
                        ) : (
                          <span>System action</span>
                        )}
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        {date} at {time}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                    >
                      {isExpanded ? 'Hide' : 'Details'}
                    </Button>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium mb-2">Details:</h4>
                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} logs
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};