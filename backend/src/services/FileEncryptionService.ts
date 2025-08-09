import { EncryptionService } from '../config/encryption.js';
import { FileStorageService } from './FileStorageService.js';
import { DatabaseService } from '../database/DatabaseService.js';
import { v4 as uuidv4 } from 'uuid';

export interface EncryptedFileMetadata {
  fileId: string;
  encryptionKeyId: string;
  algorithm: string;
  isEncrypted: boolean;
  originalSize: number;
  encryptedSize: number;
  checksum: string;
}

export interface FileEncryptionOptions {
  forceEncryption?: boolean;
  algorithm?: string;
  keyRotation?: boolean;
}

/**
 * Service for encrypting and decrypting CAD files at rest
 */
export class FileEncryptionService {
  private static readonly SUPPORTED_ALGORITHMS = ['aes-256-gcm'];
  private static readonly ENCRYPTION_THRESHOLD_MB = 1; // Encrypt files larger than 1MB

  /**
   * Encrypt a file and store it
   */
  static async encryptAndStoreFile(
    fileBuffer: Buffer,
    filename: string,
    userId: string,
    options: FileEncryptionOptions = {}
  ): Promise<EncryptedFileMetadata> {
    try {
      const shouldEncrypt = this.shouldEncryptFile(fileBuffer, options);
      
      if (!shouldEncrypt) {
        // Store file without encryption
        const fileUrl = await FileStorageService.uploadFile(fileBuffer, filename);
        return {
          fileId: uuidv4(),
          encryptionKeyId: '',
          algorithm: 'none',
          isEncrypted: false,
          originalSize: fileBuffer.length,
          encryptedSize: fileBuffer.length,
          checksum: EncryptionService.hash(fileBuffer.toString('base64'))
        };
      }

      // Generate unique encryption key for this file
      const encryptionKeyId = uuidv4();
      const algorithm = options.algorithm || 'aes-256-gcm';

      if (!this.SUPPORTED_ALGORITHMS.includes(algorithm)) {
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      }

      // Encrypt the file
      const { encryptedData, key } = EncryptionService.encryptFile(fileBuffer);
      
      // Store the encrypted file
      const encryptedFilename = `encrypted_${filename}`;
      const fileUrl = await FileStorageService.uploadFile(encryptedData, encryptedFilename);

      // Store encryption key metadata in database
      await this.storeEncryptionKey(encryptionKeyId, key, algorithm, userId);

      // Calculate checksums
      const originalChecksum = EncryptionService.hash(fileBuffer.toString('base64'));
      const encryptedChecksum = EncryptionService.hash(encryptedData.toString('base64'));

      const metadata: EncryptedFileMetadata = {
        fileId: uuidv4(),
        encryptionKeyId,
        algorithm,
        isEncrypted: true,
        originalSize: fileBuffer.length,
        encryptedSize: encryptedData.length,
        checksum: originalChecksum
      };

      // Log encryption event
      await this.logEncryptionEvent('file_encrypted', userId, metadata.fileId, {
        algorithm,
        originalSize: fileBuffer.length,
        encryptedSize: encryptedData.length,
        filename
      });

      return metadata;
    } catch (error) {
      console.error('File encryption failed:', error);
      throw new Error(`File encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt and retrieve a file
   */
  static async decryptAndRetrieveFile(
    fileId: string,
    userId: string
  ): Promise<{ fileBuffer: Buffer; metadata: EncryptedFileMetadata }> {
    try {
      // Get file metadata from database
      const metadata = await this.getFileEncryptionMetadata(fileId);
      
      if (!metadata.isEncrypted) {
        // File is not encrypted, retrieve normally
        const fileBuffer = await FileStorageService.downloadFile(fileId);
        return { fileBuffer, metadata };
      }

      // Get encryption key
      const encryptionKey = await this.getEncryptionKey(metadata.encryptionKeyId);
      
      // Download encrypted file
      const encryptedBuffer = await FileStorageService.downloadFile(fileId);
      
      // Decrypt the file
      const decryptedBuffer = EncryptionService.decryptFile(encryptedBuffer, encryptionKey);

      // Verify integrity
      const computedChecksum = EncryptionService.hash(decryptedBuffer.toString('base64'));
      if (computedChecksum !== metadata.checksum) {
        throw new Error('File integrity check failed - possible corruption or tampering');
      }

      // Log decryption event
      await this.logEncryptionEvent('file_decrypted', userId, fileId, {
        algorithm: metadata.algorithm,
        size: decryptedBuffer.length
      });

      return { fileBuffer: decryptedBuffer, metadata };
    } catch (error) {
      console.error('File decryption failed:', error);
      
      // Log decryption failure
      await this.logEncryptionEvent('file_decryption_failed', userId, fileId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`File decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate encryption keys for enhanced security
   */
  static async rotateEncryptionKeys(userId: string): Promise<{ rotatedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let rotatedCount = 0;

    try {
      // Get all active encryption keys older than 90 days
      const oldKeys = await this.getKeysForRotation();

      for (const keyMetadata of oldKeys) {
        try {
          await this.rotateFileEncryptionKey(keyMetadata.fileId, keyMetadata.encryptionKeyId, userId);
          rotatedCount++;
        } catch (error) {
          const errorMsg = `Failed to rotate key for file ${keyMetadata.fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Log key rotation event
      await this.logEncryptionEvent('key_rotation_completed', userId, 'system', {
        rotatedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 5) // Log first 5 errors
      });

      return { rotatedCount, errors };
    } catch (error) {
      console.error('Key rotation process failed:', error);
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify file encryption integrity
   */
  static async verifyFileIntegrity(fileId: string): Promise<{ isValid: boolean; details: any }> {
    try {
      const metadata = await this.getFileEncryptionMetadata(fileId);
      
      if (!metadata.isEncrypted) {
        return { isValid: true, details: { message: 'File is not encrypted' } };
      }

      // Download and decrypt file to verify integrity
      const encryptedBuffer = await FileStorageService.downloadFile(fileId);
      const encryptionKey = await this.getEncryptionKey(metadata.encryptionKeyId);
      const decryptedBuffer = EncryptionService.decryptFile(encryptedBuffer, encryptionKey);

      // Verify checksum
      const computedChecksum = EncryptionService.hash(decryptedBuffer.toString('base64'));
      const isValid = computedChecksum === metadata.checksum;

      return {
        isValid,
        details: {
          originalSize: metadata.originalSize,
          currentSize: decryptedBuffer.length,
          checksumMatch: isValid,
          algorithm: metadata.algorithm
        }
      };
    } catch (error) {
      return {
        isValid: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Get encryption statistics
   */
  static async getEncryptionStatistics(): Promise<{
    totalFiles: number;
    encryptedFiles: number;
    encryptionPercentage: number;
    totalEncryptedSize: number;
    keyRotationsDue: number;
  }> {
    try {
      const db = DatabaseService.getInstance();
      
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(CASE WHEN is_encrypted = true THEN 1 END) as encrypted_files,
          SUM(CASE WHEN is_encrypted = true THEN file_size ELSE 0 END) as total_encrypted_size
        FROM cad_files
      `);

      const stats = result.rows[0];
      const totalFiles = parseInt(stats.total_files);
      const encryptedFiles = parseInt(stats.encrypted_files);
      const encryptionPercentage = totalFiles > 0 ? (encryptedFiles / totalFiles) * 100 : 0;

      // Get keys due for rotation (older than 90 days)
      const rotationResult = await db.query(`
        SELECT COUNT(*) as keys_due
        FROM encryption_keys
        WHERE is_active = true
        AND created_at < NOW() - INTERVAL '90 days'
      `);

      return {
        totalFiles,
        encryptedFiles,
        encryptionPercentage: Math.round(encryptionPercentage * 100) / 100,
        totalEncryptedSize: parseInt(stats.total_encrypted_size) || 0,
        keyRotationsDue: parseInt(rotationResult.rows[0].keys_due)
      };
    } catch (error) {
      console.error('Failed to get encryption statistics:', error);
      throw new Error('Failed to retrieve encryption statistics');
    }
  }

  // Private helper methods

  private static shouldEncryptFile(fileBuffer: Buffer, options: FileEncryptionOptions): boolean {
    if (options.forceEncryption) {
      return true;
    }

    // Encrypt files larger than threshold
    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    return fileSizeMB >= this.ENCRYPTION_THRESHOLD_MB;
  }

  private static async storeEncryptionKey(
    keyId: string,
    key: string,
    algorithm: string,
    userId: string
  ): Promise<void> {
    const db = DatabaseService.getInstance();
    
    // Encrypt the key with master key before storing
    const encryptedKey = EncryptionService.encrypt(key);
    
    await db.query(`
      INSERT INTO encryption_keys (key_id, encrypted_key, algorithm, created_by)
      VALUES ($1, $2, $3, $4)
    `, [keyId, encryptedKey, algorithm, userId]);
  }

  private static async getEncryptionKey(keyId: string): Promise<string> {
    const db = DatabaseService.getInstance();
    
    const result = await db.query(`
      SELECT encrypted_key FROM encryption_keys
      WHERE key_id = $1 AND is_active = true
    `, [keyId]);

    if (result.rows.length === 0) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    // Decrypt the key
    return EncryptionService.decrypt(result.rows[0].encrypted_key);
  }

  private static async getFileEncryptionMetadata(fileId: string): Promise<EncryptedFileMetadata> {
    const db = DatabaseService.getInstance();
    
    const result = await db.query(`
      SELECT 
        id as file_id,
        encryption_key_id,
        encryption_algorithm as algorithm,
        is_encrypted,
        file_size as original_size,
        file_size as encrypted_size,
        metadata->>'checksum' as checksum
      FROM cad_files
      WHERE id = $1
    `, [fileId]);

    if (result.rows.length === 0) {
      throw new Error(`File not found: ${fileId}`);
    }

    const row = result.rows[0];
    return {
      fileId: row.file_id,
      encryptionKeyId: row.encryption_key_id || '',
      algorithm: row.algorithm || 'none',
      isEncrypted: row.is_encrypted || false,
      originalSize: parseInt(row.original_size) || 0,
      encryptedSize: parseInt(row.encrypted_size) || 0,
      checksum: row.checksum || ''
    };
  }

  private static async getKeysForRotation(): Promise<Array<{ fileId: string; encryptionKeyId: string }>> {
    const db = DatabaseService.getInstance();
    
    const result = await db.query(`
      SELECT cf.id as file_id, ek.key_id as encryption_key_id
      FROM cad_files cf
      JOIN encryption_keys ek ON cf.encryption_key_id = ek.key_id
      WHERE ek.is_active = true
      AND ek.created_at < NOW() - INTERVAL '90 days'
      AND cf.is_encrypted = true
    `);

    return result.rows.map(row => ({
      fileId: row.file_id,
      encryptionKeyId: row.encryption_key_id
    }));
  }

  private static async rotateFileEncryptionKey(
    fileId: string,
    oldKeyId: string,
    userId: string
  ): Promise<void> {
    // Download and decrypt with old key
    const { fileBuffer } = await this.decryptAndRetrieveFile(fileId, userId);
    
    // Re-encrypt with new key
    const newMetadata = await this.encryptAndStoreFile(fileBuffer, `rotated_${fileId}`, userId, {
      forceEncryption: true,
      keyRotation: true
    });

    // Update file record with new encryption metadata
    const db = DatabaseService.getInstance();
    await db.query(`
      UPDATE cad_files
      SET encryption_key_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [newMetadata.encryptionKeyId, fileId]);

    // Mark old key as inactive
    await db.query(`
      UPDATE encryption_keys
      SET is_active = false, rotation_date = NOW()
      WHERE key_id = $1
    `, [oldKeyId]);
  }

  private static async logEncryptionEvent(
    eventType: string,
    userId: string,
    resourceId: string,
    details: any
  ): Promise<void> {
    try {
      const { SecurityEventService } = await import('./SecurityEventService.js');
      await SecurityEventService.logEvent({
        eventType,
        severity: 'low',
        userId,
        resourceType: 'file',
        resourceId,
        details
      });
    } catch (error) {
      console.error('Failed to log encryption event:', error);
    }
  }
}