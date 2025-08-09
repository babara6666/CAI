import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import apiRoutes from './routes/api.js';
import { setupSwagger } from './docs/swagger.js';
import { 
  forceHTTPS, 
  securityHeaders, 
  apiRateLimit, 
  detectSuspiciousActivity,
  secureCORS,
  sanitizeInput
} from './middleware/security.js';
import { EncryptionService } from './config/encryption.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { CompressionService } from './middleware/compression.js';
import { CacheService } from './services/CacheService.js';
import { CacheMiddleware } from './middleware/caching.js';
import { CDNService, CDNMiddleware } from './services/CDNService.js';
import { JobQueueService, JobProcessors } from './services/JobQueueService.js';

const app = express();

// Initialize services
let cacheService: CacheService;
let cacheMiddleware: CacheMiddleware;
let cdnService: CDNService;
let cdnMiddleware: CDNMiddleware;
let jobQueueService: JobQueueService;

try {
  // Initialize encryption service
  EncryptionService.initialize();
  console.log('✅ Encryption service initialized');

  // Initialize cache service
  cacheService = new CacheService({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'cad-ai:',
    ttl: 3600,
  });
  cacheMiddleware = new CacheMiddleware(cacheService);
  console.log('✅ Cache service initialized');

  // Initialize CDN service
  cdnService = new CDNService({
    provider: (process.env.CDN_PROVIDER as any) || 'local',
    distributionId: process.env.CDN_DISTRIBUTION_ID,
    domain: process.env.CDN_DOMAIN,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    cacheTTL: 86400,
  });
  cdnMiddleware = new CDNMiddleware(cdnService);
  console.log('✅ CDN service initialized');

  // Initialize job queue service
  jobQueueService = new JobQueueService({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: 5,
  });

  // Register job processors
  jobQueueService.registerProcessor('thumbnail-generation', JobProcessors.fileProcessing);
  jobQueueService.registerProcessor('metadata-extraction', JobProcessors.fileProcessing);
  jobQueueService.registerProcessor('file-validation', JobProcessors.fileProcessing);
  jobQueueService.registerProcessor('virus-scan', JobProcessors.fileProcessing);
  jobQueueService.registerProcessor('model-training', JobProcessors.aiTraining);
  jobQueueService.registerProcessor('model-evaluation', JobProcessors.aiTraining);
  jobQueueService.registerProcessor('dataset-preprocessing', JobProcessors.aiTraining);
  jobQueueService.registerProcessor('index-file', JobProcessors.searchIndexing);
  jobQueueService.registerProcessor('reindex-all', JobProcessors.searchIndexing);
  jobQueueService.registerProcessor('update-search-vectors', JobProcessors.searchIndexing);
  
  console.log('✅ Job queue service initialized');
} catch (error) {
  console.error('❌ Failed to initialize services:', error);
  process.exit(1);
}

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use(forceHTTPS);
}

// Enhanced security headers
app.use(securityHeaders);

// Secure CORS configuration
app.use(secureCORS);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-api-key', 'x-content-hash']
}));

// Enhanced compression middleware
app.use(CompressionService.create({
  threshold: 1024,
  level: 6,
}));

// Response optimization middleware
app.use(CompressionService.optimize());
app.use(CompressionService.cacheHeaders());
app.use(CompressionService.sizeMonitoring());

// CDN headers for static assets
app.use(cdnMiddleware.addCDNHeaders());

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.headers['x-request-id']);
  next();
});

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.http(message.trim());
    }
  }
}));

// Rate limiting
app.use(apiRateLimit);

// Suspicious activity detection
app.use(detectSuspiciousActivity);

// Input sanitization
app.use(sanitizeInput);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup API documentation
setupSwagger(app);

// API routes with caching
app.use('/api', apiRoutes);

// Make services available to routes
app.locals.cacheService = cacheService;
app.locals.cacheMiddleware = cacheMiddleware;
app.locals.cdnService = cdnService;
app.locals.jobQueueService = jobQueueService;

// 404 handler
app.use('*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  try {
    if (jobQueueService) {
      await jobQueueService.shutdown();
    }
    if (cacheService) {
      await cacheService.disconnect();
    }
    console.log('✅ Services shut down successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  try {
    if (jobQueueService) {
      await jobQueueService.shutdown();
    }
    if (cacheService) {
      await cacheService.disconnect();
    }
    console.log('✅ Services shut down successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  
  process.exit(0);
});

export default app;