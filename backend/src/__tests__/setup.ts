import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../database/DatabaseService';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

// Mock Redis for testing
const mockRedis = new RedisMock();

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/cad_ai_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
  
  // Mock database for testing - no real connection needed
  // Tests will use mocked database responses
});

afterAll(async () => {
  // Cleanup mocked services
  vi.clearAllMocks();
});

beforeEach(async () => {
  // Clear Redis cache before each test
  try {
    await mockRedis.flushall();
  } catch (error) {
    console.warn('Redis cleanup failed:', error);
  }
});

afterEach(async () => {
  // Additional cleanup after each test if needed
});

// Mock external services
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => mockRedis),
  };
});

// Mock AWS SDK
vi.mock('aws-sdk', () => ({
  S3: vi.fn(() => ({
    upload: vi.fn().mockReturnValue({
      promise: vi.fn().mockResolvedValue({
        Location: 'https://test-bucket.s3.amazonaws.com/test-file.dwg',
        Key: 'test-file.dwg',
      }),
    }),
    deleteObject: vi.fn().mockReturnValue({
      promise: vi.fn().mockResolvedValue({}),
    }),
    getObject: vi.fn().mockReturnValue({
      promise: vi.fn().mockResolvedValue({
        Body: Buffer.from('test file content'),
      }),
    }),
  })),
  config: {
    update: vi.fn(),
  },
}));

// Mock Bull queue
vi.mock('bull', () => ({
  default: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    process: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock PostgreSQL client
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  })),
}));

// Mock DatabaseService
vi.mock('../database/DatabaseService', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      getClient: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      }),
      transaction: vi.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
          release: vi.fn(),
        };
        return callback(mockClient);
      }),
      close: vi.fn().mockResolvedValue(undefined),
      getPoolStatus: vi.fn().mockReturnValue({
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
      }),
    })),
  },
}));

// Global test utilities
global.testUtils = {
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    role: 'engineer' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    isActive: true,
    preferences: {
      theme: 'light' as const,
      notificationSettings: {
        email: true,
        push: false,
      },
    },
  }),
  
  createTestCADFile: () => ({
    id: 'test-file-id',
    filename: 'test-file.dwg',
    originalName: 'test-file.dwg',
    fileSize: 1024000,
    mimeType: 'application/dwg',
    uploadedBy: 'test-user-id',
    uploadedAt: new Date(),
    tags: ['test', 'mechanical'],
    projectName: 'Test Project',
    partName: 'Test Part',
    description: 'Test CAD file',
    metadata: {
      dimensions: { width: 100, height: 200 },
      units: 'mm',
      software: 'AutoCAD',
    },
    versions: [],
    thumbnailUrl: 'https://test-bucket.s3.amazonaws.com/thumbnails/test-file.jpg',
    fileUrl: 'https://test-bucket.s3.amazonaws.com/test-file.dwg',
    currentVersion: 1,
  }),
  
  createTestDataset: () => ({
    id: 'test-dataset-id',
    name: 'Test Dataset',
    description: 'Test dataset for ML training',
    createdBy: 'test-user-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    fileCount: 10,
    files: ['file1', 'file2', 'file3'],
    status: 'ready' as const,
    tags: ['test', 'training'],
    labels: [],
  }),
};

declare global {
  var testUtils: {
    createTestUser: () => any;
    createTestCADFile: () => any;
    createTestDataset: () => any;
  };
}