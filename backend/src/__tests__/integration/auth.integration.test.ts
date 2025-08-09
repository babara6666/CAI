import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../database/DatabaseService';
import { User } from '../../models/User';

describe('Auth Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await DatabaseService.runMigrations();
    server = app.listen(0);
  });

  afterAll(async () => {
    await server.close();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    // Clean up users table before each test
    await DatabaseService.query('DELETE FROM users WHERE email LIKE %test%');
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'engineer',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            email: userData.email,
            username: userData.username,
            role: userData.role,
            isActive: true,
          },
        },
      });

      expect(response.body.data.user).not.toHaveProperty('password');
      expect(response.body.data.user.id).toBeDefined();
      expect(response.body.data.user.createdAt).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        username: 'testuser',
        password: 'password123',
        role: 'engineer',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('email'),
        },
      });
    });

    it('should return 400 for weak password', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: '123',
        role: 'engineer',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('password'),
        },
      });
    });

    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        username: 'testuser1',
        password: 'password123',
        role: 'engineer',
      };

      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to register with same email
      const duplicateData = {
        ...userData,
        username: 'testuser2',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateData)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Email already exists',
        },
      });
    });

    it('should return 409 for duplicate username', async () => {
      const userData1 = {
        email: 'test1@example.com',
        username: 'duplicateuser',
        password: 'password123',
        role: 'engineer',
      };

      const userData2 = {
        email: 'test2@example.com',
        username: 'duplicateuser',
        password: 'password123',
        role: 'engineer',
      };

      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send(userData1)
        .expect(201);

      // Try to register with same username
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData2)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DUPLICATE_USERNAME',
          message: 'Username already exists',
        },
      });
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      // Create a test user for login tests
      const userData = {
        email: 'login-test@example.com',
        username: 'loginuser',
        password: 'password123',
        role: 'engineer',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      testUser = response.body.data.user;
    });

    it('should login with valid credentials', async () => {
      const credentials = {
        email: 'login-test@example.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: testUser.id,
            email: testUser.email,
            username: testUser.username,
            role: testUser.role,
          },
          token: expect.any(String),
        },
      });

      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should return 401 for invalid email', async () => {
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        },
      });
    });

    it('should return 401 for invalid password', async () => {
      const credentials = {
        email: 'login-test@example.com',
        password: 'wrongpassword',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        },
      });
    });

    it('should return 401 for inactive user', async () => {
      // Deactivate the user
      await User.update(testUser.id, { isActive: false });

      const credentials = {
        email: 'login-test@example.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Account is deactivated',
        },
      });
    });
  });

  describe('GET /api/auth/profile', () => {
    let authToken: string;
    let testUser: any;

    beforeEach(async () => {
      // Register and login to get auth token
      const userData = {
        email: 'profile-test@example.com',
        username: 'profileuser',
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

    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: testUser.id,
            email: testUser.email,
            username: testUser.username,
            role: testUser.role,
          },
        },
      });

      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
        },
      });
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: expect.stringContaining('Invalid token'),
        },
      });
    });
  });

  describe('POST /api/auth/change-password', () => {
    let authToken: string;
    let testUser: any;

    beforeEach(async () => {
      const userData = {
        email: 'password-test@example.com',
        username: 'passworduser',
        password: 'oldpassword123',
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

    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Password changed successfully',
        },
      });

      // Verify new password works
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-test@example.com',
          password: 'newpassword123',
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    it('should return 400 for incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
        },
      });
    });

    it('should return 400 for weak new password', async () => {
      const passwordData = {
        currentPassword: 'oldpassword123',
        newPassword: '123',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('password'),
        },
      });
    });
  });
});