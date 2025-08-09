import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import {
  validateSearchQuery,
  validateSearchSuggestions,
  validateNLPQuery,
  validateSearchFeedback,
  validateSearchHistory,
  validatePopularTerms,
  validateDateRange,
  validateFileSizeRange
} from '../searchValidation.js';

// Mock express-validator
vi.mock('express-validator', () => ({
  body: vi.fn(() => ({
    isString: vi.fn().mockReturnThis(),
    trim: vi.fn().mockReturnThis(),
    isLength: vi.fn().mockReturnThis(),
    withMessage: vi.fn().mockReturnThis(),
    optional: vi.fn().mockReturnThis(),
    isIn: vi.fn().mockReturnThis(),
    isUUID: vi.fn().mockReturnThis(),
    isObject: vi.fn().mockReturnThis(),
    isArray: vi.fn().mockReturnThis(),
    isISO8601: vi.fn().mockReturnThis(),
    isInt: vi.fn().mockReturnThis(),
    isBoolean: vi.fn().mockReturnThis()
  })),
  query: vi.fn(() => ({
    isString: vi.fn().mockReturnThis(),
    trim: vi.fn().mockReturnThis(),
    isLength: vi.fn().mockReturnThis(),
    withMessage: vi.fn().mockReturnThis(),
    optional: vi.fn().mockReturnThis(),
    isInt: vi.fn().mockReturnThis()
  })),
  validationResult: vi.fn()
}));

describe('Search Validation', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: vi.Mock;

  beforeEach(() => {
    mockReq = {
      body: {},
      headers: { 'x-request-id': 'test-request-id' }
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('validateDateRange', () => {
    it('should pass validation when date range is valid', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: '2023-01-01T00:00:00.000Z',
            endDate: '2023-12-31T23:59:59.999Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when no date range is provided', () => {
      mockReq.body = {
        filters: {}
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when no filters are provided', () => {
      mockReq.body = {};

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail validation when start date is after end date', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: '2023-12-31T23:59:59.999Z',
            endDate: '2023-01-01T00:00:00.000Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Start date must be before end date',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail validation when start date equals end date', () => {
      const sameDate = '2023-06-15T12:00:00.000Z';
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: sameDate,
            endDate: sameDate
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Start date must be before end date',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass validation when only start date is provided', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: '2023-01-01T00:00:00.000Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when only end date is provided', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            endDate: '2023-12-31T23:59:59.999Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle missing request ID', () => {
      mockReq.headers = {};
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: '2023-12-31T23:59:59.999Z',
            endDate: '2023-01-01T00:00:00.000Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Start date must be before end date',
          timestamp: expect.any(Date),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('validateFileSizeRange', () => {
    it('should pass validation when file size range is valid', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 1000,
            max: 10000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when min equals max', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 5000,
            max: 5000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when no file size filter is provided', () => {
      mockReq.body = {
        filters: {}
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when no filters are provided', () => {
      mockReq.body = {};

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail validation when min is greater than max', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 10000,
            max: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Minimum file size must be less than or equal to maximum file size',
          timestamp: expect.any(Date),
          requestId: 'test-request-id'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass validation when only min is provided', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when only max is provided', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            max: 10000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass validation when min is 0', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 0,
            max: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle undefined values correctly', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: undefined,
            max: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle missing request ID', () => {
      mockReq.headers = {};
      mockReq.body = {
        filters: {
          fileSize: {
            min: 10000,
            max: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Minimum file size must be less than or equal to maximum file size',
          timestamp: expect.any(Date),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('validation arrays structure', () => {
    it('should have correct structure for validateSearchQuery', () => {
      expect(Array.isArray(validateSearchQuery)).toBe(true);
      expect(validateSearchQuery.length).toBeGreaterThan(0);
    });

    it('should have correct structure for validateSearchSuggestions', () => {
      expect(Array.isArray(validateSearchSuggestions)).toBe(true);
      expect(validateSearchSuggestions.length).toBeGreaterThan(0);
    });

    it('should have correct structure for validateNLPQuery', () => {
      expect(Array.isArray(validateNLPQuery)).toBe(true);
      expect(validateNLPQuery.length).toBeGreaterThan(0);
    });

    it('should have correct structure for validateSearchFeedback', () => {
      expect(Array.isArray(validateSearchFeedback)).toBe(true);
      expect(validateSearchFeedback.length).toBeGreaterThan(0);
    });

    it('should have correct structure for validateSearchHistory', () => {
      expect(Array.isArray(validateSearchHistory)).toBe(true);
      expect(validateSearchHistory.length).toBeGreaterThan(0);
    });

    it('should have correct structure for validatePopularTerms', () => {
      expect(Array.isArray(validatePopularTerms)).toBe(true);
      expect(validatePopularTerms.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed date strings in date range validation', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: 'invalid-date',
            endDate: '2023-12-31T23:59:59.999Z'
          }
        }
      };

      // Should not throw an error, but may not validate correctly
      expect(() => {
        validateDateRange(mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();
    });

    it('should handle non-numeric values in file size validation', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: 'not-a-number',
            max: 1000
          }
        }
      };

      // Should not throw an error
      expect(() => {
        validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();
    });

    it('should handle null values in date range', () => {
      mockReq.body = {
        filters: {
          dateRange: {
            startDate: null,
            endDate: '2023-12-31T23:59:59.999Z'
          }
        }
      };

      validateDateRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle null values in file size range', () => {
      mockReq.body = {
        filters: {
          fileSize: {
            min: null,
            max: 1000
          }
        }
      };

      validateFileSizeRange(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});