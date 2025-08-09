import { describe, it, expect } from 'vitest';
import {
  validateDatasetCreate,
  validateDatasetUpdate,
  validateDatasetQuery,
  validateAddFilesToDataset,
  validateUpdateFileLabel,
  validateDatasetExport,
  validateBatchLabelUpdate,
  validateDatasetStatistics,
  validateDatasetId,
  validateFileId,
  validateDatasetName,
  validateLabel
} from '../datasetValidation.js';

describe('Dataset Validation', () => {
  describe('validateDatasetCreate', () => {
    it('should validate valid dataset creation data', () => {
      const validData = {
        name: 'Test Dataset',
        description: 'Test description',
        tags: ['test', 'dataset']
      };

      const result = validateDatasetCreate(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should require name field', () => {
      const invalidData = {
        description: 'Test description'
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('required');
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        description: 'Test description'
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('empty');
    });

    it('should reject name longer than 100 characters', () => {
      const invalidData = {
        name: 'a'.repeat(101),
        description: 'Test description'
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('100');
    });

    it('should reject description longer than 1000 characters', () => {
      const invalidData = {
        name: 'Test Dataset',
        description: 'a'.repeat(1001)
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('1000');
    });

    it('should reject more than 20 tags', () => {
      const invalidData = {
        name: 'Test Dataset',
        tags: Array(21).fill('tag')
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('20');
    });

    it('should reject tags longer than 50 characters', () => {
      const invalidData = {
        name: 'Test Dataset',
        tags: ['a'.repeat(51)]
      };

      const result = validateDatasetCreate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('50');
    });

    it('should trim whitespace from name and description', () => {
      const dataWithWhitespace = {
        name: '  Test Dataset  ',
        description: '  Test description  '
      };

      const result = validateDatasetCreate(dataWithWhitespace);

      expect(result.error).toBeUndefined();
      expect(result.value.name).toBe('Test Dataset');
      expect(result.value.description).toBe('Test description');
    });
  });

  describe('validateDatasetUpdate', () => {
    it('should validate valid update data', () => {
      const validData = {
        name: 'Updated Dataset',
        description: 'Updated description',
        tags: ['updated']
      };

      const result = validateDatasetUpdate(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should allow empty description', () => {
      const validData = {
        name: 'Updated Dataset',
        description: ''
      };

      const result = validateDatasetUpdate(validData);

      expect(result.error).toBeUndefined();
      expect(result.value.description).toBe('');
    });

    it('should allow partial updates', () => {
      const validData = {
        name: 'Updated Dataset'
      };

      const result = validateDatasetUpdate(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });
  });

  describe('validateDatasetQuery', () => {
    it('should validate valid query parameters', () => {
      const validQuery = {
        page: '1',
        limit: '10',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: 'ready',
        tags: ['test'],
        search: 'test dataset'
      };

      const result = validateDatasetQuery(validQuery);

      expect(result.error).toBeUndefined();
      expect(result.value.page).toBe(1);
      expect(result.value.limit).toBe(10);
    });

    it('should use default values', () => {
      const emptyQuery = {};

      const result = validateDatasetQuery(emptyQuery);

      expect(result.error).toBeUndefined();
      expect(result.value.page).toBe(1);
      expect(result.value.limit).toBe(10);
      expect(result.value.sortBy).toBe('createdAt');
      expect(result.value.sortOrder).toBe('desc');
    });

    it('should reject invalid page number', () => {
      const invalidQuery = {
        page: '0'
      };

      const result = validateDatasetQuery(invalidQuery);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('greater than or equal to 1');
    });

    it('should reject invalid sort field', () => {
      const invalidQuery = {
        sortBy: 'invalid_field'
      };

      const result = validateDatasetQuery(invalidQuery);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('must be one of');
    });

    it('should handle tags as string or array', () => {
      const queryWithStringTags = { tags: 'test' };
      const queryWithArrayTags = { tags: ['test', 'dataset'] };

      const result1 = validateDatasetQuery(queryWithStringTags);
      const result2 = validateDatasetQuery(queryWithArrayTags);

      expect(result1.error).toBeUndefined();
      expect(result2.error).toBeUndefined();
    });
  });

  describe('validateAddFilesToDataset', () => {
    it('should validate valid file IDs', () => {
      const validData = {
        fileIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001'
        ]
      };

      const result = validateAddFilesToDataset(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should require at least one file ID', () => {
      const invalidData = {
        fileIds: []
      };

      const result = validateAddFilesToDataset(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('at least 1');
    });

    it('should reject more than 100 file IDs', () => {
      const invalidData = {
        fileIds: Array(101).fill('123e4567-e89b-12d3-a456-426614174000')
      };

      const result = validateAddFilesToDataset(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('100');
    });

    it('should reject invalid UUID format', () => {
      const invalidData = {
        fileIds: ['invalid-uuid']
      };

      const result = validateAddFilesToDataset(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('valid GUID');
    });
  });

  describe('validateUpdateFileLabel', () => {
    it('should validate valid label data', () => {
      const validData = {
        label: 'test-label',
        confidence: 0.85
      };

      const result = validateUpdateFileLabel(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should require label field', () => {
      const invalidData = {
        confidence: 0.85
      };

      const result = validateUpdateFileLabel(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('required');
    });

    it('should reject empty label', () => {
      const invalidData = {
        label: ''
      };

      const result = validateUpdateFileLabel(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('empty');
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidData1 = {
        label: 'test-label',
        confidence: -0.1
      };

      const invalidData2 = {
        label: 'test-label',
        confidence: 1.1
      };

      const result1 = validateUpdateFileLabel(invalidData1);
      const result2 = validateUpdateFileLabel(invalidData2);

      expect(result1.error).toBeDefined();
      expect(result2.error).toBeDefined();
    });

    it('should allow optional confidence', () => {
      const validData = {
        label: 'test-label'
      };

      const result = validateUpdateFileLabel(validData);

      expect(result.error).toBeUndefined();
      expect(result.value.confidence).toBeUndefined();
    });
  });

  describe('validateDatasetExport', () => {
    it('should validate valid export options', () => {
      const validData = {
        format: 'json',
        includeMetadata: true,
        includeImages: false,
        splitRatio: {
          train: 0.7,
          validation: 0.2,
          test: 0.1
        },
        compressionLevel: 6
      };

      const result = validateDatasetExport(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should require format field', () => {
      const invalidData = {
        includeMetadata: true
      };

      const result = validateDatasetExport(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('required');
    });

    it('should reject invalid format', () => {
      const invalidData = {
        format: 'invalid-format'
      };

      const result = validateDatasetExport(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('must be one of');
    });

    it('should validate split ratios sum to 1.0', () => {
      const invalidData = {
        format: 'json',
        splitRatio: {
          train: 0.5,
          validation: 0.3,
          test: 0.3 // Sum = 1.1
        }
      };

      const result = validateDatasetExport(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('Split ratios must sum to 1.0');
    });

    it('should use default values', () => {
      const minimalData = {
        format: 'json'
      };

      const result = validateDatasetExport(minimalData);

      expect(result.error).toBeUndefined();
      expect(result.value.includeMetadata).toBe(true);
      expect(result.value.includeImages).toBe(false);
      expect(result.value.compressionLevel).toBe(6);
    });
  });

  describe('validateBatchLabelUpdate', () => {
    it('should validate valid batch updates', () => {
      const validData = {
        updates: [
          {
            fileId: '123e4567-e89b-12d3-a456-426614174000',
            label: 'label1',
            confidence: 0.9
          },
          {
            fileId: '123e4567-e89b-12d3-a456-426614174001',
            label: 'label2'
          }
        ]
      };

      const result = validateBatchLabelUpdate(validData);

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validData);
    });

    it('should require at least one update', () => {
      const invalidData = {
        updates: []
      };

      const result = validateBatchLabelUpdate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('at least 1');
    });

    it('should reject more than 100 updates', () => {
      const invalidData = {
        updates: Array(101).fill({
          fileId: '123e4567-e89b-12d3-a456-426614174000',
          label: 'test'
        })
      };

      const result = validateBatchLabelUpdate(invalidData);

      expect(result.error).toBeDefined();
      expect(result.error!.details[0].message).toContain('100');
    });
  });

  describe('validateDatasetId', () => {
    it('should validate valid UUID', () => {
      const validId = '123e4567-e89b-12d3-a456-426614174000';

      const result = validateDatasetId(validId);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid UUID format', () => {
      const invalidId = 'invalid-uuid';

      const result = validateDatasetId(invalidId);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid UUID');
    });

    it('should reject non-string values', () => {
      const invalidId = 123;

      const result = validateDatasetId(invalidId);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required and must be a string');
    });

    it('should reject null or undefined', () => {
      const result1 = validateDatasetId(null);
      const result2 = validateDatasetId(undefined);

      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
    });
  });

  describe('validateFileId', () => {
    it('should validate valid UUID', () => {
      const validId = '123e4567-e89b-12d3-a456-426614174000';

      const result = validateFileId(validId);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid UUID format', () => {
      const invalidId = 'invalid-uuid';

      const result = validateFileId(invalidId);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid UUID');
    });
  });

  describe('validateDatasetName', () => {
    it('should validate valid dataset name', () => {
      const validName = 'Test Dataset';
      const existingNames = ['Other Dataset'];

      const result = validateDatasetName(validName, existingNames);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedName).toBe('Test Dataset');
    });

    it('should trim whitespace', () => {
      const nameWithWhitespace = '  Test Dataset  ';

      const result = validateDatasetName(nameWithWhitespace);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedName).toBe('Test Dataset');
    });

    it('should reject empty name', () => {
      const emptyName = '';

      const result = validateDatasetName(emptyName);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject name with only whitespace', () => {
      const whitespaceOnlyName = '   ';

      const result = validateDatasetName(whitespaceOnlyName);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject name longer than 100 characters', () => {
      const longName = 'a'.repeat(101);

      const result = validateDatasetName(longName);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('100 characters');
    });

    it('should reject name with invalid characters', () => {
      const invalidName = 'Test<Dataset>';

      const result = validateDatasetName(invalidName);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should detect duplicate names (case-insensitive)', () => {
      const duplicateName = 'Test Dataset';
      const existingNames = ['test dataset', 'Other Dataset'];

      const result = validateDatasetName(duplicateName, existingNames);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('validateLabel', () => {
    it('should validate valid label', () => {
      const validLabel = 'test-label_123';

      const result = validateLabel(validLabel);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedLabel).toBe('test-label_123');
    });

    it('should trim whitespace', () => {
      const labelWithWhitespace = '  test label  ';

      const result = validateLabel(labelWithWhitespace);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedLabel).toBe('test label');
    });

    it('should reject empty label', () => {
      const emptyLabel = '';

      const result = validateLabel(emptyLabel);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject label with only whitespace', () => {
      const whitespaceOnlyLabel = '   ';

      const result = validateLabel(whitespaceOnlyLabel);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject label longer than 100 characters', () => {
      const longLabel = 'a'.repeat(101);

      const result = validateLabel(longLabel);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('100 characters');
    });

    it('should reject label with invalid characters', () => {
      const invalidLabel = 'test@label';

      const result = validateLabel(invalidLabel);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('can only contain');
    });

    it('should allow alphanumeric, spaces, hyphens, and underscores', () => {
      const validLabels = [
        'test123',
        'test label',
        'test-label',
        'test_label',
        'Test Label 123'
      ];

      validLabels.forEach(label => {
        const result = validateLabel(label);
        expect(result.isValid).toBe(true);
      });
    });
  });
});