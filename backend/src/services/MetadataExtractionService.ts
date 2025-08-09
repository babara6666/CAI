import { CADMetadata, BoundingBox, MaterialProperties } from '../types/index.js';

export interface MetadataExtractionResult {
  success: boolean;
  metadata: CADMetadata;
  warnings: string[];
  errors: string[];
}

export interface MetadataExtractionConfig {
  enableTextExtraction: boolean;
  enableDimensionAnalysis: boolean;
  enableMaterialDetection: boolean;
  maxTextLength: number;
}

export class MetadataExtractionService {
  private config: MetadataExtractionConfig;

  constructor(config?: Partial<MetadataExtractionConfig>) {
    this.config = {
      enableTextExtraction: true,
      enableDimensionAnalysis: true,
      enableMaterialDetection: true,
      maxTextLength: 10000,
      ...config
    };
  }

  /**
   * Extract metadata from CAD file buffer
   */
  async extractMetadata(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<MetadataExtractionResult> {
    const result: MetadataExtractionResult = {
      success: false,
      metadata: {},
      warnings: [],
      errors: []
    };

    try {
      console.log(`Extracting metadata from ${filename} (${mimeType})`);

      // Basic file analysis
      result.metadata = await this.performBasicAnalysis(fileBuffer, filename, mimeType);

      // Format-specific extraction
      if (this.isDWGFile(filename, mimeType)) {
        const dwgMetadata = await this.extractDWGMetadata(fileBuffer);
        result.metadata = { ...result.metadata, ...dwgMetadata };
      } else if (this.isDXFFile(filename, mimeType)) {
        const dxfMetadata = await this.extractDXFMetadata(fileBuffer);
        result.metadata = { ...result.metadata, ...dxfMetadata };
      } else if (this.isSTEPFile(filename, mimeType)) {
        const stepMetadata = await this.extractSTEPMetadata(fileBuffer);
        result.metadata = { ...result.metadata, ...stepMetadata };
      } else if (this.isSTLFile(filename, mimeType)) {
        const stlMetadata = await this.extractSTLMetadata(fileBuffer);
        result.metadata = { ...result.metadata, ...stlMetadata };
      } else {
        result.warnings.push(`Metadata extraction not fully supported for ${mimeType}`);
      }

      // Text extraction if enabled
      if (this.config.enableTextExtraction) {
        try {
          const extractedText = await this.extractText(fileBuffer, filename, mimeType);
          if (extractedText.length > 0) {
            result.metadata.extractedText = extractedText;
          }
        } catch (error) {
          result.warnings.push('Failed to extract text content');
        }
      }

      result.success = true;
      console.log(`Metadata extraction completed for ${filename}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Metadata extraction failed: ${errorMessage}`);
      console.error(`Metadata extraction failed for ${filename}:`, error);
    }

    return result;
  }

  /**
   * Perform basic file analysis
   */
  private async performBasicAnalysis(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<CADMetadata> {
    const metadata: CADMetadata = {};

    // Detect software from file headers or content
    metadata.software = this.detectSoftware(fileBuffer, filename);

    // Extract basic dimensions if possible
    if (this.config.enableDimensionAnalysis) {
      metadata.dimensions = await this.extractBasicDimensions(fileBuffer, mimeType);
    }

    // Detect units
    metadata.units = this.detectUnits(fileBuffer, filename);

    return metadata;
  }

  /**
   * Extract DWG metadata
   */
  private async extractDWGMetadata(fileBuffer: Buffer): Promise<Partial<CADMetadata>> {
    const metadata: Partial<CADMetadata> = {};

    try {
      // DWG files have a specific header structure
      const header = fileBuffer.subarray(0, 128);
      
      // Extract version information
      if (header.length >= 6) {
        const version = header.subarray(0, 6).toString('ascii');
        metadata.software = `AutoCAD (${version})`;
      }

      // Try to extract layer information
      metadata.layerCount = this.extractDWGLayerCount(fileBuffer);

      // Extract drawing scale if present
      metadata.drawingScale = this.extractDWGScale(fileBuffer);

    } catch (error) {
      console.warn('Failed to extract DWG metadata:', error);
    }

    return metadata;
  }

  /**
   * Extract DXF metadata
   */
  private async extractDXFMetadata(fileBuffer: Buffer): Promise<Partial<CADMetadata>> {
    const metadata: Partial<CADMetadata> = {};

    try {
      const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 10000));
      
      // DXF files are text-based, so we can parse them more easily
      metadata.software = this.extractDXFSoftware(content);
      metadata.units = this.extractDXFUnits(content);
      metadata.layerCount = this.extractDXFLayerCount(content);
      metadata.drawingScale = this.extractDXFScale(content);

      // Extract bounding box from entities
      metadata.boundingBox = this.extractDXFBoundingBox(content);

    } catch (error) {
      console.warn('Failed to extract DXF metadata:', error);
    }

    return metadata;
  }

  /**
   * Extract STEP metadata
   */
  private async extractSTEPMetadata(fileBuffer: Buffer): Promise<Partial<CADMetadata>> {
    const metadata: Partial<CADMetadata> = {};

    try {
      const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 5000));
      
