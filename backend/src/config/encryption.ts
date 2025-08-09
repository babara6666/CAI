import crypto from 'crypto';
import { promisify } from 'util';

/**
 * Encryption configuration and utilities for data at rest
 */
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly TAG_LENGTH = 16; // 128 bits

  private static encryptionKey: Buffer;

  /**
   * Initialize encryption service with master key
   */
  static initialize(): void {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    // Derive encryption key from master key using PBKDF2
    const salt = Buffer.from(process.env.ENCRYPTION_SALT || 'cad-ai-platform-salt', 'utf8');
    this.encryptionKey = crypto.pbkdf2Sync(masterKey, salt, 100000, this.KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt sensitive data
   */
  static encrypt(plaintext: string): string {
    if (!this.encryptionKey) {
      this.initialize();
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipherGCM(this.ALGORITHM, this.encryptionKey, iv);
    cipher.setAAD(Buffer.from('cad-ai-platform', 'utf8'));

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Combine IV, tag, and encrypted data
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData: string): string {
    if (!this.encryptionKey) {
      this.initialize();
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipherGCM(this.ALGORITHM, this.encryptionKey, iv);
    decipher.setAAD(Buffer.from('cad-ai-platform', 'utf8'));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash sensitive data (one-way)
   */
  static hash(data: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256');
    return salt.toString('hex') + ':' + hash.toString('hex');
  }

  /**
   * Verify hashed data
   */
  static verifyHash(data: string, hashedData: string): boolean {
    const parts = hashedData.split(':');
    if (parts.length !== 2) {
      return false;
    }

    const salt = Buffer.from(parts[0], 'hex');
    const hash = Buffer.from(parts[1], 'hex');
    const computedHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256');

    return crypto.timingSafeEqual(hash, computedHash);
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt file content
   */
  static encryptFile(fileBuffer: Buffer): { encryptedData: Buffer; key: string; iv: string } {
    const key = crypto.randomBytes(this.KEY_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipherGCM(this.ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      encryptedData: Buffer.concat([iv, tag, encrypted]),
      key: key.toString('hex'),
      iv: iv.toString('hex')
    };
  }

  /**
   * Decrypt file content
   */
  static decryptFile(encryptedBuffer: Buffer, keyHex: string): Buffer {
    const key = Buffer.from(keyHex, 'hex');
    const iv = encryptedBuffer.subarray(0, this.IV_LENGTH);
    const tag = encryptedBuffer.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(this.IV_LENGTH + this.TAG_LENGTH);

    const decipher = crypto.createDecipherGCM(this.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * Database field encryption decorator
 */
export function Encrypted(target: any, propertyKey: string) {
  const privateKey = `_${propertyKey}`;
  
  Object.defineProperty(target, propertyKey, {
    get() {
      const encryptedValue = this[privateKey];
      return encryptedValue ? EncryptionService.decrypt(encryptedValue) : undefined;
    },
    set(value: string) {
      this[privateKey] = value ? EncryptionService.encrypt(value) : undefined;
    },
    enumerable: true,
    configurable: true
  });
}