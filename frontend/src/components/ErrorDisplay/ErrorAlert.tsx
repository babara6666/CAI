import React from 'react';
import { AlertTriangle, X, RefreshCw, ExternalLink, Home, HelpCircle } from 'lucide-react';
import { UserFriendlyError } from '../../services/errorHandlingService';

interface ErrorAlertProps {
  error: UserFriendlyError;
  isVisible: boolean;
  canRetry: boolean;
  retryCount?: number;
  maxRetries?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const severityStyles = {
  low: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  medium: 'bg-orange-50 border-orange-200 text-orange-800',
  high: 'bg-red-50 border-red-200 text-red-800',
  critical: 'bg-red-100 border-red-300 text-red-900'
};

const severityIcons = {
  low: 'text-yellow-400',
  medium: 'text-orange-400',
  high: 'text-red-400',
  critical: 'text-red-500'
};

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  isVisible,
  canRetry,
  retryCount = 0,
  maxRetries = 3,
  onRetry,
  onDismiss,
  className = ''
}) => {
  if (!isVisible || !error) {
    return null;
  }

  const handleActionClick = (action: any) => {
    switch (action.type) {
      case 'retry':
        if (onRetry) {
          onRetry();
        }
        break;
      case 'button':
        if (action.handler) {
          action.handler();
        }
        break;
      case 'link':
        if (action.url) {
          window.location.href = action.url;
        }
        break;
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'retry':
        return <RefreshCw className="w-4 h-4" />;
      case 'link':
        return <ExternalLink className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const isRetryDisabled = canRetry && retryCount >= maxRetries;

  return (
    <div
      className={`
        fixed top-4 right-4 max-w-md w-full z-50 transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${className}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className={`
        rounded-lg border p-4 shadow-lg
        ${severityStyles[error.severity]}
      `}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <AlertTriangle className={`h-5 w-5 ${severityIcons[error.severity]}`} />
          </div>
          
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium">
              {error.title}
            </h3>
            
            <div className="mt-2 text-sm">
              <p>{error.message}</p>
            </div>

            {/* Retry information */}
            {canRetry && retryCount > 0 && (
              <div className="mt-2 text-xs opacity-75">
                Attempt {retryCount} of {maxRetries}
                {isRetryDisabled && (
                  <span className="ml-2 font-medium">Max retries reached</span>
                )}
              </div>
            )}

            {/* Suggestions */}
            {error.suggestions && error.suggestions.length > 0 && (
              <div className="mt-3">
                <details className="group">
                  <summary className="flex items-center cursor-pointer text-xs font-medium hover:underline">
                    <HelpCircle className="w-3 h-3 mr-1" />
                    What can I do?
                  </summary>
                  <ul className="mt-2 text-xs space-y-1 ml-4">
                    {error.suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start">
                        <span className="inline-block w-1 h-1 bg-current rounded-full mt-2 mr-2 flex-shrink-0" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}

            {/* Recovery Actions */}
            {error.recoveryActions && error.recoveryActions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {error.recoveryActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleActionClick(action)}
                    disabled={action.type === 'retry' && isRetryDisabled}
                    className={`
                      inline-flex items-center px-3 py-1 rounded text-xs font-medium
                      transition-colors duration-200
                      ${action.type === 'retry' 
                        ? 'bg-white bg-opacity-20 hover:bg-opacity-30 disabled:opacity-50 disabled:cursor-not-allowed'
                        : 'bg-white bg-opacity-20 hover:bg-opacity-30'
                      }
                    `}
                  >
                    {getActionIcon(action.type)}
                    <span className={action.type === 'retry' ? 'ml-1' : action.type === 'link' ? 'mr-1' : ''}>
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          {onDismiss && (
            <div className="ml-4 flex-shrink-0">
              <button
                onClick={onDismiss}
                className="inline-flex rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-white"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Inline error component for forms and specific sections
export const InlineError: React.FC<{
  error: UserFriendlyError;
  className?: string;
}> = ({ error, className = '' }) => {
  return (
    <div className={`rounded-md bg-red-50 border border-red-200 p-3 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </div>
        <div className="ml-2">
          <h4 className="text-sm font-medium text-red-800">
            {error.title}
          </h4>
          <p className="mt-1 text-sm text-red-700">
            {error.message}
          </p>
          {error.suggestions && error.suggestions.length > 0 && (
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
              {error.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// Field error component for form inputs
export const FieldError: React.FC<{
  error?: string;
  className?: string;
}> = ({ error, className = '' }) => {
  if (!error) return null;

  return (
    <p className={`mt-1 text-sm text-red-600 ${className}`} role="alert">
      {error}
    </p>
  );
};

// Loading error component
export const LoadingError: React.FC<{
  error: UserFriendlyError;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className = '' }) => {
  return (
    <div className={`text-center py-8 ${className}`}>
      <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
      <h3 className="mt-4 text-lg font-medium text-gray-900">
        {error.title}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        {error.message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </button>
      )}
    </div>
  );
};

// Empty state with error
export const EmptyStateError: React.FC<{
  error: UserFriendlyError;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className = '' }) => {
  return (
    <div className={`text-center py-12 ${className}`}>
      <div className="mx-auto h-24 w-24 rounded-full bg-red-100 flex items-center justify-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
      </div>
      <h3 className="mt-6 text-lg font-medium text-gray-900">
        {error.title}
      </h3>
      <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
        {error.message}
      </p>
      {error.suggestions && error.suggestions.length > 0 && (
        <div className="mt-4">
          <details className="inline-block text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Show suggestions
            </summary>
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              {error.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start">
                  <span className="inline-block w-1 h-1 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </button>
      )}
    </div>
  );
};