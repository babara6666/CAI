import { Router, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { ABTestService } from '../services/ABTestService.js';
import { authenticateToken } from '../middleware/auth.js';
import { ApiResponse, ABTestStatus } from '../types/index.js';
import {
  validateCreateABTest,
  validateABTestFilters,
  validateRecordMetric,
  validateTestAssignment
} from '../validation/abtestValidation.js';

const router = Router();

// Apply authentication to all A/B test routes
router.use(authenticateToken);

/**
 * Create a new A/B test (admin only)
 */
router.post('/',
  validateCreateABTest,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const user = (req as any).user;
      
      // Check if user is admin
      if (user.role !== 'admin') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const testData = req.body;
      const abtestService = new ABTestService();
      const test = await abtestService.createTest(testData, user.id);

      const response: ApiResponse = {
        success: true,
        data: test
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Create A/B test failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CREATE_TEST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create A/B test',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get all A/B tests with filtering
 */
router.get('/',
  validateABTestFilters,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const user = (req as any).user;
      
      // Check if user is admin or engineer
      if (!['admin', 'engineer'].includes(user.role)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin or engineer access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { status, feature, createdBy, startDate, endDate, page, limit } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as ABTestStatus;
      if (feature) filters.feature = feature as string;
      if (createdBy) filters.createdBy = createdBy as string;
      if (startDate && endDate) {
        filters.dateRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const options = {
        limit: parseInt(limit as string) || 10,
        offset: ((parseInt(page as string) || 1) - 1) * (parseInt(limit as string) || 10)
      };

      const abtestService = new ABTestService();
      const { tests, pagination } = await abtestService.getTests(filters, options);

      const response: ApiResponse = {
        success: true,
        data: tests,
        pagination
      };

      res.json(response);
    } catch (error) {
      console.error('Get A/B tests failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'GET_TESTS_ERROR',
          message: 'Failed to get A/B tests',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get A/B test by ID
 */
router.get('/:testId',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin or engineer
      if (!['admin', 'engineer'].includes(user.role)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin or engineer access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { testId } = req.params;

      const abtestService = new ABTestService();
      const test = await abtestService.getTest(testId);

      if (!test) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'TEST_NOT_FOUND',
            message: 'A/B test not found',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: test
      };

      res.json(response);
    } catch (error) {
      console.error('Get A/B test failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'GET_TEST_ERROR',
          message: 'Failed to get A/B test',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Start an A/B test (admin only)
 */
router.post('/:testId/start',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin
      if (user.role !== 'admin') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { testId } = req.params;

      const abtestService = new ABTestService();
      const test = await abtestService.startTest(testId);

      const response: ApiResponse = {
        success: true,
        data: test
      };

      res.json(response);
    } catch (error) {
      console.error('Start A/B test failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'START_TEST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start A/B test',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Stop an A/B test (admin only)
 */
router.post('/:testId/stop',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin
      if (user.role !== 'admin') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { testId } = req.params;

      const abtestService = new ABTestService();
      const test = await abtestService.stopTest(testId);

      const response: ApiResponse = {
        success: true,
        data: test
      };

      res.json(response);
    } catch (error) {
      console.error('Stop A/B test failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STOP_TEST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to stop A/B test',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get user's test assignment for a feature
 */
router.get('/assignment/:feature',
  validateTestAssignment,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { feature } = req.params;
      const userId = (req as any).user.id;
      const sessionId = req.headers['x-session-id'] as string;

      const abtestService = new ABTestService();
      const activeTests = await abtestService.getActiveTestsForFeature(feature);

      const assignments = [];
      for (const test of activeTests) {
        const assignment = await abtestService.assignUserToTest(test.id, userId, sessionId);
        if (assignment) {
          assignments.push(assignment);
        }
      }

      const response: ApiResponse = {
        success: true,
        data: assignments
      };

      res.json(response);
    } catch (error) {
      console.error('Get test assignment failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ASSIGNMENT_ERROR',
          message: 'Failed to get test assignment',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Record A/B test metric
 */
router.post('/:testId/metrics',
  validateRecordMetric,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { testId } = req.params;
      const { metricName, metricValue, metadata } = req.body;
      const userId = (req as any).user.id;

      const abtestService = new ABTestService();
      await abtestService.recordMetric(testId, userId, metricName, metricValue, metadata || {});

      const response: ApiResponse = {
        success: true,
        data: { message: 'Metric recorded successfully' }
      };

      res.json(response);
    } catch (error) {
      console.error('Record A/B test metric failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'METRIC_ERROR',
          message: 'Failed to record metric',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get A/B test results
 */
router.get('/:testId/results',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin or engineer
      if (!['admin', 'engineer'].includes(user.role)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin or engineer access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const { testId } = req.params;

      const abtestService = new ABTestService();
      const results = await abtestService.getTestResults(testId);

      const response: ApiResponse = {
        success: true,
        data: results
      };

      res.json(response);
    } catch (error) {
      console.error('Get A/B test results failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'RESULTS_ERROR',
          message: 'Failed to get A/B test results',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get user's test assignments
 */
router.get('/user/assignments',
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const abtestService = new ABTestService();
      const assignments = await abtestService.getUserTestAssignments(userId);

      const response: ApiResponse = {
        success: true,
        data: assignments
      };

      res.json(response);
    } catch (error) {
      console.error('Get user test assignments failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'USER_ASSIGNMENTS_ERROR',
          message: 'Failed to get user test assignments',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get A/B test statistics (admin only)
 */
router.get('/admin/statistics',
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Check if user is admin
      if (user.role !== 'admin') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(403).json(response);
      }

      const abtestService = new ABTestService();
      const statistics = await abtestService.getABTestStatistics();

      const response: ApiResponse = {
        success: true,
        data: statistics
      };

      res.json(response);
    } catch (error) {
      console.error('Get A/B test statistics failed:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATISTICS_ERROR',
          message: 'Failed to get A/B test statistics',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

export default router;