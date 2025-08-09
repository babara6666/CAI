import { FileStorageService, FileUploadResult } from './FileStorageService.js';
import { FileValidationService, ValidationResult } from './FileValidationService.js';
import { ThumbnailService, ThumbnailResult } from './ThumbnailService.js';
import { MetadataExtractionService, MetadataExtractionResult } from './MetadataExtractionService.js';
import { CADFileModel, CADFileCreateData } from '../models/CADFile.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { CADFile } from '../types/index.js';

export interface FileUploadOptions {
  generateThumbnail?: boolean;
  validateFile?: boolean;
  tags?: string[];
  projectName?: string;
  partName?: string;
  description?: string;
}

export interface FileUploadServiceResult {
  success: boolean;
  file?: CADFile;
  errors: string[];
  warnings: string[];
  validationResult?: ValidationResult;
  metadataResult?: MetadataExtractionResult;
}

export class FileUploadService {
  private storageService: FileStorageService;
  private validationService: FileValidationService;
  private thumbnailService: ThumbnailService;
  private metadataService: MetadataExtractionService;

  constructor() {
    const storageConfig = FileStorageService.getStorageConfig();
    const validationConfig = FileValidationService.getDefaultConfig();
    const metadataConfig = MetadataExtractionService.getDefaultConfig();
    
    this.storageService = new FileStorageService(storageConfig);
    this.validationService = new FileValidationService(validationConfig);
    this.thumbnailService = new ThumbnailService();
    this.metadataService = new MetadataExtractionService(metadataConfig);
  }

