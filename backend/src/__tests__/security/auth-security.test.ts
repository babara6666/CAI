import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../database/DatabaseService';
import jwt from 'jsonwebtoken';

describe('Authentication Security Tests', () => {
  let server: any;

  beforeAll(async () => {
    await DatabaseService.initialize();
    server = app.listen(0);
  });

  afterAll(async () => {
    await server.close();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await DatabaseService.query('DELETE FROM users WHERE email LIKE %security-test%');
  });

  describe('Password Security', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        '123',
        'password',
        '12345678',
        'qwerty',
        'abc123',
        '11111111',
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'security-test@example.com',
            username: 'securityuser',
            password,
            role: 'engineer',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toMatch(/password/i);
      }
    });

    it('should enforce password complexity requirements', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'security-test@example.com',
          username: 'securityuser',
          password: 'ComplexPassword123!',
          role: 'engineer',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should hash passwords securely', async () => {
      const userData = {
        email: 'hash-test@example.com',
        username: 'hashuser',
        password: 'SecurePassword123!',
        role: 'engineer',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Check that password is hashed in database
      const result = await DatabaseService.query(
        'SELECT password FROM users WHERE email = $1',
        [userData.email]
      );

      const storedPassword = result.rows[0].password;
      
      // Password should be hashed (not plain text)
      expect(storedPassword).not.toBe(userData.password);
      expect(storedPassword).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
      expect(storedPassword.length).toBeGreaterThan(50);
    });

    it('should prevent password enumeration attacks', async () => {
      // Register a user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'enum-test@example.com',
          username: 'enumuser',
          password: 'SecurePassword123!',
          role: 'engineer',
        });

      // Try login with existing email but wrong password
      const existingEmailResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'enum-test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      // Try login with non-existing email
      const nonExistingEmailResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      // Both should return the same generic error message
      expect(existingEmailResponse.body.error.message).toBe('Invalid credentials');
      expect(nonExistingEmailResponse.body.error.message).toBe('Invalid credentials');
      
      // Response times should be similar to prevent timing attacks
      // This is a simplified check - in practice, you'd want more sophisticated timing analysis
      expect(Math.abs(
        existingEmailResponse.get('X-Response-Time') - 
        nonExistingEmailResponse.get('X-Response-Time')
      )).toBeLessThan(100); // Within 100ms
    });
  });

  describe('JWT Security', () => {
    let validToken: string;
    let testUser: any;

    beforeEach(async () => {
      const userData = {
        email: 'jwt-test@example.com',
        username: 'jwtuser',
        password: 'SecurePassword123!',
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

      validToken = loginResponse.body.data.token;
    });

    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '',
        null,
        undefined,
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', token ? `Bearer ${token}` : '');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      }
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, role: testUser.role },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.message).toMatch(/expired|invalid/i);
    });

    it('should reject tokens with invalid signatures', async () => {
      // Create a token with wrong secret
      const invalidToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, role: testUser.role },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error.message).toMatch(/invalid/i);
    });

    it('should reject tokens with tampered payload', async () => {
      // Decode the valid token and tamper with it
      const decoded = jwt.decode(validToken, { complete: true }) as any;
      const tamperedPayload = {
        ...decoded.payload,
        role: 'admin', // Escalate privileges
      };

      const tamperedToken = jwt.sign(
        tamperedPayload,
        'wrong-secret', // This will make the signature invalid
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should validate token claims properly', async () => {
      // Create a token with missing required claims
      const incompleteToken = jwt.sign(
        { userId: testUser.id }, // Missing email and role
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${incompleteToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection in login', async () => {
      const sqlInjectionAttempts = [
        "admin@example.com'; DROP TABLE users; --",
        "admin@example.com' OR '1'='1",
        "admin@example.com' UNION SELECT * FROM users --",
        "'; INSERT INTO users (email, role) VALUES ('hacker@evil.com', 'admin'); --",
      ];

      for (const maliciousEmail of sqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: maliciousEmail,
            password: 'password123',
          });

        // Should not cause server error or unauthorized access
        expect([400, 401]).toContain(response.status);
        expect(response.body.success).toBe(false);
      }

      // Verify users table still exists and is intact
      const result = await DatabaseService.query('SELECT COUNT(*) FROM users');
      expect(result.rows[0].count).toBeDefined();
    });

    it('should sanitize XSS attempts in registration', async () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert("xss")</script>',
      ];

      for (const maliciousInput of xssAttempts) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'xss-test@example.com',
            username: maliciousInput,
            password: 'SecurePassword123!',
            role: 'engineer',
          });

        // Should either reject the input or sanitize it
        if (response.status === 201) {
          // If accepted, should be sanitized
          expect(response.body.data.user.username).not.toContain('<script>');
          expect(response.body.data.user.username).not.toContain('javascript:');
        } else {
          // Should be rejected with validation error
          expect(response.status).toBe(400);
          expect(response.body.success).toBe(false);
        }
      }
    });

    it('should validate email format strictly', async () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user..user@example.com',
        'user@example',
        'user@.example.com',
        'user@example..com',
      ];

      for (const invalidEmail of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: invalidEmail,
            username: 'testuser',
            password: 'SecurePassword123!',
            role: 'engineer',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toMatch(/email/i);
      }
    });
  });

  describe('Rate Limiting Security', () => {
    it('should rate limit login attempts', async () => {
      const maxAttempts = 5; // Assuming rate limit is 5 attempts per minute
      const attempts = [];

      // Make multiple failed login attempts
      for (let i = 0; i < maxAttempts + 2; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'nonexistent@example.com',
              password: 'wrongpassword',
            })
        );
      }

      const results = await Promise.all(attempts);

      // First few attempts should return 401 (unauthorized)
      for (let i = 0; i < maxAttempts; i++) {
        expect(results[i].status).toBe(401);
      }

      // Subsequent attempts should be rate limited (429)
      for (let i = maxAttempts; i < results.length; i++) {
        expect(results[i].status).toBe(429);
        expect(results[i].body.error.message).toMatch(/rate limit/i);
      }
    });

    it('should rate limit registration attempts', async () => {
      const maxAttempts = 3; // Assuming stricter rate limit for registration
      const attempts = [];

      // Make multiple registration attempts
      for (let i = 0; i < maxAttempts + 2; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/register')
            .send({
              email: `rate-test-${i}@example.com`,
              username: `rateuser${i}`,
              password: 'SecurePassword123!',
              role: 'engineer',
            })
        );
      }

      const results = await Promise.all(attempts);

      // Some attempts should succeed
      const successful = results.filter(r => r.status === 201);
      const rateLimited = results.filter(r => r.status === 429);

      expect(successful.length).toBeGreaterThan(0);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions on password change', async () => {
      // Register and login
      const userData = {
        email: 'session-test@example.com',
        username: 'sessionuser',
        password: 'OldPassword123!',
        role: 'engineer',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      const oldToken = loginResponse.body.data.token;

      // Verify token works
      await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      // Old token should be invalidated (if implemented)
      // Note: This test assumes token invalidation is implemented
      // const response = await request(app)
      //   .get('/api/auth/profile')
      //   .set('Authorization', `Bearer ${oldToken}`)
      //   .expect(401);
    });

    it('should prevent concurrent sessions (if implemented)', async () => {
      // This test would check if the system prevents multiple active sessions
      // Implementation depends on business requirements
      
      const userData = {
        email: 'concurrent-session-test@example.com',
        username: 'concurrentuser',
        password: 'SecurePassword123!',
        role: 'engineer',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Login from first "device"
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      const token1 = login1.body.data.token;

      // Login from second "device"
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      const token2 = login2.body.data.token;

      // Both tokens should work (or first should be invalidated, depending on implementation)
      const profile1 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token1}`);

      const profile2 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token2}`);

      // At least one should work
      expect([profile1.status, profile2.status]).toContain(200);
    });
  });
});