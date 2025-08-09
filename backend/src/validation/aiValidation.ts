import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

const modelTrainingSchema = Joi.object({
  datasetId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.uuid': 'Dataset ID must be a valid UUID',
      'any.required': 'Dataset ID is required'
    }),
  modelConfig: Joi.object({
    name: Joi.string()
      .min(3)
      .max(100)
      .required()
      .messages({
        'string.min': 'Model name must be at least 3 characters long',
        'string.max': 'Model name cannot exceed 100 characters',
        'any.required': 'Model name is required'
      }),
    description: Joi.string()
      .max(500)
      .messages({
        'string.max': 'Model description cannot exceed 500 characters'
      }),
    type: Joi.string()
      .valid('cnn', 'transformer', 'hybrid')
      .required()
      .messages({
        'any.only': 'Model type must be one of: cnn, transformer, hybrid',
        'any.required': 'Model type is required'
      }),
    architecture: Joi.string()
      .min(1)
      .max(200)
      .required()
      .messages({
        'string.min': 'Architecture specification is required',
        'string.max': 'Architecture specification cannot exceed 200 characters',
        'any.required': 'Architecture is required'
      }),
    hyperparameters: Joi.object()
      .pattern(Joi.string(), Joi.alternatives().try(
        Joi.string(),
        Joi.number(),
        Joi.boolean(),
        Joi.array()
      ))
      .messages({
        'object.pattern.match': 'Hyperparameters must be valid key-value pairs'
      }),
    trainingConfig: Joi.object({
      epochs: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .required()
        .messages({
          'number.base': 'Epochs must be a number',
          'number.integer': 'Epochs must be an integer',
          'number.min': 'Epochs must be at least 1',
          'number.max': 'Epochs cannot exceed 1000',
          'any.required': 'Epochs is required'
        }),
      batchSize: Joi.number()
        .integer()
        .min(1)
        .max(512)
        .required()
        .messages({
          'number.base': 'Batch size must be a number',
          'number.integer': 'Batch size must be an integer',
          'number.min': 'Batch size must be at least 1',
          'number.max': 'Batch size cannot exceed 512',
          'any.required': 'Batch size is required'
        }),
      learningRate: Joi.number()
        .min(0.0001)
        .max(1.0)
        .required()
        .messages({
          'number.base': 'Learning rate must be a number',
          'number.min': 'Learning rate must be at least 0.0001',
          'number.max': 'Learning rate cannot exceed 1.0',
          'any.required': 'Learning rate is required'
        }),
      validationSplit: Joi.number()
        .min(0.1)
        .max(0.5)
        .required()
        .messages({
          'number.base': 'Validation split must be a number',
          'number.min': 'Validation split must be at least 0.1 (10%)',
          'number.max': 'Validation split cannot exceed 0.5 (50%)',
          'any.required': 'Validation split is required'
        }),
      earlyStopping: Joi.boolean()
        .required()
        .messages({
          'boolean.base': 'Early stopping must be a boolean',
          'any.required': 'Early stopping setting is required'
        }),
      patience: Joi.number()
        .integer()
        .min(1)
        .when('earlyStopping', {
          is: true,
          then: Joi.required(),
          otherwise: Joi.optional()
        })
        .messages({
          'number.base': 'Patience must be a number',
          'number.integer': 'Patience must be an integer',
          'number.min': 'Patience must be at least 1',
          'any.required': 'Patience is required when early stopping is enabled'
        })
    }).required().messages({
      'any.required': 'Training configuration is required'
    })
  }).required().messages({
    'any.required': 'Model configuration is required'
  })
});

const inferenceRequestSchema = Joi.object({
  modelId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.uuid': 'Model ID must be a valid UUID',
      'any.required': 'Model ID is required'
    }),
  query: Joi.string()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Query cannot be empty',
      'string.max': 'Query cannot exceed 1000 characters',
      'any.required': 'Query is required'
    }),
  options: Joi.object({
    maxResults: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.base': 'Max results must be a number',
        'number.integer': 'Max results must be an integer',
        'number.min': 'Max results must be at least 1',
        'number.max': 'Max results cannot exceed 100'
      }),
    threshold: Joi.number()
      .min(0)
      .max(1)
      .default(0.5)
      .messages({
        'number.base': 'Threshold must be a number',
        'number.min': 'Threshold must be at least 0',
        'number.max': 'Threshold cannot exceed 1'
      }),
    includeMetadata: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'Include metadata must be a boolean'
      })
  }).default({})
});

export const validateModelTraining = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = modelTrainingSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid model training request',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        suggestions: [
          'Ensure all required fields are provided',
          'Check that numeric values are within valid ranges',
          'Verify that the dataset ID exists and is accessible',
          'Review training configuration parameters'
        ]
      }
    };
    return res.status(400).json(response);
  }
  
  req.body = value;
  next();
};

export const validateInferenceRequest = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = inferenceRequestSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid inference request',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        suggestions: [
          'Ensure model ID is a valid UUID',
          'Check that query is not empty and within length limits',
          'Verify inference options are within valid ranges'
        ]
      }
    };
    return res.status(400).json(response);
  }
  
  req.body = value;
  next();
};