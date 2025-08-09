import { describe, it, expect, beforeEach } from 'vitest'
import { CADParserService } from '../CADParserService'

describe('CADParserService', () => {
  let parserService: CADParserService

  beforeEach(() => {
    parserService = CADParserService.getInstance()
  })

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = CADParserService.getInstance()
      const instance2 = CADParserService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('isSupportedFormat', () => {
    it('should return true for supported formats', () => {
      const supportedFormats = [
        'test.dwg',
        'test.dxf',
        'test.step',
        'test.stp',
        'test.iges',
        'test.igs',
        'test.obj',
        'test.stl'
      ]

      supportedFormats.forEach(filename => {
        expect(parserService.isSupportedFormat(filename)).toBe(true)
      })
    })

    it('should return false for unsupported formats', () => {
      const unsupportedFormats = [
        'test.pdf',
        'test.jpg',
        'test.png',
        'test.doc',
        'test.txt'
      ]

      unsupportedFormats.forEach(filename => {
        expect(parserService.isSupportedFormat(filename)).toBe(false)
      })
    })

    it('should be case insensitive', () => {
      expect(parserService.isSupportedFormat('test.DXF')).toBe(true)
      expect(parserService.isSupportedFormat('test.DWG')).toBe(true)
      expect(parserService.isSupportedFormat('test.STL')).toBe(true)
    })
  })

  describe('parseCADFile', () => {
    it('should throw error for unsupported format', async () => {
      const file = new ArrayBuffer(100)
      await expect(parserService.parseCADFile(file, 'test.pdf')).rejects.toThrow('Unsupported file format: .pdf')
    })

    describe('DXF parsing', () => {
      it('should parse basic DXF file with line entity', async () => {
        const dxfContent = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0.0
20
0.0
11
100.0
21
100.0
0
ENDSEC
0
EOF`
        
        const file = new TextEncoder().encode(dxfContent).buffer
        const result = await parserService.parseCADFile(file, 'test.dxf')

        expect(result.metadata.format).toBe('DXF')
        expect(result.layers).toHaveLength(1)
        expect(result.layers[0].objects).toHaveLength(1)
        expect(result.layers[0].objects[0].type).toBe('line')
        expect(result.layers[0].objects[0].geometry.start).toEqual({ x: 0, y: 0 })
        expect(result.layers[0].objects[0].geometry.end).toEqual({ x: 100, y: 100 })
      })

      it('should parse DXF file with circle entity', async () => {
        const dxfContent = `0
SECTION
2
ENTITIES
0
CIRCLE
8
0
10
50.0
20
50.0
40
25.0
0
ENDSEC
0
EOF`
        
        const file = new TextEncoder().encode(dxfContent).buffer
        const result = await parserService.parseCADFile(file, 'test.dxf')

        expect(result.layers[0].objects).toHaveLength(1)
        expect(result.layers[0].objects[0].type).toBe('circle')
        expect(result.layers[0].objects[0].geometry.center).toEqual({ x: 50, y: 50 })
        expect(result.layers[0].objects[0].geometry.radius).toBe(25)
      })

      it('should handle empty DXF file', async () => {
        const dxfContent = `0
EOF`
        
        const file = new TextEncoder().encode(dxfContent).buffer
        const result = await parserService.parseCADFile(file, 'test.dxf')

        expect(result.layers).toHaveLength(1)
        expect(result.layers[0].objects).toHaveLength(0)
        expect(result.metadata.entityCount).toBe(0)
      })
    })

    describe('OBJ parsing', () => {
      it('should parse basic OBJ file', async () => {
        const objContent = `v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f 1 2 3`
        
        const file = new TextEncoder().encode(objContent).buffer
        const result = await parserService.parseCADFile(file, 'test.obj')

        expect(result.metadata.format).toBe('OBJ')
        expect(result.metadata.vertexCount).toBe(3)
        expect(result.metadata.faceCount).toBe(1)
        expect(result.layers[0].objects).toHaveLength(1)
        expect(result.layers[0].objects[0].type).toBe('polyline')
      })

      it('should handle OBJ file with no faces', async () => {
        const objContent = `v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0`
        
        const file = new TextEncoder().encode(objContent).buffer
        const result = await parserService.parseCADFile(file, 'test.obj')

        expect(result.metadata.vertexCount).toBe(3)
        expect(result.metadata.faceCount).toBe(0)
      })
    })

    describe('STL parsing', () => {
      it('should parse ASCII STL file', async () => {
        const stlContent = `solid test
facet normal 0.0 0.0 1.0
  outer loop
    vertex 0.0 0.0 0.0
    vertex 1.0 0.0 0.0
    vertex 0.0 1.0 0.0
  endloop
endfacet
endsolid test`
        
        const file = new TextEncoder().encode(stlContent).buffer
        const result = await parserService.parseCADFile(file, 'test.stl')

        expect(result.metadata.format).toBe('STL')
        expect(result.metadata.triangleCount).toBe(1)
        expect(result.metadata.vertexCount).toBe(3)
        expect(result.layers[0].objects).toHaveLength(1)
        expect(result.layers[0].objects[0].type).toBe('polyline')
      })

      it('should parse binary STL file', async () => {
        // Create a minimal binary STL file
        const buffer = new ArrayBuffer(84 + 50) // Header + 1 triangle
        const view = new DataView(buffer)
        
        // Header (80 bytes of zeros)
        // Triangle count
        view.setUint32(80, 1, true)
        
        // Triangle data (50 bytes)
        let offset = 84
        // Normal vector (12 bytes)
        view.setFloat32(offset, 0, true)
        view.setFloat32(offset + 4, 0, true)
        view.setFloat32(offset + 8, 1, true)
        offset += 12
        
        // Vertices (36 bytes)
        // Vertex 1
        view.setFloat32(offset, 0, true)
        view.setFloat32(offset + 4, 0, true)
        view.setFloat32(offset + 8, 0, true)
        offset += 12
        // Vertex 2
        view.setFloat32(offset, 1, true)
        view.setFloat32(offset + 4, 0, true)
        view.setFloat32(offset + 8, 0, true)
        offset += 12
        // Vertex 3
        view.setFloat32(offset, 0, true)
        view.setFloat32(offset + 4, 1, true)
        view.setFloat32(offset + 8, 0, true)
        offset += 12
        
        // Attribute byte count (2 bytes)
        view.setUint16(offset, 0, true)

        const result = await parserService.parseCADFile(buffer, 'test.stl')

        expect(result.metadata.format).toBe('STL')
        expect(result.metadata.triangleCount).toBe(1)
        expect(result.metadata.vertexCount).toBe(3)
      })
    })

    describe('STEP parsing', () => {
      it('should handle STEP files with basic parsing', async () => {
        const stepContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('test'),'2;1');
FILE_NAME('test.step','2023-01-01T00:00:00',(''),(''),('','',''));
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`
        
        const file = new TextEncoder().encode(stepContent).buffer
        const result = await parserService.parseCADFile(file, 'test.step')

        expect(result.metadata.format).toBe('STEP')
        expect(result.layers).toHaveLength(1)
        expect(result.metadata.note).toContain('Basic parsing')
      })
    })

    describe('DWG parsing', () => {
      it('should handle DWG files with placeholder parsing', async () => {
        const file = new ArrayBuffer(100) // Dummy DWG data
        const result = await parserService.parseCADFile(file, 'test.dwg')

        expect(result.metadata.format).toBe('DWG')
        expect(result.layers).toHaveLength(1)
        expect(result.metadata.note).toContain('specialized library')
      })
    })
  })

  describe('bounding box calculation', () => {
    it('should calculate correct bounding box for line entities', async () => {
      const dxfContent = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
-50.0
20
-25.0
11
100.0
21
75.0
0
ENDSEC
0
EOF`
      
      const file = new TextEncoder().encode(dxfContent).buffer
      const result = await parserService.parseCADFile(file, 'test.dxf')

      expect(result.boundingBox.min.x).toBe(-50)
      expect(result.boundingBox.min.y).toBe(-25)
      expect(result.boundingBox.max.x).toBe(100)
      expect(result.boundingBox.max.y).toBe(75)
    })

    it('should handle empty geometry gracefully', async () => {
      const dxfContent = `0
EOF`
      
      const file = new TextEncoder().encode(dxfContent).buffer
      const result = await parserService.parseCADFile(file, 'test.dxf')

      expect(result.boundingBox.min.x).toBe(0)
      expect(result.boundingBox.min.y).toBe(0)
      expect(result.boundingBox.max.x).toBe(100)
      expect(result.boundingBox.max.y).toBe(100)
    })
  })

  describe('layer handling', () => {
    it('should create default layer when no layers are defined', async () => {
      const dxfContent = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0.0
20
0.0
11
100.0
21
100.0
0
ENDSEC
0
EOF`
      
      const file = new TextEncoder().encode(dxfContent).buffer
      const result = await parserService.parseCADFile(file, 'test.dxf')

      expect(result.layers).toHaveLength(1)
      expect(result.layers[0].name).toBe('Default')
      expect(result.layers[0].id).toBe('default')
    })

    it('should parse layer definitions', async () => {
      const dxfContent = `0
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
TestLayer
62
1
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
ENDSEC
0
EOF`
      
      const file = new TextEncoder().encode(dxfContent).buffer
      const result = await parserService.parseCADFile(file, 'test.dxf')

      expect(result.layers.some(layer => layer.name === 'TestLayer')).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle malformed DXF content gracefully', async () => {
      const malformedContent = `invalid dxf content`
      const file = new TextEncoder().encode(malformedContent).buffer
      
      const result = await parserService.parseCADFile(file, 'test.dxf')
      
      // Should not throw, but return minimal valid structure
      expect(result.layers).toHaveLength(1)
      expect(result.metadata.format).toBe('DXF')
    })

    it('should handle empty file content', async () => {
      const file = new ArrayBuffer(0)
      
      const result = await parserService.parseCADFile(file, 'test.dxf')
      
      expect(result.layers).toHaveLength(1)
      expect(result.layers[0].objects).toHaveLength(0)
    })
  })
})