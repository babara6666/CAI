export interface ErrorMessage {
  code: string;
  message: string;
  suggestions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'user' | 'system' | 'network' | 'security';
}

export const ErrorMessages: Record<string, ErrorMessage> = {
  // Authentication Errors
  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'The email or password you entered is incorrect.',
    suggestions: [
      'Double-check your email and password',
      'Use the "Forgot Password" link if you can\'t remember your password',
      'Make sure Caps Lock is not enabled'
    ],
    severity: 'medium',
    category: 'user'
  },

  ACCOUNT_LOCKED: {
    code: 'ACCOUNT_LOCKED',
    message: 'Your account has been temporarily locked due to multiple failed login attempts.',
    suggestions: [
      'Wait 15 minutes before trying again',
      'Use the "Forgot Password" link to reset your password',
      'Contact support if you believe this is an error'
    ],
    severity: 'high',
    category: 'security'
  },

  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    message: 'Your session has expired. Please log in again.',
    suggestions: [
      'Click "Log In" to sign in again',
      'Your work has been saved automatically'
    ],
    severity: 'medium',
    category: 'user'
  },

  INSUFFICIENT_PERMISSIONS: {
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'You don\'t have permission to perform this action.',
    suggestions: [
      'Contact your administrator to request access',
      'Make sure you\'re logged in with the correct account',
      'Check if your account role has the necessary permissions'
    ],
    severity: 'medium',
    category: 'user'
  },

  // File Upload Errors
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'The file you\'re trying to upload is too large.',
    suggestions: [
      'Compress your file or reduce its size',
      'Split large files into smaller parts',
      'Contact support to increase your upload limit'
    ],
    severity: 'medium',
    category: 'user'
  },

  UNSUPPORTED_FILE_TYPE: {
    code: 'UNSUPPORTED_FILE_TYPE',
    message: 'This file type is not supported.',
    suggestions: [
      'Convert your file to a supported format (DWG, DXF, STEP, IGES)',
      'Check the list of supported file types in the help documentation',
      'Contact support if you need support for additional file types'
    ],
    severity: 'medium',
    category: 'user'
  },

  FILE_CORRUPTED: {
    code: 'FILE_CORRUPTED',
    message: 'The uploaded file appears to be corrupted or damaged.',
    suggestions: [
      'Try uploading the file again',
      'Check if the original file opens correctly in your CAD software',
      'Try exporting the file again from your CAD application'
    ],
    severity: 'medium',
    category: 'user'
  },

  MALWARE_DETECTED: {
    code: 'MALWARE_DETECTED',
    message: 'The uploaded file failed security screening.',
    suggestions: [
      'Scan your file with antivirus software',
      'Try uploading a different file',
      'Contact support if you believe this is a false positive'
    ],
    severity: 'high',
    category: 'security'
  },

  STORAGE_QUOTA_EXCEEDED: {
    code: 'STORAGE_QUOTA_EXCEEDED',
    message: 'You\'ve reached your storage limit.',
    suggestions: [
      'Delete some old files to free up space',
      'Upgrade your plan for more storage',
      'Archive files you don\'t need immediate access to'
    ],
    severity: 'medium',
    category: 'user'
  },

  // AI Service Errors
  AI_SERVICE_UNAVAILABLE: {
    code: 'AI_SERVICE_UNAVAILABLE',
    message: 'AI features are temporarily unavailable.',
    suggestions: [
      'Try again in a few minutes',
      'Use basic search instead of AI-powered search',
      'Check our status page for service updates'
    ],
    severity: 'medium',
    category: 'system'
  },

  MODEL_NOT_READY: {
    code: 'MODEL_NOT_READY',
    message: 'The AI model is still training and not ready for use.',
    suggestions: [
      'Wait for the training to complete',
      'Use a different trained model if available',
      'Check the training progress in the dashboard'
    ],
    severity: 'medium',
    category: 'system'
  },

  TRAINING_FAILED: {
    code: 'TRAINING_FAILED',
    message: 'Model training failed due to an error.',
    suggestions: [
      'Check your dataset for issues',
      'Try training with different parameters',
      'Contact support if the problem persists'
    ],
    severity: 'high',
    category: 'system'
  },

  INSUFFICIENT_TRAINING_DATA: {
    code: 'INSUFFICIENT_TRAINING_DATA',
    message: 'Not enough data to train the model effectively.',
    suggestions: [
      'Add more files to your dataset',
      'Ensure your dataset has diverse examples',
      'Consider using data augmentation techniques'
    ],
    severity: 'medium',
    category: 'user'
  },

  // Database Errors
  DATABASE_CONNECTION_FAILED: {
    code: 'DATABASE_CONNECTION_FAILED',
    message: 'Unable to connect to the database.',
    suggestions: [
      'Try again in a few moments',
      'Check your internet connection',
      'Contact support if the problem persists'
    ],
    severity: 'high',
    category: 'system'
  },

  DATA_INTEGRITY_ERROR: {
    code: 'DATA_INTEGRITY_ERROR',
    message: 'A data integrity issue was detected.',
    suggestions: [
      'Try the operation again',
      'Contact support with details of what you were doing',
      'Check if your data was saved correctly'
    ],
    severity: 'high',
    category: 'system'
  },

  // Network Errors
  NETWORK_TIMEOUT: {
    code: 'NETWORK_TIMEOUT',
    message: 'The request timed out. Please try again.',
    suggestions: [
      'Check your internet connection',
      'Try again with a smaller file or simpler operation',
      'Contact support if timeouts persist'
    ],
    severity: 'medium',
    category: 'network'
  },

  CONNECTION_LOST: {
    code: 'CONNECTION_LOST',
    message: 'Connection to the server was lost.',
    suggestions: [
      'Check your internet connection',
      'Refresh the page to reconnect',
      'Your work may have been saved automatically'
    ],
    severity: 'high',
    category: 'network'
  },

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'You\'ve made too many requests. Please slow down.',
    suggestions: [
      'Wait a few minutes before trying again',
      'Consider upgrading your plan for higher limits',
      'Batch your operations to reduce request frequency'
    ],
    severity: 'low',
    category: 'user'
  },

  // Search Errors
  SEARCH_TIMEOUT: {
    code: 'SEARCH_TIMEOUT',
    message: 'The search request timed out.',
    suggestions: [
      'Try a more specific search query',
      'Use filters to narrow down results',
      'Try again in a few moments'
    ],
    severity: 'medium',
    category: 'system'
  },

  INVALID_SEARCH_QUERY: {
    code: 'INVALID_SEARCH_QUERY',
    message: 'The search query contains invalid characters or format.',
    suggestions: [
      'Remove special characters from your search',
      'Try using simpler search terms',
      'Check the search help for query syntax'
    ],
    severity: 'low',
    category: 'user'
  },

  // System Errors
  MAINTENANCE_MODE: {
    code: 'MAINTENANCE_MODE',
    message: 'The system is currently under maintenance.',
    suggestions: [
      'Try again after the maintenance window',
      'Check our status page for updates',
      'Follow us on social media for announcements'
    ],
    severity: 'high',
    category: 'system'
  },

  RESOURCE_EXHAUSTED: {
    code: 'RESOURCE_EXHAUSTED',
    message: 'System resources are temporarily exhausted.',
    suggestions: [
      'Try again in a few minutes',
      'Consider breaking large operations into smaller parts',
      'Contact support if this happens frequently'
    ],
    severity: 'high',
    category: 'system'
  },

  // Validation Errors
  INVALID_INPUT_FORMAT: {
    code: 'INVALID_INPUT_FORMAT',
    message: 'The input format is not valid.',
    suggestions: [
      'Check the required format for this field',
      'Remove any special characters',
      'Refer to the help documentation for examples'
    ],
    severity: 'low',
    category: 'user'
  },

  REQUIRED_FIELD_MISSING: {
    code: 'REQUIRED_FIELD_MISSING',
    message: 'Required fields are missing.',
    suggestions: [
      'Fill in all required fields marked with *',
      'Check that all mandatory information is provided',
      'Review the form for any validation errors'
    ],
    severity: 'low',
    category: 'user'
  }
};

