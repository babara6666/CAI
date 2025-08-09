import { AxiosError } from 'axios';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
    requestId: string;
    suggestions?: string[];
  };
}

export interface UserFriendlyError {
  title: string;
  message: string;
  suggestions: string[];
  recoveryActions: RecoveryAction[];
  canRetry: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecoveryAction {
  label: string;
  action: string;
  type: 'button' | 'link' | 'retry';
  url?: string;
  handler?: () => void;
}

export class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private errorQueue: Array<{ error: Error; context?: string; timestamp: Date }> = [];
  private maxQueueSize = 100;

  public static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }

  constructor() {
    this.setupGlobalErrorHandlers();
  }

  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.logError(new Error(event.reason), 'unhandled-promise-rejection');
      
      // Prevent the default browser behavior
      event.preventDefault();
    });

    // Handle global JavaScript errors
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.logError(event.error, 'global-error');
    });

    // Handle resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        console.error('Resource loading error:', event);
        this.logError(
          new Error(`Failed to load resource: ${(event.target as any)?.src || 'unknown'}`),
          'resource-loading-error'
        );
      }
    }, true);
  }

  public handleApiError(error: AxiosError): UserFriendlyError {
    const errorResponse = error.response?.data as ErrorResponse;
    
    if (errorResponse?.error) {
      return this.createUserFriendlyError(errorResponse.error);
    }

    // Handle network errors
    if (!error.response) {
      return {
        title: 'Connection Problem',
        message: 'Unable to connect to the server. Please check your internet connection.',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'Contact support if the problem persists'
        ],
        recoveryActions: [
          {
            label: 'Retry',
            action: 'retry',
            type: 'retry'
          },
          {
            label: 'Refresh Page',
            action: 'refresh',
            type: 'button',
            handler: () => window.location.reload()
          }
        ],
        canRetry: true,
        severity: 'high'
      };
    }

    // Handle HTTP status codes
    const status = error.response.status;
    return this.createErrorFromStatus(status, error.message);
  }

  private createUserFriendlyError(errorData: ErrorResponse['error']): UserFriendlyError {
    const errorMappings: Record<string, Partial<UserFriendlyError>> = {
      'VALIDATION_ERROR': {
        title: 'Input Validation Failed',
        message: 'Please check your input and try again.',
        severity: 'medium',
        canRetry: true
      },
      'AUTHENTICATION_ERROR': {
        title: 'Authentication Required',
        message: 'Please log in to continue.',
        severity: 'high',
        canRetry: false,
        recoveryActions: [
          {
            label: 'Log In',
            action: 'login',
            type: 'button',
            handler: () => window.location.href = '/login'
          }
        ]
      },
      'AUTHORIZATION_ERROR': {
        title: 'Access Denied',
        message: 'You don\'t have permission to perform this action.',
        severity: 'medium',
        canRetry: false
      },
      'NOT_FOUND': {
        title: 'Not Found',
        message: 'The requested resource could not be found.',
        severity: 'medium',
        canRetry: false,
        recoveryActions: [
          {
            label: 'Go Back',
            action: 'back',
            type: 'button',
            handler: () => window.history.back()
          },
          {
            label: 'Go to Dashboard',
            action: 'dashboard',
            type: 'button',
            handler: () => window.location.href = '/'
          }
        ]
      },
      'FILE_UPLOAD_ERROR': {
        title: 'File Upload Failed',
        message: 'There was a problem uploading your file.',
        severity: 'medium',
        canRetry: true,
        suggestions: [
          'Check that your file is under the size limit',
          'Ensure the file format is supported',
          'Try uploading a different file'
        ]
      },
      'AI_SERVICE_ERROR': {
        title: 'AI Service Temporarily Unavailable',
        message: 'AI features are currently unavailable. Basic functionality is still available.',
        severity: 'medium',
        canRetry: true,
        suggestions: [
          'Try again in a few minutes',
          'Use basic search instead of AI search',
          'Check the service status page'
        ]
      },
      'RATE_LIMIT_ERROR': {
        title: 'Too Many Requests',
        message: 'You\'ve made too many requests. Please wait before trying again.',
        severity: 'low',
        canRetry: true,
        suggestions: [
          'Wait a few minutes before trying again',
          'Consider upgrading your plan for higher limits'
        ]
      }
    };

    const mapping = errorMappings[errorData.code] || {};
    
    return {
      title: mapping.title || 'Unexpected Error',
      message: errorData.message || mapping.message || 'Something went wrong.',
      suggestions: errorData.suggestions || mapping.suggestions || [
        'Try refreshing the page',
        'Contact support if the problem persists'
      ],
      recoveryActions: mapping.recoveryActions || [
        {
          label: 'Try Again',
          action: 'retry',
          type: 'retry'
        }
      ],
      canRetry: mapping.canRetry ?? true,
      severity: mapping.severity || 'medium'
    };
  }

  private createErrorFromStatus(status: number, message: string): UserFriendlyError {
    const statusMappings: Record<number, Partial<UserFriendlyError>> = {
      400: {
        title: 'Bad Request',
        message: 'The request was invalid. Please check your input.',
        severity: 'medium'
      },
      401: {
        title: 'Authentication Required',
        message: 'Please log in to continue.',
        severity: 'high',
        canRetry: false
      },
      403: {
        title: 'Access Denied',
        message: 'You don\'t have permission to access this resource.',
        severity: 'medium',
        canRetry: false
      },
      404: {
        title: 'Not Found',
        message: 'The requested resource was not found.',
        severity: 'medium',
        canRetry: false
      },
      429: {
        title: 'Too Many Requests',
        message: 'Please wait before making another request.',
        severity: 'low',
        canRetry: true
      },
      500: {
        title: 'Server Error',
        message: 'An internal server error occurred.',
        severity: 'high',
        canRetry: true
      },
      502: {
        title: 'Service Unavailable',
        message: 'The service is temporarily unavailable.',
        severity: 'high',
        canRetry: true
      },
      503: {
        title: 'Service Unavailable',
        message: 'The service is temporarily unavailable.',
        severity: 'high',
        canRetry: true
      }
    };

    const mapping = statusMappings[status] || {};
    
    return {
      title: mapping.title || 'Error',
      message: mapping.message || message || 'An error occurred.',
      suggestions: mapping.suggestions || [
        'Try again in a few moments',
        'Contact support if the problem persists'
      ],
      recoveryActions: mapping.recoveryActions || [
        {
          label: 'Try Again',
          action: 'retry',
          type: 'retry'
        }
      ],
      canRetry: mapping.canRetry ?? true,
      severity: mapping.severity || 'medium'
    };
  }

  public logError(error: Error, context?: string): void {
    const errorEntry = {
      error,
      context,
      timestamp: new Date()
    };

    // Add to queue
    this.errorQueue.push(errorEntry);
    
    // Maintain queue size
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // Log to console
    console.error('Error logged:', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: errorEntry.timestamp
    });

    // In a real application, send to monitoring service
    this.sendToMonitoringService(errorEntry);
  }

  private sendToMonitoringService(errorEntry: { error: Error; context?: string; timestamp: Date }): void {
    try {
      // Example: Send to monitoring service
      const errorReport = {
        message: errorEntry.error.message,
        stack: errorEntry.error.stack,
        context: errorEntry.context,
        timestamp: errorEntry.timestamp.toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: localStorage.getItem('userId') || 'anonymous'
      };

      // In a real application, you would send this to your monitoring service
      // Example: Sentry.captureException(errorEntry.error, { extra: errorReport });
      console.log('Error report sent to monitoring service:', errorReport);
    } catch (monitoringError) {
      console.error('Failed to send error to monitoring service:', monitoringError);
    }
  }

  public getErrorQueue(): Array<{ error: Error; context?: string; timestamp: Date }> {
    return [...this.errorQueue];
  }

  public clearErrorQueue(): void {
    this.errorQueue = [];
  }

  public createRetryHandler(originalFunction: Function, maxRetries: number = 3): Function {
    return async (...args: any[]) => {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await originalFunction(...args);
        } catch (error) {
          lastError = error as Error;
          
          if (attempt === maxRetries) {
            this.logError(lastError, `retry-failed-after-${maxRetries}-attempts`);
            throw lastError;
          }
          
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    };
  }

  public isRetryableError(error: Error | AxiosError): boolean {
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      
      // Retry on server errors and rate limits
      return !status || status >= 500 || status === 429;
    }
    
    // Retry on network errors
    return error.message.includes('network') || 
           error.message.includes('timeout') || 
           error.message.includes('connection');
  }
}

// Export singleton instance
export const errorHandlingService = ErrorHandlingService.getInstance();