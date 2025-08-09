// Core type definitions for the CAD AI Platform

export type UserRole = 'admin' | 'engineer' | 'viewer';
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'error';
export type DatasetStatus = 'creating' | 'ready' | 'training' | 'error';
export type ModelStatus = 'training' | 'ready' | 'failed' | 'deprecated';
export type ModelType = 'cnn' | 'transformer' | 'hybrid';
export type QueryType = 'natural_language' | 'filtered' | 'hybrid';

// Base interfaces
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// User related interfaces
export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultSearchModel?: string;
  notificationSettings: NotificationSettings;
  mfa?: MFAPreferences;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  trainingComplete: boolean;
  searchResults: boolean;
  systemUpdates: boolean;
}

export interface MFAPreferences {
  enabled: boolean;
  secret?: string;
  backupCodes?: Array<{
    code: string;
    used: boolean;
  }>;
}

export interface User extends BaseEntity {
  email: string;
  username: string;
  role: UserRole;
  lastLoginAt?: Date;
  isActive: boolean;
  preferences: UserPreferences;
}

export interface UserRegistration {
  email: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface UserActivity {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: Date;
  details: Record<string, any>;
}

// CAD File related interfaces
export interface BoundingBox {
  minX: number;
  minY: number;
  minZ?: number;
  maxX: number;
  maxY: number;
  maxZ?: number;
}

export interface MaterialProperties {
  material?: string;
  density?: number;
  color?: string;
  finish?: string;
}

export interface CADMetadata {
  dimensions?: { width: number; height: number; depth?: number };
  units?: string;
  software?: string;
  drawingScale?: string;
  layerCount?: number;
  extractedText?: string[];
  boundingBox?: BoundingBox;
  materialProperties?: MaterialProperties;
  checksum?: string;
}

export interface CADFile extends BaseEntity {
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
  tags: string[];
  projectName?: string;
  partName?: string;
  description?: string;
  metadata: CADMetadata;
  thumbnailUrl?: string;
  fileUrl: string;
  currentVersion: number;
  versions: CADFileVersion[];
}

export interface CADFileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  filename: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: Date;
  changeDescription?: string;
  fileUrl: string;
}

// Dataset related interfaces
export interface DatasetLabel {
  fileId: string;
  label: string;
  confidence?: number;
  createdBy: string;
  createdAt: Date;
}

export interface Dataset extends BaseEntity {
  name: string;
  description?: string;
  createdBy: string;
  fileCount: number;
  files: string[]; // CADFile IDs
  status: DatasetStatus;
  tags: string[];
  labels: DatasetLabel[];
}

// AI Model related interfaces
export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  trainingLoss: number;
  validationLoss: number;
  trainingTime: number;
  inferenceTime: number;
}

export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  earlyStopping: boolean;
  patience?: number;
}

export interface ModelConfig {
  architecture: string;
  hyperparameters: Record<string, any>;
  trainingConfig: TrainingConfig;
}

export interface AIModel extends BaseEntity {
  name: string;
  description?: string;
  type: ModelType;
  version: string;
  trainingDatasetId: string;
  createdBy: string;
  status: ModelStatus;
  performance: ModelPerformance;
  config: ModelConfig;
  modelPath: string;
  isDefault: boolean;
}

export interface TrainingJob {
  id: string;
  modelId: string;
  datasetId: string;
  status: ModelStatus;
  progress: number;
  metrics: TrainingMetrics;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface TrainingMetrics {
  epoch: number;
  loss: number;
  accuracy: number;
  validationLoss: number;
  validationAccuracy: number;
  learningRate: number;
}

// Search related interfaces
export interface SearchFilters {
  dateRange?: DateRange;
  tags?: string[];
  projectName?: string;
  partName?: string;
  fileSize?: { min?: number; max?: number };
  uploadedBy?: string[];
}

export interface UserFeedback {
  rating: number; // 1-5 stars
  comment?: string;
  timestamp: Date;
  helpful: boolean;
}

export interface SearchResult {
  fileId: string;
  relevanceScore: number;
  confidence: number;
  matchedFeatures: string[];
  userFeedback?: UserFeedback;
}

export interface SearchQuery extends BaseEntity {
  userId: string;
  query: string;
  queryType: QueryType;
  filters?: SearchFilters;
  modelId?: string;
  results: SearchResult[];
  timestamp: Date;
  responseTime: number;
  resultCount: number;
}

export interface InferenceResult {
  fileId: string;
  score: number;
  features: string[];
  metadata: Record<string, any>;
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
    requestId: string;
    suggestions?: string[];
  };
  pagination?: Pagination;
}

