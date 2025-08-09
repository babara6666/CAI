import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

const userCreationSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  username: Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required()
    .messages({
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 50 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens',
      'any.required': 'Username is required'
    }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  role: Joi.string()
    .valid('admin', 'engineer', 'viewer')
    .default('viewer')
    .messages({
      'any.only': 'Role must be one of: admin, engineer, viewer'
    })
});

const userUpdateSchema = Joi.object({
  email: Joi.string()
    .email()
    .messages({
      'string.email': 'Please provide a valid email address'
    }),
  username: Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 50 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens'
    }),
  role: Joi.string()
    .valid('admin', 'engineer', 'viewer')
    .messages({
      'any.only': 'Role must be one of: admin, engineer, viewer'
    }),
  isActive: Joi.boolean(),
  preferences: Joi.object({
    theme: Joi.string()
      .valid('light', 'dark')
      .messages({
        'any.only': 'Theme must be either light or dark'
      }),
    defaultSearchModel: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'Default search model must be a valid UUID'
      }),
    notificationSettings: Joi.object({
      emailNotifications: Joi.boolean(),
      trainingComplete: Joi.boolean(),
      searchResults: Joi.boolean(),
      systemUpdates: Joi.boolean()
    })
  })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

export const validateUserCreation = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = userCreationSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user data',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      }
    };
    return res.status(400).json(response);
  }
  
  req.body = value;
  next();
};

export const validateUserUpdate = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = userUpdateSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user update data',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      }
    };
    return res.status(400).json(response);
  }
  
  req.body = value;
  next();
};