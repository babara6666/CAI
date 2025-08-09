import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Alert, AlertDescription } from '../ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

interface ResourceUsageData {
  storage: {
    totalUsed: number;
    totalAvailable: number;
    byUser: Array<{
      userId: string;
      username: string;
      storageUsed: number;
      fileCount: number;
    }>;
    byFileType: Record<string, number>;
  };
  compute: {
    activeTrainingJobs: number;
    queuedJobs: number;
    totalGpuHours: number;
    averageJobDuration: number;
  };
  api: {
    requestsToday: number;
    requestsThisMonth: number;
    topEndpoints: Array<{
      endpoint: string;
      requests: number;
      averageResponseTime: number;
    }>;
  };
}

export const ResourceUsage: React.FC = () => {
  const [resourceData, setResourceData] = useState<ResourceUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResourceUsage();
  }, []);

  const fetchResourceUsage = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/resource-usage', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch resource usage');
      }

      const result = await response.json();
      if (result.success) {
        setResourceData(result.data);
      } else {
        throw new Error(result.error?.message || 'Failed to fetch resource usage');
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

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num);
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

  if (!resourceData) {
    return <div>No resource usage data available</div>;
  }

  const storagePercentage = (resourceData.storage.totalUsed / resourceData.storage.totalAvailable) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Resource Usage</h2>
      </div>

      <Tabs defaultValue="storage" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="compute">Compute</TabsTrigger>
          <TabsTrigger value="api">API Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="storage" className="space-y-4">
          {/* Storage Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Storage Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Total Storage Used</span>
                    <span>{formatBytes(resourceData.storage.totalUsed)} / {formatBytes(resourceData.storage.totalAvailable)}</span>
                  </div>
                  <Progress value={storagePercentage} className="mb-2" />
                  <div className="text-xs text-muted-foreground">
                    {storagePercentage.toFixed(1)}% of available storage
                  </div>
                </div>
                
                {storagePercentage > 80 && (
                  <Alert variant={storagePercentage > 90 ? 'destructive' : 'default'}>
                    <AlertDescription>
                      {storagePercentage > 90 
                        ? 'Storage is critically low. Immediate action required.'
                        : 'Storage usage is high. Consider cleaning up old files or increasing capacity.'
                      }
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Storage by User */}
          <Card>
            <CardHeader>
              <CardTitle>Top Storage Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resourceData.storage.byUser.slice(0, 10).map((user, index) => (
                  <div key={user.userId} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{user.username}</div>
                        <div className="text-sm text-muted-foreground">
                          {user.fileCount} files
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatBytes(user.storageUsed)}</div>
                      <div className="text-sm text-muted-foreground">
                        {((user.storageUsed / resourceData.storage.totalUsed) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Storage by File Type */}
          <Card>
            <CardHeader>
              <CardTitle>Storage by File Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(resourceData.storage.byFileType)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 8)
                  .map(([fileType, size]) => (
                    <div key={fileType} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm font-medium">{fileType}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatBytes(size)}</div>
                        <div className="text-xs text-muted-foreground">
                          {((size / resourceData.storage.totalUsed) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compute" className="space-y-4">
          {/* Compute Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {resourceData.compute.activeTrainingJobs}
                </div>
                <p className="text-xs text-muted-foreground">Currently running</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Queued Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {resourceData.compute.queuedJobs}
                </div>
                <p className="text-xs text-muted-foreground">Waiting to start</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">GPU Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatNumber(resourceData.compute.totalGpuHours)}
                </div>
                <p className="text-xs text-muted-foreground">Total consumed</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {resourceData.compute.averageJobDuration}m
                </div>
                <p className="text-xs text-muted-foreground">Per training job</p>
              </CardContent>
            </Card>
          </div>

          {/* Compute Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Compute Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {resourceData.compute.queuedJobs > 5 && (
                  <Alert>
                    <AlertDescription>
                      High number of queued jobs detected. Consider adding more compute resources or optimizing job scheduling.
                    </AlertDescription>
                  </Alert>
                )}
                {resourceData.compute.averageJobDuration > 120 && (
                  <Alert>
                    <AlertDescription>
                      Long average job duration detected. Consider optimizing training parameters or using more powerful hardware.
                    </AlertDescription>
                  </Alert>
                )}
                {resourceData.compute.activeTrainingJobs === 0 && resourceData.compute.queuedJobs === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No active or queued training jobs. Compute resources are available.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          {/* API Usage Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {formatNumber(resourceData.api.requestsToday)}
                </div>
                <p className="text-sm text-muted-foreground">Requests today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatNumber(resourceData.api.requestsThisMonth)}
                </div>
                <p className="text-sm text-muted-foreground">Requests this month</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Endpoints */}
          <Card>
            <CardHeader>
              <CardTitle>Top API Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resourceData.api.topEndpoints.map((endpoint, index) => (
                  <div key={endpoint.endpoint} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium font-mono text-sm">{endpoint.endpoint}</div>
                        <div className="text-xs text-muted-foreground">
                          Avg response: {endpoint.averageResponseTime.toFixed(0)}ms
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatNumber(endpoint.requests)}</div>
                      <div className="text-sm text-muted-foreground">requests</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* API Performance Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {resourceData.api.topEndpoints.some(e => e.averageResponseTime > 1000) && (
                  <Alert>
                    <AlertDescription>
                      Some endpoints have slow response times (>1s). Consider optimization or caching.
                    </AlertDescription>
                  </Alert>
                )}
                {resourceData.api.requestsToday > 10000 && (
                  <Alert>
                    <AlertDescription>
                      High API usage detected today. Monitor for potential rate limiting needs.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="text-sm text-muted-foreground">
                  Average daily growth: {((resourceData.api.requestsThisMonth / 30) - resourceData.api.requestsToday).toFixed(0)} requests/day
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};