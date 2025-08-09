import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

const reportRequestSchema = Joi.object({
  startDate: Joi.date()
    .iso()
    .required()
    .messages({
      'date.base': 'Start date must be a valid date',
      'date.format': 'Start date must be in ISO format',
      'any.required': 'Start date is required'
    }),
  endDate: Joi.date()
    .iso()
    .min(Joi.ref('startDate'))
    .required()
    .messages({
      'date.base': 'End date must be a valid date',
      'date.format': 'End date must be in ISO format',
      'date.min': 'End date must be after start date',
      'any.required': 'End date is required'
    }),
  granularity: Joi.string()
    .valid('hour', 'day', 'week', 'month')
    .default('day')
    .messages({
      'any.only': 'Granularity must be one of: hour, day, week, month'
    }),
  modelId: Joi.string()
    .uuid()
    .messages({
      'string.uuid': 'Model ID must be a valid UUID'
    }),
  userId: Joi.string()
    .uuid()
    .messages({
      'string.uuid': 'User ID must be a valid UUID'
    }),
  action: Joi.string()
    .min(1)
    .max(100)
    .messages({
      'string.min': 'Action must not be empty',
      'string.max': 'Action cannot exceed 100 characters'
    }),
  resourceType: Joi.string()
    .min(1)
    .max(100)
    .messages({
      'string.min': 'Resource type must not be empty',
      'string.max': 'Resource type cannot exceed 100 characters'
    })
});

const reportExportSchema = Joi.object({
  reportType: Joi.string()
    .valid('usage', 'performance', 'audit')
    .required()
    .messages({
      'any.only': 'Report type must be one of: usage, performance, audit',
      'any.required': 'Report type is required'
    }),
  format: Joi.string()
    .valid('csv', 'pdf')
    .required()
    .messages({
      'any.only': 'Format must be either csv or pdf',
      'any.required': 'Format is required'
    }),
  startDate: Joi.date()
    .iso()
    .required()
    .messages({
      'date.base': 'Start date must be a valid date',
      'date.format': 'Start date must be in ISO format',
      'any.required': 'Start date is required'
    }),
  endDate: Joi.date()
    .iso()
    .min(Joi.ref('startDate'))
    .required()
    .messages({
      'date.base': 'End date must be a valid date',
      'date.format': 'End date must be in ISO format',
      'date.min': 'End date must be after start date',
      'any.required': 'End date is required'
    }),
  filters: Joi.object({
    userId: Joi.string().uuid(),
    action: Joi.string().min(1).max(100),
    resourceType: Joi.string().min(1).max(100),
    modelId: Joi.string().uuid(),
    granularity: Joi.string().valid('hour', 'day', 'week', 'month')
  }).messages({
    'string.uuid': 'ID must be a valid UUID',
    'string.min': 'Field must not be empty',
    'string.max': 'Field cannot exceed 100 characters',
    'any.only': 'Invalid value provided'
  })
});

export const validateReportRequest = (req: Request, res: Response, next: NextFunction) => {
  // Combine query parameters for validation
  const data = { ...req.query };
  
  const { error, value } = reportRequestSchema.validate(data, { 
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true
  });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid report request parameters',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        suggestions: [
          'Ensure dates are in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)',
          'End date must be after start date',
          'Check that UUIDs are properly formatted'
        ]
      }
    };
    return res.status(400).json(response);
  }
  
  // Update query with validated values
  req.query = value;
  next();
};

export const validateReportExport = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = reportExportSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid report export request',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        suggestions: [
          'Ensure all required fields are provided',
          'Check that dates are in ISO format',
          'Verify report type and format are supported'
        ]
      }
    };
    return res.status(400).json(response);
  }
  
  req.body = value;
  next();
};