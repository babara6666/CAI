import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import filesRouter from '../files.js';
import { CADFileModel } from '../../models/CADFile.js';
import { AuthService } from '../../services/AuthService.js';
import { FileUploadService } from '../../services/FileUploadService.js';

// Mock dependencies
vi.mock('../../models/CADFile.js');
vi.mock('../../services/AuthService.js');
vi.mock('../../services/FileUploadService.js');

const app = express();
app.use(express.json());
app.use('/api/files', filesRouter);

// Mock user for authentication
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  username: 'testuser',
  role: 'engineer' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  preferences: {
    theme: 'light' as const,
    notificationSettings: {
      emailNotifications: true,
      trainingComplete: true,
      searchResults: true,
      systemUpdates: true
    }
  }
};

// Mock CAD file data
const mockCADFile = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  filename: 'test-file.dwg',
  originalName: 'test-file.dwg',
  fileSize: 1024000,
  mimeType: 'application/acad',
  uploadedBy: '550e8400-e29b-41d4-a716-446655440001',
  uploadedAt: new Date(),
  tags: ['mechanical', 'design'],
  projectName: 'Test Project',
  partName: 'Test Part',
  description: 'Test CAD file',
  metadata: {
    software: 'AutoCAD',
    units: 'mm',
    layerCount: 5
  },
  thumbnailUrl: 'https://example.com/thumbnail.jpg',
  fileUrl: 'https://example.com/file.dwg',
  currentVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: []
};

