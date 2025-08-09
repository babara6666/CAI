import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { UserFriendlyError, errorHandlingService } from '../../services/errorHandlingService';
import { ErrorAlert } from '../ErrorDisplay/ErrorAlert';

interface ErrorState {
  errors: Array<UserFriendlyError & { id: string; timestamp: Date }>;
  globalError: (UserFriendlyError & { id: string }) | null;
  isOnline: boolean;
  retryQueue: Array<{ id: string; operation: () => Promise<void>; retryCount: number }>;
}

type ErrorAction =
  | { type: 'ADD_ERROR'; payload: UserFriendlyError & { id: string } }
  | { type: 'REMOVE_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_GLOBAL_ERROR'; payload: (UserFriendlyError & { id: string }) | null }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'ADD_TO_RETRY_QUEUE'; payload: { id: string; operation: () => Promise<void> } }
  | { type: 'REMOVE_FROM_RETRY_QUEUE'; payload: string }
  | { type: 'INCREMENT_RETRY_COUNT'; payload: string };

const initialState: ErrorState = {
  errors: [],
  globalError: null,
  isOnline: navigator.onLine,
  retryQueue: []
};

const errorReducer = (state: ErrorState, action: ErrorAction): ErrorState => {
  switch (action.type) {
    case 'ADD_ERROR':
      return {
        ...state,
        errors: [...state.errors, { ...action.payload, timestamp: new Date() }]
      };
    
    case 'REMOVE_ERROR':
      return {
        ...state,
        errors: state.errors.filter(error => error.id !== action.payload)
      };
    
    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: []
      };
    
    case 'SET_GLOBAL_ERROR':
      return {
        ...state,
        globalError: action.payload
      };
    
    case 'SET_ONLINE_STATUS':
      return {
        ...state,
        isOnline: action.payload
      };
    
    case 'ADD_TO_RETRY_QUEUE':
      return {
        ...state,
        retryQueue: [...state.retryQueue, { ...action.payload, retryCount: 0 }]
      };
    
    case 'REMOVE_FROM_RETRY_QUEUE':
      return {
        ...state,
        retryQueue: state.retryQueue.filter(item => item.id !== action.payload)
      };
    
    case 'INCREMENT_RETRY_COUNT':
      return {
        ...state,
        retryQueue: state.retryQueue.map(item =>
          item.id === action.payload
            ? { ...item, retryCount: item.retryCount + 1 }
            : item
        )
      };
    
    default:
      return state;
  }
};

interface ErrorContextValue {
  state: ErrorState;
  showError: (error: UserFriendlyError, options?: { persistent?: boolean; autoHide?: boolean }) => string;
  hideError: (errorId: string) => void;
  clearAllErrors: () => void;
  setGlobalError: (error: UserFriendlyError | null) => void;
  retryOperation: (operationId: string) => Promise<void>;
  addToRetryQueue: (operation: () => Promise<void>, operationId?: string) => string;
  executeWithErrorHandling: <T>(
    operation: () => Promise<T>,
    options?: {
      showError?: boolean;
      retryable?: boolean;
      operationName?: string;
    }
  ) => Promise<T | null>;
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export const useErrorContext = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrorContext must be used within an ErrorProvider');
  }
  return context;
};

interface ErrorProviderProps {
  children: React.ReactNode;
  maxErrors?: number;
  autoHideDelay?: number;
  retryDelay?: number;
  maxRetries?: number;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({
  children,
  maxErrors = 5,
  autoHideDelay = 5000,
  retryDelay = 2000,
  maxRetries = 3
}) => {
  const [state, dispatch] = useReducer(errorReducer, initialState);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
      
      // Retry queued operations when coming back online
      state.retryQueue.forEach(item => {
        retryOperation(item.id);
      });
    };

    const handleOffline = () => {
      dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
      
      // Show offline error
      showError({
        title: 'Connection Lost',
        message: 'You are currently offline. Some features may not work properly.',
        suggestions: [
          'Check your internet connection',
          'Operations will be retried when connection is restored'
        ],
        recoveryActions: [],
        canRetry: false,
        severity: 'medium'
      }, { persistent: true });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [state.retryQueue]);