  /**
   * Upload single file
   */
  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy: string,
    options: FileUploadOptions = {}
  ): Promise<FileUploadServiceResult> {
    const result: FileUploadServiceResult = {
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // Step 1: Validate file if enabled
      if (options.validateFile !== false) {
        console.log(`Validating file: ${originalName}`);
        const validationResult = await this.validationService.validateFile(
          fileBuffer,
          originalName,
          mimeType
        );

        result.validationResult = validationResult;
        result.warnings.push(...validationResult.warnings);

        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors);
          await this.logAuditEvent(uploadedBy, 'FILE_UPLOAD_FAILED', {
            filename: originalName,
            reason: 'Validation failed',
            errors: validationResult.errors
          });
          return result;
        }
      }

      // Step 2: Upload file to storage
      console.log(`Uploading file to storage: ${originalName}`);
      const uploadResult = await this.storageService.uploadFile(
        fileBuffer,
        originalName,
        mimeType
      );

      // Step 3: Extract metadata
      console.log(`Extracting metadata for: ${originalName}`);
      const metadataResult = await this.metadataService.extractMetadata(
        fileBuffer,
        originalName,
        mimeType
      );

      result.metadataResult = metadataResult;
      result.warnings.push(...metadataResult.warnings);

      if (!metadataResult.success) {
        result.warnings.push('Metadata extraction failed, continuing with upload');
      }

      // Step 4: Generate thumbnail if enabled
      let thumbnailUrl: string | undefined;
      if (options.generateThumbnail !== false) {
        try {
          console.log(`Generating thumbnail for: ${originalName}`);
          const thumbnailResult = await this.thumbnailService.generateThumbnail(
            fileBuffer,
            originalName
          );

          thumbnailUrl = await this.storageService.uploadThumbnail(
            thumbnailResult.buffer,
            uploadResult.filename
          );
        } catch (thumbnailError) {
          console.warn(`Failed to generate thumbnail for ${originalName}:`, thumbnailError);
          result.warnings.push('Failed to generate thumbnail');
        }
      }

      // Step 5: Save file metadata to database
      const fileData: CADFileCreateData = {
        filename: uploadResult.filename,
        originalName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        uploadedBy,
        fileUrl: uploadResult.fileUrl,
        thumbnailUrl,
        tags: options.tags,
        projectName: options.projectName,
        partName: options.partName,
        description: options.description,
        metadata: {
          checksum: uploadResult.checksum,
          ...result.validationResult?.metadata,
          ...metadataResult.metadata
        }
      };

      console.log(`Saving file metadata to database: ${originalName}`);
      const cadFile = await CADFileModel.create(fileData);

      // Step 6: Log successful upload
      await this.logAuditEvent(uploadedBy, 'FILE_UPLOADED', {
        fileId: cadFile.id,
        filename: originalName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType
      });

      result.success = true;
      result.file = cadFile;

      console.log(`File upload completed successfully: ${originalName}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Upload failed: ${errorMessage}`);

      console.error(`File upload failed for ${originalName}:`, error);

      // Log failed upload
      await this.logAuditEvent(uploadedBy, 'FILE_UPLOAD_FAILED', {
        filename: originalName,
        reason: errorMessage,
        error: error instanceof Error ? error.stack : String(error)
      });

      return result;
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(
    files: Array<{
      buffer: Buffer;
      originalName: string;
      mimeType: string;
    }>,
    uploadedBy: string,
    options: FileUploadOptions = {}
  ): Promise<FileUploadServiceResult[]> {
    const results: FileUploadServiceResult[] = [];

    console.log(`Starting batch upload of ${files.length} files`);

    for (const file of files) {
      const result = await this.uploadFile(
        file.buffer,
        file.originalName,
        file.mimeType,
        uploadedBy,
        options
      );
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`Batch upload completed: ${successCount} successful, ${failureCount} failed`);

    // Log batch upload summary
    await this.logAuditEvent(uploadedBy, 'BATCH_UPLOAD_COMPLETED', {
      totalFiles: files.length,
      successCount,
      failureCount,
      files: files.map(f => f.originalName)
    });

    return results;
  }

  /**
   * Replace file (create new version)
   */
  async replaceFile(
    fileId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy: string,
    changeDescription?: string,
    options: FileUploadOptions = {}
  ): Promise<FileUploadServiceResult> {
    const result: FileUploadServiceResult = {
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // Check if original file exists
      const existingFile = await CADFileModel.findById(fileId);
      if (!existingFile) {
        result.errors.push('Original file not found');
        return result;
      }

      // Validate new file
      if (options.validateFile !== false) {
        const validationResult = await this.validationService.validateFile(
          fileBuffer,
          originalName,
          mimeType
        );

        result.validationResult = validationResult;
        result.warnings.push(...validationResult.warnings);

        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors);
          return result;
        }
      }

      // Upload new version
      const uploadResult = await this.storageService.uploadFile(
        fileBuffer,
        originalName,
        mimeType
      );

      // Generate new thumbnail
      let thumbnailUrl: string | undefined;
      if (options.generateThumbnail !== false) {
        try {
          const thumbnailResult = await this.thumbnailService.generateThumbnail(
            fileBuffer,
            originalName
          );

          thumbnailUrl = await this.storageService.uploadThumbnail(
            thumbnailResult.buffer,
            uploadResult.filename
          );
        } catch (thumbnailError) {
          console.warn(`Failed to generate thumbnail for replacement:`, thumbnailError);
          result.warnings.push('Failed to generate thumbnail');
        }
      }

      // Create new version
      const newVersion = existingFile.currentVersion + 1;
      await CADFileModel.createVersion({
        fileId,
        versionNumber: newVersion,
        filename: uploadResult.filename,
        fileSize: uploadResult.fileSize,
        uploadedBy,
        changeDescription,
        fileUrl: uploadResult.fileUrl
      });

      // Update main file record
      const updatedFile = await CADFileModel.update(fileId, {
        thumbnailUrl,
        metadata: {
          ...existingFile.metadata,
          checksum: uploadResult.checksum,
          ...result.validationResult?.metadata
        }
      });

      // Log version creation
      await this.logAuditEvent(uploadedBy, 'FILE_VERSION_CREATED', {
        fileId,
        originalFilename: existingFile.originalName,
        newVersion,
        changeDescription
      });

      result.success = true;
      result.file = updatedFile;

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`File replacement failed: ${errorMessage}`);

      await this.logAuditEvent(uploadedBy, 'FILE_REPLACEMENT_FAILED', {
        fileId,
        reason: errorMessage
      });

      return result;
    }
  }

  /**
   * Delete file and cleanup storage
   */
  async deleteFile(fileId: string, deletedBy: string): Promise<boolean> {
    try {
      const file = await CADFileModel.findById(fileId);
      if (!file) {
        return false;
      }

      // Delete from storage
      await this.storageService.deleteFile(file.fileUrl);
      
      if (file.thumbnailUrl) {
        try {
          await this.storageService.deleteFile(file.thumbnailUrl);
        } catch (error) {
          console.warn(`Failed to delete thumbnail: ${file.thumbnailUrl}`, error);
        }
      }

      // Delete all versions from storage
      for (const version of file.versions) {
        try {
          await this.storageService.deleteFile(version.fileUrl);
        } catch (error) {
          console.warn(`Failed to delete version file: ${version.fileUrl}`, error);
        }
      }

      // Delete from database
      const deleted = await CADFileModel.delete(fileId);

      if (deleted) {
        await this.logAuditEvent(deletedBy, 'FILE_DELETED', {
          fileId,
          filename: file.originalName,
          fileSize: file.fileSize
        });
      }

      return deleted;

    } catch (error) {
      console.error(`Failed to delete file ${fileId}:`, error);
      
      await this.logAuditEvent(deletedBy, 'FILE_DELETION_FAILED', {
        fileId,
        reason: error instanceof Error ? error.message : 'Unknown error'
      });

      return false;
    }
  }

  /**
   * Get file download stream
   */
  async getFileStream(fileId: string, userId: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const file = await CADFileModel.findById(fileId);
      if (!file) {
        return null;
      }

      // Log file access
      await this.logAuditEvent(userId, 'FILE_ACCESSED', {
        fileId,
        filename: file.originalName,
        accessType: 'download'
      });

      return await this.storageService.getFileStream(file.fileUrl);

    } catch (error) {
      console.error(`Failed to get file stream for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Validate file integrity
   */
  async validateFileIntegrity(fileId: string): Promise<ValidationResult | null> {
    try {
      const file = await CADFileModel.findById(fileId);
      if (!file) {
        return null;
      }

      // Get file from storage
      const fileStream = await this.storageService.getFileStream(file.fileUrl);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        fileStream.on('data', (chunk) => chunks.push(chunk));
        fileStream.on('end', async () => {
          try {
            const fileBuffer = Buffer.concat(chunks);
            const validationResult = await this.validationService.validateFile(
              fileBuffer,
              file.originalName,
              file.mimeType
            );
            resolve(validationResult);
          } catch (error) {
            reject(error);
          }
        });
        fileStream.on('error', reject);
      });

    } catch (error) {
      console.error(`Failed to validate file integrity for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Get upload statistics
   */
  async getUploadStatistics(userId?: string): Promise<{
    totalUploads: number;
    totalSize: number;
    recentUploads: number;
    failureRate: number;
  }> {
    try {
      const fileStats = await CADFileModel.getStatistics();
      
      // Get audit log statistics for upload failures
      const auditStats = await AuditLogModel.getActionStatistics('FILE_UPLOAD_FAILED', {
        userId,
        timeRange: { days: 30 }
      });

      const totalUploads = fileStats.totalFiles;
      const failedUploads = auditStats.count;
      const failureRate = totalUploads > 0 ? (failedUploads / (totalUploads + failedUploads)) * 100 : 0;

      return {
        totalUploads,
        totalSize: fileStats.totalSize,
        recentUploads: fileStats.recentUploads,
        failureRate
      };

    } catch (error) {
      console.error('Failed to get upload statistics:', error);
      return {
        totalUploads: 0,
        totalSize: 0,
        recentUploads: 0,
        failureRate: 0
      };
    }
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    userId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await AuditLogModel.create({
        userId,
        action,
        resourceType: 'file',
        resourceId: details.fileId || null,
        details,
        ipAddress: '127.0.0.1', // This should come from request context
        userAgent: 'FileUploadService'
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }

  /**
   * Cleanup orphaned files (files in storage but not in database)
   */
  async cleanupOrphanedFiles(): Promise<{
    cleaned: number;
    errors: string[];
  }> {
    // This would be implemented based on your storage provider
    // For now, return a placeholder
    return {
      cleaned: 0,
      errors: []
    };
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    storage: boolean;
    validation: boolean;
    thumbnail: boolean;
    database: boolean;
  }> {
    const status = {
      storage: false,
      validation: true, // Validation service is always available
      thumbnail: true,  // Thumbnail service is always available
      database: false
    };

    try {
      // Test storage connectivity
      const testBuffer = Buffer.from('test');
      await this.storageService.uploadFile(testBuffer, 'health-check.txt', 'text/plain');
      status.storage = true;
    } catch (error) {
      console.warn('Storage health check failed:', error);
    }

    try {
      // Test database connectivity
      await CADFileModel.getStatistics();
      status.database = true;
    } catch (error) {
      console.warn('Database health check failed:', error);
    }

    return status;
  }
}