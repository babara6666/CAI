import Joi from 'joi';

/**
 * File upload validation schema
 */
export const fileUploadSchema = Joi.object({
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).optional(),
  projectName: Joi.string().trim().min(1).max(100).optional(),
  partName: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  generateThumbnail: Joi.boolean().optional().default(true),
  validateFile: Joi.boolean().optional().default(true)
});

/**
 * File replacement validation schema
 */
export const fileReplaceSchema = Joi.object({
  changeDescription: Joi.string().trim().max(500).optional(),
  generateThumbnail: Joi.boolean().optional().default(true),
  validateFile: Joi.boolean().optional().default(true)
});

/**
 * File query validation schema
 */
export const fileQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  sortBy: Joi.string().valid('uploadedAt', 'filename', 'fileSize', 'originalName').optional().default('uploadedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
  tags: Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(Joi.string().trim())
  ).optional(),
  projectName: Joi.string().trim().optional(),
  partName: Joi.string().trim().optional(),
  uploadedBy: Joi.string().uuid().optional(),
  mimeType: Joi.string().optional(),
  minSize: Joi.number().integer().min(0).optional(),
  maxSize: Joi.number().integer().min(0).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  search: Joi.string().trim().min(1).max(200).optional()
});

/**
 * File update validation schema
 */
export const fileUpdateSchema = Joi.object({
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).optional(),
  projectName: Joi.string().trim().min(1).max(100).allow('').optional(),
  partName: Joi.string().trim().min(1).max(100).allow('').optional(),
  description: Joi.string().trim().max(1000).allow('').optional()
});

/**
 * Batch upload validation schema
 */
export const batchUploadSchema = Joi.object({
  files: Joi.array().items(Joi.object({
    fieldname: Joi.string().required(),
    originalname: Joi.string().required(),
    encoding: Joi.string().required(),
    mimetype: Joi.string().required(),
    buffer: Joi.binary().required(),
    size: Joi.number().integer().min(1).required()
  })).min(1).max(10).required(),
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).optional(),
  projectName: Joi.string().trim().min(1).max(100).optional(),
  partName: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  generateThumbnail: Joi.boolean().optional().default(true),
  validateFile: Joi.boolean().optional().default(true)
});

/**
 * File validation configuration schema
 */
export const validationConfigSchema = Joi.object({
  maxFileSize: Joi.number().integer().min(1024).max(1024 * 1024 * 1024).optional(), // 1KB to 1GB
  allowedMimeTypes: Joi.array().items(Joi.string()).optional(),
  allowedExtensions: Joi.array().items(Joi.string().pattern(/^\.[a-zA-Z0-9]+$/)).optional(),
  enableMalwareScanning: Joi.boolean().optional(),
  enableIntegrityCheck: Joi.boolean().optional()
});

/**
 * Storage configuration schema
 */
export const storageConfigSchema = Joi.object({
  provider: Joi.string().valid('aws', 'minio', 'local').required(),
  bucket: Joi.string().when('provider', {
    is: Joi.string().valid('aws', 'minio'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  region: Joi.string().when('provider', {
    is: 'aws',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  endpoint: Joi.string().uri().when('provider', {
    is: 'minio',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  accessKeyId: Joi.string().when('provider', {
    is: Joi.string().valid('aws', 'minio'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  secretAccessKey: Joi.string().when('provider', {
    is: Joi.string().valid('aws', 'minio'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  localPath: Joi.string().when('provider', {
    is: 'local',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

/**
 * Thumbnail options schema
 */
export const thumbnailOptionsSchema = Joi.object({
  width: Joi.number().integer().min(50).max(1000).optional().default(300),
  height: Joi.number().integer().min(50).max(1000).optional().default(300),
  quality: Joi.number().integer().min(1).max(100).optional().default(80),
  format: Joi.string().valid('jpeg', 'png', 'webp').optional().default('jpeg')
});

/**
 * File statistics query schema
 */
export const statisticsQuerySchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  groupBy: Joi.string().valid('day', 'week', 'month').optional().default('day')
});

/**
 * Validate file upload request
 */
export function validateFileUpload(data: any) {
  return fileUploadSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate file replacement request
 */
export function validateFileReplace(data: any) {
  return fileReplaceSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate file query parameters
 */
export function validateFileQuery(data: any) {
  return fileQuerySchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate file update request
 */
export function validateFileUpdate(data: any) {
  return fileUpdateSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate batch upload request
 */
export function validateBatchUpload(data: any) {
  return batchUploadSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate validation configuration
 */
export function validateValidationConfig(data: any) {
  return validationConfigSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate storage configuration
 */
export function validateStorageConfig(data: any) {
  return storageConfigSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate thumbnail options
 */
export function validateThumbnailOptions(data: any) {
  return thumbnailOptionsSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Validate statistics query
 */
export function validateStatisticsQuery(data: any) {
  return statisticsQuerySchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

/**
 * Custom validation for multer file objects
 */
export function validateMulterFile(file: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }

  if (!file.originalname || typeof file.originalname !== 'string') {
    errors.push('Invalid or missing filename');
  }

  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    errors.push('Invalid or missing file data');
  }

  if (!file.mimetype || typeof file.mimetype !== 'string') {
    errors.push('Invalid or missing MIME type');
  }

  if (!file.size || typeof file.size !== 'number' || file.size <= 0) {
    errors.push('Invalid file size');
  }

  // Check filename length
  if (file.originalname && file.originalname.length > 255) {
    errors.push('Filename is too long (maximum 255 characters)');
  }

  // Check for dangerous characters in filename
  if (file.originalname && /[<>:"/\\|?*\x00-\x1f]/.test(file.originalname)) {
    errors.push('Filename contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
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
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace dangerous characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  // Ensure filename is not empty
  if (!sanitized) {
    sanitized = 'unnamed_file';
  }

  // Limit length
  if (sanitized.length > 200) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = name.substring(0, 200 - ext.length) + ext;
  }

  return sanitized;
}

/**
 * Extract and validate file extension
 */
export function validateFileExtension(filename: string, allowedExtensions: string[]): {
  isValid: boolean;
  extension: string;
  error?: string;
} {
  const lastDotIndex = filename.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    return {
      isValid: false,
      extension: '',
      error: 'File must have an extension'
    };
  }

  const extension = filename.substring(lastDotIndex).toLowerCase();
  
  if (!allowedExtensions.includes(extension)) {
    return {
      isValid: false,
      extension,
      error: `Extension '${extension}' is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`
    };
  }

  return {
    isValid: true,
    extension
  };
}