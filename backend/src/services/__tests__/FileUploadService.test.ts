import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileUploadService } from '../FileUploadService.js';
import { FileStorageService } from '../FileStorageService.js';
import { FileValidationService } from '../FileValidationService.js';
import { ThumbnailService } from '../ThumbnailService.js';
import { CADFileModel } from '../../models/CADFile.js';
import { AuditLogModel } from '../../models/AuditLog.js';

// Mock all dependencies
vi.mock('../FileStorageService.js');
vi.mock('../FileValidationService.js');
vi.mock('../ThumbnailService.js');
vi.mock('../../models/CADFile.js');
vi.mock('../../models/AuditLog.js');

describe('FileUploadService', () => {
  let service: FileUploadService;
  let mockStorageService: any;
  let mockValidationService: any;
  let mockThumbnailService: any;
  let testBuffer: Buffer;
  let testUserId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    
    testBuffer = Buffer.from('test file content');
    testUserId = 'user-123';

    // Mock FileStorageService
    mockStorageService = {
      uploadFile: vi.fn(),
      uploadThumbnail: vi.fn(),
      deleteFile: vi.fn(),
      getFileStream: vi.fn(),
      fileExists: vi.fn()
    };

    // Mock FileValidationService
    mockValidationService = {
      validateFile: vi.fn()
    };

    // Mock ThumbnailService
    mockThumbnailService = {
      generateThumbnail: vi.fn()
    };

    // Mock constructors
    (FileStorageService as any).mockImplementation(() => mockStorageService);
    (FileValidationService as any).mockImplementation(() => mockValidationService);
    (ThumbnailService as any).mockImplementation(() => mockThumbnailService);

    // Mock static methods
    (FileStorageService.getStorageConfig as any) = vi.fn().mockReturnValue({
      provider: 'local',
      localPath: './uploads'
    });
    (FileValidationService.getDefaultConfig as any) = vi.fn().mockReturnValue({
      maxFileSize: 100 * 1024 * 1024,
      allowedExtensions: ['.dwg', '.dxf'],
      enableMalwareScanning: true
    });

    service = new FileUploadService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully with all steps', async () => {
      // Mock validation success
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: { units: 'mm' }
      });

      // Mock storage upload success
      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      // Mock thumbnail generation success
      mockThumbnailService.generateThumbnail.mockResolvedValue({
        buffer: Buffer.from('thumbnail'),
        width: 300,
        height: 300,
        format: 'jpeg',
        size: 1000
      });

      mockStorageService.uploadThumbnail.mockResolvedValue('https://example.com/thumb.jpg');

      // Mock database save success
      const mockCADFile = {
        id: 'file-123',
        filename: 'test-file.dwg',
        originalName: 'test.dwg',
        fileSize: testBuffer.length,
        uploadedBy: testUserId
      };
      (CADFileModel.create as any).mockResolvedValue(mockCADFile);

      // Mock audit log
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId,
        {
          tags: ['test'],
          projectName: 'Test Project'
        }
      );

      expect(result.success).toBe(true);
      expect(result.file).toEqual(mockCADFile);
      expect(result.errors).toHaveLength(0);

      // Verify all services were called
      expect(mockValidationService.validateFile).toHaveBeenCalledWith(
        testBuffer,
        'test.dwg',
        'application/dwg'
      );
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        testBuffer,
        'test.dwg',
        'application/dwg'
      );
      expect(mockThumbnailService.generateThumbnail).toHaveBeenCalledWith(
        testBuffer,
        'test.dwg'
      );
      expect(CADFileModel.create).toHaveBeenCalledWith({
        filename: 'test-file.dwg',
        originalName: 'test.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        uploadedBy: testUserId,
        fileUrl: 'https://example.com/file.dwg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        tags: ['test'],
        projectName: 'Test Project',
        partName: undefined,
        description: undefined,
        metadata: {
          checksum: 'abc123',
          units: 'mm'
        }
      });
    });

    it('should fail when file validation fails', async () => {
      mockValidationService.validateFile.mockResolvedValue({
        isValid: false,
        errors: ['File is too large'],
        warnings: []
      });

      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('File is too large');
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(CADFileModel.create).not.toHaveBeenCalled();
    });

    it('should continue when thumbnail generation fails', async () => {
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      // Mock thumbnail generation failure
      mockThumbnailService.generateThumbnail.mockRejectedValue(new Error('Thumbnail failed'));

      const mockCADFile = { id: 'file-123' };
      (CADFileModel.create as any).mockResolvedValue(mockCADFile);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId
      );

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Failed to generate thumbnail');
      expect(CADFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          thumbnailUrl: undefined
        })
      );
    });

    it('should skip validation when disabled', async () => {
      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      const mockCADFile = { id: 'file-123' };
      (CADFileModel.create as any).mockResolvedValue(mockCADFile);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId,
        { validateFile: false }
      );

      expect(result.success).toBe(true);
      expect(mockValidationService.validateFile).not.toHaveBeenCalled();
    });

    it('should skip thumbnail generation when disabled', async () => {
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      const mockCADFile = { id: 'file-123' };
      (CADFileModel.create as any).mockResolvedValue(mockCADFile);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId,
        { generateThumbnail: false }
      );

      expect(result.success).toBe(true);
      expect(mockThumbnailService.generateThumbnail).not.toHaveBeenCalled();
    });

    it('should handle storage upload errors', async () => {
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockStorageService.uploadFile.mockRejectedValue(new Error('Storage failed'));
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Upload failed: Storage failed');
    });

    it('should handle database save errors', async () => {
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      (CADFileModel.create as any).mockRejectedValue(new Error('Database failed'));
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.uploadFile(
        testBuffer,
        'test.dwg',
        'application/dwg',
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Upload failed: Database failed');
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files successfully', async () => {
      const files = [
        { buffer: testBuffer, originalName: 'file1.dwg', mimeType: 'application/dwg' },
        { buffer: testBuffer, originalName: 'file2.dwg', mimeType: 'application/dwg' }
      ];

      // Mock successful uploads for both files
      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      (CADFileModel.create as any).mockResolvedValue({ id: 'file-123' });
      (AuditLogModel.create as any).mockResolvedValue({});

      const results = await service.uploadMultipleFiles(files, testUserId);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockValidationService.validateFile).toHaveBeenCalledTimes(2);
      expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure results', async () => {
      const files = [
        { buffer: testBuffer, originalName: 'file1.dwg', mimeType: 'application/dwg' },
        { buffer: testBuffer, originalName: 'file2.dwg', mimeType: 'application/dwg' }
      ];

      // First file succeeds, second fails validation
      mockValidationService.validateFile
        .mockResolvedValueOnce({
          isValid: true,
          errors: [],
          warnings: []
        })
        .mockResolvedValueOnce({
          isValid: false,
          errors: ['Invalid file'],
          warnings: []
        });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/file.dwg',
        filename: 'test-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'abc123'
      });

      (CADFileModel.create as any).mockResolvedValue({ id: 'file-123' });
      (AuditLogModel.create as any).mockResolvedValue({});

      const results = await service.uploadMultipleFiles(files, testUserId);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].errors).toContain('Invalid file');
    });
  });

  describe('replaceFile', () => {
    it('should replace file successfully', async () => {
      const fileId = 'file-123';
      const existingFile = {
        id: fileId,
        originalName: 'original.dwg',
        currentVersion: 1,
        metadata: { oldData: 'value' }
      };

      (CADFileModel.findById as any).mockResolvedValue(existingFile);

      mockValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: { newData: 'value' }
      });

      mockStorageService.uploadFile.mockResolvedValue({
        fileUrl: 'https://example.com/new-file.dwg',
        filename: 'new-file.dwg',
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: 'def456'
      });

      (CADFileModel.createVersion as any).mockResolvedValue({
        id: 'version-123',
        versionNumber: 2
      });

      const updatedFile = { ...existingFile, currentVersion: 2 };
      (CADFileModel.update as any).mockResolvedValue(updatedFile);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.replaceFile(
        fileId,
        testBuffer,
        'new-file.dwg',
        'application/dwg',
        testUserId,
        'Updated design'
      );

      expect(result.success).toBe(true);
      expect(result.file).toEqual(updatedFile);

      expect(CADFileModel.createVersion).toHaveBeenCalledWith({
        fileId,
        versionNumber: 2,
        filename: 'new-file.dwg',
        fileSize: testBuffer.length,
        uploadedBy: testUserId,
        changeDescription: 'Updated design',
        fileUrl: 'https://example.com/new-file.dwg'
      });
    });

    it('should fail when original file not found', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const result = await service.replaceFile(
        'nonexistent-file',
        testBuffer,
        'new-file.dwg',
        'application/dwg',
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Original file not found');
    });
  });

  describe('deleteFile', () => {
    it('should delete file and all versions successfully', async () => {
      const fileId = 'file-123';
      const file = {
        id: fileId,
        originalName: 'test.dwg',
        fileUrl: 'https://example.com/file.dwg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        fileSize: 1000,
        versions: [
          { fileUrl: 'https://example.com/v1.dwg' },
          { fileUrl: 'https://example.com/v2.dwg' }
        ]
      };

      (CADFileModel.findById as any).mockResolvedValue(file);
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      (CADFileModel.delete as any).mockResolvedValue(true);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.deleteFile(fileId, testUserId);

      expect(result).toBe(true);
      expect(mockStorageService.deleteFile).toHaveBeenCalledTimes(4); // main file + thumbnail + 2 versions
      expect(CADFileModel.delete).toHaveBeenCalledWith(fileId);
    });

    it('should return false when file not found', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const result = await service.deleteFile('nonexistent-file', testUserId);

      expect(result).toBe(false);
    });

    it('should continue deletion even if storage cleanup fails', async () => {
      const fileId = 'file-123';
      const file = {
        id: fileId,
        originalName: 'test.dwg',
        fileUrl: 'https://example.com/file.dwg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        fileSize: 1000,
        versions: []
      };

      (CADFileModel.findById as any).mockResolvedValue(file);
      mockStorageService.deleteFile.mockRejectedValue(new Error('Storage delete failed'));
      (CADFileModel.delete as any).mockResolvedValue(true);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.deleteFile(fileId, testUserId);

      expect(result).toBe(true); // Should still succeed despite storage errors
    });
  });

  describe('getFileStream', () => {
    it('should return file stream successfully', async () => {
      const fileId = 'file-123';
      const file = {
        id: fileId,
        originalName: 'test.dwg',
        fileUrl: 'https://example.com/file.dwg'
      };

      const mockStream = { pipe: vi.fn() };

      (CADFileModel.findById as any).mockResolvedValue(file);
      mockStorageService.getFileStream.mockResolvedValue(mockStream);
      (AuditLogModel.create as any).mockResolvedValue({});

      const result = await service.getFileStream(fileId, testUserId);

      expect(result).toBe(mockStream);
      expect(AuditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          action: 'FILE_ACCESSED',
          details: expect.objectContaining({
            fileId,
            accessType: 'download'
          })
        })
      );
    });

    it('should return null when file not found', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const result = await service.getFileStream('nonexistent-file', testUserId);

      expect(result).toBeNull();
    });
  });

  describe('validateFileIntegrity', () => {
    it('should validate file integrity successfully', async () => {
      const fileId = 'file-123';
      const file = {
        id: fileId,
        originalName: 'test.dwg',
        mimeType: 'application/dwg',
        fileUrl: 'https://example.com/file.dwg'
      };

      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(testBuffer);
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const validationResult = {
        isValid: true,
        errors: [],
        warnings: []
      };

      (CADFileModel.findById as any).mockResolvedValue(file);
      mockStorageService.getFileStream.mockResolvedValue(mockStream);
      mockValidationService.validateFile.mockResolvedValue(validationResult);

      const result = await service.validateFileIntegrity(fileId);

      expect(result).toEqual(validationResult);
    });

    it('should return null when file not found', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const result = await service.validateFileIntegrity('nonexistent-file');

      expect(result).toBeNull();
    });
  });

  describe('getUploadStatistics', () => {
    it('should return upload statistics', async () => {
      const fileStats = {
        totalFiles: 100,
        totalSize: 1000000,
        recentUploads: 10,
        filesByType: { 'application/dwg': 50, 'application/dxf': 50 }
      };

      const auditStats = { count: 5 };

      (CADFileModel.getStatistics as any).mockResolvedValue(fileStats);
      (AuditLogModel.getActionStatistics as any).mockResolvedValue(auditStats);

      const result = await service.getUploadStatistics();

      expect(result).toEqual({
        totalUploads: 100,
        totalSize: 1000000,
        recentUploads: 10,
        failureRate: 4.76 // 5 failures out of 105 total attempts
      });
    });

    it('should handle statistics errors gracefully', async () => {
      (CADFileModel.getStatistics as any).mockRejectedValue(new Error('Stats failed'));

      const result = await service.getUploadStatistics();

      expect(result).toEqual({
        totalUploads: 0,
        totalSize: 0,
        recentUploads: 0,
        failureRate: 0
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status for all services', async () => {
      mockStorageService.uploadFile.mockResolvedValue({});
      (CADFileModel.getStatistics as any).mockResolvedValue({});

      const result = await service.getHealthStatus();

      expect(result).toEqual({
        storage: true,
        validation: true,
        thumbnail: true,
        database: true
      });
    });

    it('should detect storage service failures', async () => {
      mockStorageService.uploadFile.mockRejectedValue(new Error('Storage failed'));
      (CADFileModel.getStatistics as any).mockResolvedValue({});

      const result = await service.getHealthStatus();

      expect(result.storage).toBe(false);
      expect(result.database).toBe(true);
    });

    it('should detect database failures', async () => {
      mockStorageService.uploadFile.mockResolvedValue({});
      (CADFileModel.getStatistics as any).mockRejectedValue(new Error('DB failed'));

      const result = await service.getHealthStatus();

      expect(result.storage).toBe(true);
      expect(result.database).toBe(false);
    });
  });
});