  // Auto-hide errors
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    state.errors.forEach(error => {
      if (error.severity !== 'critical') {
        const timer = setTimeout(() => {
          hideError(error.id);
        }, autoHideDelay);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [state.errors, autoHideDelay]);

  const generateErrorId = useCallback(() => {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const showError = useCallback((
    error: UserFriendlyError,
    options: { persistent?: boolean; autoHide?: boolean } = {}
  ): string => {
    const errorId = generateErrorId();
    const errorWithId = { ...error, id: errorId };

    dispatch({ type: 'ADD_ERROR', payload: errorWithId });

    // Log error
    errorHandlingService.logError(new Error(error.message), `user-error-${error.severity}`);

    // Maintain max errors limit
    if (state.errors.length >= maxErrors) {
      const oldestError = state.errors[0];
      if (oldestError) {
        hideError(oldestError.id);
      }
    }

    return errorId;
  }, [generateErrorId, maxErrors, state.errors.length]);

  const hideError = useCallback((errorId: string) => {
    dispatch({ type: 'REMOVE_ERROR', payload: errorId });
  }, []);

  const clearAllErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ERRORS' });
  }, []);

  const setGlobalError = useCallback((error: UserFriendlyError | null) => {
    const errorWithId = error ? { ...error, id: generateErrorId() } : null;
    dispatch({ type: 'SET_GLOBAL_ERROR', payload: errorWithId });
  }, [generateErrorId]);

  const addToRetryQueue = useCallback((
    operation: () => Promise<void>,
    operationId?: string
  ): string => {
    const id = operationId || generateErrorId();
    dispatch({ type: 'ADD_TO_RETRY_QUEUE', payload: { id, operation } });
    return id;
  }, [generateErrorId]);

  const retryOperation = useCallback(async (operationId: string): Promise<void> => {
    const queueItem = state.retryQueue.find(item => item.id === operationId);
    if (!queueItem) return;

    if (queueItem.retryCount >= maxRetries) {
      dispatch({ type: 'REMOVE_FROM_RETRY_QUEUE', payload: operationId });
      showError({
        title: 'Operation Failed',
        message: 'Maximum retry attempts reached. Please try again manually.',
        suggestions: ['Check your connection', 'Try again later'],
        recoveryActions: [],
        canRetry: false,
        severity: 'high'
      });
      return;
    }

    try {
      dispatch({ type: 'INCREMENT_RETRY_COUNT', payload: operationId });
      
      // Add delay before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * (queueItem.retryCount + 1)));
      
      await queueItem.operation();
      
      // Success - remove from queue
      dispatch({ type: 'REMOVE_FROM_RETRY_QUEUE', payload: operationId });
      
    } catch (error) {
      // Retry failed - will try again up to maxRetries
      console.warn(`Retry ${queueItem.retryCount + 1} failed for operation ${operationId}:`, error);
    }
  }, [state.retryQueue, maxRetries, retryDelay, showError]);

  const executeWithErrorHandling = useCallback(async <T>(
    operation: () => Promise<T>,
    options: {
      showError?: boolean;
      retryable?: boolean;
      operationName?: string;
    } = {}
  ): Promise<T | null> => {
    const { showError: shouldShowError = true, retryable = false, operationName = 'operation' } = options;

    try {
      return await operation();
    } catch (error) {
      const userFriendlyError = errorHandlingService.handleApiError(error as any);

      if (shouldShowError) {
        const errorId = showError(userFriendlyError);

        if (retryable && state.isOnline) {
          addToRetryQueue(async () => {
            const result = await operation();
            hideError(errorId);
            return result;
          });
        }
      }

      // Log error
      errorHandlingService.logError(error as Error, `operation-failed-${operationName}`);

      return null;
    }
  }, [showError, addToRetryQueue, hideError, state.isOnline]);

  const contextValue: ErrorContextValue = {
    state,
    showError,
    hideError,
    clearAllErrors,
    setGlobalError,
    retryOperation,
    addToRetryQueue,
    executeWithErrorHandling
  };

  return (
    <ErrorContext.Provider value={contextValue}>
      {children}
      
      {/* Render error alerts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {state.errors.map(error => (
          <ErrorAlert
            key={error.id}
            error={error}
            isVisible={true}
            canRetry={error.canRetry}
            onRetry={() => {
              // Find and retry the operation if it's in the queue
              const queueItem = state.retryQueue.find(item => 
                item.id.includes(error.id) || error.id.includes(item.id)
              );
              if (queueItem) {
                retryOperation(queueItem.id);
              }
            }}
            onDismiss={() => hideError(error.id)}
          />
        ))}
      </div>

      {/* Global error overlay */}
      {state.globalError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <ErrorAlert
              error={state.globalError}
              isVisible={true}
              canRetry={state.globalError.canRetry}
              onRetry={() => {
                // Handle global error retry
                if (state.globalError) {
                  setGlobalError(null);
                }
              }}
              onDismiss={() => setGlobalError(null)}
              className="relative"
            />
          </div>
        </div>
      )}

      {/* Offline indicator */}
      {!state.isOnline && (
        <div className="fixed bottom-4 left-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
            You are offline
          </div>
        </div>
      )}
    </ErrorContext.Provider>
  );
};