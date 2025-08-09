import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataExtractionService, MetadataExtractionConfig } from '../MetadataExtractionService.js';

describe('MetadataExtractionService', () => {
  let service: MetadataExtractionService;
  let config: MetadataExtractionConfig;

  beforeEach(() => {
    config = {
      enableTextExtraction: true,
      enableDimensionAnalysis: true,
      enableMaterialDetection: true,
      maxTextLength: 10000
    };
    service = new MetadataExtractionService(config);
  });

  describe('extractMetadata', () => {
    it('should extract basic metadata from DWG file', async () => {
      // Mock DWG file header
      const dwgHeader = Buffer.from('AC1021DWG file header data');
      const dwgBuffer = Buffer.concat([dwgHeader, Buffer.alloc(1000)]);

      const result = await service.extractMetadata(
        dwgBuffer,
        'test-file.dwg',
        'application/acad'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.software).toContain('AutoCAD');
      expect(result.errors).toHaveLength(0);
    });

    it('should extract metadata from DXF file', async () => {
      const dxfContent = `
        0
        SECTION
        2
        HEADER
        9
        $ACADVER
        1
        AC1021
        9
        $INSUNITS
        70
        4
        0
        ENDSEC
      `;
      const dxfBuffer = Buffer.from(dxfContent);

      const result = await service.extractMetadata(
        dxfBuffer,
        'test-file.dxf',
        'application/dxf'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.software).toContain('AutoCAD');
      expect(result.metadata.units).toBe('mm');
    });

    it('should extract metadata from STEP file', async () => {
      const stepContent = `
        ISO-10303-21;
        HEADER;
        FILE_DESCRIPTION(('STEP AP214'),'2;1');
        FILE_NAME('test.step','2023-01-01T00:00:00',('Author'),('Organization'),'SolidWorks','SolidWorks','');
        FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
        ENDSEC;
        DATA;
        #1 = SI_UNIT(.MILLI.,.METRE.);
        ENDSEC;
        END-ISO-10303-21;
      `;
      const stepBuffer = Buffer.from(stepContent);

      const result = await service.extractMetadata(
        stepBuffer,
        'test-file.step',
        'application/step'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.software).toContain('SolidWorks');
      expect(result.metadata.units).toBe('mm');
    });

    it('should extract metadata from ASCII STL file', async () => {
      const stlContent = `
        solid SolidWorks_Part
        facet normal 0.0 0.0 1.0
          outer loop
            vertex 0.0 0.0 0.0
            vertex 1.0 0.0 0.0
            vertex 0.0 1.0 0.0
          endloop
        endfacet
        endsolid SolidWorks_Part
      `;
      const stlBuffer = Buffer.from(stlContent);

      const result = await service.extractMetadata(
        stlBuffer,
        'test-file.stl',
        'model/stl'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.software).toBe('SolidWorks_Part');
    });

    it('should extract metadata from binary STL file', async () => {
      // Create a mock binary STL file
      const header = Buffer.alloc(80);
      header.write('Binary STL created by SolidWorks');
      const triangleCount = Buffer.alloc(4);
      triangleCount.writeUInt32LE(100, 0); // 100 triangles
      const triangleData = Buffer.alloc(50 * 100); // 50 bytes per triangle * 100 triangles
      
      const stlBuffer = Buffer.concat([header, triangleCount, triangleData]);

      const result = await service.extractMetadata(
        stlBuffer,
        'test-file.stl',
        'model/stl'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.layerCount).toBe(100); // Triangle count stored as layer count
    });

    it('should extract text content when enabled', async () => {
      const dxfContent = `
        0
        SECTION
        2
        ENTITIES
        0
        TEXT
        8
        LAYER1
        1
        Sample Text Content
        10
        0.0
        20
        0.0
        0
        ENDSEC
      `;
      const dxfBuffer = Buffer.from(dxfContent);

      const result = await service.extractMetadata(
        dxfBuffer,
        'test-file.dxf',
        'application/dxf'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.extractedText).toBeDefined();
      expect(result.metadata.extractedText?.length).toBeGreaterThan(0);
    });

    it('should handle unsupported file formats gracefully', async () => {
      const unknownBuffer = Buffer.from('Unknown file format content');

      const result = await service.extractMetadata(
        unknownBuffer,
        'test-file.unknown',
        'application/unknown'
      );

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Metadata extraction not fully supported for application/unknown');
    });

    it('should handle extraction errors gracefully', async () => {
      // Create a service that will throw an error
      const errorService = new MetadataExtractionService(config);
      
      // Mock a method to throw an error
      vi.spyOn(errorService as any, 'performBasicAnalysis').mockRejectedValue(new Error('Extraction failed'));

      const result = await errorService.extractMetadata(
        Buffer.from('test'),
        'test.dwg',
        'application/acad'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Metadata extraction failed: Extraction failed');
    });

    it('should respect text extraction configuration', async () => {
      const configWithoutText = {
        ...config,
        enableTextExtraction: false
      };
      const serviceWithoutText = new MetadataExtractionService(configWithoutText);

      const dxfContent = 'Sample DXF content with text';
      const dxfBuffer = Buffer.from(dxfContent);

      const result = await serviceWithoutText.extractMetadata(
        dxfBuffer,
        'test-file.dxf',
        'application/dxf'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.extractedText).toBeUndefined();
    });
  });

  describe('Software Detection', () => {
    it('should detect AutoCAD from file header', async () => {
      const buffer = Buffer.from('AutoCAD Drawing File Header');
      
      const result = await service.extractMetadata(
        buffer,
        'test.dwg',
        'application/acad'
      );

      expect(result.metadata.software).toBe('AutoCAD');
    });

    it('should detect SolidWorks from file header', async () => {
      const buffer = Buffer.from('SolidWorks CAD File');
      
      const result = await service.extractMetadata(
        buffer,
        'test.sldprt',
        'application/octet-stream'
      );

      expect(result.metadata.software).toBe('SolidWorks');
    });

    it('should detect multiple software signatures', async () => {
      const testCases = [
        { content: 'Inventor Part File', expected: 'Autodesk Inventor' },
        { content: 'CATIA V5 Model', expected: 'CATIA' },
        { content: 'NX Unigraphics', expected: 'Siemens NX' },
        { content: 'Fusion 360 Design', expected: 'Autodesk Fusion 360' },
        { content: 'Rhino 3D Model', expected: 'Rhinoceros' },
        { content: 'SketchUp Model', expected: 'SketchUp' }
      ];

      for (const testCase of testCases) {
        const buffer = Buffer.from(testCase.content);
        const result = await service.extractMetadata(
          buffer,
          'test.file',
          'application/octet-stream'
        );

        expect(result.metadata.software).toBe(testCase.expected);
      }
    });
  });

  describe('Units Detection', () => {
    it('should detect various unit types', async () => {
      const testCases = [
        { content: 'MILLIMETER units', expected: 'mm' },
        { content: 'METER scale', expected: 'm' },
        { content: 'INCH measurement', expected: 'in' },
        { content: 'FOOT dimensions', expected: 'ft' },
        { content: 'CENTIMETER size', expected: 'cm' }
      ];

      for (const testCase of testCases) {
        const buffer = Buffer.from(testCase.content);
        const result = await service.extractMetadata(
          buffer,
          'test.file',
          'application/octet-stream'
        );

        expect(result.metadata.units).toBe(testCase.expected);
      }
    });
  });

  describe('DXF Specific Extraction', () => {
    it('should extract DXF bounding box', async () => {
      const dxfContent = `
        9
        $EXTMIN
        10
        -10.5
        20
        -5.2
        9
        $EXTMAX
        10
        15.7
        20
        8.3
      `;
      const buffer = Buffer.from(dxfContent);

      const result = await service.extractMetadata(
        buffer,
        'test.dxf',
        'application/dxf'
      );

      expect(result.metadata.boundingBox).toBeDefined();
      expect(result.metadata.boundingBox?.minX).toBe(-10.5);
      expect(result.metadata.boundingBox?.minY).toBe(-5.2);
      expect(result.metadata.boundingBox?.maxX).toBe(15.7);
      expect(result.metadata.boundingBox?.maxY).toBe(8.3);
    });

    it('should extract DXF layer count', async () => {
      const dxfContent = `
        0
        LAYER
        2
        Layer1
        0
        LAYER
        2
        Layer2
        0
        LAYER
        2
        Layer3
      `;
      const buffer = Buffer.from(dxfContent);

      const result = await service.extractMetadata(
        buffer,
        'test.dxf',
        'application/dxf'
      );

      expect(result.metadata.layerCount).toBe(3);
    });

    it('should extract DXF scale', async () => {
      const dxfContent = `
        9
        $LTSCALE
        40
        2.5
      `;
      const buffer = Buffer.from(dxfContent);

      const result = await service.extractMetadata(
        buffer,
        'test.dxf',
        'application/dxf'
      );

      expect(result.metadata.drawingScale).toBe('2.5');
    });
  });

  describe('STEP Specific Extraction', () => {
    it('should extract STEP material properties', async () => {
      const stepContent = `
        #100 = MATERIAL_DESIGNATION('Steel_AISI_1020');
        #101 = MATERIAL_DESIGNATION('Aluminum_6061');
      `;
      const buffer = Buffer.from(stepContent);

      const result = await service.extractMetadata(
        buffer,
        'test.step',
        'application/step'
      );

      expect(result.metadata.materialProperties).toBeDefined();
      expect(result.metadata.materialProperties?.material).toBe('Steel_AISI_1020');
    });
  });

  describe('Binary String Extraction', () => {
    it('should extract readable strings from binary files', async () => {
      // Create a buffer with embedded strings
      const binaryData = Buffer.concat([
        Buffer.from([0x00, 0x01, 0x02]), // Non-printable bytes
        Buffer.from('Readable String 1'),
        Buffer.from([0xFF, 0xFE]), // Non-printable bytes
        Buffer.from('Another String'),
        Buffer.from([0x00, 0x00, 0x00])
      ]);

      const result = await service.extractMetadata(
        binaryData,
        'test.bin',
        'application/octet-stream'
      );

      expect(result.metadata.extractedText).toBeDefined();
      expect(result.metadata.extractedText).toContain('Readable String 1');
      expect(result.metadata.extractedText).toContain('Another String');
    });

    it('should limit extracted strings to prevent memory issues', async () => {
      // Create a large buffer with many strings
      const strings = Array.from({ length: 200 }, (_, i) => `String${i}`);
      const binaryData = Buffer.concat(
        strings.map(str => Buffer.concat([Buffer.from(str), Buffer.from([0x00])]))
      );

      const result = await service.extractMetadata(
        binaryData,
        'test.bin',
        'application/octet-stream'
      );

      expect(result.metadata.extractedText).toBeDefined();
      expect(result.metadata.extractedText!.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration correctly', () => {
      const validConfig = {
        enableTextExtraction: true,
        maxTextLength: 5000
      };

      const result = MetadataExtractionService.validateConfig(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid maxTextLength', () => {
      const invalidConfig = {
        maxTextLength: 50 // Too small
      };

      const result = MetadataExtractionService.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxTextLength must be a number between 100 and 100000');
    });

    it('should reject maxTextLength that is too large', () => {
      const invalidConfig = {
        maxTextLength: 200000 // Too large
      };

      const result = MetadataExtractionService.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxTextLength must be a number between 100 and 100000');
    });
  });

  describe('Default Configuration', () => {
    it('should provide sensible defaults', () => {
      const defaultConfig = MetadataExtractionService.getDefaultConfig();

      expect(defaultConfig.enableTextExtraction).toBe(true);
      expect(defaultConfig.enableDimensionAnalysis).toBe(true);
      expect(defaultConfig.enableMaterialDetection).toBe(true);
      expect(defaultConfig.maxTextLength).toBe(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted file data gracefully', async () => {
      const corruptedBuffer = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

      const result = await service.extractMetadata(
        corruptedBuffer,
        'corrupted.dwg',
        'application/acad'
      );

      expect(result.success).toBe(true); // Should not fail completely
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty files', async () => {
      const emptyBuffer = Buffer.alloc(0);

      const result = await service.extractMetadata(
        emptyBuffer,
        'empty.dwg',
        'application/acad'
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    it('should handle very large files within limits', async () => {
      const largeBuffer = Buffer.alloc(50000, 'A'); // 50KB of 'A' characters

      const result = await service.extractMetadata(
        largeBuffer,
        'large.dxf',
        'application/dxf'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.extractedText).toBeDefined();
      // Should be limited by maxTextLength
      expect(result.metadata.extractedText!.join('').length).toBeLessThanOrEqual(config.maxTextLength);
    });
  });
});