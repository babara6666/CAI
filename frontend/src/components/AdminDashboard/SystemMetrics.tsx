import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Alert, AlertDescription } from '../ui/Alert';

interface SystemMetricsData {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  storage: { used: number; total: number; percentage: number };
  database: { connections: number; maxConnections: number; queryTime: number };
  api: { requestsPerMinute: number; averageResponseTime: number; errorRate: number };
}

interface SystemMetricsProps {
  metrics?: SystemMetricsData;
}

export const SystemMetrics: React.FC<SystemMetricsProps> = ({ metrics: initialMetrics }) => {
  const [metrics, setMetrics] = useState<SystemMetricsData | null>(initialMetrics || null);
  const [loading, setLoading] = useState(!initialMetrics);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24');

  useEffect(() => {
    if (!initialMetrics) {
      fetchMetrics();
    }
  }, [timeRange, initialMetrics]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/system/metrics?timeRange=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch system metrics');
      }

      const result = await response.json();
      if (result.success) {
        setMetrics(result.data);
      } else {
        throw new Error(result.error?.message || 'Failed to fetch system metrics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return <div>No metrics data available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Metrics</h2>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last Hour</SelectItem>
            <SelectItem value="6">Last 6 Hours</SelectItem>
            <SelectItem value="24">Last 24 Hours</SelectItem>
            <SelectItem value="168">Last Week</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* CPU Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              CPU Usage
              <span className={`text-sm font-normal ${getStatusColor(metrics.cpu.usage)}`}>
                {metrics.cpu.usage.toFixed(1)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={metrics.cpu.usage} 
              className="mb-2"
            />
            <div className="text-sm text-muted-foreground">
              {metrics.cpu.cores} cores available
            </div>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Memory Usage
              <span className={`text-sm font-normal ${getStatusColor(metrics.memory.percentage)}`}>
                {metrics.memory.percentage.toFixed(1)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={metrics.memory.percentage} 
              className="mb-2"
            />
            <div className="text-sm text-muted-foreground">
              {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
            </div>
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Storage Usage
              <span className={`text-sm font-normal ${getStatusColor(metrics.storage.percentage)}`}>
                {metrics.storage.percentage.toFixed(1)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={metrics.storage.percentage} 
              className="mb-2"
            />
            <div className="text-sm text-muted-foreground">
              {formatBytes(metrics.storage.used)} / {formatBytes(metrics.storage.total)}
            </div>
          </CardContent>
        </Card>

        {/* Database Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Database
              <span className="text-sm font-normal text-blue-600">
                {metrics.database.connections} connections
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={(metrics.database.connections / metrics.database.maxConnections) * 100} 
              className="mb-2"
            />
            <div className="text-sm text-muted-foreground">
              Max: {metrics.database.maxConnections} | Query time: {metrics.database.queryTime}ms
            </div>
          </CardContent>
        </Card>

        {/* API Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              API Performance
              <span className="text-sm font-normal text-blue-600">
                {metrics.api.requestsPerMinute}/min
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avg Response Time:</span>
                <span>{metrics.api.averageResponseTime}ms</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Error Rate:</span>
                <span className={getStatusColor(metrics.api.errorRate)}>
                  {metrics.api.errorRate.toFixed(2)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Health Summary */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">CPU</span>
                <div className={`w-3 h-3 rounded-full ${
                  metrics.cpu.usage < 75 ? 'bg-green-500' : 
                  metrics.cpu.usage < 90 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Memory</span>
                <div className={`w-3 h-3 rounded-full ${
                  metrics.memory.percentage < 75 ? 'bg-green-500' : 
                  metrics.memory.percentage < 90 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Storage</span>
                <div className={`w-3 h-3 rounded-full ${
                  metrics.storage.percentage < 75 ? 'bg-green-500' : 
                  metrics.storage.percentage < 90 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <div className={`w-3 h-3 rounded-full ${
                  (metrics.database.connections / metrics.database.maxConnections) < 0.75 ? 'bg-green-500' : 
                  (metrics.database.connections / metrics.database.maxConnections) < 0.90 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API</span>
                <div className={`w-3 h-3 rounded-full ${
                  metrics.api.errorRate < 1 ? 'bg-green-500' : 
                  metrics.api.errorRate < 5 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.cpu.usage > 80 && (
              <Alert>
                <AlertDescription>
                  High CPU usage detected. Consider scaling up or optimizing resource-intensive processes.
                </AlertDescription>
              </Alert>
            )}
            {metrics.memory.percentage > 85 && (
              <Alert>
                <AlertDescription>
                  High memory usage detected. Consider increasing available memory or optimizing memory usage.
                </AlertDescription>
              </Alert>
            )}
            {metrics.storage.percentage > 90 && (
              <Alert variant="destructive">
                <AlertDescription>
                  Storage is nearly full. Immediate action required to free up space or increase storage capacity.
                </AlertDescription>
              </Alert>
            )}
            {metrics.api.errorRate > 5 && (
              <Alert variant="destructive">
                <AlertDescription>
                  High API error rate detected. Check application logs and investigate potential issues.
                </AlertDescription>
              </Alert>
            )}
            {metrics.api.averageResponseTime > 1000 && (
              <Alert>
                <AlertDescription>
                  Slow API response times detected. Consider optimizing database queries or scaling infrastructure.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};