export const getErrorMessage = (code: string): ErrorMessage => {
  return ErrorMessages[code] || {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred.',
    suggestions: [
      'Try refreshing the page',
      'Contact support if the problem persists',
      'Check your internet connection'
    ],
    severity: 'medium',
    category: 'system'
  };
};

export const getErrorsByCategory = (category: ErrorMessage['category']): ErrorMessage[] => {
  return Object.values(ErrorMessages).filter(error => error.category === category);
};

export const getErrorsBySeverity = (severity: ErrorMessage['severity']): ErrorMessage[] => {
  return Object.values(ErrorMessages).filter(error => error.severity === severity);
};

export const formatErrorForUser = (error: ErrorMessage, context?: any): string => {
  let message = error.message;
  
  // Add context-specific information if available
  if (context) {
    if (context.fileName && error.code.includes('FILE')) {
      message += ` (File: ${context.fileName})`;
    }
    if (context.operation && error.code.includes('OPERATION')) {
      message += ` (Operation: ${context.operation})`;
    }
  }
  
  return message;
};

export const getRecoveryActions = (errorCode: string): Array<{
  label: string;
  action: string;
  type: 'button' | 'link' | 'retry';
  url?: string;
}> => {
  const commonActions = {
    retry: { label: 'Try Again', action: 'retry', type: 'retry' as const },
    refresh: { label: 'Refresh Page', action: 'refresh', type: 'button' as const },
    home: { label: 'Go to Dashboard', action: 'home', type: 'link' as const, url: '/' },
    login: { label: 'Log In', action: 'login', type: 'link' as const, url: '/login' },
    support: { label: 'Contact Support', action: 'support', type: 'link' as const, url: '/support' },
    help: { label: 'View Help', action: 'help', type: 'link' as const, url: '/help' }
  };

  const actionMappings: Record<string, Array<keyof typeof commonActions>> = {
    INVALID_CREDENTIALS: ['retry', 'login'],
    TOKEN_EXPIRED: ['login'],
    FILE_TOO_LARGE: ['retry', 'help'],
    UNSUPPORTED_FILE_TYPE: ['help', 'support'],
    AI_SERVICE_UNAVAILABLE: ['retry', 'home'],
    DATABASE_CONNECTION_FAILED: ['retry', 'refresh', 'support'],
    NETWORK_TIMEOUT: ['retry', 'refresh'],
    RATE_LIMIT_EXCEEDED: ['retry'],
    MAINTENANCE_MODE: ['home', 'support']
  };

  const actions = actionMappings[errorCode] || ['retry', 'support'];
  return actions.map(actionKey => commonActions[actionKey]);
};