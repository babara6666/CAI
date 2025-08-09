import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { FileValidationService } from '../services/FileValidationService.js';
import { validateMulterFile, sanitizeFilename } from '../validation/fileValidation.js';
import { ApiResponse } from '../types/index.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Basic file validation
  const validation = validateMulterFile(file);
  
  if (!validation.isValid) {
    cb(new Error(validation.errors.join(', ')));
    return;
  }

  // Sanitize filename
  file.originalname = sanitizeFilename(file.originalname);

  cb(null, true);
};

// Multer configuration
const uploadConfig = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB default
    files: parseInt(process.env.MAX_FILES_PER_REQUEST || '10'),
    fieldSize: 1024 * 1024, // 1MB for form fields
    fieldNameSize: 100,
    fields: 20
  }
});

/**
 * Single file upload middleware
 */
export const uploadSingle = (fieldName: string = 'file') => {
  return [
    uploadConfig.single(fieldName),
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.file) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No file was provided for upload',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      // Additional validation
      const validation = validateMulterFile(req.file);
      if (!validation.isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE',
            message: 'File validation failed',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: validation.errors
          }
        };
        return res.status(400).json(response);
      }

      next();
    }
  ];
};

/**
 * Multiple files upload middleware
 */
export const uploadMultiple = (fieldName: string = 'files', maxCount: number = 10) => {
  return [
    uploadConfig.array(fieldName, maxCount),
    (req: Request, res: Response, next: NextFunction) => {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NO_FILES_PROVIDED',
            message: 'No files were provided for upload',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      // Validate each file
      const validationErrors: string[] = [];
      files.forEach((file, index) => {
        const validation = validateMulterFile(file);
        if (!validation.isValid) {
          validationErrors.push(`File ${index + 1} (${file.originalname}): ${validation.errors.join(', ')}`);
        }
      });

      if (validationErrors.length > 0) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILES',
            message: 'One or more files failed validation',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: validationErrors
          }
        };
        return res.status(400).json(response);
      }

      next();
    }
  ];
};

/**
 * File fields upload middleware (for mixed form data)
 */
export const uploadFields = (fields: { name: string; maxCount?: number }[]) => {
  return [
    uploadConfig.fields(fields),
    (req: Request, res: Response, next: NextFunction) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files || Object.keys(files).length === 0) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NO_FILES_PROVIDED',
            message: 'No files were provided for upload',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      // Validate all files
      const validationErrors: string[] = [];
      Object.entries(files).forEach(([fieldName, fileArray]) => {
        fileArray.forEach((file, index) => {
          const validation = validateMulterFile(file);
          if (!validation.isValid) {
            validationErrors.push(`${fieldName}[${index}] (${file.originalname}): ${validation.errors.join(', ')}`);
          }
        });
      });

      if (validationErrors.length > 0) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILES',
            message: 'One or more files failed validation',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: validationErrors
          }
        };
        return res.status(400).json(response);
      }

      next();
    }
  ];
};

/**
 * Error handling middleware for multer errors
 */
