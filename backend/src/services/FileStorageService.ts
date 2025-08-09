import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

export interface FileUploadResult {
  fileUrl: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
}

export interface StorageConfig {
  provider: 'aws' | 'minio' | 'local';
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  localPath?: string;
}

export class FileStorageService {
  private s3Client?: AWS.S3;
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
    
    if (config.provider === 'aws' || config.provider === 'minio') {
      this.s3Client = new AWS.S3({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || 'us-east-1',
        ...(config.endpoint && { 
          endpoint: config.endpoint,
          s3ForcePathStyle: true // Required for MinIO
        })
      });
    }
  }

  /**
   * Upload file to storage
   */
  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: string = 'cad-files'
  ): Promise<FileUploadResult> {
    const fileExtension = path.extname(originalName);
    const filename = `${uuidv4()}${fileExtension}`;
    const key = `${folder}/${filename}`;
    const checksum = this.calculateChecksum(fileBuffer);

    switch (this.config.provider) {
      case 'aws':
      case 'minio':
        return await this.uploadToS3(fileBuffer, key, mimeType, filename, checksum);
      
      case 'local':
        return await this.uploadToLocal(fileBuffer, key, mimeType, filename, checksum);
      
      default:
        throw new Error(`Unsupported storage provider: ${this.config.provider}`);
    }
  }

  /**
   * Upload thumbnail to storage
   */
  async uploadThumbnail(
    thumbnailBuffer: Buffer,
    originalFilename: string
  ): Promise<string> {
    const filename = `thumb_${path.parse(originalFilename).name}.jpg`;
    const key = `thumbnails/${filename}`;

    switch (this.config.provider) {
      case 'aws':
      case 'minio':
        const result = await this.uploadToS3(thumbnailBuffer, key, 'image/jpeg', filename, '');
        return result.fileUrl;
      
      case 'local':
        const localResult = await this.uploadToLocal(thumbnailBuffer, key, 'image/jpeg', filename, '');
        return localResult.fileUrl;
      
      default:
        throw new Error(`Unsupported storage provider: ${this.config.provider}`);
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileUrl: string): Promise<void> {
    const key = this.extractKeyFromUrl(fileUrl);

    switch (this.config.provider) {
      case 'aws':
      case 'minio':
        await this.deleteFromS3(key);
        break;
      
      case 'local':
        await this.deleteFromLocal(key);
        break;
      
      default:
        throw new Error(`Unsupported storage provider: ${this.config.provider}`);
    }
  }

  /**
   * Get file stream for download
   */
  async getFileStream(fileUrl: string): Promise<NodeJS.ReadableStream> {
    const key = this.extractKeyFromUrl(fileUrl);

    switch (this.config.provider) {
      case 'aws':
      case 'minio':
        if (!this.s3Client) throw new Error('S3 client not initialized');
        return this.s3Client.getObject({
          Bucket: this.config.bucket!,
          Key: key
        }).createReadStream();
      
      case 'local':
        const localPath = path.join(this.config.localPath!, key);
        const fs = await import('fs');
        return fs.createReadStream(localPath);
      
      default:
        throw new Error(`Unsupported storage provider: ${this.config.provider}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(fileUrl: string): Promise<boolean> {
    try {
      const key = this.extractKeyFromUrl(fileUrl);

      switch (this.config.provider) {
        case 'aws':
        case 'minio':
          if (!this.s3Client) return false;
          await this.s3Client.headObject({
            Bucket: this.config.bucket!,
            Key: key
          }).promise();
          return true;
        
        case 'local':
          const localPath = path.join(this.config.localPath!, key);
          await fs.access(localPath);
          return true;
        
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Upload to S3/MinIO
   */
  private async uploadToS3(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
    filename: string,
    checksum: string
  ): Promise<FileUploadResult> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: this.config.bucket!,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        originalName: filename,
        checksum: checksum
      }
    };

    const result = await this.s3Client.upload(uploadParams).promise();

    return {
      fileUrl: result.Location,
      filename,
      fileSize: fileBuffer.length,
      mimeType,
      checksum
    };
  }

  /**
   * Upload to local storage
   */
  private async uploadToLocal(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
    filename: string,
    checksum: string
  ): Promise<FileUploadResult> {
    if (!this.config.localPath) {
      throw new Error('Local storage path not configured');
    }

    const filePath = path.join(this.config.localPath, key);
    const directory = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });

    // Write file
    await fs.writeFile(filePath, fileBuffer);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/${key}`;

    return {
      fileUrl,
      filename,
      fileSize: fileBuffer.length,
      mimeType,
      checksum
    };
  }

  /**
   * Delete from S3/MinIO
   */
  private async deleteFromS3(key: string): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    await this.s3Client.deleteObject({
      Bucket: this.config.bucket!,
      Key: key
    }).promise();
  }

  /**
   * Delete from local storage
   */
  private async deleteFromLocal(key: string): Promise<void> {
    if (!this.config.localPath) {
      throw new Error('Local storage path not configured');
    }

    const filePath = path.join(this.config.localPath, key);
    await fs.unlink(filePath);
  }

  /**
   * Extract key from file URL
   */
  private extractKeyFromUrl(fileUrl: string): string {
    if (this.config.provider === 'local') {
      const urlParts = fileUrl.split('/uploads/');
      return urlParts[1] || '';
    }
    
    // For S3/MinIO, extract key from URL
    const url = new URL(fileUrl);
    return url.pathname.substring(1); // Remove leading slash
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get storage configuration
   */
  static getStorageConfig(): StorageConfig {
    const provider = (process.env.STORAGE_PROVIDER as 'aws' | 'minio' | 'local') || 'local';
    
    return {
      provider,
      bucket: process.env.STORAGE_BUCKET,
      region: process.env.STORAGE_REGION,
      endpoint: process.env.STORAGE_ENDPOINT,
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
      localPath: process.env.STORAGE_LOCAL_PATH || './uploads'
    };
  }
}