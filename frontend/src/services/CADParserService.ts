import { ParsedCADData, CADLayer, CADObject, BoundingBox } from '../types/cad'

export class CADParserService {
  private static instance: CADParserService
  private supportedFormats = ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.obj', '.stl']

  static getInstance(): CADParserService {
    if (!CADParserService.instance) {
      CADParserService.instance = new CADParserService()
    }
    return CADParserService.instance
  }

  isSupportedFormat(filename: string): boolean {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return this.supportedFormats.includes(extension)
  }

  async parseCADFile(file: File | ArrayBuffer, filename: string): Promise<ParsedCADData> {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    
    switch (extension) {
      case '.dxf':
        return this.parseDXF(file)
      case '.obj':
        return this.parseOBJ(file)
      case '.stl':
        return this.parseSTL(file)
      case '.step':
      case '.stp':
        return this.parseSTEP(file)
      case '.dwg':
        return this.parseDWG(file)
      default:
        throw new Error(`Unsupported file format: ${extension}`)
    }
  }

  private async parseDXF(file: File | ArrayBuffer): Promise<ParsedCADData> {
    // Basic DXF parser implementation
    const content = await this.getFileContent(file)
    const lines = content.split('\n').map(line => line.trim())
    
    const layers: CADLayer[] = []
    const entities: CADObject[] = []
    let currentLayer = 'default'
    
    // Parse DXF structure
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i]
      const value = lines[i + 1]
      
