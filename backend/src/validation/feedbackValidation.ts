import { body, param, query } from 'express-validator';

/**
 * Validation for tracking user interactions
 */
export const validateTrackInteraction = [
  body('interactionType')
    .isIn(['search', 'file_view', 'file_download', 'feedback', 'model_training', 'dataset_creation'])
    .withMessage('Invalid interaction type'),
  
  body('resourceType')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Resource type must be a string between 1 and 50 characters'),
  
  body('resourceId')
    .isUUID()
    .withMessage('Resource ID must be a valid UUID'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

/**
 * Validation for feedback aggregation requests
 */
export const validateFeedbackAggregation = [
  param('modelId')
    .isUUID()
    .withMessage('Model ID must be a valid UUID'),
  
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be an integer between 1 and 365')
];

/**
 * Validation for model improvement requests
 */
export const validateModelImprovement = [
  query('modelId')
    .optional()
    .isUUID()
    .withMessage('Model ID must be a valid UUID')
];

/**
 * Validation for user behavior requests
 */
export const validateUserBehavior = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be an integer between 1 and 365')
];

/**
 * Validation for feedback analytics requests
 */
export const validateFeedbackAnalytics = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be an integer between 1 and 365')
];