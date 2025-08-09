import { AxiosError } from 'axios';
import { ErrorHandlingService, errorHandlingService } from '../../services/errorHandlingService';

// Mock console methods
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

describe('ErrorHandlingService', () => {
  let service: ErrorHandlingService;

  beforeEach(() => {
    service = ErrorHandlingService.getInstance();
    service.clearErrorQueue();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const service1 = ErrorHandlingService.getInstance();
      const service2 = ErrorHandlingService.getInstance();
      expect(service1).toBe(service2);
    });

    it('should return the same instance as the exported singleton', () => {
      const service1 = ErrorHandlingService.getInstance();
      expect(service1).toBe(errorHandlingService);
    });
  });

  describe('API Error Handling', () => {
    it('should handle Axios error with error response', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              suggestions: ['Check your input'],
              timestamp: new Date(),
              requestId: 'req-123'
            }
          }
        }
      } as AxiosError;

      const result = service.handleApiError(axiosError);

      expect(result.title).toBe('Input Validation Failed');
      expect(result.message).toBe('Invalid input');
      expect(result.suggestions).toContain('Check your input');
      expect(result.canRetry).toBe(true);
      expect(result.severity).toBe('medium');
    });

    it('should handle network errors', () => {
      const networkError = {
        isAxiosError: true,
        message: 'Network Error',
        response: undefined
      } as AxiosError;

      const result = service.handleApiError(networkError);

      expect(result.title).toBe('Connection Problem');
      expect(result.message).toContain('Unable to connect to the server');
      expect(result.canRetry).toBe(true);
      expect(result.severity).toBe('high');
      expect(result.recoveryActions).toHaveLength(2);
    });

    it('should handle HTTP status codes', () => {
      const statusError = {
        isAxiosError: true,
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: {}
        }
      } as AxiosError;

      const result = service.handleApiError(statusError);

      expect(result.title).toBe('Not Found');
      expect(result.message).toBe('The requested resource was not found.');
      expect(result.canRetry).toBe(false);
      expect(result.severity).toBe('medium');
    });

    it('should handle authentication errors', () => {
      const authError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'Invalid token',
              timestamp: new Date(),
              requestId: 'req-123'
            }
          }
        }
      } as AxiosError;

      const result = service.handleApiError(authError);

      expect(result.title).toBe('Authentication Required');
      expect(result.canRetry).toBe(false);
      expect(result.severity).toBe('high');
      expect(result.recoveryActions).toHaveLength(1);
      expect(result.recoveryActions[0].label).toBe('Log In');
    });

    it('should handle rate limit errors', () => {
      const rateLimitError = {
        isAxiosError: true,
        response: {
          status: 429,
          data: {
            success: false,
            error: {
              code: 'RATE_LIMIT_ERROR',
              message: 'Too many requests',
              timestamp: new Date(),
              requestId: 'req-123'
            }
          }
        }
      } as AxiosError;

      const result = service.handleApiError(rateLimitError);

      expect(result.title).toBe('Too Many Requests');
      expect(result.canRetry).toBe(true);
      expect(result.severity).toBe('low');
      expect(result.suggestions).toContain('Wait a few minutes before trying again');
    });
  });

  describe('Error Logging', () => {
    it('should log errors to the queue', () => {
      const error = new Error('Test error');
      const context = 'test-context';

      service.logError(error, context);

      const queue = service.getErrorQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].error).toBe(error);
      expect(queue[0].context).toBe(context);
      expect(queue[0].timestamp).toBeInstanceOf(Date);
    });

    it('should maintain queue size limit', () => {
      // Add more errors than the max queue size (100)
      for (let i = 0; i < 105; i++) {
        service.logError(new Error(`Error ${i}`), `context-${i}`);
      }

      const queue = service.getErrorQueue();
      expect(queue).toHaveLength(100);
      
      // Should have removed the oldest errors
      expect(queue[0].context).toBe('context-5');
      expect(queue[99].context).toBe('context-104');
    });

    it('should clear error queue', () => {
      service.logError(new Error('Test error'), 'test-context');
      expect(service.getErrorQueue()).toHaveLength(1);

      service.clearErrorQueue();
      expect(service.getErrorQueue()).toHaveLength(0);
    });
  });

  describe('Retry Handler', () => {
    it('should create retry handler that succeeds on first attempt', async () => {
      const mockFunction = jest.fn().mockResolvedValue('success');
      const retryHandler = service.createRetryHandler(mockFunction, 3);

      const result = await retryHandler('arg1', 'arg2');

      expect(result).toBe('success');
      expect(mockFunction).toHaveBeenCalledTimes(1);
      expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should retry failed operations', async () => {
      const mockFunction = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      const retryHandler = service.createRetryHandler(mockFunction, 3);

      const result = await retryHandler();

      expect(result).toBe('success');
      expect(mockFunction).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const error = new Error('Persistent failure');
      const mockFunction = jest.fn().mockRejectedValue(error);
      const retryHandler = service.createRetryHandler(mockFunction, 2);

      await expect(retryHandler()).rejects.toThrow('Persistent failure');
      expect(mockFunction).toHaveBeenCalledTimes(2);
    });

    it('should log error when max retries exceeded', async () => {
      const error = new Error('Persistent failure');
      const mockFunction = jest.fn().mockRejectedValue(error);
      const retryHandler = service.createRetryHandler(mockFunction, 2);
      const logErrorSpy = jest.spyOn(service, 'logError');

      try {
        await retryHandler();
      } catch (e) {
        // Expected to throw
      }

      expect(logErrorSpy).toHaveBeenCalledWith(
        error,
        'retry-failed-after-2-attempts'
      );
    });
  });

  describe('Retryable Error Detection', () => {
    it('should identify retryable Axios errors', () => {
      const serverError = {
        isAxiosError: true,
        response: { status: 500 }
      } as AxiosError;

      const rateLimitError = {
        isAxiosError: true,
        response: { status: 429 }
      } as AxiosError;

      const networkError = {
        isAxiosError: true,
        response: undefined
      } as AxiosError;

      expect(service.isRetryableError(serverError)).toBe(true);
      expect(service.isRetryableError(rateLimitError)).toBe(true);
      expect(service.isRetryableError(networkError)).toBe(true);
    });

    it('should identify non-retryable Axios errors', () => {
      const clientError = {
        isAxiosError: true,
        response: { status: 400 }
      } as AxiosError;

      const authError = {
        isAxiosError: true,
        response: { status: 401 }
      } as AxiosError;

      const notFoundError = {
        isAxiosError: true,
        response: { status: 404 }
      } as AxiosError;

      expect(service.isRetryableError(clientError)).toBe(false);
      expect(service.isRetryableError(authError)).toBe(false);
      expect(service.isRetryableError(notFoundError)).toBe(false);
    });

    it('should identify retryable generic errors', () => {
      const networkError = new Error('Network connection failed');
      const timeoutError = new Error('Request timeout');
      const connectionError = new Error('Connection refused');

      expect(service.isRetryableError(networkError)).toBe(true);
      expect(service.isRetryableError(timeoutError)).toBe(true);
      expect(service.isRetryableError(connectionError)).toBe(true);
    });

    it('should identify non-retryable generic errors', () => {
      const validationError = new Error('Validation failed');
      const genericError = new Error('Something went wrong');

      expect(service.isRetryableError(validationError)).toBe(false);
      expect(service.isRetryableError(genericError)).toBe(false);
    });
  });

  describe('Error Code Mapping', () => {
    it('should map AI service errors correctly', () => {
      const aiError = {
        isAxiosError: true,
        response: {
          status: 503,
          data: {
            success: false,
            error: {
              code: 'AI_SERVICE_ERROR',
              message: 'AI service unavailable',
              timestamp: new Date(),
              requestId: 'req-123'
            }
          }
        }
      } as AxiosError;

      const result = service.handleApiError(aiError);

      expect(result.title).toBe('AI Service Temporarily Unavailable');
      expect(result.message).toBe('AI service unavailable');
      expect(result.canRetry).toBe(true);
      expect(result.severity).toBe('medium');
      expect(result.suggestions).toContain('Try again in a few minutes');
    });

    it('should map file upload errors correctly', () => {
      const fileError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'FILE_UPLOAD_ERROR',
              message: 'File too large',
              timestamp: new Date(),
              requestId: 'req-123'
            }
          }
        }
      } as AxiosError;

      const result = service.handleApiError(fileError);

      expect(result.title).toBe('File Upload Failed');
      expect(result.message).toBe('File too large');
      expect(result.canRetry).toBe(true);
      expect(result.severity).toBe('medium');
      expect(result.suggestions).toContain('Check that your file is under the size limit');
    });
  });
});