      if (code === '0' && value === 'LAYER') {
        // Parse layer definition
        const layerName = this.findDXFValue(lines, i, '2') || 'default'
        const layerColor = this.findDXFValue(lines, i, '62') || '7'
        
        layers.push({
          id: layerName,
          name: layerName,
          visible: true,
          color: this.dxfColorToHex(parseInt(layerColor)),
          objects: []
        })
      } else if (code === '0' && ['LINE', 'CIRCLE', 'ARC', 'POLYLINE'].includes(value)) {
        // Parse entity
        const entity = this.parseDXFEntity(lines, i, value)
        if (entity) {
          entities.push(entity)
        }
      }
    }
    
    // Group entities by layer
    entities.forEach(entity => {
      const layer = layers.find(l => l.id === entity.layer) || layers[0]
      if (layer) {
        layer.objects.push(entity)
      }
    })
    
    const boundingBox = this.calculateBoundingBox(entities)
    
    return {
      layers: layers.length > 0 ? layers : [{ id: 'default', name: 'Default', visible: true, objects: entities }],
      boundingBox,
      units: 'mm',
      metadata: { format: 'DXF', entityCount: entities.length }
    }
  }

  private async parseOBJ(file: File | ArrayBuffer): Promise<ParsedCADData> {
    const content = await this.getFileContent(file)
    const lines = content.split('\n')
    
    const vertices: number[][] = []
    const faces: number[][] = []
    const objects: CADObject[] = []
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      
      if (parts[0] === 'v') {
        // Vertex
        vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])])
      } else if (parts[0] === 'f') {
        // Face
        const face = parts.slice(1).map(p => parseInt(p.split('/')[0]) - 1)
        faces.push(face)
      }
    }
    
    const meshObject: CADObject = {
      id: 'mesh_0',
      type: 'polyline',
      layer: 'default',
      geometry: { vertices, faces },
      properties: { type: 'mesh' }
    }
    
    objects.push(meshObject)
    
    const boundingBox = this.calculateBoundingBoxFromVertices(vertices)
    
    return {
      layers: [{
        id: 'default',
        name: 'Default',
        visible: true,
        objects
      }],
      boundingBox,
      units: 'mm',
      metadata: { format: 'OBJ', vertexCount: vertices.length, faceCount: faces.length }
    }
  }

  private async parseSTL(file: File | ArrayBuffer): Promise<ParsedCADData> {
    const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
    const view = new DataView(buffer)
    
    // Check if binary STL (first 80 bytes are header, then 4 bytes for triangle count)
    const triangleCount = view.getUint32(80, true)
    const expectedSize = 80 + 4 + (triangleCount * 50)
    
    if (buffer.byteLength === expectedSize) {
      return this.parseBinarySTL(view, triangleCount)
    } else {
      return this.parseAsciiSTL(new TextDecoder().decode(buffer))
    }
  }

  private parseBinarySTL(view: DataView, triangleCount: number): ParsedCADData {
    const vertices: number[][] = []
    const faces: number[][] = []
    let offset = 84 // Skip header and triangle count
    
    for (let i = 0; i < triangleCount; i++) {
      // Skip normal vector (12 bytes)
      offset += 12
      
      // Read 3 vertices (9 floats)
      const v1 = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]
      const v2 = [view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true)]
      const v3 = [view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true), view.getFloat32(offset + 32, true)]
      
      const startIndex = vertices.length
      vertices.push(v1, v2, v3)
      faces.push([startIndex, startIndex + 1, startIndex + 2])
      
      offset += 36 + 2 // 36 bytes for vertices + 2 bytes attribute
    }
    
    const meshObject: CADObject = {
      id: 'stl_mesh',
      type: 'polyline',
      layer: 'default',
      geometry: { vertices, faces },
      properties: { type: 'mesh' }
    }
    
    return {
      layers: [{
        id: 'default',
        name: 'Default',
        visible: true,
        objects: [meshObject]
      }],
      boundingBox: this.calculateBoundingBoxFromVertices(vertices),
      units: 'mm',
      metadata: { format: 'STL', triangleCount, vertexCount: vertices.length }
    }
  }

  private parseAsciiSTL(content: string): ParsedCADData {
    const lines = content.split('\n').map(line => line.trim())
    const vertices: number[][] = []
    const faces: number[][] = []
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('facet normal')) {
        // Find the three vertices of this facet
        const faceVertices: number[][] = []
        
        for (let j = i + 1; j < lines.length && faceVertices.length < 3; j++) {
          if (lines[j].startsWith('vertex')) {
            const coords = lines[j].split(/\s+/).slice(1).map(parseFloat)
            faceVertices.push(coords)
          }
        }
        
        if (faceVertices.length === 3) {
          const startIndex = vertices.length
          vertices.push(...faceVertices)
          faces.push([startIndex, startIndex + 1, startIndex + 2])
        }
      }
    }
    
    const meshObject: CADObject = {
      id: 'stl_mesh',
      type: 'polyline',
      layer: 'default',
      geometry: { vertices, faces },
      properties: { type: 'mesh' }
    }
    
    return {
      layers: [{
        id: 'default',
        name: 'Default',
        visible: true,
        objects: [meshObject]
      }],
      boundingBox: this.calculateBoundingBoxFromVertices(vertices),
      units: 'mm',
      metadata: { format: 'STL', triangleCount: faces.length, vertexCount: vertices.length }
    }
  }

  private async parseSTEP(file: File | ArrayBuffer): Promise<ParsedCADData> {
    // Basic STEP file parsing (simplified)
    const content = await this.getFileContent(file)
    
    // STEP files are complex - this is a basic implementation
    // In production, you'd use a proper STEP parser library
    
    return {
      layers: [{
        id: 'default',
        name: 'Default',
        visible: true,
        objects: []
      }],
      boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } },
      units: 'mm',
      metadata: { format: 'STEP', note: 'Basic parsing - full STEP support requires specialized library' }
    }
  }

  private async parseDWG(file: File | ArrayBuffer): Promise<ParsedCADData> {
    // DWG parsing requires specialized libraries due to proprietary format
    // This is a placeholder implementation
    
    return {
      layers: [{
        id: 'default',
        name: 'Default',
        visible: true,
        objects: []
      }],
      boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } },
      units: 'mm',
      metadata: { format: 'DWG', note: 'DWG parsing requires specialized library' }
    }
  }

  private async getFileContent(file: File | ArrayBuffer): Promise<string> {
    if (file instanceof ArrayBuffer) {
      return new TextDecoder().decode(file)
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  private findDXFValue(lines: string[], startIndex: number, code: string): string | null {
    for (let i = startIndex; i < Math.min(startIndex + 20, lines.length); i += 2) {
      if (lines[i] === code) {
        return lines[i + 1]
      }
    }
    return null
  }

  private parseDXFEntity(lines: string[], startIndex: number, entityType: string): CADObject | null {
    const layer = this.findDXFValue(lines, startIndex, '8') || 'default'
    
    switch (entityType) {
      case 'LINE':
        const x1 = parseFloat(this.findDXFValue(lines, startIndex, '10') || '0')
        const y1 = parseFloat(this.findDXFValue(lines, startIndex, '20') || '0')
        const x2 = parseFloat(this.findDXFValue(lines, startIndex, '11') || '0')
        const y2 = parseFloat(this.findDXFValue(lines, startIndex, '21') || '0')
        
        return {
          id: `line_${Date.now()}_${Math.random()}`,
          type: 'line',
          layer,
          geometry: { start: { x: x1, y: y1 }, end: { x: x2, y: y2 } },
          properties: {}
        }
      
      case 'CIRCLE':
        const cx = parseFloat(this.findDXFValue(lines, startIndex, '10') || '0')
        const cy = parseFloat(this.findDXFValue(lines, startIndex, '20') || '0')
        const radius = parseFloat(this.findDXFValue(lines, startIndex, '40') || '1')
        
        return {
          id: `circle_${Date.now()}_${Math.random()}`,
          type: 'circle',
          layer,
          geometry: { center: { x: cx, y: cy }, radius },
          properties: {}
        }
      
      default:
        return null
    }
  }

  private dxfColorToHex(colorIndex: number): string {
    // Basic DXF color mapping
    const colors = [
      '#000000', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF',
      '#0000FF', '#FF00FF', '#FFFFFF', '#808080', '#C0C0C0'
    ]
    return colors[colorIndex] || '#FFFFFF'
  }

  private calculateBoundingBox(objects: CADObject[]): BoundingBox {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    
    objects.forEach(obj => {
      if (obj.geometry) {
        // Extract coordinates based on geometry type
        const coords = this.extractCoordinates(obj.geometry)
        coords.forEach(coord => {
          minX = Math.min(minX, coord.x)
          minY = Math.min(minY, coord.y)
          minZ = Math.min(minZ, coord.z || 0)
          maxX = Math.max(maxX, coord.x)
          maxY = Math.max(maxY, coord.y)
          maxZ = Math.max(maxZ, coord.z || 0)
        })
      }
    })
    
    return {
      min: { x: minX === Infinity ? 0 : minX, y: minY === Infinity ? 0 : minY, z: minZ === Infinity ? 0 : minZ },
      max: { x: maxX === -Infinity ? 100 : maxX, y: maxY === -Infinity ? 100 : maxY, z: maxZ === -Infinity ? 100 : maxZ }
    }
  }

  private calculateBoundingBoxFromVertices(vertices: number[][]): BoundingBox {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    
    vertices.forEach(vertex => {
      minX = Math.min(minX, vertex[0])
      minY = Math.min(minY, vertex[1])
      minZ = Math.min(minZ, vertex[2] || 0)
      maxX = Math.max(maxX, vertex[0])
      maxY = Math.max(maxY, vertex[1])
      maxZ = Math.max(maxZ, vertex[2] || 0)
    })
    
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    }
  }

  private extractCoordinates(geometry: any): Array<{ x: number; y: number; z?: number }> {
    const coords: Array<{ x: number; y: number; z?: number }> = []
    
    if (geometry.start && geometry.end) {
      // Line
      coords.push(geometry.start, geometry.end)
    } else if (geometry.center) {
      // Circle
      coords.push(geometry.center)
    } else if (geometry.vertices) {
      // Mesh vertices
      geometry.vertices.forEach((vertex: number[]) => {
        coords.push({ x: vertex[0], y: vertex[1], z: vertex[2] })
      })
    }
    
    return coords
  }
}