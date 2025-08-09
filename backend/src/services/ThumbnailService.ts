import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface ThumbnailOptions {
  width: number;
  height: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
}

export interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

export class ThumbnailService {
  private defaultOptions: ThumbnailOptions = {
    width: 300,
    height: 300,
    quality: 80,
    format: 'jpeg'
  };

  /**
   * Generate thumbnail from CAD file
   */
  async generateThumbnail(
    fileBuffer: Buffer,
    originalName: string,
    options?: Partial<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    const opts = { ...this.defaultOptions, ...options };
    const extension = this.getFileExtension(originalName).toLowerCase();

    try {
      switch (extension) {
        case '.stl':
          return await this.generateSTLThumbnail(fileBuffer, opts);
        case '.obj':
          return await this.generateOBJThumbnail(fileBuffer, opts);
        case '.dxf':
          return await this.generateDXFThumbnail(fileBuffer, opts);
        case '.dwg':
          return await this.generateDWGThumbnail(fileBuffer, opts);
        case '.step':
        case '.stp':
          return await this.generateSTEPThumbnail(fileBuffer, opts);
        default:
          return await this.generateGenericThumbnail(originalName, opts);
      }
    } catch (error) {
      console.warn(`Failed to generate thumbnail for ${originalName}:`, error);
      // Fallback to generic thumbnail
      return await this.generateGenericThumbnail(originalName, opts);
    }
  }

  /**
   * Generate thumbnail for STL files
   */
  private async generateSTLThumbnail(
    fileBuffer: Buffer,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    // For STL files, we'll create a simple wireframe representation
    // This is a simplified implementation - in production, you might use
    // a 3D rendering library like Three.js headless or Blender
    
    const canvas = await this.createCanvas(options.width, options.height);
    const ctx = canvas.getContext('2d');
    
    // Parse STL and extract basic geometry info
    const geometry = this.parseSTLGeometry(fileBuffer);
    
    // Draw simple wireframe representation
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, options.width, options.height);
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Draw bounding box representation
    if (geometry.boundingBox) {
      const { min, max } = geometry.boundingBox;
      const centerX = options.width / 2;
      const centerY = options.height / 2;
      const scale = Math.min(options.width, options.height) * 0.6;
      
      // Simple isometric projection
      const points = [
        [min.x, min.y, min.z],
        [max.x, min.y, min.z],
        [max.x, max.y, min.z],
        [min.x, max.y, min.z],
        [min.x, min.y, max.z],
        [max.x, min.y, max.z],
        [max.x, max.y, max.z],
        [min.x, max.y, max.z]
      ];
      
      const projectedPoints = points.map(([x, y, z]) => [
        centerX + (x - y) * Math.cos(Math.PI / 6) * scale,
        centerY + (x + y) * Math.sin(Math.PI / 6) * scale - z * scale
      ]);
      
      // Draw wireframe cube
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
        [4, 5], [5, 6], [6, 7], [7, 4], // top face
        [0, 4], [1, 5], [2, 6], [3, 7]  // vertical edges
      ];
      
