import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileStorageService, StorageConfig } from '../FileStorageService.js';
import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';

// Mock AWS SDK
vi.mock('aws-sdk');
const mockS3 = {
  upload: vi.fn(),
  deleteObject: vi.fn(),
  getObject: vi.fn(),
  headObject: vi.fn()
};

// Mock fs promises
vi.mock('fs/promises');

describe('FileStorageService', () => {
  let service: FileStorageService;
  let testBuffer: Buffer;

  beforeEach(() => {
    vi.clearAllMocks();
    testBuffer = Buffer.from('test file content');
    
    // Mock AWS.S3 constructor
    (AWS.S3 as any).mockImplementation(() => mockS3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AWS S3 Storage', () => {
    beforeEach(() => {
      const config: StorageConfig = {
        provider: 'aws',
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      };
      service = new FileStorageService(config);
    });

    it('should upload file to S3 successfully', async () => {
      const mockUploadResult = {
        Location: 'https://test-bucket.s3.amazonaws.com/cad-files/test-file.dwg'
      };
      
      mockS3.upload.mockReturnValue({
        promise: () => Promise.resolve(mockUploadResult)
      });

      const result = await service.uploadFile(
        testBuffer,
        'test-file.dwg',
        'application/dwg'
      );

      expect(result).toEqual({
        fileUrl: mockUploadResult.Location,
        filename: expect.stringMatching(/^[0-9a-f-]+\.dwg$/),
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: expect.any(String)
      });

      expect(mockS3.upload).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: expect.stringMatching(/^cad-files\/[0-9a-f-]+\.dwg$/),
        Body: testBuffer,
        ContentType: 'application/dwg',
        Metadata: {
          originalName: expect.stringMatching(/^[0-9a-f-]+\.dwg$/),
          checksum: expect.any(String)
        }
      });
    });

    it('should upload thumbnail to S3 successfully', async () => {
      const mockUploadResult = {
        Location: 'https://test-bucket.s3.amazonaws.com/thumbnails/thumb_test-file.jpg'
      };
      
      mockS3.upload.mockReturnValue({
        promise: () => Promise.resolve(mockUploadResult)
      });

      const result = await service.uploadThumbnail(testBuffer, 'test-file.dwg');

      expect(result).toBe(mockUploadResult.Location);
      expect(mockS3.upload).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'thumbnails/thumb_test-file.jpg',
        Body: testBuffer,
        ContentType: 'image/jpeg',
        Metadata: {
          originalName: 'thumb_test-file.jpg',
          checksum: ''
        }
      });
    });

    it('should delete file from S3 successfully', async () => {
      mockS3.deleteObject.mockReturnValue({
        promise: () => Promise.resolve({})
      });

      const fileUrl = 'https://test-bucket.s3.amazonaws.com/cad-files/test-file.dwg';
      await service.deleteFile(fileUrl);

      expect(mockS3.deleteObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'cad-files/test-file.dwg'
      });
    });

    it('should check if file exists in S3', async () => {
      mockS3.headObject.mockReturnValue({
        promise: () => Promise.resolve({})
      });

      const fileUrl = 'https://test-bucket.s3.amazonaws.com/cad-files/test-file.dwg';
      const exists = await service.fileExists(fileUrl);

      expect(exists).toBe(true);
      expect(mockS3.headObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'cad-files/test-file.dwg'
      });
    });

    it('should return false when file does not exist in S3', async () => {
      mockS3.headObject.mockReturnValue({
        promise: () => Promise.reject(new Error('Not Found'))
      });

      const fileUrl = 'https://test-bucket.s3.amazonaws.com/cad-files/nonexistent.dwg';
      const exists = await service.fileExists(fileUrl);

      expect(exists).toBe(false);
    });

    it('should get file stream from S3', async () => {
      const mockStream = { pipe: vi.fn() };
      mockS3.getObject.mockReturnValue({
        createReadStream: () => mockStream
      });

      const fileUrl = 'https://test-bucket.s3.amazonaws.com/cad-files/test-file.dwg';
      const stream = await service.getFileStream(fileUrl);

      expect(stream).toBe(mockStream);
      expect(mockS3.getObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'cad-files/test-file.dwg'
      });
    });
  });

  describe('MinIO Storage', () => {
    beforeEach(() => {
      const config: StorageConfig = {
        provider: 'minio',
        bucket: 'test-bucket',
        endpoint: 'http://localhost:9000',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      };
      service = new FileStorageService(config);
    });

    it('should configure S3 client for MinIO with correct options', () => {
      expect(AWS.S3).toHaveBeenCalledWith({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
        s3ForcePathStyle: true
      });
    });
  });

  describe('Local Storage', () => {
    beforeEach(() => {
      const config: StorageConfig = {
        provider: 'local',
        localPath: '/tmp/uploads'
      };
      service = new FileStorageService(config);
    });

    it('should upload file to local storage successfully', async () => {
      (fs.mkdir as any).mockResolvedValue(undefined);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const result = await service.uploadFile(
        testBuffer,
        'test-file.dwg',
        'application/dwg'
      );

      expect(result).toEqual({
        fileUrl: expect.stringMatching(/^http:\/\/localhost:3001\/uploads\/cad-files\/[0-9a-f-]+\.dwg$/),
        filename: expect.stringMatching(/^[0-9a-f-]+\.dwg$/),
        fileSize: testBuffer.length,
        mimeType: 'application/dwg',
        checksum: expect.any(String)
      });

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/uploads\/cad-files$/),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/uploads\/cad-files\/[0-9a-f-]+\.dwg$/),
        testBuffer
      );
    });

    it('should delete file from local storage successfully', async () => {
      (fs.unlink as any).mockResolvedValue(undefined);

      const fileUrl = 'http://localhost:3001/uploads/cad-files/test-file.dwg';
      await service.deleteFile(fileUrl);

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/uploads/cad-files/test-file.dwg');
    });

    it('should check if file exists in local storage', async () => {
      (fs.access as any).mockResolvedValue(undefined);

      const fileUrl = 'http://localhost:3001/uploads/cad-files/test-file.dwg';
      const exists = await service.fileExists(fileUrl);

      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/tmp/uploads/cad-files/test-file.dwg');
    });

    it('should return false when file does not exist in local storage', async () => {
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      const fileUrl = 'http://localhost:3001/uploads/cad-files/nonexistent.dwg';
      const exists = await service.fileExists(fileUrl);

      expect(exists).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should get storage configuration from environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        STORAGE_PROVIDER: 'aws',
        STORAGE_BUCKET: 'my-bucket',
        STORAGE_REGION: 'us-west-2',
        STORAGE_ACCESS_KEY_ID: 'my-key',
        STORAGE_SECRET_ACCESS_KEY: 'my-secret'
      };

      const config = FileStorageService.getStorageConfig();

      expect(config).toEqual({
        provider: 'aws',
        bucket: 'my-bucket',
        region: 'us-west-2',
        endpoint: undefined,
        accessKeyId: 'my-key',
        secretAccessKey: 'my-secret',
        localPath: './uploads'
      });

      process.env = originalEnv;
    });

    it('should use default values when environment variables are not set', () => {
      const originalEnv = process.env;
      process.env = {};

      const config = FileStorageService.getStorageConfig();

      expect(config).toEqual({
        provider: 'local',
        bucket: undefined,
        region: undefined,
        endpoint: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
        localPath: './uploads'
      });

      process.env = originalEnv;
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const config: StorageConfig = {
        provider: 'aws',
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      };
      service = new FileStorageService(config);
    });

    it('should throw error for unsupported storage provider', () => {
      const config: StorageConfig = {
        provider: 'unsupported' as any
      };

      expect(() => new FileStorageService(config)).not.toThrow();
      
      const service = new FileStorageService(config);
      expect(service.uploadFile(testBuffer, 'test.dwg', 'application/dwg'))
        .rejects.toThrow('Unsupported storage provider: unsupported');
    });

    it('should handle S3 upload errors', async () => {
      mockS3.upload.mockReturnValue({
        promise: () => Promise.reject(new Error('S3 upload failed'))
      });

      await expect(service.uploadFile(testBuffer, 'test.dwg', 'application/dwg'))
        .rejects.toThrow('S3 upload failed');
    });

    it('should handle S3 delete errors', async () => {
      mockS3.deleteObject.mockReturnValue({
        promise: () => Promise.reject(new Error('S3 delete failed'))
      });

      const fileUrl = 'https://test-bucket.s3.amazonaws.com/cad-files/test-file.dwg';
      await expect(service.deleteFile(fileUrl)).rejects.toThrow('S3 delete failed');
    });
  });

  describe('Checksum Calculation', () => {
    it('should calculate consistent checksums for same content', async () => {
      const config: StorageConfig = {
        provider: 'aws',
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      };
      service = new FileStorageService(config);

      mockS3.upload.mockReturnValue({
        promise: () => Promise.resolve({ Location: 'https://example.com/file.dwg' })
      });

      const result1 = await service.uploadFile(testBuffer, 'test1.dwg', 'application/dwg');
      const result2 = await service.uploadFile(testBuffer, 'test2.dwg', 'application/dwg');

      expect(result1.checksum).toBe(result2.checksum);
      expect(result1.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string
    });

    it('should calculate different checksums for different content', async () => {
      const config: StorageConfig = {
        provider: 'aws',
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      };
      service = new FileStorageService(config);

      mockS3.upload.mockReturnValue({
        promise: () => Promise.resolve({ Location: 'https://example.com/file.dwg' })
      });

      const buffer1 = Buffer.from('content 1');
      const buffer2 = Buffer.from('content 2');

      const result1 = await service.uploadFile(buffer1, 'test1.dwg', 'application/dwg');
      const result2 = await service.uploadFile(buffer2, 'test2.dwg', 'application/dwg');

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });
});