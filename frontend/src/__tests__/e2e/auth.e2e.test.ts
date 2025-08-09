import { test, expect } from '@playwright/test';

test.describe('Authentication E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should register a new user and login', async ({ page }) => {
    // Navigate to register page
    await page.click('text=Sign Up');
    await expect(page).toHaveURL('/register');

    // Fill registration form
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;
    const testUsername = `testuser${timestamp}`;

    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="username-input"]', testUsername);
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');
    await page.selectOption('[data-testid="role-select"]', 'engineer');

    // Submit registration
    await page.click('[data-testid="register-button"]');

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-welcome"]')).toContainText(testUsername);

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL('/login');

    // Login with the same credentials
    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Should redirect to dashboard after successful login
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-welcome"]')).toContainText(testUsername);
  });

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.click('text=Sign Up');

    // Try to submit empty form
    await page.click('[data-testid="register-button"]');

    // Should show validation errors
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="username-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();

    // Fill invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="email-error"]')).toContainText('Invalid email format');

    // Fill weak password
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', '123');
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters');

    // Fill mismatched passwords
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'different123');
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('Passwords do not match');
  });

  test('should show error for invalid login credentials', async ({ page }) => {
    await page.goto('/login');

    // Try invalid credentials
    await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    // Should show error message
    await expect(page.locator('[data-testid="login-error"]')).toContainText('Invalid credentials');
    await expect(page).toHaveURL('/login');
  });

  test('should handle forgot password flow', async ({ page }) => {
    await page.goto('/login');
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL('/forgot-password');

    // Fill email and submit
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.click('[data-testid="reset-password-button"]');

    // Should show success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset email sent');
  });

  test('should protect routes that require authentication', async ({ page }) => {
    // Try to access protected route without authentication
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
    await expect(page.locator('[data-testid="login-required-message"]')).toContainText('Please log in to continue');
  });

  test('should maintain session across page refreshes', async ({ page }) => {
    // Register and login
    await page.click('text=Sign Up');
    const timestamp = Date.now();
    const testEmail = `session-test-${timestamp}@example.com`;
    const testUsername = `sessionuser${timestamp}`;

    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="username-input"]', testUsername);
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');
    await page.selectOption('[data-testid="role-select"]', 'engineer');
    await page.click('[data-testid="register-button"]');

    await expect(page).toHaveURL('/dashboard');

    // Refresh page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-welcome"]')).toContainText(testUsername);
  });

  test('should handle session expiration', async ({ page }) => {
    // This test would require mocking token expiration
    // For now, we'll test the logout functionality
    
    // Register and login first
    await page.click('text=Sign Up');
    const timestamp = Date.now();
    const testEmail = `expire-test-${timestamp}@example.com`;
    const testUsername = `expireuser${timestamp}`;

    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="username-input"]', testUsername);
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');
    await page.selectOption('[data-testid="role-select"]', 'engineer');
    await page.click('[data-testid="register-button"]');

    await expect(page).toHaveURL('/dashboard');

    // Simulate session expiration by clearing localStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Try to navigate to a protected route
    await page.goto('/files');

    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });
});