      // STEP files have header information
      metadata.software = this.extractSTEPSoftware(content);
      metadata.units = this.extractSTEPUnits(content);

      // Extract material properties if present
      if (this.config.enableMaterialDetection) {
        metadata.materialProperties = this.extractSTEPMaterials(content);
      }

    } catch (error) {
      console.warn('Failed to extract STEP metadata:', error);
    }

    return metadata;
  }

  /**
   * Extract STL metadata
   */
  private async extractSTLMetadata(fileBuffer: Buffer): Promise<Partial<CADMetadata>> {
    const metadata: Partial<CADMetadata> = {};

    try {
      // Check if it's ASCII or binary STL
      const isAscii = this.isAsciiSTL(fileBuffer);
      
      if (isAscii) {
        const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 1000));
        metadata.software = this.extractSTLSoftware(content);
      } else {
        // Binary STL - extract triangle count
        if (fileBuffer.length >= 84) {
          const triangleCount = fileBuffer.readUInt32LE(80);
          metadata.layerCount = triangleCount; // Using layerCount to store triangle count
        }
      }

      // Calculate bounding box for STL
      metadata.boundingBox = await this.calculateSTLBoundingBox(fileBuffer, isAscii);

    } catch (error) {
      console.warn('Failed to extract STL metadata:', error);
    }

    return metadata;
  }

  /**
   * Extract text content from file
   */
  private async extractText(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<string[]> {
    const extractedText: string[] = [];

    try {
      // For text-based formats (DXF, STEP), extract readable text
      if (this.isDXFFile(filename, mimeType) || this.isSTEPFile(filename, mimeType)) {
        const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, this.config.maxTextLength));
        const textMatches = content.match(/[A-Za-z][A-Za-z0-9\s]{2,}/g);
        if (textMatches) {
          extractedText.push(...textMatches.slice(0, 100)); // Limit to 100 text fragments
        }
      }

      // For binary formats, try to extract embedded strings
      else {
        const strings = this.extractStringsFromBinary(fileBuffer);
        extractedText.push(...strings.slice(0, 50)); // Limit to 50 strings
      }

    } catch (error) {
      console.warn('Failed to extract text:', error);
    }

    return extractedText.filter(text => text.length > 2 && text.length < 100);
  }

  /**
   * File type detection methods
   */
  private isDWGFile(filename: string, mimeType: string): boolean {
    return filename.toLowerCase().endsWith('.dwg') || 
           mimeType === 'application/acad' ||
           mimeType === 'image/vnd.dwg';
  }

  private isDXFFile(filename: string, mimeType: string): boolean {
    return filename.toLowerCase().endsWith('.dxf') || 
           mimeType === 'application/dxf' ||
           mimeType === 'image/vnd.dxf';
  }

  private isSTEPFile(filename: string, mimeType: string): boolean {
    return filename.toLowerCase().endsWith('.step') || 
           filename.toLowerCase().endsWith('.stp') ||
           mimeType === 'application/step';
  }

  private isSTLFile(filename: string, mimeType: string): boolean {
    return filename.toLowerCase().endsWith('.stl') || 
           mimeType === 'application/sla' ||
           mimeType === 'model/stl';
  }

  /**
   * Software detection
   */
  private detectSoftware(fileBuffer: Buffer, filename: string): string | undefined {
    try {
      const header = fileBuffer.subarray(0, 200).toString('utf8');
      
      if (header.includes('AutoCAD')) return 'AutoCAD';
      if (header.includes('SolidWorks')) return 'SolidWorks';
      if (header.includes('Inventor')) return 'Autodesk Inventor';
      if (header.includes('CATIA')) return 'CATIA';
      if (header.includes('NX')) return 'Siemens NX';
      if (header.includes('Fusion')) return 'Autodesk Fusion 360';
      if (header.includes('Rhino')) return 'Rhinoceros';
      if (header.includes('SketchUp')) return 'SketchUp';

    } catch (error) {
      // Ignore errors in software detection
    }

    return undefined;
  }

  /**
   * Units detection
   */
  private detectUnits(fileBuffer: Buffer, filename: string): string | undefined {
    try {
      const content = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 2000));
      
      if (content.includes('MILLIMETER') || content.includes('MM')) return 'mm';
      if (content.includes('METER') || content.includes('M')) return 'm';
      if (content.includes('INCH') || content.includes('IN')) return 'in';
      if (content.includes('FOOT') || content.includes('FT')) return 'ft';
      if (content.includes('CENTIMETER') || content.includes('CM')) return 'cm';

    } catch (error) {
      // Ignore errors in units detection
    }

    return undefined;
  }

  /**
   * Extract basic dimensions
   */
  private async extractBasicDimensions(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ width: number; height: number; depth?: number } | undefined> {
    // This is a placeholder - real implementation would require
    // format-specific parsers to extract actual geometry
    return undefined;
  }

  /**
   * DWG-specific extraction methods
   */
  private extractDWGLayerCount(fileBuffer: Buffer): number | undefined {
    // Placeholder - would require DWG format parser
    return undefined;
  }

  private extractDWGScale(fileBuffer: Buffer): string | undefined {
    // Placeholder - would require DWG format parser
    return undefined;
  }

  /**
   * DXF-specific extraction methods
   */
  private extractDXFSoftware(content: string): string | undefined {
    const match = content.match(/\$ACADVER\s*\n\s*1\s*\n\s*([^\n]+)/);
    return match ? `AutoCAD ${match[1]}` : undefined;
  }

  private extractDXFUnits(content: string): string | undefined {
    const match = content.match(/\$INSUNITS\s*\n\s*70\s*\n\s*(\d+)/);
    if (match) {
      const unitCode = parseInt(match[1]);
      const unitMap: Record<number, string> = {
        1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm'
      };
      return unitMap[unitCode];
    }
    return undefined;
  }

  private extractDXFLayerCount(content: string): number | undefined {
    const layers = content.match(/\nLAYER\n/g);
    return layers ? layers.length : undefined;
  }

  private extractDXFScale(content: string): string | undefined {
    const match = content.match(/\$LTSCALE\s*\n\s*40\s*\n\s*([\d.]+)/);
    return match ? match[1] : undefined;
  }

  private extractDXFBoundingBox(content: string): BoundingBox | undefined {
    // Extract EXTMIN and EXTMAX values
    const minMatch = content.match(/\$EXTMIN\s*\n\s*10\s*\n\s*([-\d.]+)\s*\n\s*20\s*\n\s*([-\d.]+)/);
    const maxMatch = content.match(/\$EXTMAX\s*\n\s*10\s*\n\s*([-\d.]+)\s*\n\s*20\s*\n\s*([-\d.]+)/);

    if (minMatch && maxMatch) {
      return {
        minX: parseFloat(minMatch[1]),
        minY: parseFloat(minMatch[2]),
        maxX: parseFloat(maxMatch[1]),
        maxY: parseFloat(maxMatch[2])
      };
    }

    return undefined;
  }

  /**
   * STEP-specific extraction methods
   */
  private extractSTEPSoftware(content: string): string | undefined {
    const match = content.match(/FILE_NAME\s*\([^,]*,\s*'([^']*)',/);
    return match ? match[1] : undefined;
  }

  private extractSTEPUnits(content: string): string | undefined {
    if (content.includes('SI_UNIT(.MILLI.,.METRE.)')) return 'mm';
    if (content.includes('SI_UNIT(.METRE.)')) return 'm';
    if (content.includes('CONVERSION_BASED_UNIT') && content.includes('INCH')) return 'in';
    return undefined;
  }

  private extractSTEPMaterials(content: string): MaterialProperties | undefined {
    // Look for material definitions in STEP file
    const materialMatch = content.match(/MATERIAL_DESIGNATION\s*\(\s*'([^']+)'/);
    if (materialMatch) {
      return {
        material: materialMatch[1]
      };
    }
    return undefined;
  }

  /**
   * STL-specific extraction methods
   */
  private isAsciiSTL(fileBuffer: Buffer): boolean {
    const header = fileBuffer.subarray(0, 80).toString('utf8').toLowerCase();
    return header.startsWith('solid');
  }

  private extractSTLSoftware(content: string): string | undefined {
    const firstLine = content.split('\n')[0];
    if (firstLine.includes('solid')) {
      const parts = firstLine.split(' ');
      if (parts.length > 1) {
        return parts.slice(1).join(' ').trim();
      }
    }
    return undefined;
  }

  private async calculateSTLBoundingBox(fileBuffer: Buffer, isAscii: boolean): Promise<BoundingBox | undefined> {
    // This would require parsing the STL geometry
    // Placeholder implementation
    return undefined;
  }

  /**
   * Extract strings from binary files
   */
  private extractStringsFromBinary(fileBuffer: Buffer): string[] {
    const strings: string[] = [];
    const minLength = 4;
    let currentString = '';

    for (let i = 0; i < fileBuffer.length; i++) {
      const byte = fileBuffer[i];
      
      // Check if byte is printable ASCII
      if (byte >= 32 && byte <= 126) {
        currentString += String.fromCharCode(byte);
      } else {
        if (currentString.length >= minLength) {
          strings.push(currentString);
        }
        currentString = '';
      }

      // Limit number of strings to prevent memory issues
      if (strings.length >= 100) break;
    }

    // Add final string if it meets criteria
    if (currentString.length >= minLength) {
      strings.push(currentString);
    }

    return strings;
  }

  /**
   * Get default configuration
   */
  static getDefaultConfig(): MetadataExtractionConfig {
    return {
      enableTextExtraction: true,
      enableDimensionAnalysis: true,
      enableMaterialDetection: true,
      maxTextLength: 10000
    };
  }

  /**
   * Validate extraction configuration
   */
  static validateConfig(config: Partial<MetadataExtractionConfig>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.maxTextLength !== undefined) {
      if (typeof config.maxTextLength !== 'number' || config.maxTextLength < 100 || config.maxTextLength > 100000) {
        errors.push('maxTextLength must be a number between 100 and 100000');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}