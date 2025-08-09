import { body, param, query } from 'express-validator';

/**
 * Validation for creating A/B tests
 */
export const validateCreateABTest = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be a string between 1 and 255 characters'),
  
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be a string with maximum 1000 characters'),
  
  body('feature')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Feature must be a string between 1 and 100 characters'),
  
  body('variants')
    .isArray({ min: 2 })
    .withMessage('Must have at least 2 variants'),
  
  body('variants.*.name')
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Variant name must be a string between 1 and 255 characters'),
  
  body('variants.*.description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Variant description must be a string with maximum 1000 characters'),
  
  body('variants.*.configuration')
    .isObject()
    .withMessage('Variant configuration must be an object'),
  
  body('variants.*.trafficPercentage')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Traffic percentage must be between 0 and 100'),
  
  body('trafficAllocation')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Traffic allocation must be between 0 and 100'),
  
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  body('targetMetric')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Target metric must be a string between 1 and 100 characters'),
  
  body('minimumSampleSize')
    .isInt({ min: 10 })
    .withMessage('Minimum sample size must be at least 10'),
  
  body('confidenceLevel')
    .isFloat({ min: 80, max: 99.9 })
    .withMessage('Confidence level must be between 80 and 99.9')
];

/**
 * Validation for A/B test filters
 */
export const validateABTestFilters = [
  query('status')
    .optional()
    .isIn(['draft', 'running', 'completed', 'paused'])
    .withMessage('Invalid status'),
  
  query('feature')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Feature must be a string between 1 and 100 characters'),
  
  query('createdBy')
    .optional()
    .isUUID()
    .withMessage('Created by must be a valid UUID'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

/**
 * Validation for recording A/B test metrics
 */
export const validateRecordMetric = [
  param('testId')
    .isUUID()
    .withMessage('Test ID must be a valid UUID'),
  
  body('metricName')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Metric name must be a string between 1 and 100 characters'),
  
  body('metricValue')
    .isNumeric()
    .withMessage('Metric value must be a number'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

/**
 * Validation for test assignment requests
 */
export const validateTestAssignment = [
  param('feature')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Feature must be a string between 1 and 100 characters')
];