describe('File Management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock authentication
    vi.mocked(AuthService.verifyAccessToken).mockResolvedValue(mockUser);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/files', () => {
    it('should return paginated list of files', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.findAll).mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(1);
      expect(response.body.data.files[0].id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(response.body.data.pagination.total).toBe(1);
    });

    it('should apply filters correctly', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.findAll).mockResolvedValue(mockResult);

      await request(app)
        .get('/api/files')
        .query({
          tags: 'mechanical,design',
          projectName: 'Test Project',
          page: 1,
          limit: 10
        })
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(CADFileModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['mechanical', 'design'],
          projectName: 'Test Project'
        }),
        expect.objectContaining({
          limit: 10,
          offset: 0
        })
      );
    });

    it('should perform search when search parameter is provided', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.search).mockResolvedValue(mockResult);

      await request(app)
        .get('/api/files')
        .query({ search: 'mechanical part' })
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(CADFileModel.search).toHaveBeenCalledWith(
        'mechanical part',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/files')
        .expect(401);
    });
  });

  describe('GET /api/files/:id', () => {
    it('should return file by ID', async () => {
      vi.mocked(CADFileModel.findById).mockResolvedValue(mockCADFile);

      const response = await request(app)
        .get('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.file.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(CADFileModel.findById).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return 404 for non-existent file', async () => {
      vi.mocked(CADFileModel.findById).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/files/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should return 400 for invalid file ID', async () => {
      const response = await request(app)
        .get('/api/files/invalid-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FILE_ID');
    });
  });

  describe('PUT /api/files/:id', () => {
    it('should update file metadata', async () => {
      const updatedFile = {
        ...mockCADFile,
        tags: ['mechanical', 'design', 'updated'],
        description: 'Updated description'
      };

      vi.mocked(CADFileModel.update).mockResolvedValue(updatedFile);

      const updateData = {
        tags: ['mechanical', 'design', 'updated'],
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.file.tags).toContain('updated');
      expect(response.body.data.file.description).toBe('Updated description');
      expect(CADFileModel.update).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', updateData);
    });

    it('should return 404 for non-existent file', async () => {
      vi.mocked(CADFileModel.update).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/files/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', 'Bearer valid-token')
        .send({ tags: ['test'] })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should validate update data', async () => {
      const response = await request(app)
        .put('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token')
        .send({ tags: 'invalid-tags' }) // Should be array
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should delete file successfully', async () => {
      const mockFileUploadService = {
        deleteFile: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(FileUploadService).mockImplementation(() => mockFileUploadService as any);

      const response = await request(app)
        .delete('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('File deleted successfully');
    });

    it('should return 404 for non-existent file', async () => {
      const mockFileUploadService = {
        deleteFile: vi.fn().mockResolvedValue(false)
      };
      vi.mocked(FileUploadService).mockImplementation(() => mockFileUploadService as any);

      const response = await request(app)
        .delete('/api/files/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('GET /api/files/:id/versions', () => {
    it('should return file versions', async () => {
      const mockVersions = [
        {
          id: 'version-1',
          fileId: '550e8400-e29b-41d4-a716-446655440000',
          versionNumber: 1,
          filename: 'test-file-v1.dwg',
          fileSize: 1024000,
          uploadedBy: '550e8400-e29b-41d4-a716-446655440001',
          uploadedAt: new Date(),
          fileUrl: 'https://example.com/file-v1.dwg'
        },
        {
          id: 'version-2',
          fileId: '550e8400-e29b-41d4-a716-446655440000',
          versionNumber: 2,
          filename: 'test-file-v2.dwg',
          fileSize: 1048576,
          uploadedBy: '550e8400-e29b-41d4-a716-446655440001',
          uploadedAt: new Date(),
          changeDescription: 'Updated dimensions',
          fileUrl: 'https://example.com/file-v2.dwg'
        }
      ];

      vi.mocked(CADFileModel.getFileVersions).mockResolvedValue(mockVersions);

      const response = await request(app)
        .get('/api/files/550e8400-e29b-41d4-a716-446655440000/versions')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.versions).toHaveLength(2);
      expect(response.body.data.versions[1].changeDescription).toBe('Updated dimensions');
      expect(CADFileModel.getFileVersions).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('POST /api/files/search/advanced', () => {
    it('should perform advanced search', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        },
        searchStats: {
          totalMatches: 1,
          metadataMatches: 1,
          tagMatches: 0,
          contentMatches: 0
        }
      };

      vi.mocked(CADFileModel.advancedSearch).mockResolvedValue(mockResult);

      const searchData = {
        search: 'mechanical design',
        tags: ['mechanical'],
        projectName: 'Test Project',
        page: 1,
        limit: 10
      };

      const response = await request(app)
        .post('/api/files/search/advanced')
        .set('Authorization', 'Bearer valid-token')
        .send(searchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(1);
      expect(response.body.data.searchStats.totalMatches).toBe(1);
      expect(CADFileModel.advancedSearch).toHaveBeenCalledWith(
        'mechanical design',
        expect.objectContaining({
          tags: ['mechanical'],
          projectName: 'Test Project'
        }),
        expect.any(Object)
      );
    });
  });

  describe('POST /api/files/search/metadata', () => {
    it('should search by metadata criteria', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.searchByMetadata).mockResolvedValue(mockResult);

      const metadataFilters = {
        software: 'AutoCAD',
        units: 'mm',
        hasText: true,
        layerCountMin: 3
      };

      const response = await request(app)
        .post('/api/files/search/metadata')
        .set('Authorization', 'Bearer valid-token')
        .send(metadataFilters)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(1);
      expect(CADFileModel.searchByMetadata).toHaveBeenCalledWith(
        metadataFilters,
        expect.any(Object)
      );
    });
  });

  describe('GET /api/files/search/tags', () => {
    it('should search by tags with any match', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.findByTags).mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/files/search/tags')
        .query({
          tags: 'mechanical,design',
          matchType: 'any',
          page: 1,
          limit: 10
        })
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(1);
      expect(CADFileModel.findByTags).toHaveBeenCalledWith(
        ['mechanical', 'design'],
        'any',
        expect.any(Object)
      );
    });

    it('should search by tags with all match', async () => {
      const mockResult = {
        files: [mockCADFile],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      };

      vi.mocked(CADFileModel.findByTags).mockResolvedValue(mockResult);

      await request(app)
        .get('/api/files/search/tags')
        .query({
          tags: 'mechanical,design',
          matchType: 'all'
        })
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(CADFileModel.findByTags).toHaveBeenCalledWith(
        ['mechanical', 'design'],
        'all',
        expect.any(Object)
      );
    });
  });

  describe('GET /api/files/tags/popular', () => {
    it('should return popular tags', async () => {
      const mockTags = [
        { tag: 'mechanical', count: 15 },
        { tag: 'design', count: 12 },
        { tag: 'prototype', count: 8 },
        { tag: 'assembly', count: 6 }
      ];

      vi.mocked(CADFileModel.getPopularTags).mockResolvedValue(mockTags);

      const response = await request(app)
        .get('/api/files/tags/popular')
        .query({ limit: 10 })
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tags).toHaveLength(4);
      expect(response.body.data.tags[0].tag).toBe('mechanical');
      expect(response.body.data.tags[0].count).toBe(15);
      expect(CADFileModel.getPopularTags).toHaveBeenCalledWith(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(CADFileModel.findAll).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should handle authentication errors', async () => {
      vi.mocked(AuthService.verifyAccessToken).mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
