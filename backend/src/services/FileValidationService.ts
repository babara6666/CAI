import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    dimensions?: { width: number; height: number; depth?: number };
    units?: string;
    software?: string;
    layerCount?: number;
  };
}

export interface FileValidationConfig {
  maxFileSize: number; // in bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  enableMalwareScanning: boolean;
  enableIntegrityCheck: boolean;
}

export class FileValidationService {
  private config: FileValidationConfig;

  constructor(config?: Partial<FileValidationConfig>) {
    this.config = {
      maxFileSize: config?.maxFileSize || 100 * 1024 * 1024, // 100MB default
      allowedMimeTypes: config?.allowedMimeTypes || [
        'application/dwg',
        'application/dxf',
        'application/step',
        'application/stp',
        'application/iges',
        'application/igs',
        'application/x-step',
        'application/x-iges',
        'model/step',
        'model/iges',
        'application/octet-stream', // Generic binary for CAD files
        'text/plain' // For some CAD text formats
      ],
      allowedExtensions: config?.allowedExtensions || [
        '.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', 
        '.stl', '.obj', '.3ds', '.fbx', '.dae', '.x3d',
        '.ply', '.off', '.wrl', '.3mf'
      ],
      enableMalwareScanning: config?.enableMalwareScanning ?? true,
      enableIntegrityCheck: config?.enableIntegrityCheck ?? true
    };
  }

  /**
   * Validate uploaded file
   */
  async validateFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Basic validations
      await this.validateFileSize(fileBuffer, result);
      await this.validateFileType(originalName, mimeType, result);
      await this.validateFileName(originalName, result);

      // Advanced validations
      if (this.config.enableIntegrityCheck) {
        await this.validateFileIntegrity(fileBuffer, originalName, result);
      }

      if (this.config.enableMalwareScanning) {
        await this.scanForMalware(fileBuffer, result);
      }

      // Extract metadata if possible
      result.metadata = await this.extractMetadata(fileBuffer, originalName);

      // Set overall validity
      result.isValid = result.errors.length === 0;

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate file size
   */
  private async validateFileSize(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    if (fileBuffer.length > this.config.maxFileSize) {
      result.errors.push(
        `File size ${this.formatFileSize(fileBuffer.length)} exceeds maximum allowed size of ${this.formatFileSize(this.config.maxFileSize)}`
      );
    }

    if (fileBuffer.length === 0) {
      result.errors.push('File is empty');
    }
  }

  /**
   * Validate file type and extension
   */
  private async validateFileType(
    originalName: string,
    mimeType: string,
    result: ValidationResult
  ): Promise<void> {
    const extension = this.getFileExtension(originalName).toLowerCase();

    // Check extension
    if (!this.config.allowedExtensions.includes(extension)) {
      result.errors.push(
        `File extension '${extension}' is not allowed. Allowed extensions: ${this.config.allowedExtensions.join(', ')}`
      );
    }

    // Check MIME type (more lenient for CAD files as they often have generic MIME types)
    const isAllowedMimeType = this.config.allowedMimeTypes.some(allowed => 
      mimeType.toLowerCase().includes(allowed.toLowerCase()) || 
      allowed === 'application/octet-stream'
    );

    if (!isAllowedMimeType) {
      result.warnings.push(
        `MIME type '${mimeType}' may not be supported. Expected CAD file types.`
      );
    }
  }

  /**
   * Validate file name
   */
  private async validateFileName(originalName: string, result: ValidationResult): Promise<void> {
    // Check for dangerous characters
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(originalName)) {
      result.errors.push('File name contains invalid characters');
    }

    // Check length
    if (originalName.length > 255) {
      result.errors.push('File name is too long (maximum 255 characters)');
    }

    if (originalName.length === 0) {
      result.errors.push('File name is empty');
    }

