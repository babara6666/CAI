import { Router } from 'express';
import { versioningMiddleware, deprecationWarning } from '../middleware/versioning.js';
import { generalRateLimit } from '../middleware/rateLimiting.js';
import authRoutes from './auth.js';
import fileRoutes from './files.js';
import datasetRoutes from './datasets.js';
import searchRoutes from './search.js';
import feedbackRoutes from './feedback.js';
import abtestRoutes from './abtest.js';
import userRoutes from './users.js';
import reportRoutes from './reports.js';
import aiRoutes from './ai.js';
import adminRoutes from './admin.js';

const router = Router();

// Apply versioning middleware to all API routes
router.use(versioningMiddleware);

// Apply deprecation warnings for older versions
router.use(deprecationWarning({
  '1.0': {
    sunset: '2024-12-31T23:59:59Z',
    replacement: '1.1'
  }
}));

// Apply general rate limiting
router.use(generalRateLimit);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: healthy
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *                         version:
 *                           type: string
 *                           example: 1.0.0
 *                         environment:
 *                           type: string
 *                           example: development
 */
router.get('/health', (req, res) => {
  const response = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      apiVersion: (req as any).apiVersion || '1.0'
    }
  };
  
  // Add deprecation warning if present
  if (res.locals.deprecationWarning) {
    response.data.deprecationWarning = res.locals.deprecationWarning;
  }
  
  res.json(response);
});

/**
 * @swagger
 * /api/info:
 *   get:
 *     summary: API information endpoint
 *     description: Returns information about the API including supported versions and features
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: CAD AI Platform API
 *                         description:
 *                           type: string
 *                         supportedVersions:
 *                           type: array
 *                           items:
 *                             type: string
 *                         currentVersion:
 *                           type: string
 *                         features:
 *                           type: array
 *                           items:
 *                             type: string
 *                         rateLimits:
 *                           type: object
 */
router.get('/info', (req, res) => {
  const response = {
    success: true,
    data: {
      name: 'CAD AI Platform API',
      description: 'A comprehensive API for CAD file management and AI-powered search',
      supportedVersions: ['1.0', '1.1'],
      currentVersion: (req as any).apiVersion || '1.0',
      features: [
        'File upload and management',
        'AI-powered search',
        'Dataset creation',
        'Model training',
        'User management',
        'Audit logging',
        'Real-time notifications'
      ],
      rateLimits: {
        general: '1000 requests per 15 minutes',
        authentication: '10 requests per 15 minutes',
        fileUpload: '100 requests per hour',
        search: '60 requests per minute',
        training: '5 requests per day'
      },
      documentation: '/api-docs'
    }
  };
  
  res.json(response);
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/files', fileRoutes);
router.use('/datasets', datasetRoutes);
router.use('/search', searchRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/abtest', abtestRoutes);
router.use('/users', userRoutes);
router.use('/reports', reportRoutes);
router.use('/ai', aiRoutes);
router.use('/admin', adminRoutes);

export default router;