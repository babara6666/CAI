import { useState, useCallback, useRef } from 'react';
import { AxiosError } from 'axios';
import { errorHandlingService, UserFriendlyError } from '../services/errorHandlingService';

export interface ErrorState {
  error: UserFriendlyError | null;
  isVisible: boolean;
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
}

export interface UseErrorHandlerOptions {
  maxRetries?: number;
  autoHide?: boolean;
  autoHideDelay?: number;
  onError?: (error: UserFriendlyError) => void;
  onRetry?: (retryCount: number) => void;
  onMaxRetriesReached?: (error: UserFriendlyError) => void;
}

export const useErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  const {
    maxRetries = 3,
    autoHide = false,
    autoHideDelay = 5000,
    onError,
    onRetry,
    onMaxRetriesReached
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isVisible: false,
    canRetry: false,
    retryCount: 0,
    maxRetries
  });

  const autoHideTimeoutRef = useRef<NodeJS.Timeout>();
  const retryFunctionRef = useRef<(() => Promise<void>) | null>(null);

  const clearAutoHideTimeout = useCallback(() => {
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = undefined;
    }
  }, []);

  const setAutoHideTimeout = useCallback(() => {
    if (autoHide) {
      clearAutoHideTimeout();
      autoHideTimeoutRef.current = setTimeout(() => {
        hideError();
      }, autoHideDelay);
    }
  }, [autoHide, autoHideDelay]);

  const showError = useCallback((error: Error | AxiosError | UserFriendlyError, retryFunction?: () => Promise<void>) => {
    let userFriendlyError: UserFriendlyError;

    if ('title' in error && 'message' in error) {
      // Already a UserFriendlyError
      userFriendlyError = error as UserFriendlyError;
    } else if ('response' in error || 'request' in error) {
      // Axios error
      userFriendlyError = errorHandlingService.handleApiError(error as AxiosError);
    } else {
      // Generic error
      userFriendlyError = {
        title: 'Unexpected Error',
        message: error.message || 'An unexpected error occurred.',
        suggestions: ['Try refreshing the page', 'Contact support if the problem persists'],
        recoveryActions: [
          {
            label: 'Try Again',
            action: 'retry',
            type: 'retry'
          }
        ],
        canRetry: true,
        severity: 'medium'
      };
    }

    // Store retry function
    retryFunctionRef.current = retryFunction || null;

    setErrorState({
      error: userFriendlyError,
      isVisible: true,
      canRetry: userFriendlyError.canRetry && !!retryFunction,
      retryCount: 0,
      maxRetries
    });

    // Log error
    errorHandlingService.logError(error as Error, 'user-error-handler');

    // Call onError callback
    if (onError) {
      onError(userFriendlyError);
    }

    // Set auto-hide timeout
    setAutoHideTimeout();
  }, [maxRetries, onError, setAutoHideTimeout]);

  const hideError = useCallback(() => {
    clearAutoHideTimeout();
    setErrorState(prev => ({
      ...prev,
      isVisible: false
    }));

    // Clear error after animation
    setTimeout(() => {
      setErrorState(prev => ({
        ...prev,
        error: null,
        retryCount: 0
      }));
      retryFunctionRef.current = null;
    }, 300);
  }, [clearAutoHideTimeout]);

  const retry = useCallback(async () => {
    if (!retryFunctionRef.current || !errorState.canRetry) {
      return;
    }

    const newRetryCount = errorState.retryCount + 1;

    // Check if max retries reached
    if (newRetryCount > maxRetries) {
      if (onMaxRetriesReached && errorState.error) {
        onMaxRetriesReached(errorState.error);
      }
      return;
    }

    setErrorState(prev => ({
      ...prev,
      retryCount: newRetryCount,
      isVisible: false
    }));

    // Call onRetry callback
    if (onRetry) {
      onRetry(newRetryCount);
    }

    try {
      await retryFunctionRef.current();
      // Success - clear error
      setErrorState({
        error: null,
        isVisible: false,
        canRetry: false,
        retryCount: 0,
        maxRetries
      });
      retryFunctionRef.current = null;
    } catch (error) {
      // Retry failed - show error again
      showError(error as Error);
    }
  }, [errorState, maxRetries, onRetry, onMaxRetriesReached, showError]);

  const executeWithErrorHandling = useCallback(async <T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      showError(error as Error, operation);
      return null;
    }
  }, [showError]);

  const createRetryableOperation = useCallback(<T>(
    operation: () => Promise<T>,
    operationName?: string
  ) => {
    return async (): Promise<T | null> => {
      return executeWithErrorHandling(operation, operationName);
    };
  }, [executeWithErrorHandling]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      clearAutoHideTimeout();
    };
  }, [clearAutoHideTimeout]);

  return {
    // State
    error: errorState.error,
    isVisible: errorState.isVisible,
    canRetry: errorState.canRetry,
    retryCount: errorState.retryCount,
    maxRetries: errorState.maxRetries,
    
    // Actions
    showError,
    hideError,
    retry,
    executeWithErrorHandling,
    createRetryableOperation,
    
    // Utilities
    isRetryable: (error: Error | AxiosError) => errorHandlingService.isRetryableError(error),
    clearError: hideError
  };
};

