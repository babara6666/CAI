import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';
import { logger } from '../utils/logger';

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'cadai_backend_'
});

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'cadai_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'cadai_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
  name: 'cadai_active_connections',
  help: 'Number of active connections'
});

const fileUploadsTotal = new promClient.Counter({
  name: 'cadai_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['status']
});

const fileUploadSize = new promClient.Histogram({
  name: 'cadai_file_upload_size_bytes',
  help: 'Size of uploaded files in bytes',
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824] // 1KB to 1GB
});

const searchQueriesTotal = new promClient.Counter({
  name: 'cadai_search_queries_total',
  help: 'Total number of search queries',
  labelNames: ['type', 'model']
});

const searchResponseTime = new promClient.Histogram({
  name: 'cadai_search_response_time_seconds',
  help: 'Search query response time in seconds',
  labelNames: ['type', 'model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const aiTrainingJobsTotal = new promClient.Counter({
  name: 'cadai_ai_training_jobs_total',
  help: 'Total number of AI training jobs',
  labelNames: ['status']
});

const aiInferenceRequestsTotal = new promClient.Counter({
  name: 'cadai_ai_inference_requests_total',
  help: 'Total number of AI inference requests',
  labelNames: ['model', 'status']
});

const databaseConnectionsActive = new promClient.Gauge({
  name: 'cadai_database_connections_active',
  help: 'Number of active database connections'
});

const cacheHitRate = new promClient.Gauge({
  name: 'cadai_cache_hit_rate',
  help: 'Cache hit rate percentage'
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(fileUploadsTotal);
register.registerMetric(fileUploadSize);
register.registerMetric(searchQueriesTotal);
register.registerMetric(searchResponseTime);
register.registerMetric(aiTrainingJobsTotal);
register.registerMetric(aiInferenceRequestsTotal);
register.registerMetric(databaseConnectionsActive);
register.registerMetric(cacheHitRate);

// Middleware to collect HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Increment active connections
  activeConnections.inc();
  
  // Override res.end to capture metrics when response is sent
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): void {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();
    
    // Record metrics
    httpRequestDuration
      .labels(method, route, statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(method, route, statusCode)
      .inc();
    
    // Decrement active connections
    activeConnections.dec();
    
    // Log slow requests
    if (duration > 2) {
      logger.warn('Slow request detected', {
        method,
        route,
        duration,
        statusCode
      });
    }
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Metrics collection functions
export const recordFileUpload = (status: 'success' | 'failure', sizeBytes?: number): void => {
  fileUploadsTotal.labels(status).inc();
  if (sizeBytes && status === 'success') {
    fileUploadSize.observe(sizeBytes);
  }
};

export const recordSearchQuery = (type: string, model: string, responseTimeSeconds: number): void => {
  searchQueriesTotal.labels(type, model).inc();
  searchResponseTime.labels(type, model).observe(responseTimeSeconds);
};

export const recordTrainingJob = (status: 'started' | 'completed' | 'failed'): void => {
  aiTrainingJobsTotal.labels(status).inc();
};

export const recordInferenceRequest = (model: string, status: 'success' | 'failure'): void => {
  aiInferenceRequestsTotal.labels(model, status).inc();
};

export const updateDatabaseConnections = (count: number): void => {
  databaseConnectionsActive.set(count);
};

export const updateCacheHitRate = (hitRate: number): void => {
  cacheHitRate.set(hitRate);
};

// Metrics endpoint handler
export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).end('Failed to generate metrics');
  }
};

export { register };