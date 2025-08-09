import { describe, it, expect } from 'vitest';
import { getErrorMessage, ErrorMessages, ContextualErrorMessages, ErrorTypes } from '../../utils/errorMessages';

describe('Error Messages', () => {
  describe('ErrorMessages', () => {
    it('should have messages for all error types', () => {
      const errorTypes = Object.values(ErrorTypes);
      
      errorTypes.forEach(errorType => {
        expect(ErrorMessages[errorType]).toBeDefined();
        expect(ErrorMessages[errorType].title).toBeTruthy();
        expect(ErrorMessages[errorType].message).toBeTruthy();
        expect(ErrorMessages[errorType].suggestions).toBeInstanceOf(Array);
        expect(ErrorMessages[errorType].suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should have recovery actions for critical errors', () => {
      const criticalErrors = [
        ErrorTypes.AUTHENTICATION_ERROR,
        ErrorTypes.AUTHORIZATION_ERROR,
        ErrorTypes.FILE_UPLOAD_ERROR,
        ErrorTypes.AI_SERVICE_ERROR
      ];

      criticalErrors.forEach(errorType => {
        expect(ErrorMessages[errorType].recoveryActions).toBeDefined();
        expect(ErrorMessages[errorType].recoveryActions!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ContextualErrorMessages', () => {
    it('should have file upload context messages', () => {
      expect(ContextualErrorMessages.fileUpload.fileTooLarge).toBeDefined();
      expect(ContextualErrorMessages.fileUpload.unsupportedFormat).toBeDefined();
      
      expect(ContextualErrorMessages.fileUpload.fileTooLarge.title).toBe('File Too Large');
      expect(ContextualErrorMessages.fileUpload.unsupportedFormat.title).toBe('Unsupported File Format');
    });

    it('should have search context messages', () => {
      expect(ContextualErrorMessages.search.noResults).toBeDefined();
      expect(ContextualErrorMessages.search.aiSearchFailed).toBeDefined();
      
      expect(ContextualErrorMessages.search.noResults.title).toBe('No Results Found');
      expect(ContextualErrorMessages.search.aiSearchFailed.title).toBe('AI Search Temporarily Unavailable');
    });

    it('should have training context messages', () => {
      expect(ContextualErrorMessages.training.insufficientData).toBeDefined();
      expect(ContextualErrorMessages.training.trainingFailed).toBeDefined();
      
      expect(ContextualErrorMessages.training.insufficientData.title).toBe('Insufficient Training Data');
      expect(ContextualErrorMessages.training.trainingFailed.title).toBe('Model Training Failed');
    });
  });

  describe('getErrorMessage', () => {
    it('should return general error message for known error type', () => {
      const errorMessage = getErrorMessage(ErrorTypes.VALIDATION_ERROR);
      
      expect(errorMessage).toEqual(ErrorMessages[ErrorTypes.VALIDATION_ERROR]);
      expect(errorMessage.title).toBe('Input Validation Failed');
      expect(errorMessage.suggestions).toContain('Please check all required fields are filled out correctly');
    });

    it('should return contextual error message when context and specific error provided', () => {
      const errorMessage = getErrorMessage(
        ErrorTypes.FILE_UPLOAD_ERROR,
        'fileUpload',
        'fileTooLarge'
      );
      
      expect(errorMessage).toEqual(ContextualErrorMessages.fileUpload.fileTooLarge);
      expect(errorMessage.title).toBe('File Too Large');
      expect(errorMessage.suggestions).toContain('Maximum file size is 100MB');
    });

    it('should fall back to general error message when contextual message not found', () => {
      const errorMessage = getErrorMessage(
        ErrorTypes.VALIDATION_ERROR,
        'nonExistentContext',
        'nonExistentError'
      );
      
      expect(errorMessage).toEqual(ErrorMessages[ErrorTypes.VALIDATION_ERROR]);
    });

    it('should return default error message for unknown error type', () => {
      const errorMessage = getErrorMessage('UNKNOWN_ERROR_TYPE');
      
      expect(errorMessage.title).toBe('Unexpected Error');
      expect(errorMessage.message).toContain('Something went wrong');
      expect(errorMessage.suggestions).toContain('Refresh the page and try again');
      expect(errorMessage.recoveryActions).toBeDefined();
      expect(errorMessage.recoveryActions!.length).toBeGreaterThan(0);
    });

    it('should include appropriate recovery actions', () => {
      const authErrorMessage = getErrorMessage(ErrorTypes.AUTHENTICATION_ERROR);
      
      expect(authErrorMessage.recoveryActions).toBeDefined();
      expect(authErrorMessage.recoveryActions!.some(action => action.label === 'Log In')).toBe(true);
      expect(authErrorMessage.recoveryActions!.some(action => action.label === 'Forgot Password?')).toBe(true);
    });

    it('should have different recovery actions for different error types', () => {
      const fileUploadError = getErrorMessage(ErrorTypes.FILE_UPLOAD_ERROR);
      const authError = getErrorMessage(ErrorTypes.AUTHENTICATION_ERROR);
      
      expect(fileUploadError.recoveryActions).not.toEqual(authError.recoveryActions);
      
      const fileUploadActions = fileUploadError.recoveryActions!.map(action => action.label);
      const authActions = authError.recoveryActions!.map(action => action.label);
      
      expect(fileUploadActions).toContain('Try Again');
      expect(fileUploadActions).toContain('Check Supported Formats');
      expect(authActions).toContain('Log In');
      expect(authActions).toContain('Forgot Password?');
    });

    it('should provide helpful suggestions for each error type', () => {
      const validationError = getErrorMessage(ErrorTypes.VALIDATION_ERROR);
      const aiServiceError = getErrorMessage(ErrorTypes.AI_SERVICE_ERROR);
      const rateLimitError = getErrorMessage(ErrorTypes.RATE_LIMIT_ERROR);
      
      expect(validationError.suggestions).toContain('Please check all required fields are filled out correctly');
      expect(aiServiceError.suggestions).toContain('Basic search and file management are still available');
      expect(rateLimitError.suggestions).toContain('Wait a few minutes before making another request');
    });

    it('should have contextual file upload error messages with specific guidance', () => {
      const fileTooLargeError = getErrorMessage(
        ErrorTypes.FILE_UPLOAD_ERROR,
        'fileUpload',
        'fileTooLarge'
      );
      
      const unsupportedFormatError = getErrorMessage(
        ErrorTypes.FILE_UPLOAD_ERROR,
        'fileUpload',
        'unsupportedFormat'
      );
      
      expect(fileTooLargeError.suggestions).toContain('Maximum file size is 100MB');
      expect(fileTooLargeError.suggestions).toContain('Try compressing your CAD file');
      
      expect(unsupportedFormatError.suggestions).toContain('Supported formats: DWG, DXF, STEP, IGES, STL, OBJ');
      expect(unsupportedFormatError.suggestions).toContain('Convert your file to a supported format');
    });

    it('should have contextual search error messages', () => {
      const noResultsError = getErrorMessage(
        ErrorTypes.NOT_FOUND,
        'search',
        'noResults'
      );
      
      const aiSearchFailedError = getErrorMessage(
        ErrorTypes.AI_SERVICE_ERROR,
        'search',
        'aiSearchFailed'
      );
      
      expect(noResultsError.suggestions).toContain('Try using different keywords');
      expect(noResultsError.suggestions).toContain('Remove some filters to expand your search');
      
      expect(aiSearchFailedError.suggestions).toContain('Results are based on file names and metadata');
      expect(aiSearchFailedError.suggestions).toContain('AI search will be restored automatically');
    });

    it('should have contextual training error messages', () => {
      const insufficientDataError = getErrorMessage(
        ErrorTypes.AI_SERVICE_ERROR,
        'training',
        'insufficientData'
      );
      
      const trainingFailedError = getErrorMessage(
        ErrorTypes.AI_SERVICE_ERROR,
        'training',
        'trainingFailed'
      );
      
      expect(insufficientDataError.suggestions).toContain('Add more files to your dataset (minimum 100 recommended)');
      expect(insufficientDataError.suggestions).toContain('Consider combining with existing datasets');
      
      expect(trainingFailedError.suggestions).toContain('Check that your dataset has consistent labeling');
      expect(trainingFailedError.suggestions).toContain('Try training with a smaller dataset first');
    });
  });

  describe('Recovery Actions', () => {
    it('should have different action types', () => {
      const authError = getErrorMessage(ErrorTypes.AUTHENTICATION_ERROR);
      const fileUploadError = getErrorMessage(ErrorTypes.FILE_UPLOAD_ERROR);
      
      const authActions = authError.recoveryActions!;
      const fileActions = fileUploadError.recoveryActions!;
      
      expect(authActions.some(action => action.type === 'button')).toBe(true);
      expect(authActions.some(action => action.type === 'link')).toBe(true);
      expect(fileActions.some(action => action.type === 'retry')).toBe(true);
    });

    it('should include URLs for link actions', () => {
      const authError = getErrorMessage(ErrorTypes.AUTHENTICATION_ERROR);
      const linkAction = authError.recoveryActions!.find(action => action.type === 'link');
      
      expect(linkAction).toBeDefined();
      expect(linkAction!.url).toBeDefined();
      expect(linkAction!.url).toMatch(/^\/\w+/); // Should start with /
    });

    it('should have appropriate action labels', () => {
      const notFoundError = getErrorMessage(ErrorTypes.NOT_FOUND);
      const actions = notFoundError.recoveryActions!;
      
      expect(actions.some(action => action.label === 'Go to Dashboard')).toBe(true);
      expect(actions.some(action => action.label === 'Search Files')).toBe(true);
    });
  });
});