    // Check for hidden files or system files
    if (originalName.startsWith('.') || originalName.startsWith('~')) {
      result.warnings.push('File appears to be a hidden or temporary file');
    }
  }

  /**
   * Validate file integrity
   */
  private async validateFileIntegrity(
    fileBuffer: Buffer,
    originalName: string,
    result: ValidationResult
  ): Promise<void> {
    const extension = this.getFileExtension(originalName).toLowerCase();

    try {
      switch (extension) {
        case '.dwg':
          await this.validateDWGFile(fileBuffer, result);
          break;
        case '.dxf':
          await this.validateDXFFile(fileBuffer, result);
          break;
        case '.step':
        case '.stp':
          await this.validateSTEPFile(fileBuffer, result);
          break;
        case '.stl':
          await this.validateSTLFile(fileBuffer, result);
          break;
        default:
          // Generic binary file validation
          await this.validateGenericFile(fileBuffer, result);
      }
    } catch (error) {
      result.warnings.push(`Could not validate file integrity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate DWG file format
   */
  private async validateDWGFile(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    // DWG files start with specific magic bytes
    const dwgSignatures = [
      'AC1006', 'AC1009', 'AC1012', 'AC1014', 'AC1015', 'AC1018', 
      'AC1021', 'AC1024', 'AC1027', 'AC1032'
    ];

    const header = fileBuffer.slice(0, 6).toString('ascii');
    const isValidDWG = dwgSignatures.some(sig => header.startsWith(sig));

    if (!isValidDWG) {
      result.errors.push('Invalid DWG file format - missing or corrupted header');
    }
  }

  /**
   * Validate DXF file format
   */
  private async validateDXFFile(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    const content = fileBuffer.slice(0, 1000).toString('ascii');
    
    // DXF files should contain specific section markers
    const requiredMarkers = ['SECTION', 'HEADER', 'ENDSEC'];
    const hasRequiredMarkers = requiredMarkers.every(marker => content.includes(marker));

    if (!hasRequiredMarkers) {
      result.errors.push('Invalid DXF file format - missing required section markers');
    }
  }

  /**
   * Validate STEP file format
   */
  private async validateSTEPFile(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    const content = fileBuffer.slice(0, 1000).toString('ascii');
    
    // STEP files should start with ISO-10303 identifier
    if (!content.startsWith('ISO-10303')) {
      result.errors.push('Invalid STEP file format - missing ISO-10303 header');
    }

    // Should contain END-ISO-10303 at the end (check last 1000 bytes)
    const endContent = fileBuffer.slice(-1000).toString('ascii');
    if (!endContent.includes('END-ISO-10303')) {
      result.warnings.push('STEP file may be incomplete - missing END-ISO-10303 marker');
    }
  }

  /**
   * Validate STL file format
   */
  private async validateSTLFile(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    // Check if it's ASCII STL
    const header = fileBuffer.slice(0, 5).toString('ascii').toLowerCase();
    
    if (header === 'solid') {
      // ASCII STL
      const content = fileBuffer.toString('ascii');
      if (!content.includes('facet normal') || !content.includes('endsolid')) {
        result.errors.push('Invalid ASCII STL file format');
      }
    } else {
      // Binary STL - check minimum size (80 byte header + 4 byte triangle count)
      if (fileBuffer.length < 84) {
        result.errors.push('Invalid binary STL file - file too small');
      } else {
        // Validate triangle count
        const triangleCount = fileBuffer.readUInt32LE(80);
        const expectedSize = 84 + (triangleCount * 50); // 50 bytes per triangle
        
        if (fileBuffer.length !== expectedSize) {
          result.warnings.push('Binary STL file size does not match triangle count');
        }
      }
    }
  }

  /**
   * Generic file validation
   */
  private async validateGenericFile(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    // Check for null bytes (potential corruption)
    const nullByteCount = fileBuffer.filter(byte => byte === 0).length;
    const nullByteRatio = nullByteCount / fileBuffer.length;

    if (nullByteRatio > 0.9) {
      result.warnings.push('File contains high percentage of null bytes - may be corrupted');
    }

    // Check for minimum entropy (detect empty or repetitive files)
    const entropy = this.calculateEntropy(fileBuffer);
    if (entropy < 1.0) {
      result.warnings.push('File has low entropy - may be empty or contain repetitive data');
    }
  }

  /**
   * Scan for malware (basic implementation)
   */
  private async scanForMalware(fileBuffer: Buffer, result: ValidationResult): Promise<void> {
    try {
      // Check for common malware signatures
      const malwareSignatures = [
        'MZ', // PE executable header
        '\x7fELF', // ELF executable header
        '#!/bin/sh', // Shell script
        '#!/bin/bash', // Bash script
        '<script', // JavaScript
        'eval(', // Potentially malicious eval
        'exec(', // Potentially malicious exec
      ];

      const fileContent = fileBuffer.toString('ascii', 0, Math.min(1000, fileBuffer.length));
      
      for (const signature of malwareSignatures) {
        if (fileContent.includes(signature)) {
          result.errors.push(`Potentially malicious content detected: ${signature}`);
        }
      }

      // Check file size patterns that might indicate malware
      if (fileBuffer.length < 100 && fileBuffer.length > 0) {
        result.warnings.push('File is unusually small for a CAD file');
      }

    } catch (error) {
      result.warnings.push('Could not complete malware scan');
    }
  }

  /**
   * Extract metadata from CAD files
   */
  private async extractMetadata(
    fileBuffer: Buffer,
    originalName: string
  ): Promise<ValidationResult['metadata']> {
    const extension = this.getFileExtension(originalName).toLowerCase();
    const metadata: ValidationResult['metadata'] = {};

    try {
      switch (extension) {
        case '.dxf':
          return await this.extractDXFMetadata(fileBuffer);
        case '.stl':
          return await this.extractSTLMetadata(fileBuffer);
        default:
          return metadata;
      }
    } catch (error) {
      // Metadata extraction is optional, don't fail validation
      return metadata;
    }
  }

  /**
   * Extract DXF metadata
   */
  private async extractDXFMetadata(fileBuffer: Buffer): Promise<ValidationResult['metadata']> {
    const content = fileBuffer.toString('ascii');
    const metadata: ValidationResult['metadata'] = {};

    // Extract units
    const unitsMatch = content.match(/\$INSUNITS\s*\n\s*70\s*\n\s*(\d+)/);
    if (unitsMatch) {
      const unitsCode = parseInt(unitsMatch[1]);
      const unitsMap: Record<number, string> = {
        1: 'inches',
        2: 'feet',
        4: 'millimeters',
        5: 'centimeters',
        6: 'meters'
      };
      metadata.units = unitsMap[unitsCode] || 'unknown';
    }

    // Count layers
    const layerMatches = content.match(/\nLAYER\n/g);
    if (layerMatches) {
      metadata.layerCount = layerMatches.length;
    }

    return metadata;
  }

  /**
   * Extract STL metadata
   */
  private async extractSTLMetadata(fileBuffer: Buffer): Promise<ValidationResult['metadata']> {
    const metadata: ValidationResult['metadata'] = {};

    const header = fileBuffer.slice(0, 5).toString('ascii').toLowerCase();
    
    if (header === 'solid') {
      // ASCII STL - count triangles
      const content = fileBuffer.toString('ascii');
      const triangleMatches = content.match(/facet normal/g);
      if (triangleMatches) {
        metadata.layerCount = triangleMatches.length; // Using layerCount to store triangle count
      }
    } else {
      // Binary STL
      if (fileBuffer.length >= 84) {
        const triangleCount = fileBuffer.readUInt32LE(80);
        metadata.layerCount = triangleCount;
      }
    }

    return metadata;
  }

  /**
   * Calculate file entropy
   */
  private calculateEntropy(buffer: Buffer): number {
    const frequencies = new Array(256).fill(0);
    
    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++;
    }

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const probability = frequencies[i] / buffer.length;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
  }

  /**
   * Format file size for human reading
   */
  private formatFileSize(bytes: number): string {
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
   * Get default validation configuration
   */
  static getDefaultConfig(): FileValidationConfig {
    return {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
      allowedMimeTypes: [
        'application/dwg',
        'application/dxf',
        'application/step',
        'application/stp',
        'application/iges',
        'application/igs',
        'application/x-step',
        'application/x-iges',
        'model/step',
        'model/iges',
        'application/octet-stream',
        'text/plain'
      ],
      allowedExtensions: [
        '.dwg', '.dxf', '.step', '.stp', '.iges', '.igs',
        '.stl', '.obj', '.3ds', '.fbx', '.dae', '.x3d',
        '.ply', '.off', '.wrl', '.3mf'
      ],
      enableMalwareScanning: process.env.ENABLE_MALWARE_SCANNING !== 'false',
      enableIntegrityCheck: process.env.ENABLE_INTEGRITY_CHECK !== 'false'
    };
  }
}