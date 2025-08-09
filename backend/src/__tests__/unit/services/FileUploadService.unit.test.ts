import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileUploadService } from '../../../services/FileUploadService';
import { FileStorageService } from '../../../services/FileStorageService';
import { FileValidationService } from '../../../services/FileValidationService';
import { ThumbnailService } from '../../../services/ThumbnailService';
import { MetadataExtractionService } from '../../../services/MetadataExtractionService';

vi.mock('../../../services/FileStorageService');
vi.mock('../../../services/FileValidationService');
vi.mock('../../../services/ThumbnailService');
vi.mock('../../../services/MetadataExtractionService');

describe('FileUploadService', () => {
  let fileUploadService: FileUploadService;
  let mockFileStorageService: any;
  let mockFileValidationService: any;
  let mockThumbnailService: any;
  let mockMetadataExtractionService: any;

  beforeEach(() => {
    mockFileStorageService = {
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
    };
    mockFileValidationService = {
      validateFile: vi.fn(),
      scanForMalware: vi.fn(),
    };
    mockThumbnailService = {
      generateThumbnail: vi.fn(),
    };
    mockMetadataExtractionService = {
      extractMetadata: vi.fn(),
    };

    vi.mocked(FileStorageService).mockImplementation(() => mockFileStorageService);
    vi.mocked(FileValidationService).mockImplementation(() => mockFileValidationService);
    vi.mocked(ThumbnailService).mockImplementation(() => mockThumbnailService);
    vi.mocked(MetadataExtractionService).mockImplementation(() => mockMetadataExtractionService);

    fileUploadService = new FileUploadService();
    vi.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = {
        originalname: 'test.dwg',
        mimetype: 'application/dwg',
        size: 1024000,
        buffer: Buffer.from('test file content'),
      };
      const userId = 'user-id';
      const uploadOptions = {
        tags: ['test'],
        projectName: 'Test Project',
        description: 'Test file',
      };

      const mockValidationResult = { isValid: true, errors: [] };
      const mockUploadResult = {
        fileUrl: 'https://test-bucket.s3.amazonaws.com/test.dwg',
        key: 'uploads/test.dwg',
      };
      const mockThumbnailUrl = 'https://test-bucket.s3.amazonaws.com/thumbnails/test.jpg';
      const mockMetadata = {
        dimensions: { width: 100, height: 200 },
        units: 'mm',
        software: 'AutoCAD',
      };

      mockFileValidationService.validateFile.mockResolvedValue(mockValidationResult);
      mockFileValidationService.scanForMalware.mockResolvedValue(true);
      mockFileStorageService.uploadFile.mockResolvedValue(mockUploadResult);
      mockThumbnailService.generateThumbnail.mockResolvedValue(mockThumbnailUrl);
      mockMetadataExtractionService.extractMetadata.mockResolvedValue(mockMetadata);

      const result = await fileUploadService.uploadFile(mockFile, userId, uploadOptions);

      expect(mockFileValidationService.validateFile).toHaveBeenCalledWith(mockFile);
      expect(mockFileValidationService.scanForMalware).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockFileStorageService.uploadFile).toHaveBeenCalledWith(mockFile, 'uploads/');
      expect(mockThumbnailService.generateThumbnail).toHaveBeenCalledWith(mockFile.buffer, mockFile.mimetype);
      expect(mockMetadataExtractionService.extractMetadata).toHaveBeenCalledWith(mockFile.buffer, mockFile.mimetype);

      expect(result).toEqual({
        filename: expect.stringMatching(/^[a-f0-9-]+\.dwg$/),
        originalName: 'test.dwg',
        fileSize: 1024000,
        mimeType: 'application/dwg',
        uploadedBy: userId,
        tags: ['test'],
        projectName: 'Test Project',
        description: 'Test file',
        fileUrl: mockUploadResult.fileUrl,
        thumbnailUrl: mockThumbnailUrl,
        metadata: mockMetadata,
      });
    });

    it('should throw error for invalid file', async () => {
      const mockFile = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test content'),
      };
      const userId = 'user-id';

      const mockValidationResult = {
        isValid: false,
        errors: ['Unsupported file type'],
      };

      mockFileValidationService.validateFile.mockResolvedValue(mockValidationResult);

      await expect(fileUploadService.uploadFile(mockFile, userId)).rejects.toThrow('File validation failed: Unsupported file type');
    });

    it('should throw error for malware detected', async () => {
      const mockFile = {
        originalname: 'test.dwg',
        mimetype: 'application/dwg',
        size: 1024000,
        buffer: Buffer.from('malicious content'),
      };
      const userId = 'user-id';

      const mockValidationResult = { isValid: true, errors: [] };

      mockFileValidationService.validateFile.mockResolvedValue(mockValidationResult);
      mockFileValidationService.scanForMalware.mockResolvedValue(false);

      await expect(fileUploadService.uploadFile(mockFile, userId)).rejects.toThrow('Malware detected in file');
    });

    it('should handle storage upload failure', async () => {
      const mockFile = {
        originalname: 'test.dwg',
        mimetype: 'application/dwg',
        size: 1024000,
        buffer: Buffer.from('test file content'),
      };
      const userId = 'user-id';

      const mockValidationResult = { isValid: true, errors: [] };

      mockFileValidationService.validateFile.mockResolvedValue(mockValidationResult);
      mockFileValidationService.scanForMalware.mockResolvedValue(true);
      mockFileStorageService.uploadFile.mockRejectedValue(new Error('Storage error'));

      await expect(fileUploadService.uploadFile(mockFile, userId)).rejects.toThrow('Storage error');
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files successfully', async () => {
      const mockFiles = [
        {
          originalname: 'test1.dwg',
          mimetype: 'application/dwg',
          size: 1024000,
          buffer: Buffer.from('test file 1'),
        },
        {
          originalname: 'test2.dwg',
          mimetype: 'application/dwg',
          size: 2048000,
          buffer: Buffer.from('test file 2'),
        },
      ];
      const userId = 'user-id';

      const mockValidationResult = { isValid: true, errors: [] };
      const mockUploadResults = [
        {
          fileUrl: 'https://test-bucket.s3.amazonaws.com/test1.dwg',
          key: 'uploads/test1.dwg',
        },
        {
          fileUrl: 'https://test-bucket.s3.amazonaws.com/test2.dwg',
          key: 'uploads/test2.dwg',
        },
      ];

      mockFileValidationService.validateFile.mockResolvedValue(mockValidationResult);
      mockFileValidationService.scanForMalware.mockResolvedValue(true);
      mockFileStorageService.uploadFile
        .mockResolvedValueOnce(mockUploadResults[0])
        .mockResolvedValueOnce(mockUploadResults[1]);
      mockThumbnailService.generateThumbnail.mockResolvedValue('thumbnail-url');
      mockMetadataExtractionService.extractMetadata.mockResolvedValue({});

      const results = await fileUploadService.uploadMultipleFiles(mockFiles, userId);

      expect(results).toHaveLength(2);
      expect(results[0].originalName).toBe('test1.dwg');
      expect(results[1].originalName).toBe('test2.dwg');
    });

    it('should handle partial failures in multiple file upload', async () => {
      const mockFiles = [
        {
          originalname: 'test1.dwg',
          mimetype: 'application/dwg',
          size: 1024000,
          buffer: Buffer.from('test file 1'),
        },
        {
          originalname: 'test2.txt',
          mimetype: 'text/plain',
          size: 1024,
          buffer: Buffer.from('invalid file'),
        },
      ];
      const userId = 'user-id';

      mockFileValidationService.validateFile
        .mockResolvedValueOnce({ isValid: true, errors: [] })
        .mockResolvedValueOnce({ isValid: false, errors: ['Unsupported file type'] });

      const results = await fileUploadService.uploadMultipleFiles(mockFiles, userId);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('filename');
      expect(results[1]).toEqual({
        originalName: 'test2.txt',
        error: 'File validation failed: Unsupported file type',
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const fileKey = 'uploads/test.dwg';
      const thumbnailKey = 'thumbnails/test.jpg';

      mockFileStorageService.deleteFile.mockResolvedValue(true);

      const result = await fileUploadService.deleteFile(fileKey, thumbnailKey);

      expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith(fileKey);
      expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith(thumbnailKey);
      expect(result).toBe(true);
    });

    it('should handle deletion errors gracefully', async () => {
      const fileKey = 'uploads/test.dwg';

      mockFileStorageService.deleteFile.mockRejectedValue(new Error('Deletion failed'));

      await expect(fileUploadService.deleteFile(fileKey)).rejects.toThrow('Deletion failed');
    });
  });
});