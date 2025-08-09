import { body, query } from 'express-validator';

export const validateSearchQuery = [
  body('query')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters'),
  body('queryType')
    .optional()
    .isIn(['natural_language', 'filtered', 'hybrid'])
    .withMessage('Invalid query type'),
  body('modelId')
    .optional()
    .isUUID()
    .withMessage('Model ID must be a valid UUID'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
  body('filters.tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('filters.tags.*')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
  body('filters.projectName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Project name must be between 1 and 100 characters'),
  body('filters.partName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Part name must be between 1 and 100 characters'),
  body('filters.uploadedBy')
    .optional()
    .isArray()
    .withMessage('UploadedBy must be an array'),
  body('filters.uploadedBy.*')
    .optional()
    .isUUID()
    .withMessage('Each uploadedBy ID must be a valid UUID'),
  body('filters.dateRange')
    .optional()
    .isObject()
    .withMessage('Date range must be an object'),
  body('filters.dateRange.startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('filters.dateRange.endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  body('filters.fileSize')
    .optional()
    .isObject()
    .withMessage('File size must be an object'),
  body('filters.fileSize.min')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum file size must be a non-negative integer'),
  body('filters.fileSize.max')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Maximum file size must be a non-negative integer'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const validateSearchSuggestions = [
  query('partial')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Partial query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20')
];

export const validateNLPQuery = [
  body('query')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters')
];

export const validateSearchFeedback = [
  body('queryId')
    .isUUID()
    .withMessage('Query ID must be a valid UUID'),
  body('resultId')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Result ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must be less than 500 characters'),
  body('helpful')
    .isBoolean()
    .withMessage('Helpful must be a boolean')
];

export const validateSearchHistory = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

export const validatePopularTerms = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// Custom validation for date range consistency
export const validateDateRange = (req: any, res: any, next: any) => {
  const { filters } = req.body;
  
  if (filters && filters.dateRange) {
    const { startDate, endDate } = filters.dateRange;
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start >= end) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Start date must be before end date',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }
    }
  }
  
  next();
};

// Custom validation for file size range consistency
export const validateFileSizeRange = (req: any, res: any, next: any) => {
  const { filters } = req.body;
  
  if (filters && filters.fileSize) {
    const { min, max } = filters.fileSize;
    
    if (min !== undefined && max !== undefined && min > max) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Minimum file size must be less than or equal to maximum file size',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  next();
};