// Hook for global error handling
export const useGlobalErrorHandler = () => {
  const [globalErrors, setGlobalErrors] = useState<UserFriendlyError[]>([]);

  const addGlobalError = useCallback((error: UserFriendlyError) => {
    setGlobalErrors(prev => [...prev, { ...error, id: Date.now() }]);
  }, []);

  const removeGlobalError = useCallback((errorId: number) => {
    setGlobalErrors(prev => prev.filter(error => error.id !== errorId));
  }, []);

  const clearAllErrors = useCallback(() => {
    setGlobalErrors([]);
  }, []);

  return {
    globalErrors,
    addGlobalError,
    removeGlobalError,
    clearAllErrors
  };
};

// Hook for form error handling
export const useFormErrorHandler = () => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const setFieldError = useCallback((field: string, error: string) => {
    setFieldErrors(prev => ({
      ...prev,
      [field]: error
    }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const clearAllFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  const hasFieldError = useCallback((field: string) => {
    return !!fieldErrors[field];
  }, [fieldErrors]);

  const getFieldError = useCallback((field: string) => {
    return fieldErrors[field] || null;
  }, [fieldErrors]);

  const handleApiError = useCallback((error: AxiosError) => {
    const errorResponse = error.response?.data as any;
    
    if (errorResponse?.error?.details && typeof errorResponse.error.details === 'object') {
      // Handle field-specific validation errors
      Object.entries(errorResponse.error.details).forEach(([field, message]) => {
        setFieldError(field, message as string);
      });
    } else {
      // Handle general form error
      const userFriendlyError = errorHandlingService.handleApiError(error);
      setFormError(userFriendlyError.message);
    }
  }, [setFieldError]);

  const clearFormError = useCallback(() => {
    setFormError(null);
  }, []);

  const clearAllErrors = useCallback(() => {
    clearAllFieldErrors();
    clearFormError();
  }, [clearAllFieldErrors, clearFormError]);

  return {
    fieldErrors,
    formError,
    setFieldError,
    clearFieldError,
    clearAllFieldErrors,
    hasFieldError,
    getFieldError,
    handleApiError,
    clearFormError,
    clearAllErrors,
    hasErrors: Object.keys(fieldErrors).length > 0 || !!formError
  };
};

// Hook for async operation error handling
export const useAsyncErrorHandler = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<UserFriendlyError | null>(null);

  const execute = useCallback(async <T>(
    operation: () => Promise<T>,
    options: {
      onSuccess?: (result: T) => void;
      onError?: (error: UserFriendlyError) => void;
      showError?: boolean;
    } = {}
  ): Promise<T | null> => {
    const { onSuccess, onError, showError = true } = options;

    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (err) {
      const userFriendlyError = err instanceof Error && 'response' in err
        ? errorHandlingService.handleApiError(err as AxiosError)
        : {
            title: 'Operation Failed',
            message: (err as Error).message || 'An unexpected error occurred.',
            suggestions: ['Try again', 'Contact support if the problem persists'],
            recoveryActions: [],
            canRetry: true,
            severity: 'medium' as const
          };

      if (showError) {
        setError(userFriendlyError);
      }

      if (onError) {
        onError(userFriendlyError);
      }

      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retry = useCallback(async <T>(
    operation: () => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void;
      onError?: (error: UserFriendlyError) => void;
    }
  ): Promise<T | null> => {
    return execute(operation, options);
  }, [execute]);

  return {
    isLoading,
    error,
    execute,
    retry,
    clearError
  };
};