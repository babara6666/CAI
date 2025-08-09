import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../database/DatabaseService';
import path from 'path';
import fs from 'fs';

describe('Files Integration Tests', () => {
  let server: any;
  let authToken: string;
  let testUser: any;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await DatabaseService.runMigrations();
    server = app.listen(0);

    // Create test user and get auth token
    const userData = {
      email: 'files-test@example.com',
      username: 'filesuser',
      password: 'password123',
      role: 'engineer',
    };

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userData);

    testUser = registerResponse.body.data.user;

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      });

    authToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    await server.close();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    // Clean up files table before each test
    await DatabaseService.query('DELETE FROM cad_files WHERE uploaded_by = $1', [testUser.id]);
  });

  describe('POST /api/files/upload', () => {
    it('should upload a single CAD file successfully', async () => {
      // Create a test file buffer
      const testFileContent = Buffer.from('test CAD file content');
      
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFileContent, 'test.dwg')
        .field('tags', 'test,mechanical')
        .field('projectName', 'Test Project')
        .field('description', 'Test CAD file upload')
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          files: [
            {
              id: expect.any(String),
              filename: expect.stringMatching(/\.dwg$/),
              originalName: 'test.dwg',
              fileSize: testFileContent.length,
              mimeType: 'application/dwg',
              uploadedBy: testUser.id,
              tags: ['test', 'mechanical'],
              projectName: 'Test Project',
              description: 'Test CAD file upload',
              fileUrl: expect.stringContaining('test'),
              thumbnailUrl: expect.any(String),
              currentVersion: 1,
            },
          ],
        },
      });
    });

    it('should upload multiple CAD files successfully', async () => {
      const testFile1 = Buffer.from('test CAD file 1');
      const testFile2 = Buffer.from('test CAD file 2');
      
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFile1, 'test1.dwg')
        .attach('files', testFile2, 'test2.dxf')
        .field('tags', 'test,batch')
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          files: expect.arrayContaining([
            expect.objectContaining({
              originalName: 'test1.dwg',
              mimeType: 'application/dwg',
            }),
            expect.objectContaining({
              originalName: 'test2.dxf',
              mimeType: 'application/dxf',
            }),
          ]),
        },
      });

      expect(response.body.data.files).toHaveLength(2);
    });

    it('should return 400 for unsupported file type', async () => {
      const testFileContent = Buffer.from('not a CAD file');
      
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFileContent, 'test.txt')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('Unsupported file type'),
        },
      });
    });

    it('should return 400 for file too large', async () => {
      // Create a large buffer (assuming max size is 100MB)
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
      
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', largeBuffer, 'large.dwg')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: expect.stringContaining('File size exceeds limit'),
        },
      });
    });

    it('should return 401 without authentication', async () => {
      const testFileContent = Buffer.from('test CAD file content');
      
      const response = await request(app)
        .post('/api/files/upload')
        .attach('files', testFileContent, 'test.dwg')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
        },
      });
    });
  });

  describe('GET /api/files', () => {
    let uploadedFiles: any[];

    beforeEach(async () => {
      // Upload test files
      const testFiles = [
        { content: Buffer.from('test file 1'), name: 'test1.dwg', tags: 'mechanical,engine' },
        { content: Buffer.from('test file 2'), name: 'test2.dxf', tags: 'electrical,circuit' },
        { content: Buffer.from('test file 3'), name: 'test3.step', tags: 'mechanical,assembly' },
      ];

      uploadedFiles = [];
      for (const file of testFiles) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('files', file.content, file.name)
          .field('tags', file.tags);
        
        uploadedFiles.push(response.body.data.files[0]);
      }
    });

    it('should get all files for user', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          files: expect.arrayContaining([
            expect.objectContaining({
              originalName: 'test1.dwg',
            }),
            expect.objectContaining({
              originalName: 'test2.dxf',
            }),
            expect.objectContaining({
              originalName: 'test3.step',
            }),
          ]),
          pagination: {
            page: 1,
            limit: 20,
            total: 3,
            totalPages: 1,
          },
        },
      });
    });

    it('should filter files by tags', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ tags: 'mechanical' })
        .expect(200);

      expect(response.body.data.files).toHaveLength(2);
      expect(response.body.data.files.every((file: any) => 
        file.tags.includes('mechanical')
      )).toBe(true);
    });

    it('should filter files by project name', async () => {
      // Upload a file with specific project name
      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('project file'), 'project.dwg')
        .field('projectName', 'Special Project');

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ projectName: 'Special Project' })
        .expect(200);

      expect(response.body.data.files).toHaveLength(1);
      expect(response.body.data.files[0].projectName).toBe('Special Project');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.data.files).toHaveLength(2);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should sort files by upload date', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ sortBy: 'uploadedAt', sortOrder: 'desc' })
        .expect(200);

      const files = response.body.data.files;
      expect(files).toHaveLength(3);
      
      // Check that files are sorted by upload date (newest first)
      for (let i = 0; i < files.length - 1; i++) {
        const currentDate = new Date(files[i].uploadedAt);
        const nextDate = new Date(files[i + 1].uploadedAt);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    });
  });

  describe('GET /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('test file content'), 'test.dwg')
        .field('description', 'Test file for retrieval');
      
      testFile = response.body.data.files[0];
    });

    it('should get file by ID', async () => {
      const response = await request(app)
        .get(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          file: {
            id: testFile.id,
            originalName: 'test.dwg',
            description: 'Test file for retrieval',
            uploadedBy: testUser.id,
          },
        },
      });
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app)
        .get('/api/files/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found',
        },
      });
    });

    it('should return 403 for file owned by another user', async () => {
      // Create another user
      const otherUserData = {
        email: 'other@example.com',
        username: 'otheruser',
        password: 'password123',
        role: 'engineer',
      };

      await request(app)
        .post('/api/auth/register')
        .send(otherUserData);

      const otherLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: otherUserData.email,
          password: otherUserData.password,
        });

      const otherAuthToken = otherLoginResponse.body.data.token;

      const response = await request(app)
        .get(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    });
  });

  describe('PUT /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('test file content'), 'test.dwg')
        .field('tags', 'original,test');
      
      testFile = response.body.data.files[0];
    });

    it('should update file metadata', async () => {
      const updateData = {
        tags: ['updated', 'modified'],
        projectName: 'Updated Project',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          file: {
            id: testFile.id,
            tags: ['updated', 'modified'],
            projectName: 'Updated Project',
            description: 'Updated description',
          },
        },
      });
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app)
        .put('/api/files/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
        },
      });
    });
  });

  describe('DELETE /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('test file content'), 'test.dwg');
      
      testFile = response.body.data.files[0];
    });

    it('should delete file successfully', async () => {
      const response = await request(app)
        .delete(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'File deleted successfully',
        },
      });

      // Verify file is deleted
      await request(app)
        .get(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app)
        .delete('/api/files/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
        },
      });
    });
  });
});