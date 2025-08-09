import { describe, it, expect, beforeEach } from 'vitest';
import { FileValidationService, FileValidationConfig } from '../FileValidationService.js';

describe('FileValidationService', () => {
  let service: FileValidationService;
  let defaultConfig: FileValidationConfig;

  beforeEach(() => {
    defaultConfig = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['application/dwg', 'application/dxf', 'application/step'],
      allowedExtensions: ['.dwg', '.dxf', '.step', '.stl'],
      enableMalwareScanning: true,
      enableIntegrityCheck: true
    };
    service = new FileValidationService(defaultConfig);
  });

  describe('File Size Validation', () => {
    it('should pass validation for files within size limit', async () => {
      const buffer = Buffer.alloc(1024); // 1KB
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/size.*exceeds/i));
    });

    it('should fail validation for files exceeding size limit', async () => {
      const buffer = Buffer.alloc(20 * 1024 * 1024); // 20MB
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/size.*exceeds/i));
    });

    it('should fail validation for empty files', async () => {
      const buffer = Buffer.alloc(0);
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });
  });

  describe('File Type Validation', () => {
    it('should pass validation for allowed file extensions', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/extension.*not allowed/i));
    });

    it('should fail validation for disallowed file extensions', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test.exe', 'application/octet-stream');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/extension.*not allowed/i));
    });

    it('should add warning for unsupported MIME types', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/unknown');

      expect(result.warnings).toContain(expect.stringMatching(/MIME type.*may not be supported/i));
    });

    it('should accept generic MIME types for CAD files', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/octet-stream');

      expect(result.warnings).not.toContain(expect.stringMatching(/MIME type.*may not be supported/i));
    });
  });

  describe('File Name Validation', () => {
    it('should pass validation for valid file names', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'valid-file_name.dwg', 'application/dwg');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/file name/i));
    });

    it('should fail validation for file names with dangerous characters', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test<script>.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name contains invalid characters');
    });

    it('should fail validation for file names that are too long', async () => {
      const buffer = Buffer.from('test content');
      const longName = 'a'.repeat(250) + '.dwg';
      const result = await service.validateFile(buffer, longName, 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name is too long (maximum 255 characters)');
    });

    it('should fail validation for empty file names', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, '', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name is empty');
    });

    it('should add warning for hidden files', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, '.hidden.dwg', 'application/dwg');

      expect(result.warnings).toContain('File appears to be a hidden or temporary file');
    });
  });

  describe('DWG File Validation', () => {
    it('should pass validation for valid DWG files', async () => {
      const buffer = Buffer.from('AC1024test content'); // Valid DWG header
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/Invalid DWG/i));
    });

    it('should fail validation for invalid DWG files', async () => {
      const buffer = Buffer.from('INVALID_HEADER');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid DWG file format - missing or corrupted header');
    });
  });

  describe('DXF File Validation', () => {
    it('should pass validation for valid DXF files', async () => {
      const dxfContent = `
        0
        SECTION
        2
        HEADER
        0
        ENDSEC
        0
        EOF
      `;
      const buffer = Buffer.from(dxfContent);
      const result = await service.validateFile(buffer, 'test.dxf', 'application/dxf');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/Invalid DXF/i));
    });

    it('should fail validation for invalid DXF files', async () => {
      const buffer = Buffer.from('INVALID DXF CONTENT');
      const result = await service.validateFile(buffer, 'test.dxf', 'application/dxf');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid DXF file format - missing required section markers');
    });
  });

  describe('STEP File Validation', () => {
    it('should pass validation for valid STEP files', async () => {
      const stepContent = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;';
      const buffer = Buffer.from(stepContent);
      const result = await service.validateFile(buffer, 'test.step', 'application/step');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/Invalid STEP/i));
    });

    it('should fail validation for STEP files without proper header', async () => {
      const buffer = Buffer.from('INVALID STEP CONTENT');
      const result = await service.validateFile(buffer, 'test.step', 'application/step');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid STEP file format - missing ISO-10303 header');
    });

    it('should add warning for incomplete STEP files', async () => {
      const stepContent = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;'; // Missing END-ISO-10303
      const buffer = Buffer.from(stepContent);
      const result = await service.validateFile(buffer, 'test.step', 'application/step');

      expect(result.warnings).toContain('STEP file may be incomplete - missing END-ISO-10303 marker');
    });
  });

  describe('STL File Validation', () => {
    it('should pass validation for valid ASCII STL files', async () => {
      const stlContent = `
        solid test
        facet normal 0.0 0.0 1.0
          outer loop
            vertex 0.0 0.0 0.0
            vertex 1.0 0.0 0.0
            vertex 0.0 1.0 0.0
          endloop
        endfacet
        endsolid test
      `;
      const buffer = Buffer.from(stlContent);
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/Invalid.*STL/i));
    });

    it('should fail validation for invalid ASCII STL files', async () => {
      const buffer = Buffer.from('solid test\nINVALID CONTENT\nendsolid test');
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid ASCII STL file format');
    });

    it('should pass validation for valid binary STL files', async () => {
      // Create a minimal valid binary STL
      const header = Buffer.alloc(80); // 80-byte header
      const triangleCount = Buffer.alloc(4);
      triangleCount.writeUInt32LE(1, 0); // 1 triangle
      
      // One triangle (50 bytes: 12 bytes normal + 36 bytes vertices + 2 bytes attribute)
      const triangle = Buffer.alloc(50);
      
      const buffer = Buffer.concat([header, triangleCount, triangle]);
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringMatching(/Invalid.*STL/i));
    });

    it('should fail validation for binary STL files that are too small', async () => {
      const buffer = Buffer.alloc(50); // Too small for binary STL
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid binary STL file - file too small');
    });
  });

  describe('Malware Scanning', () => {
    it('should detect potentially malicious executable headers', async () => {
      const buffer = Buffer.from('MZ\x90\x00'); // PE executable header
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Potentially malicious content detected: MZ');
    });

    it('should detect potentially malicious script content', async () => {
      const buffer = Buffer.from('<script>alert("malicious")</script>');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Potentially malicious content detected: <script');
    });

    it('should add warning for unusually small files', async () => {
      const buffer = Buffer.from('tiny');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.warnings).toContain('File is unusually small for a CAD file');
    });

    it('should skip malware scanning when disabled', async () => {
      const serviceWithoutScanning = new FileValidationService({
        ...defaultConfig,
        enableMalwareScanning: false
      });

      const buffer = Buffer.from('MZ\x90\x00'); // PE executable header
      const result = await serviceWithoutScanning.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.errors).not.toContain(expect.stringMatching(/malicious/i));
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract metadata from DXF files', async () => {
      const dxfContent = `
        0
        SECTION
        2
        HEADER
        9
        $INSUNITS
        70
        4
        0
        ENDSEC
        0
        SECTION
        2
        TABLES
        0
        TABLE
        2
        LAYER
        0
        LAYER
        2
        Layer1
        0
        LAYER
        2
        Layer2
        0
        ENDTAB
        0
        ENDSEC
        0
        EOF
      `;
      const buffer = Buffer.from(dxfContent);
      const result = await service.validateFile(buffer, 'test.dxf', 'application/dxf');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.units).toBe('millimeters');
      expect(result.metadata?.layerCount).toBe(2);
    });

    it('should extract metadata from ASCII STL files', async () => {
      const stlContent = `
        solid test
        facet normal 0.0 0.0 1.0
          outer loop
            vertex 0.0 0.0 0.0
            vertex 1.0 0.0 0.0
            vertex 0.0 1.0 0.0
          endloop
        endfacet
        facet normal 0.0 0.0 1.0
          outer loop
            vertex 0.0 0.0 0.0
            vertex 1.0 0.0 0.0
            vertex 0.0 1.0 0.0
          endloop
        endfacet
        endsolid test
      `;
      const buffer = Buffer.from(stlContent);
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.layerCount).toBe(2); // Triangle count stored in layerCount
    });

    it('should extract metadata from binary STL files', async () => {
      const header = Buffer.alloc(80);
      const triangleCount = Buffer.alloc(4);
      triangleCount.writeUInt32LE(5, 0); // 5 triangles
      
      const triangles = Buffer.alloc(250); // 5 triangles * 50 bytes each
      const buffer = Buffer.concat([header, triangleCount, triangles]);
      
      const result = await service.validateFile(buffer, 'test.stl', 'application/octet-stream');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.layerCount).toBe(5);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when not provided', () => {
      const defaultService = new FileValidationService();
      expect(defaultService).toBeDefined();
    });

    it('should get default configuration from environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        MAX_FILE_SIZE: '52428800', // 50MB
        ENABLE_MALWARE_SCANNING: 'false',
        ENABLE_INTEGRITY_CHECK: 'false'
      };

      const config = FileValidationService.getDefaultConfig();

      expect(config.maxFileSize).toBe(52428800);
      expect(config.enableMalwareScanning).toBe(false);
      expect(config.enableIntegrityCheck).toBe(false);

      process.env = originalEnv;
    });

    it('should use default values when environment variables are not set', () => {
      const originalEnv = process.env;
      process.env = {};

      const config = FileValidationService.getDefaultConfig();

      expect(config.maxFileSize).toBe(104857600); // 100MB default
      expect(config.enableMalwareScanning).toBe(true);
      expect(config.enableIntegrityCheck).toBe(true);

      process.env = originalEnv;
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      // Create a service that will throw an error during validation
      const faultyService = new FileValidationService(defaultConfig);
      
      // Mock a method to throw an error
      const originalValidateFileIntegrity = (faultyService as any).validateFileIntegrity;
      (faultyService as any).validateFileIntegrity = () => {
        throw new Error('Validation error');
      };

      const buffer = Buffer.from('test content');
      const result = await faultyService.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Validation failed: Validation error');

      // Restore original method
      (faultyService as any).validateFileIntegrity = originalValidateFileIntegrity;
    });

    it('should handle metadata extraction errors gracefully', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validateFile(buffer, 'test.unknown', 'application/unknown');

      // Should not fail validation due to metadata extraction errors
      expect(result.isValid).toBe(false); // Will fail due to extension, not metadata
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Entropy Calculation', () => {
    it('should detect low entropy files', async () => {
      // Create a buffer with very low entropy (all zeros)
      const buffer = Buffer.alloc(1000, 0);
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.warnings).toContain('File has low entropy - may be empty or contain repetitive data');
    });

    it('should not warn about normal entropy files', async () => {
      // Create a buffer with normal entropy
      const buffer = Buffer.from('This is a normal file with varied content and different characters!');
      const result = await service.validateFile(buffer, 'test.dwg', 'application/dwg');

      expect(result.warnings).not.toContain(expect.stringMatching(/low entropy/i));
    });
  });
});