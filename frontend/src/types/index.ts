// Core types for the CAD AI Platform

export interface User {
  id: string
  email: string
  username: string
  role: 'admin' | 'engineer' | 'viewer'
  createdAt: string
  updatedAt: string
  lastLoginAt: string
  isActive: boolean
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: 'light' | 'dark'
  defaultSearchModel?: string
  notificationSettings: NotificationSettings
}

export interface NotificationSettings {
  emailNotifications: boolean
  pushNotifications: boolean
  trainingComplete: boolean
  searchResults: boolean
}

export interface CADFile {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  uploadedBy: string
  uploadedAt: string
  tags: string[]
  projectName?: string
  partName?: string
  description?: string
  metadata: CADMetadata
  versions: CADFileVersion[]
  thumbnailUrl?: string
  fileUrl: string
  currentVersion: number
}

export interface CADFileVersion {
  id: string
  fileId: string
  versionNumber: number
  filename: string
  fileSize: number
  uploadedBy: string
  uploadedAt: string
  changeDescription?: string
  fileUrl: string
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

export interface Dataset {
  id: string
  name: string
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  fileCount: number
  files: string[]
  status: 'creating' | 'ready' | 'training' | 'error'
  tags: string[]
  labels: DatasetLabel[]
}

export interface DatasetLabel {
  fileId: string
  label: string
  confidence?: number
  createdBy: string
  createdAt: string
}

export interface AIModel {
  id: string
  name: string
  description?: string
  type: 'cnn' | 'transformer' | 'hybrid'
  version: string
  trainingDatasetId: string
  createdBy: string
  createdAt: string
  status: 'training' | 'ready' | 'failed' | 'deprecated'
  performance: ModelPerformance
  config: ModelConfig
  modelPath: string
  isDefault: boolean
}

export interface ModelPerformance {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  trainingLoss: number
  validationLoss: number
  trainingTime: number
  inferenceTime: number
}

export interface ModelConfig {
  architecture: string
  hyperparameters: Record<string, any>
  trainingConfig: TrainingConfig
}

export interface TrainingConfig {
  epochs: number
  batchSize: number
  learningRate: number
  optimizer: string
  lossFunction: string
}

export interface SearchQuery {
  id: string
  userId: string
  query: string
  queryType: 'natural_language' | 'filtered' | 'hybrid'
  filters?: SearchFilters
  modelId?: string
  results: SearchResult[]
  timestamp: string
  responseTime: number
  resultCount: number
}

export interface SearchResult {
  fileId: string
  relevanceScore: number
  confidence: number
  matchedFeatures: string[]
  userFeedback?: UserFeedback
  file?: CADFile
}

export interface UserFeedback {
  rating: number
  comment?: string
  timestamp: string
  helpful: boolean
}

export interface SearchFilters {
  dateRange?: DateRange
  tags?: string[]
  projectName?: string
  partName?: string
  fileSize?: { min?: number; max?: number }
  uploadedBy?: string[]
}

export interface DateRange {
  start: string
  end: string
}

export interface TrainingJob {
  id: string
  name: string
  datasetId: string
  modelConfig: ModelConfig
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  metrics: TrainingMetrics
  createdBy: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface TrainingMetrics {
  epoch: number
  loss: number
  accuracy: number
  validationLoss: number
  validationAccuracy: number
  learningRate: number
}

export interface UploadProgress {
  fileId: string
  filename: string
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
    timestamp: string
    requestId: string
    suggestions?: string[]
  }
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}