      ctx.beginPath();
      edges.forEach(([start, end]) => {
        const [x1, y1] = projectedPoints[start];
        const [x2, y2] = projectedPoints[end];
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      });
      ctx.stroke();
    }
    
    // Add file type label
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.fillText('STL', 10, options.height - 10);
    
    return await this.canvasToBuffer(canvas, options);
  }

  /**
   * Generate thumbnail for OBJ files
   */
  private async generateOBJThumbnail(
    fileBuffer: Buffer,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    // Similar to STL but parse OBJ format
    const canvas = await this.createCanvas(options.width, options.height);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, options.width, options.height);
    
    // Parse OBJ vertices
    const content = fileBuffer.toString('ascii');
    const vertices = this.parseOBJVertices(content);
    
    if (vertices.length > 0) {
      // Find bounding box
      const bounds = this.calculateBoundingBox(vertices);
      
      // Draw points or simple mesh representation
      ctx.fillStyle = '#333';
      const centerX = options.width / 2;
      const centerY = options.height / 2;
      const scale = Math.min(options.width, options.height) * 0.4;
      
      vertices.slice(0, 100).forEach(([x, y, z]) => { // Limit to first 100 vertices
        const screenX = centerX + (x - bounds.centerX) * scale;
        const screenY = centerY + (y - bounds.centerY) * scale;
        ctx.fillRect(screenX - 1, screenY - 1, 2, 2);
      });
    }
    
    // Add file type label
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.fillText('OBJ', 10, options.height - 10);
    
    return await this.canvasToBuffer(canvas, options);
  }

  /**
   * Generate thumbnail for DXF files
   */
  private async generateDXFThumbnail(
    fileBuffer: Buffer,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    const canvas = await this.createCanvas(options.width, options.height);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, options.width, options.height);
    
    // Parse DXF entities (simplified)
    const content = fileBuffer.toString('ascii');
    const entities = this.parseDXFEntities(content);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    
    // Draw entities
    entities.forEach(entity => {
      if (entity.type === 'LINE' && entity.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(entity.points[0].x, entity.points[0].y);
        ctx.lineTo(entity.points[1].x, entity.points[1].y);
        ctx.stroke();
      } else if (entity.type === 'CIRCLE') {
        ctx.beginPath();
        ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
    
    // Add file type label
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.fillText('DXF', 10, options.height - 10);
    
    return await this.canvasToBuffer(canvas, options);
  }

  /**
   * Generate thumbnail for DWG files
   */
  private async generateDWGThumbnail(
    fileBuffer: Buffer,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    // DWG files are binary and complex to parse
    // For now, generate a generic CAD file thumbnail
    return await this.generateGenericCADThumbnail('DWG', options);
  }

  /**
   * Generate thumbnail for STEP files
   */
  private async generateSTEPThumbnail(
    fileBuffer: Buffer,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    // STEP files are also complex to parse
    // For now, generate a generic CAD file thumbnail
    return await this.generateGenericCADThumbnail('STEP', options);
  }

  /**
   * Generate generic thumbnail
   */
  private async generateGenericThumbnail(
    originalName: string,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    const extension = this.getFileExtension(originalName).toUpperCase().substring(1);
    return await this.generateGenericCADThumbnail(extension || 'CAD', options);
  }

  /**
   * Generate generic CAD file thumbnail
   */
  private async generateGenericCADThumbnail(
    fileType: string,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    const canvas = await this.createCanvas(options.width, options.height);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, options.width, options.height);
    
    // Border
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, options.width - 2, options.height - 2);
    
    // CAD icon representation
    const centerX = options.width / 2;
    const centerY = options.height / 2;
    
    // Draw simple geometric shapes to represent CAD
    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = 2;
    
    // Rectangle
    ctx.strokeRect(centerX - 40, centerY - 30, 80, 40);
    
    // Circle
    ctx.beginPath();
    ctx.arc(centerX, centerY + 20, 15, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Lines
    ctx.beginPath();
    ctx.moveTo(centerX - 30, centerY - 40);
    ctx.lineTo(centerX + 30, centerY - 40);
    ctx.moveTo(centerX - 30, centerY + 40);
    ctx.lineTo(centerX + 30, centerY + 40);
    ctx.stroke();
    
    // File type label
    ctx.fillStyle = '#495057';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(fileType, centerX, options.height - 20);
    
    return await this.canvasToBuffer(canvas, options);
  }

  /**
   * Create canvas (using node-canvas or similar)
   */
  private async createCanvas(width: number, height: number): Promise<any> {
    // This is a placeholder - in a real implementation, you would use
    // a library like node-canvas or puppeteer for server-side canvas
    
    // For now, we'll create a simple buffer-based implementation
    return {
      width,
      height,
      getContext: () => ({
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '12px Arial',
        textAlign: 'left',
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        stroke: () => {},
        fillText: () => {},
        fill: () => {}
      })
    };
  }

  /**
   * Convert canvas to buffer
   */
  private async canvasToBuffer(
    canvas: any,
    options: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    // Since we don't have actual canvas rendering in this simplified version,
    // we'll create a placeholder image using Sharp
    
    const placeholderSvg = `
      <svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
        <rect x="${options.width/2 - 40}" y="${options.height/2 - 30}" width="80" height="40" 
              fill="none" stroke="#6c757d" stroke-width="2"/>
        <circle cx="${options.width/2}" cy="${options.height/2 + 20}" r="15" 
                fill="none" stroke="#6c757d" stroke-width="2"/>
        <text x="${options.width/2}" y="${options.height - 20}" 
              text-anchor="middle" font-family="Arial" font-size="16" fill="#495057">CAD</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(placeholderSvg))
      .resize(options.width, options.height)
      .jpeg({ quality: options.quality })
      .toBuffer();

    return {
      buffer,
      width: options.width,
      height: options.height,
      format: options.format,
      size: buffer.length
    };
  }

  /**
   * Parse STL geometry (simplified)
   */
  private parseSTLGeometry(buffer: Buffer): any {
    const header = buffer.slice(0, 5).toString('ascii').toLowerCase();
    
    if (header === 'solid') {
      // ASCII STL
      return this.parseASCIISTL(buffer);
    } else {
      // Binary STL
      return this.parseBinarySTL(buffer);
    }
  }

  /**
   * Parse ASCII STL
   */
  private parseASCIISTL(buffer: Buffer): any {
    const content = buffer.toString('ascii');
    const vertices: number[][] = [];
    
    const vertexRegex = /vertex\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
    let match;
    
    while ((match = vertexRegex.exec(content)) !== null) {
      vertices.push([parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])]);
    }
    
    return {
      vertices,
      boundingBox: this.calculateBoundingBox3D(vertices)
    };
  }

  /**
   * Parse binary STL
   */
  private parseBinarySTL(buffer: Buffer): any {
    if (buffer.length < 84) return { vertices: [], boundingBox: null };
    
    const triangleCount = buffer.readUInt32LE(80);
    const vertices: number[][] = [];
    
    for (let i = 0; i < triangleCount && i < 100; i++) { // Limit for performance
      const offset = 84 + i * 50;
      if (offset + 48 > buffer.length) break;
      
      // Skip normal vector (12 bytes), read vertices (36 bytes)
      for (let j = 0; j < 3; j++) {
        const vertexOffset = offset + 12 + j * 12;
        vertices.push([
          buffer.readFloatLE(vertexOffset),
          buffer.readFloatLE(vertexOffset + 4),
          buffer.readFloatLE(vertexOffset + 8)
        ]);
      }
    }
    
    return {
      vertices,
      boundingBox: this.calculateBoundingBox3D(vertices)
    };
  }

  /**
   * Parse OBJ vertices
   */
  private parseOBJVertices(content: string): number[][] {
    const vertices: number[][] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('v ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          vertices.push([
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          ]);
        }
      }
    }
    
    return vertices;
  }

  /**
   * Parse DXF entities (simplified)
   */
  private parseDXFEntities(content: string): any[] {
    // This is a very simplified DXF parser
    // In production, you'd use a proper DXF parsing library
    const entities: any[] = [];
    
    // Look for LINE entities
    const lineRegex = /LINE[\s\S]*?10\s*([-+]?[0-9]*\.?[0-9]+)[\s\S]*?20\s*([-+]?[0-9]*\.?[0-9]+)[\s\S]*?11\s*([-+]?[0-9]*\.?[0-9]+)[\s\S]*?21\s*([-+]?[0-9]*\.?[0-9]+)/g;
    let match;
    
    while ((match = lineRegex.exec(content)) !== null) {
      entities.push({
        type: 'LINE',
        points: [
          { x: parseFloat(match[1]), y: parseFloat(match[2]) },
          { x: parseFloat(match[3]), y: parseFloat(match[4]) }
        ]
      });
    }
    
    return entities;
  }

  /**
   * Calculate 2D bounding box
   */
  private calculateBoundingBox(vertices: number[][]): any {
    if (vertices.length === 0) return null;
    
    let minX = vertices[0][0], maxX = vertices[0][0];
    let minY = vertices[0][1], maxY = vertices[0][1];
    
    for (const [x, y] of vertices) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    return {
      minX, maxX, minY, maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * Calculate 3D bounding box
   */
  private calculateBoundingBox3D(vertices: number[][]): any {
    if (vertices.length === 0) return null;
    
    let minX = vertices[0][0], maxX = vertices[0][0];
    let minY = vertices[0][1], maxY = vertices[0][1];
    let minZ = vertices[0][2], maxZ = vertices[0][2];
    
    for (const [x, y, z] of vertices) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
  }

  /**
   * Get default thumbnail options
   */
  static getDefaultOptions(): ThumbnailOptions {
    return {
      width: parseInt(process.env.THUMBNAIL_WIDTH || '300'),
      height: parseInt(process.env.THUMBNAIL_HEIGHT || '300'),
      quality: parseInt(process.env.THUMBNAIL_QUALITY || '80'),
      format: (process.env.THUMBNAIL_FORMAT as 'jpeg' | 'png' | 'webp') || 'jpeg'
    };
  }
}