// Filter interfaces
export interface FileFilters {
  tags?: string[];
  projectName?: string;
  partName?: string;
  uploadedBy?: string;
  dateRange?: DateRange;
  fileSize?: { min?: number; max?: number };
}

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  lastLoginAfter?: Date;
}

export interface AuditFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateRange?: DateRange;
}

// Report interfaces
export interface UsageReport {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalStorage: number;
  searchQueries: number;
  modelTrainings: number;
  period: DateRange;
}

export interface PerformanceReport {
  modelId?: string;
  averageSearchTime: number;
  searchAccuracy: number;
  userSatisfaction: number;
  totalQueries: number;
  period: DateRange;
}

export interface AuditReport {
  totalActions: number;
  actionsByType: Record<string, number>;
  userActivity: Record<string, number>;
  securityEvents: number;
  period: DateRange;
}

// User Interaction and Feedback interfaces
export type InteractionType = 'search' | 'file_view' | 'file_download' | 'feedback' | 'model_training' | 'dataset_creation';

export interface UserInteraction extends BaseEntity {
  userId: string;
  interactionType: InteractionType;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, any>;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// A/B Testing interfaces
export type ABTestStatus = 'draft' | 'running' | 'completed' | 'paused';

export interface ABTestVariant {
  id: string;
  testId: string;
  name: string;
  description?: string;
  configuration: Record<string, any>;
  trafficPercentage: number;
  createdAt: Date;
}

export interface ABTest extends BaseEntity {
  name: string;
  description?: string;
  feature: string;
  variants: ABTestVariant[];
  trafficAllocation: number;
  status: ABTestStatus;
  startDate: Date;
  endDate?: Date;
  targetMetric: string;
  minimumSampleSize: number;
  confidenceLevel: number;
  createdBy: string;
}

export interface ABTestResult {
  testId: string;
  testName: string;
  status: ABTestStatus;
  startDate: Date;
  endDate?: Date;
  targetMetric: string;
  confidenceLevel: number;
  variantResults: Record<string, {
    variantName: string;
    participants: number;
    metrics: Record<string, {
      sampleSize: number;
      mean: number;
      stddev: number;
      minValue: number;
      maxValue: number;
    }>;
  }>;
  statisticalSignificance: {
    pValue: number;
    confidenceInterval: { lower: number; upper: number };
    effectSize: number;
  };
  totalParticipants: number;
  isSignificant: boolean;
}

// Feedback aggregation interfaces
export interface FeedbackAggregation {
  totalFeedback: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  helpfulPercentage: number;
  commonComments: { comment: string; frequency: number }[];
  trendData: { date: string; averageRating: number; count: number }[];
}

export interface ModelImprovementSuggestion {
  modelId: string;
  suggestionType: 'retrain' | 'adjust_parameters' | 'add_data' | 'feature_engineering';
  priority: 'low' | 'medium' | 'high';
  description: string;
  expectedImprovement: number;
  estimatedEffort: string;
  basedOnFeedback: {
    totalSamples: number;
    averageRating: number;
    commonIssues: string[];
  };
}

// Database row interfaces (for internal use)
export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  is_active: boolean;
  preferences: any;
}

export interface CADFileRow {
  id: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: Date;
  tags: string[];
  project_name?: string;
  part_name?: string;
  description?: string;
  metadata: any;
  thumbnail_url?: string;
  file_url: string;
  current_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface DatasetRow {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  file_count: number;
  status: DatasetStatus;
  tags: string[];
}

export interface AIModelRow {
  id: string;
  name: string;
  description?: string;
  type: ModelType;
  version: string;
  training_dataset_id: string;
  created_by: string;
  created_at: Date;
  status: ModelStatus;
  performance: any;
  config: any;
  model_path: string;
  is_default: boolean;
}