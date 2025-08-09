import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { errorMonitoringService } from '../services/ErrorMonitoringService';
import { errorRecoveryService } from '../services/ErrorRecoveryService';
import { getErrorMessage, getRecoveryActions } from '../utils/errorMessages';

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;
  suggestions?: string[];
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: any;
  public suggestions?: string[];

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any,
    suggestions?: string[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.suggestions = suggestions;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const createError = (
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: any,
  suggestions?: string[]
): CustomError => {
  return new CustomError(message, statusCode, code, details, suggestions);
};

// Common error types
export const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR'
};

// Error response format
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
    requestId: string;
    errorId?: string;
    suggestions?: string[];
    recoveryActions?: Array<{
      label: string;
      action: string;
      type: 'button' | 'link' | 'retry';
      url?: string;
    }>;
  };
}

// Generate unique request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Enhanced centralized error handling middleware
export const errorHandler = async (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  // Set default error properties
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;
  let suggestions: string[] = [];

  // Handle custom application errors
  if (err instanceof CustomError) {
    statusCode = err.statusCode;
    code = err.code || 'APPLICATION_ERROR';
    message = err.message;
    details = err.details;
    suggestions = err.suggestions || [];
  }
  // Handle validation errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = ErrorTypes.VALIDATION_ERROR;
    message = 'Validation failed';
    details = err.message;
    suggestions = ['Please check your input and try again'];
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ErrorTypes.AUTHENTICATION_ERROR;
    message = 'Invalid authentication token';
    suggestions = ['Please log in again'];
  }
  // Handle database errors
  else if (err.message?.includes('database') || err.message?.includes('connection')) {
    statusCode = 503;
    code = ErrorTypes.DATABASE_ERROR;
    message = 'Database service temporarily unavailable';
    suggestions = ['Please try again in a few moments'];
  }
  // Handle file upload errors
  else if (err.message?.includes('file') && err.message?.includes('upload')) {
    statusCode = 400;
    code = ErrorTypes.FILE_UPLOAD_ERROR;
    message = 'File upload failed';
    suggestions = ['Check file size and format', 'Ensure stable internet connection'];
  }

  // Get enhanced error information
  const errorMessage = getErrorMessage(code);
  if (errorMessage.code !== 'UNKNOWN_ERROR') {
    message = errorMessage.message;
    suggestions = errorMessage.suggestions;
  }

  // Get recovery actions
  const recoveryActions = getRecoveryActions(code);

  // Capture error in monitoring service
  const errorLevel = statusCode >= 500 ? 'critical' : statusCode >= 400 ? 'error' : 'warning';
  const errorId = errorMonitoringService.captureError(err, errorLevel, {
    userId: (req as any).user?.id,
    requestId,
    operation: `${req.method} ${req.path}`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    url: req.originalUrl,
    method: req.method,
    statusCode,
    responseTime: Date.now() - startTime
  }, {
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Log error details
  logger.error('Request error', {
    requestId,
    errorId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode,
      code
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      user: (req as any).user?.id
    }
  });

  // Create error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date(),
      requestId,
      errorId,
      suggestions,
      recoveryActions: recoveryActions.map(action => ({
        label: action.label,
        action: action.action,
        type: action.type,
        url: action.url
      }))
    }
  };

  // Don't expose internal details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.error.details = undefined;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = createError(
    `Route ${req.originalUrl} not found`,
    404,
    ErrorTypes.NOT_FOUND,
    { method: req.method, url: req.originalUrl },
    ['Check the API documentation for valid endpoints']
  );
  next(error);
};