import Joi from 'joi';

/**
 * Dataset creation validation schema
 */
export const datasetCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).optional()
});

/**
 * Dataset update validation schema
 */
export const datasetUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).optional()
});

/**
 * Dataset query validation schema
 */
export const datasetQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'fileCount').optional().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
  status: Joi.string().valid('creating', 'ready', 'training', 'error').optional(),
  tags: Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(Joi.string().trim())
  ).optional(),
  createdBy: Joi.string().uuid().optional(),
  search: Joi.string().trim().min(1).max(200).optional()
});

/**
 * Add files to dataset validation schema
 */
export const addFilesToDatasetSchema = Joi.object({
  fileIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required()
});

/**
 * Update file label validation schema
 */
export const updateFileLabelSchema = Joi.object({
  label: Joi.string().trim().min(1).max(100).required(),
  confidence: Joi.number().min(0).max(1).optional()
});

/**
 * Dataset export validation schema
 */
export const datasetExportSchema = Joi.object({
  format: Joi.string().valid('json', 'csv', 'coco', 'yolo').required(),
  includeMetadata: Joi.boolean().optional().default(true),
  includeImages: Joi.boolean().optional().default(false),
  splitRatio: Joi.object({
    train: Joi.number().min(0).max(1).required(),
    validation: Joi.number().min(0).max(1).required(),
    test: Joi.number().min(0).max(1).required()
  }).custom((value, helpers) => {
    const sum = value.train + value.validation + value.test;
    if (Math.abs(sum - 1.0) > 0.001) {
      return helpers.error('custom.splitRatioSum');
    }
    return value;
  }).optional(),
  compressionLevel: Joi.number().integer().min(0).max(9).optional().default(6)
}).messages({
  'custom.splitRatioSum': 'Split ratios must sum to 1.0'
});

/**
 * Dataset validation configuration schema
 */
export const datasetValidationSchema = Joi.object({
  minFiles: Joi.number().integer().min(1).optional().default(1),
  maxFiles: Joi.number().integer().min(1).optional().default(10000),
  requiredLabels: Joi.array().items(Joi.string().trim()).optional(),
  allowedFileTypes: Joi.array().items(Joi.string()).optional(),
  maxFileSize: Joi.number().integer().min(1024).optional(),
  requireUniqueFiles: Joi.boolean().optional().default(true)
});

/**
 * Batch label update validation schema
 */
export const batchLabelUpdateSchema = Joi.object({
  updates: Joi.array().items(
    Joi.object({
      fileId: Joi.string().uuid().required(),
      label: Joi.string().trim().min(1).max(100).required(),
      confidence: Joi.number().min(0).max(1).optional()
    })
  ).min(1).max(100).required()
});

/**
 * Dataset statistics query schema
 */
export const datasetStatisticsSchema = Joi.object({
  datasetId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  groupBy: Joi.string().valid('day', 'week', 'month').optional().default('day')
});

/**
 * Validate dataset creation request
 */
export function validateDatasetCreate(data: any) {
  return datasetCreateSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset update request
 */
export function validateDatasetUpdate(data: any) {
  return datasetUpdateSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset query parameters
 */
export function validateDatasetQuery(data: any) {
  return datasetQuerySchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate add files to dataset request
 */
export function validateAddFilesToDataset(data: any) {
  return addFilesToDatasetSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate update file label request
 */
export function validateUpdateFileLabel(data: any) {
  return updateFileLabelSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset export request
 */
export function validateDatasetExport(data: any) {
  return datasetExportSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset validation configuration
 */
export function validateDatasetValidation(data: any) {
  return datasetValidationSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate batch label update request
 */
export function validateBatchLabelUpdate(data: any) {
  return batchLabelUpdateSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset statistics query
 */
export function validateDatasetStatistics(data: any) {
  return datasetStatisticsSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate dataset ID parameter
 */
export function validateDatasetId(datasetId: any): { isValid: boolean; error?: string } {
  if (!datasetId || typeof datasetId !== 'string') {
    return { isValid: false, error: 'Dataset ID is required and must be a string' };
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(datasetId)) {
    return { isValid: false, error: 'Dataset ID must be a valid UUID' };
  }

  return { isValid: true };
}

/**
 * Validate file ID parameter
 */
export function validateFileId(fileId: any): { isValid: boolean; error?: string } {
  if (!fileId || typeof fileId !== 'string') {
    return { isValid: false, error: 'File ID is required and must be a string' };
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    return { isValid: false, error: 'File ID must be a valid UUID' };
  }

  return { isValid: true };
}

/**
 * Validate dataset name for uniqueness and format
 */
export function validateDatasetName(name: string, existingNames: string[] = []): {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
} {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Dataset name is required' };
  }

  const trimmedName = name.trim();
  
  if (trimmedName.length === 0) {
    return { isValid: false, error: 'Dataset name cannot be empty' };
  }

  if (trimmedName.length > 100) {
    return { isValid: false, error: 'Dataset name cannot exceed 100 characters' };
  }

  // Check for invalid characters
  if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmedName)) {
    return { isValid: false, error: 'Dataset name contains invalid characters' };
  }

  // Check for uniqueness (case-insensitive)
  const lowerName = trimmedName.toLowerCase();
  if (existingNames.some(existing => existing.toLowerCase() === lowerName)) {
    return { isValid: false, error: 'Dataset name already exists' };
  }

  return {
    isValid: true,
    sanitizedName: trimmedName
  };
}

/**
 * Validate label format and content
 */
export function validateLabel(label: string): {
  isValid: boolean;
  error?: string;
  sanitizedLabel?: string;
} {
  if (!label || typeof label !== 'string') {
    return { isValid: false, error: 'Label is required' };
  }

  const trimmedLabel = label.trim();
  
  if (trimmedLabel.length === 0) {
    return { isValid: false, error: 'Label cannot be empty' };
  }

  if (trimmedLabel.length > 100) {
    return { isValid: false, error: 'Label cannot exceed 100 characters' };
  }

  // Check for invalid characters (allow alphanumeric, spaces, hyphens, underscores)
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedLabel)) {
    return { isValid: false, error: 'Label can only contain letters, numbers, spaces, hyphens, and underscores' };
  }

  return {
    isValid: true,
    sanitizedLabel: trimmedLabel
  };
}