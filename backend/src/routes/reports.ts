import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ReportService } from '../services/ReportService.js';
import { validateReportRequest } from '../validation/reportValidation.js';
import { ApiResponse, DateRange } from '../types/index.js';

const router = Router();
const reportService = new ReportService();

/**
 * @swagger
 * /api/reports/usage:
 *   get:
 *     summary: Get usage report (admin only)
 *     description: Generate a comprehensive usage report including user activity, file uploads, and system metrics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         description: Start date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         required: true
 *         description: End date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: granularity
 *         in: query
 *         description: Data granularity for time-series data
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Usage report generated successfully
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
 *                         totalUsers:
 *                           type: integer
 *                         activeUsers:
 *                           type: integer
 *                         totalFiles:
 *                           type: integer
 *                         totalStorage:
 *                           type: integer
 *                           description: Total storage used in bytes
 *                         searchQueries:
 *                           type: integer
 *                         modelTrainings:
 *                           type: integer
 *                         period:
 *                           type: object
 *                           properties:
 *                             startDate:
 *                               type: string
 *                               format: date-time
 *                             endDate:
 *                               type: string
 *                               format: date-time
 *                         trends:
 *                           type: object
 *                           properties:
 *                             userGrowth:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   date:
 *                                     type: string
 *                                     format: date
 *                                   count:
 *                                     type: integer
 *                             fileUploads:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   date:
 *                                     type: string
 *                                     format: date
 *                                   count:
 *                                     type: integer
 *                             searchActivity:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   date:
 *                                     type: string
 *                                     format: date
 *                                   count:
 *                                     type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/usage', authenticateToken, requireRole(['admin']), validateReportRequest, async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const granularity = (req.query.granularity as string) || 'day';
    
    const dateRange: DateRange = { startDate, endDate };
    const report = await reportService.generateUsageReport(dateRange, granularity);
    
    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REPORT_GENERATION_ERROR',
        message: 'Failed to generate usage report',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/reports/performance:
 *   get:
 *     summary: Get performance report (admin only)
 *     description: Generate a performance report including search metrics, model performance, and system response times
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         description: Start date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         required: true
 *         description: End date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: modelId
 *         in: query
 *         description: Specific model ID to analyze (optional)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Performance report generated successfully
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
 *                         averageSearchTime:
 *                           type: number
 *                           description: Average search response time in milliseconds
 *                         searchAccuracy:
 *                           type: number
 *                           description: Overall search accuracy score
 *                         userSatisfaction:
 *                           type: number
 *                           description: Average user satisfaction rating
 *                         totalQueries:
 *                           type: integer
 *                         period:
 *                           type: object
 *                           properties:
 *                             startDate:
 *                               type: string
 *                               format: date-time
 *                             endDate:
 *                               type: string
 *                               format: date-time
 *                         modelPerformance:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               modelId:
 *                                 type: string
 *                               modelName:
 *                                 type: string
 *                               accuracy:
 *                                 type: number
 *                               averageResponseTime:
 *                                 type: number
 *                               queryCount:
 *                                 type: integer
 *                               userRating:
 *                                 type: number
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/performance', authenticateToken, requireRole(['admin']), validateReportRequest, async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const modelId = req.query.modelId as string;
    
    const dateRange: DateRange = { startDate, endDate };
    const report = await reportService.generatePerformanceReport(dateRange, modelId);
    
    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REPORT_GENERATION_ERROR',
        message: 'Failed to generate performance report',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/reports/audit:
 *   get:
 *     summary: Get audit report (admin only)
 *     description: Generate an audit report including user actions, security events, and compliance data
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         description: Start date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         required: true
 *         description: End date for the report period
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: userId
 *         in: query
 *         description: Filter by specific user ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: action
 *         in: query
 *         description: Filter by specific action type
 *         schema:
 *           type: string
 *       - name: resourceType
 *         in: query
 *         description: Filter by resource type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit report generated successfully
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
 *                         totalActions:
 *                           type: integer
 *                         actionsByType:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *                         userActivity:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *                         securityEvents:
 *                           type: integer
 *                         period:
 *                           type: object
 *                           properties:
 *                             startDate:
 *                               type: string
 *                               format: date-time
 *                             endDate:
 *                               type: string
 *                               format: date-time
 *                         topUsers:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               userId:
 *                                 type: string
 *                               username:
 *                                 type: string
 *                               actionCount:
 *                                 type: integer
 *                         riskEvents:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               timestamp:
 *                                 type: string
 *                                 format: date-time
 *                               userId:
 *                                 type: string
 *                               action:
 *                                 type: string
 *                               riskLevel:
 *                                 type: string
 *                                 enum: [low, medium, high]
 *                               description:
 *                                 type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/audit', authenticateToken, requireRole(['admin']), validateReportRequest, async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    
    const filters: any = {};
    if (req.query.userId) filters.userId = req.query.userId;
    if (req.query.action) filters.action = req.query.action;
    if (req.query.resourceType) filters.resourceType = req.query.resourceType;
    
    const dateRange: DateRange = { startDate, endDate };
    const report = await reportService.generateAuditReport(dateRange, filters);
    
    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REPORT_GENERATION_ERROR',
        message: 'Failed to generate audit report',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/reports/export:
 *   post:
 *     summary: Export report (admin only)
 *     description: Export a report in the specified format (CSV or PDF)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *               - format
 *               - startDate
 *               - endDate
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [usage, performance, audit]
 *                 description: Type of report to export
 *               format:
 *                 type: string
 *                 enum: [csv, pdf]
 *                 description: Export format
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start date for the report period
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: End date for the report period
 *               filters:
 *                 type: object
 *                 description: Additional filters specific to the report type
 *     responses:
 *       200:
 *         description: Report export initiated successfully
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
 *                         downloadUrl:
 *                           type: string
 *                           format: uri
 *                           description: URL to download the exported report
 *                         expiresAt:
 *                           type: string
 *                           format: date-time
 *                           description: When the download URL expires
 *                         fileSize:
 *                           type: integer
 *                           description: Size of the exported file in bytes
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/export', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { reportType, format, startDate, endDate, filters } = req.body;
    
    if (!reportType || !format || !startDate || !endDate) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Missing required fields: reportType, format, startDate, endDate',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(400).json(response);
    }
    
    const dateRange: DateRange = { 
      startDate: new Date(startDate), 
      endDate: new Date(endDate) 
    };
    
    const exportResult = await reportService.exportReport(reportType, format, dateRange, filters);
    
    const response: ApiResponse = {
      success: true,
      data: exportResult
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REPORT_EXPORT_ERROR',
        message: 'Failed to export report',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get dashboard metrics (admin only)
 *     description: Get real-time dashboard metrics for system monitoring
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
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
 *                         systemHealth:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               enum: [healthy, warning, critical]
 *                             uptime:
 *                               type: number
 *                               description: System uptime in seconds
 *                             memoryUsage:
 *                               type: number
 *                               description: Memory usage percentage
 *                             cpuUsage:
 *                               type: number
 *                               description: CPU usage percentage
 *                         activeUsers:
 *                           type: integer
 *                           description: Number of currently active users
 *                         recentActivity:
 *                           type: object
 *                           properties:
 *                             fileUploads:
 *                               type: integer
 *                               description: File uploads in the last 24 hours
 *                             searchQueries:
 *                               type: integer
 *                               description: Search queries in the last 24 hours
 *                             modelTrainings:
 *                               type: integer
 *                               description: Model trainings in the last 24 hours
 *                         alerts:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               severity:
 *                                 type: string
 *                                 enum: [info, warning, error]
 *                               message:
 *                                 type: string
 *                               timestamp:
 *                                 type: string
 *                                 format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/dashboard', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const dashboardData = await reportService.getDashboardMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: dashboardData
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: 'Failed to fetch dashboard metrics',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

export default router;