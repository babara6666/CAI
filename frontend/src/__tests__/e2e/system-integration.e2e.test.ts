import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.describe('System Integration E2E Tests', () => {
  let page: Page;
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    
    // Setup test user and get auth token
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    
    // Wait for successful login and redirect
    await page.waitForURL('/dashboard');
    
    // Extract auth token from localStorage
    authToken = await page.evaluate(() => localStorage.getItem('authToken'));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.describe('Complete User Workflows', () => {
    test('End-to-end file upload and management workflow', async () => {
      // Navigate to file upload
      await page.goto('/dashboard');
      await page.click('[data-testid="upload-files-button"]');
      
      // Upload CAD file
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      await page.setInputFiles('[data-testid="file-input"]', testFilePath);
      
      // Fill metadata
      await page.fill('[data-testid="project-name-input"]', 'E2E Test Project');
      await page.fill('[data-testid="tags-input"]', 'e2e, test, integration');
      await page.fill('[data-testid="description-input"]', 'End-to-end test file');
      
      // Submit upload
      await page.click('[data-testid="upload-submit-button"]');
      
      // Wait for upload completion
      await page.waitForSelector('[data-testid="upload-success-message"]');
      
      // Verify file appears in file grid
      await page.goto('/files');
      await page.waitForSelector('[data-testid="file-grid"]');
      
      const fileCard = page.locator('[data-testid="file-card"]').first();
      await expect(fileCard).toBeVisible();
      await expect(fileCard.locator('[data-testid="file-name"]')).toContainText('test.dwg');
      
      // Test file preview
      await fileCard.click();
      await page.waitForSelector('[data-testid="cad-viewer"]');
      
      // Verify 3D viewer loads
      const viewer = page.locator('[data-testid="threejs-viewer"]');
      await expect(viewer).toBeVisible();
      
      // Test viewer controls
      await page.click('[data-testid="zoom-in-button"]');
      await page.click('[data-testid="rotate-button"]');
      await page.click('[data-testid="reset-view-button"]');
      
      // Test layer panel
      await page.click('[data-testid="layers-panel-toggle"]');
      await expect(page.locator('[data-testid="layers-panel"]')).toBeVisible();
      
      // Close viewer
      await page.click('[data-testid="close-viewer-button"]');
    });

    test('End-to-end search workflow with AI', async () => {
      await page.goto('/search');
      
      // Test natural language search
      await page.fill('[data-testid="search-input"]', 'find mechanical parts with gears');
      await page.click('[data-testid="search-button"]');
      
      // Wait for search results
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Verify results display
      const results = page.locator('[data-testid="search-result-item"]');
      await expect(results.first()).toBeVisible();
      
      // Test result interaction
      const firstResult = results.first();
      await expect(firstResult.locator('[data-testid="relevance-score"]')).toBeVisible();
      await expect(firstResult.locator('[data-testid="file-thumbnail"]')).toBeVisible();
      
      // Test feedback mechanism
      await firstResult.locator('[data-testid="feedback-button"]').click();
      await page.selectOption('[data-testid="rating-select"]', '5');
      await page.fill('[data-testid="feedback-comment"]', 'Very relevant result');
      await page.click('[data-testid="submit-feedback-button"]');
      
      // Verify feedback submitted
      await expect(page.locator('[data-testid="feedback-success"]')).toBeVisible();
      
      // Test search filters
      await page.click('[data-testid="filters-toggle"]');
      await page.fill('[data-testid="tags-filter"]', 'mechanical');
      await page.selectOption('[data-testid="date-range-filter"]', 'last-week');
      await page.click('[data-testid="apply-filters-button"]');
      
      // Verify filtered results
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Test search suggestions
      await page.fill('[data-testid="search-input"]', 'mech');
      await page.waitForSelector('[data-testid="search-suggestions"]');
      
      const suggestions = page.locator('[data-testid="suggestion-item"]');
      await expect(suggestions.first()).toBeVisible();
      await suggestions.first().click();
      
      // Verify suggestion applied
      await expect(page.locator('[data-testid="search-input"]')).toHaveValue('mechanical');
    });

    test('End-to-end dataset creation and model training workflow', async () => {
      await page.goto('/ai/datasets');
      
      // Create new dataset
      await page.click('[data-testid="create-dataset-button"]');
      await page.fill('[data-testid="dataset-name-input"]', 'E2E Test Dataset');
      await page.fill('[data-testid="dataset-description-input"]', 'Dataset for end-to-end testing');
      
      // Select files for dataset
      await page.click('[data-testid="select-files-button"]');
      await page.waitForSelector('[data-testid="file-selection-modal"]');
      
      // Select multiple files
      const fileCheckboxes = page.locator('[data-testid="file-checkbox"]');
      await fileCheckboxes.first().check();
      await fileCheckboxes.nth(1).check();
      await fileCheckboxes.nth(2).check();
      
      await page.click('[data-testid="confirm-selection-button"]');
      
      // Add labels
      await page.fill('[data-testid="label-input-0"]', 'mechanical');
      await page.fill('[data-testid="label-input-1"]', 'electrical');
      await page.fill('[data-testid="label-input-2"]', 'structural');
      
      // Create dataset
      await page.click('[data-testid="create-dataset-submit"]');
      
      // Wait for dataset creation
      await page.waitForSelector('[data-testid="dataset-created-success"]');
      
      // Navigate to model training
      await page.click('[data-testid="train-model-button"]');
      await page.waitForSelector('[data-testid="training-config-form"]');
      
      // Configure training parameters
      await page.fill('[data-testid="model-name-input"]', 'E2E Test Model');
      await page.selectOption('[data-testid="architecture-select"]', 'cnn');
      await page.fill('[data-testid="learning-rate-input"]', '0.001');
      await page.fill('[data-testid="batch-size-input"]', '32');
      await page.fill('[data-testid="epochs-input"]', '10');
      
      // Start training
      await page.click('[data-testid="start-training-button"]');
      
      // Monitor training progress
      await page.waitForSelector('[data-testid="training-dashboard"]');
      
      // Verify training metrics display
      await expect(page.locator('[data-testid="training-progress-bar"]')).toBeVisible();
      await expect(page.locator('[data-testid="loss-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="accuracy-chart"]')).toBeVisible();
      
      // Wait for training completion (or timeout for demo)
      await page.waitForTimeout(5000);
      
      // Check training status
      const status = await page.locator('[data-testid="training-status"]').textContent();
      expect(['Training', 'Completed', 'In Progress']).toContain(status);
    });

    test('End-to-end admin dashboard workflow', async () => {
      // Login as admin
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@example.com');
      await page.fill('[data-testid="password-input"]', 'AdminPassword123!');
      await page.click('[data-testid="login-button"]');
      
      await page.waitForURL('/dashboard');
      
      // Navigate to admin dashboard
      await page.goto('/admin');
      await page.waitForSelector('[data-testid="admin-dashboard"]');
      
      // Test user management
      await page.click('[data-testid="user-management-tab"]');
      await page.waitForSelector('[data-testid="users-table"]');
      
      // Verify user list
      const userRows = page.locator('[data-testid="user-row"]');
      await expect(userRows.first()).toBeVisible();
      
      // Test user role modification
      await userRows.first().locator('[data-testid="edit-user-button"]').click();
      await page.waitForSelector('[data-testid="edit-user-modal"]');
      
      await page.selectOption('[data-testid="user-role-select"]', 'engineer');
      await page.click('[data-testid="save-user-button"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="user-updated-success"]')).toBeVisible();
      
      // Test system metrics
      await page.click('[data-testid="system-metrics-tab"]');
      await page.waitForSelector('[data-testid="metrics-dashboard"]');
      
      // Verify metrics display
      await expect(page.locator('[data-testid="cpu-usage-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="memory-usage-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="storage-usage-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="active-users-count"]')).toBeVisible();
      
      // Test audit logs
      await page.click('[data-testid="audit-logs-tab"]');
      await page.waitForSelector('[data-testid="audit-logs-table"]');
      
      // Verify audit log entries
      const logRows = page.locator('[data-testid="audit-log-row"]');
      await expect(logRows.first()).toBeVisible();
      
      // Test log filtering
      await page.selectOption('[data-testid="action-filter"]', 'file_upload');
      await page.click('[data-testid="apply-log-filter"]');
      
      // Verify filtered results
      await page.waitForSelector('[data-testid="audit-logs-table"]');
      
      // Test report generation
      await page.click('[data-testid="generate-report-button"]');
      await page.selectOption('[data-testid="report-type-select"]', 'usage');
      await page.selectOption('[data-testid="report-format-select"]', 'pdf');
      await page.click('[data-testid="generate-report-submit"]');
      
      // Wait for report generation
      await page.waitForSelector('[data-testid="report-generated-success"]');
      
      // Verify download link
      await expect(page.locator('[data-testid="download-report-link"]')).toBeVisible();
    });
  });

  test.describe('Performance and Load Testing', () => {
    test('Multiple file uploads performance', async () => {
      await page.goto('/files');
      
      const startTime = Date.now();
      
      // Upload multiple files simultaneously
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      
      for (let i = 0; i < 5; i++) {
        await page.click('[data-testid="upload-files-button"]');
        await page.setInputFiles('[data-testid="file-input"]', testFilePath);
        await page.fill('[data-testid="project-name-input"]', `Performance Test ${i}`);
        await page.click('[data-testid="upload-submit-button"]');
        
        // Don't wait for completion, start next upload
        if (i < 4) {
          await page.waitForTimeout(100);
        }
      }
      
      // Wait for all uploads to complete
      await page.waitForSelector('[data-testid="all-uploads-complete"]', { timeout: 30000 });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Verify reasonable performance (should complete within 30 seconds)
      expect(totalTime).toBeLessThan(30000);
      
      // Verify all files uploaded successfully
      await page.goto('/files');
      const fileCards = page.locator('[data-testid="file-card"]');
      const fileCount = await fileCards.count();
      expect(fileCount).toBeGreaterThanOrEqual(5);
    });

    test('Search performance under load', async () => {
      await page.goto('/search');
      
      const searchQueries = [
        'mechanical parts',
        'electrical components',
        'structural elements',
        'hydraulic systems',
        'pneumatic devices'
      ];
      
      const startTime = Date.now();
      
      // Perform multiple searches rapidly
      for (const query of searchQueries) {
        await page.fill('[data-testid="search-input"]', query);
        await page.click('[data-testid="search-button"]');
        await page.waitForSelector('[data-testid="search-results"]');
        
        // Verify results load
        const results = page.locator('[data-testid="search-result-item"]');
        await expect(results.first()).toBeVisible();
        
        await page.waitForTimeout(500);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Verify reasonable search performance
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 5 searches
    });

    test('UI responsiveness during heavy operations', async () => {
      await page.goto('/ai/training');
      
      // Start a training job
      await page.click('[data-testid="start-training-button"]');
      
      // Verify UI remains responsive during training
      await page.click('[data-testid="navigation-menu"]');
      await expect(page.locator('[data-testid="nav-menu-items"]')).toBeVisible();
      
      // Navigate to different pages
      await page.click('[data-testid="nav-files"]');
      await page.waitForURL('/files');
      
      await page.click('[data-testid="nav-search"]');
      await page.waitForURL('/search');
      
      // Verify search still works during training
      await page.fill('[data-testid="search-input"]', 'test query');
      await page.click('[data-testid="search-button"]');
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Return to training dashboard
      await page.goto('/ai/training');
      
      // Verify training is still in progress
      await expect(page.locator('[data-testid="training-progress-bar"]')).toBeVisible();
    });
  });

  test.describe('Security and Access Control', () => {
    test('Unauthorized access prevention', async () => {
      // Clear authentication
      await page.evaluate(() => localStorage.removeItem('authToken'));
      
      // Try to access protected routes
      await page.goto('/files');
      await page.waitForURL('/login');
      
      await page.goto('/admin');
      await page.waitForURL('/login');
      
      await page.goto('/ai/datasets');
      await page.waitForURL('/login');
      
      // Verify login form is displayed
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });

    test('Role-based access control', async () => {
      // Login as regular user
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');
      
      await page.waitForURL('/dashboard');
      
      // Try to access admin routes
      await page.goto('/admin');
      
      // Should be redirected or show access denied
      await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
      
      // Verify admin navigation is not visible
      await expect(page.locator('[data-testid="admin-nav-item"]')).not.toBeVisible();
    });

    test('Input validation and XSS prevention', async () => {
      await page.goto('/files');
      await page.click('[data-testid="upload-files-button"]');
      
      // Try XSS in form fields
      await page.fill('[data-testid="project-name-input"]', '<script>alert("xss")</script>');
      await page.fill('[data-testid="tags-input"]', '<img src=x onerror=alert("xss")>');
      
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      await page.setInputFiles('[data-testid="file-input"]', testFilePath);
      
      await page.click('[data-testid="upload-submit-button"]');
      
      // Should show validation error, not execute script
      await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
      
      // Verify no alert was triggered
      page.on('dialog', async dialog => {
        throw new Error('XSS alert should not be triggered');
      });
    });
  });

  test.describe('Error Handling and Recovery', () => {
    test('Network error handling', async () => {
      await page.goto('/search');
      
      // Simulate network failure
      await page.route('**/api/search/**', route => route.abort());
      
      await page.fill('[data-testid="search-input"]', 'test query');
      await page.click('[data-testid="search-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="network-error"]')).toBeVisible();
      
      // Should show retry option
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
      
      // Restore network and retry
      await page.unroute('**/api/search/**');
      await page.click('[data-testid="retry-button"]');
      
      // Should work after retry
      await page.waitForSelector('[data-testid="search-results"]');
    });

    test('File upload error recovery', async () => {
      await page.goto('/files');
      await page.click('[data-testid="upload-files-button"]');
      
      // Simulate upload failure
      await page.route('**/api/files/upload', route => route.abort());
      
      const testFilePath = path.join(__dirname, '../fixtures/test.dwg');
      await page.setInputFiles('[data-testid="file-input"]', testFilePath);
      await page.click('[data-testid="upload-submit-button"]');
      
      // Should show upload error
      await expect(page.locator('[data-testid="upload-error"]')).toBeVisible();
      
      // Should show retry option
      await expect(page.locator('[data-testid="retry-upload-button"]')).toBeVisible();
      
      // Restore upload endpoint and retry
      await page.unroute('**/api/files/upload');
      await page.click('[data-testid="retry-upload-button"]');
      
      // Should succeed after retry
      await page.waitForSelector('[data-testid="upload-success-message"]');
    });

    test('Graceful degradation when AI services unavailable', async () => {
      await page.goto('/search');
      
      // Simulate AI service failure
      await page.route('**/api/ai/**', route => route.abort());
      
      await page.fill('[data-testid="search-input"]', 'intelligent search query');
      await page.click('[data-testid="search-button"]');
      
      // Should fallback to basic search
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Should show fallback notice
      await expect(page.locator('[data-testid="ai-fallback-notice"]')).toBeVisible();
      
      // Results should still be displayed
      const results = page.locator('[data-testid="search-result-item"]');
      await expect(results.first()).toBeVisible();
    });
  });
});