export const handleUploadError = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    let code = 'UPLOAD_ERROR';

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File size exceeds the maximum allowed size of ${formatFileSize(parseInt(process.env.MAX_FILE_SIZE || '104857600'))}`;
        code = 'FILE_TOO_LARGE';
        break;
      case 'LIMIT_FILE_COUNT':
        message = `Too many files. Maximum allowed: ${process.env.MAX_FILES_PER_REQUEST || '10'}`;
        code = 'TOO_MANY_FILES';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name is too long';
        code = 'FIELD_NAME_TOO_LONG';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value is too long';
        code = 'FIELD_VALUE_TOO_LONG';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in the form';
        code = 'TOO_MANY_FIELDS';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        code = 'UNEXPECTED_FILE_FIELD';
        break;
      default:
        message = error.message || 'File upload error';
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    return res.status(400).json(response);
  }

  // Handle other upload-related errors
  if (error.message && error.message.includes('File validation failed')) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FILE_VALIDATION_FAILED',
        message: error.message,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      }
    };

    return res.status(400).json(response);
  }

  // Pass other errors to the global error handler
  next(error);
};

/**
 * Middleware to validate file types based on configuration
 */
export const validateFileTypes = (allowedExtensions?: string[], allowedMimeTypes?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const validationService = new FileValidationService({
      allowedExtensions,
      allowedMimeTypes
    });

    const files = req.file ? [req.file] : (req.files as Express.Multer.File[] || []);
    const validationErrors: string[] = [];

    files.forEach((file, index) => {
      // Check extension
      if (allowedExtensions) {
        const extension = getFileExtension(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(extension)) {
          validationErrors.push(
            `File ${index + 1} (${file.originalname}): Extension '${extension}' is not allowed`
          );
        }
      }

      // Check MIME type
      if (allowedMimeTypes) {
        const isAllowedMimeType = allowedMimeTypes.some(allowed => 
          file.mimetype.toLowerCase().includes(allowed.toLowerCase())
        );
        if (!isAllowedMimeType) {
          validationErrors.push(
            `File ${index + 1} (${file.originalname}): MIME type '${file.mimetype}' is not allowed`
          );
        }
      }
    });

    if (validationErrors.length > 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'One or more files have invalid types',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: validationErrors
        }
      };
      return res.status(400).json(response);
    }

    next();
  };
};

/**
 * Middleware to check file size limits
 */
export const validateFileSize = (maxSize?: number) => {
  const maxFileSize = maxSize || parseInt(process.env.MAX_FILE_SIZE || '104857600');

  return (req: Request, res: Response, next: NextFunction) => {
    const files = req.file ? [req.file] : (req.files as Express.Multer.File[] || []);
    const sizeErrors: string[] = [];

    files.forEach((file, index) => {
      if (file.size > maxFileSize) {
        sizeErrors.push(
          `File ${index + 1} (${file.originalname}): Size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)}`
        );
      }
    });

    if (sizeErrors.length > 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'One or more files exceed the size limit',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
          details: sizeErrors
        }
      };
      return res.status(400).json(response);
    }

    next();
  };
};

/**
 * Middleware to add upload metadata to request
 */
export const addUploadMetadata = (req: Request, res: Response, next: NextFunction) => {
  const files = req.file ? [req.file] : (req.files as Express.Multer.File[] || []);
  
  // Add metadata to each file
  files.forEach(file => {
    (file as any).uploadedAt = new Date();
    (file as any).uploadedBy = req.user?.id;
    (file as any).requestId = req.headers['x-request-id'];
  });

  next();
};

/**
 * Helper function to format file size
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Helper function to get file extension
 */
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
}

/**
 * Middleware to log upload attempts
 */
export const logUploadAttempt = (req: Request, res: Response, next: NextFunction) => {
  const files = req.file ? [req.file] : (req.files as Express.Multer.File[] || []);
  
  console.log(`Upload attempt: ${files.length} file(s) from user ${req.user?.id || 'unknown'}`);
  files.forEach((file, index) => {
    console.log(`  File ${index + 1}: ${file.originalname} (${file.mimetype}, ${formatFileSize(file.size)})`);
  });

  next();
};

/**
 * Default CAD file upload middleware stack
 */
export const cadFileUpload = [
  uploadSingle('file'),
  validateFileTypes(
    ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.3ds', '.fbx'],
    ['application/dwg', 'application/dxf', 'application/step', 'application/octet-stream']
  ),
  addUploadMetadata,
  logUploadAttempt
];

/**
 * Default CAD multiple files upload middleware stack
 */
export const cadMultipleFileUpload = [
  uploadMultiple('files', 10),
  validateFileTypes(
    ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.3ds', '.fbx'],
    ['application/dwg', 'application/dxf', 'application/step', 'application/octet-stream']
  ),
  addUploadMetadata,
  logUploadAttempt
];