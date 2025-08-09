export interface CADFile {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  uploadedBy: string
  uploadedAt: Date
  tags: string[]
  projectName?: string
  partName?: string
  description?: string
  metadata: CADMetadata
  thumbnailUrl?: string
  fileUrl: string
  currentVersion: number
}

export interface CADMetadata {
  dimensions?: { width: number; height: number; depth?: number }
  units?: string
  software?: string
  drawingScale?: string
  layerCount?: number
  extractedText?: string[]
  boundingBox?: BoundingBox
  materialProperties?: MaterialProperties
}

export interface BoundingBox {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

export interface MaterialProperties {
  density?: number
  material?: string
  color?: string
}

export interface CADLayer {
  id: string
  name: string
  visible: boolean
  color?: string
  objects: CADObject[]
}

export interface CADObject {
  id: string
  type: 'line' | 'circle' | 'arc' | 'polyline' | 'text' | 'dimension' | 'block'
  layer: string
  geometry: any
  properties: Record<string, any>
}

export interface ViewerControls {
  zoom: number
  rotation: { x: number; y: number; z: number }
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

export interface ParsedCADData {
  layers: CADLayer[]
  boundingBox: BoundingBox
  units: string
  metadata: Record<string, any>
}