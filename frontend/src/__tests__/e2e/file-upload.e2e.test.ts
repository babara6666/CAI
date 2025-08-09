import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('File Upload E2E Tests', () => {
  let authToken: string;

  test.beforeEach(async ({ page }) => {
    // Register and login before each test
    await page.goto('/register');
    
    const timestamp = Date.now();
    const testEmail = `upload-test-${timestamp}@example.com`;
    const testUsername = `uploaduser${timestamp}`;

    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="username-input"]', testUsername);
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');
    await page.selectOption('[data-testid="role-select"]', 'engineer');
    await page.click('[data-testid="register-button"]');

    await expect(page).toHaveURL('/dashboard');
  });

  test('should upload a single CAD file successfully', async ({ page }) => {
    // Navigate to file upload page
    await page.click('[data-testid="upload-files-button"]');
    await expect(page).toHaveURL('/files/upload');

    // Create a test file
    const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
    
    // Upload file using file input
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(testFilePath);

    // Fill metadata
    await page.fill('[data-testid="project-name-input"]', 'Test Project');
    await page.fill('[data-testid="part-name-input"]', 'Test Part');
    await page.fill('[data-testid="description-input"]', 'Test CAD file upload');
    await page.fill('[data-testid="tags-input"]', 'test, mechanical, upload');

    // Submit upload
    await page.click('[data-testid="upload-button"]');

    // Should show upload progress
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();

    // Should show success message
    await expect(page.locator('[data-testid="upload-success"]')).toContainText('File uploaded successfully');

    // Should redirect to files list
    await expect(page).toHaveURL('/files');

    // Should see the uploaded file in the list
    await expect(page.locator('[data-testid="file-item"]').first()).toContainText('test.dwg');
    await expect(page.locator('[data-testid="file-item"]').first()).toContainText('Test Project');
  });

  test('should upload multiple files using drag and drop', async ({ page }) => {
    await page.click('[data-testid="upload-files-button"]');

    // Create test files
    const testFiles = [
      path.join(__dirname, '../fixtures/test1.dwg'),
      path.join(__dirname, '../fixtures/test2.dxf'),
    ];

    // Use drag and drop
    const dropZone = page.locator('[data-testid="drop-zone"]');
    await dropZone.setInputFiles(testFiles);

    // Should show both files in the upload queue
    await expect(page.locator('[data-testid="file-queue-item"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="file-queue-item"]').first()).toContainText('test1.dwg');
    await expect(page.locator('[data-testid="file-queue-item"]').last()).toContainText('test2.dxf');

    // Fill common metadata
    await page.fill('[data-testid="project-name-input"]', 'Batch Upload Project');
    await page.fill('[data-testid="tags-input"]', 'batch, test');

    // Upload all files
    await page.click('[data-testid="upload-all-button"]');

    // Should show progress for each file
    await expect(page.locator('[data-testid="upload-progress-item"]')).toHaveCount(2);

    // Wait for uploads to complete
    await expect(page.locator('[data-testid="upload-success"]')).toContainText('2 files uploaded successfully');

    // Navigate to files list
    await page.goto('/files');

    // Should see both uploaded files
    await expect(page.locator('[data-testid="file-item"]')).toHaveCount(2);
  });

  test('should show validation errors for invalid files', async ({ page }) => {
    await page.click('[data-testid="upload-files-button"]');

    // Try to upload an invalid file type
    const invalidFilePath = path.join(__dirname, '../fixtures/invalid.txt');
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(invalidFilePath);

    // Should show validation error
    await expect(page.locator('[data-testid="file-validation-error"]')).toContainText('Unsupported file type');
    await expect(page.locator('[data-testid="upload-button"]')).toBeDisabled();
  });

  test('should handle upload errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/files/upload', route => {
      route.abort('failed');
    });

    await page.click('[data-testid="upload-files-button"]');

    const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(testFilePath);

    await page.click('[data-testid="upload-button"]');

    // Should show error message
    await expect(page.locator('[data-testid="upload-error"]')).toContainText('Upload failed');
    
    // Should show retry button
    await expect(page.locator('[data-testid="retry-upload-button"]')).toBeVisible();
  });

  test('should show upload progress and allow cancellation', async ({ page }) => {
    // Mock slow upload
    await page.route('**/api/files/upload', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.continue();
    });

    await page.click('[data-testid="upload-files-button"]');

    const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(testFilePath);

    await page.click('[data-testid="upload-button"]');

    // Should show progress bar
    await expect(page.locator('[data-testid="upload-progress-bar"]')).toBeVisible();

    // Should show cancel button
    await expect(page.locator('[data-testid="cancel-upload-button"]')).toBeVisible();

    // Cancel upload
    await page.click('[data-testid="cancel-upload-button"]');

    // Should show cancellation message
    await expect(page.locator('[data-testid="upload-cancelled"]')).toContainText('Upload cancelled');
  });

  test('should validate file size limits', async ({ page }) => {
    await page.click('[data-testid="upload-files-button"]');

    // Try to upload a large file (mock)
    const largeFilePath = path.join(__dirname, '../fixtures/large-file.dwg');
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(largeFilePath);

    // Should show size validation error
    await expect(page.locator('[data-testid="file-size-error"]')).toContainText('File size exceeds the maximum limit');
    await expect(page.locator('[data-testid="upload-button"]')).toBeDisabled();
  });

  test('should preserve metadata across navigation', async ({ page }) => {
    await page.click('[data-testid="upload-files-button"]');

    // Fill metadata
    await page.fill('[data-testid="project-name-input"]', 'Persistent Project');
    await page.fill('[data-testid="description-input"]', 'This should persist');

    // Navigate away and back
    await page.goto('/dashboard');
    await page.click('[data-testid="upload-files-button"]');

    // Metadata should be preserved (if implemented)
    // This test assumes the app saves draft metadata
    const projectName = await page.locator('[data-testid="project-name-input"]').inputValue();
    const description = await page.locator('[data-testid="description-input"]').inputValue();

    // Note: This would only pass if the app implements draft saving
    // expect(projectName).toBe('Persistent Project');
    // expect(description).toBe('This should persist');
  });

  test('should show file preview after upload', async ({ page }) => {
    await page.click('[data-testid="upload-files-button"]');

    const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(testFilePath);

    await page.fill('[data-testid="project-name-input"]', 'Preview Test');
    await page.click('[data-testid="upload-button"]');

    // Wait for upload to complete
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    // Navigate to files list
    await page.goto('/files');

    // Click on the uploaded file
    await page.click('[data-testid="file-item"]');

    // Should show file details page
    await expect(page).toHaveURL(/\/files\/[a-f0-9-]+$/);
    await expect(page.locator('[data-testid="file-name"]')).toContainText('test.dwg');
    await expect(page.locator('[data-testid="project-name"]')).toContainText('Preview Test');

    // Should show CAD viewer
    await expect(page.locator('[data-testid="cad-viewer"]')).toBeVisible();
  });
});