# CAD AI Platform - Comprehensive Testing Guide

This document provides a complete overview of the testing strategy and implementation for the CAD AI Platform.

## Testing Strategy Overview

Our testing approach follows a multi-layered strategy to ensure comprehensive coverage:

1. **Unit Tests** - Test individual functions and components in isolation
2. **Integration Tests** - Test API endpoints and database operations
3. **End-to-End Tests** - Test complete user workflows
4. **Performance Tests** - Test system performance under load
5. **Security Tests** - Test authentication, authorization, and input validation
6. **Accessibility Tests** - Ensure WCAG 2.1 AA compliance

## Test Structure

```
├── backend/
│   ├── src/__tests__/
│   │   ├── setup.ts                    # Global test setup
│   │   ├── unit/                       # Unit tests
│   │   │   └── services/               # Service layer tests
│   │   ├── integration/                # API integration tests
│   │   ├── performance/                # Performance tests
│   │   └── security/                   # Security tests
│   └── vitest.config.ts                # Backend test configuration
├── frontend/
│   ├── src/__tests__/
│   │   ├── unit/                       # Component unit tests
│   │   ├── integration/                # Frontend integration tests
│   │   ├── e2e/                        # End-to-end tests
│   │   ├── accessibility/              # Accessibility tests
│   │   └── fixtures/                   # Test data files
│   ├── vitest.config.ts                # Frontend test configuration
│   └── playwright.config.ts            # E2E test configuration
├── ai-service/
│   └── tests/                          # Python tests
└── .github/workflows/test.yml          # CI/CD pipeline
```

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:security       # Security tests only
npm run test:performance    # Performance tests only

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests
npm run test:a11y          # Accessibility tests

# Run with coverage
npm run test:coverage

# Visual regression tests
npm run test:visual
```

### AI Service Tests

```bash
cd ai-service

# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test files
pytest tests/test_training.py
```

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions, methods, and components in isolation.

**Coverage**:
- Service layer functions
- Utility functions
- React components
- Data models
- Validation logic

**Example**:
```typescript
// backend/src/__tests__/unit/services/AuthService.unit.test.ts
describe('AuthService', () => {
  it('should hash passwords securely', async () => {
    const password = 'testpassword123';
    const hashedPassword = await authService.hashPassword(password);
    
    expect(hashedPassword).not.toBe(password);
    expect(hashedPassword).toMatch(/^\$2[aby]\$\d+\$/);
  });
});
```

### 2. Integration Tests

**Purpose**: Test API endpoints and database operations with real dependencies.

**Coverage**:
- REST API endpoints
- Database operations
- Authentication flows
- File upload/download
- Search functionality

**Example**:
```typescript
// backend/src/__tests__/integration/auth.integration.test.ts
describe('POST /api/auth/register', () => {
  it('should register a new user successfully', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'engineer',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('test@example.com');
  });
});
```

### 3. End-to-End Tests

**Purpose**: Test complete user workflows from the browser perspective.

**Coverage**:
- User registration and login
- File upload workflows
- Search functionality
- CAD file visualization
- Admin dashboard operations

**Example**:
```typescript
// frontend/src/__tests__/e2e/auth.e2e.test.ts
test('should register and login user', async ({ page }) => {
  await page.goto('/register');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="register-button"]');
  
  await expect(page).toHaveURL('/dashboard');
});
```

### 4. Performance Tests

**Purpose**: Ensure the system performs well under various load conditions.

**Coverage**:
- Concurrent user authentication
- File upload performance
- Search query response times
- Database query optimization
- Memory usage monitoring

**Example**:
```typescript
// backend/src/__tests__/performance/load.test.ts
it('should handle concurrent file uploads', async () => {
  const concurrentUploads = 20;
  const promises = Array.from({ length: concurrentUploads }, (_, i) => {
    return request(app)
      .post('/api/files/upload')
      .attach('files', testFileContent, `test-${i}.dwg`);
  });

  const results = await Promise.all(promises);
  expect(results.every(r => r.status === 201)).toBe(true);
});
```

### 5. Security Tests

**Purpose**: Verify security measures and prevent common vulnerabilities.

**Coverage**:
- Authentication security
- Authorization checks
- Input validation
- SQL injection prevention
- XSS prevention
- Rate limiting
- JWT token security

**Example**:
```typescript
// backend/src/__tests__/security/auth-security.test.ts
it('should prevent SQL injection in login', async () => {
  const maliciousEmail = "admin@example.com'; DROP TABLE users; --";
  
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: maliciousEmail,
      password: 'password123',
    });

  expect([400, 401]).toContain(response.status);
  
  // Verify users table still exists
  const result = await DatabaseService.query('SELECT COUNT(*) FROM users');
  expect(result.rows[0].count).toBeDefined();
});
```

### 6. Accessibility Tests

**Purpose**: Ensure the application is accessible to users with disabilities.

**Coverage**:
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation
- Color contrast
- Form accessibility
- ARIA attributes

**Example**:
```typescript
// frontend/src/__tests__/accessibility/auth.a11y.test.ts
it('should not have accessibility violations', async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Test Data Management

### Test Database

- Uses separate test database (`cad_ai_test`)
- Runs migrations before tests
- Cleans up data between tests
- Uses transactions for isolation

### Mock Data

- Centralized test utilities in `testUtils`
- Consistent mock data across tests
- Factory functions for creating test objects

### External Service Mocking

- AWS S3 operations mocked
- Redis operations mocked
- AI service calls mocked
- Email service mocked

## Coverage Requirements

### Minimum Coverage Thresholds

- **Backend**: 80% lines, functions, branches, statements
- **Frontend**: 75% lines, functions, branches, statements
- **AI Service**: 80% lines, functions, branches, statements

### Coverage Reports

- Generated in HTML and LCOV formats
- Uploaded to Codecov in CI/CD
- Excludes test files, migrations, and configuration

## Continuous Integration

### GitHub Actions Workflow

The CI/CD pipeline runs the following jobs in parallel:

1. **Backend Unit Tests** - Fast feedback on core logic
2. **Backend Integration Tests** - API and database testing
3. **Backend Security Tests** - Security vulnerability testing
4. **AI Service Tests** - Python service testing
5. **Frontend Unit Tests** - Component testing
6. **Frontend Accessibility Tests** - A11y compliance
7. **Performance Tests** - Load and performance testing
8. **E2E Tests** - Full workflow testing
9. **Code Quality** - Linting and type checking

### Test Environment

- PostgreSQL 15 database
- Redis 7 cache
- Node.js 18 runtime
- Python 3.11 runtime
- Playwright browsers for E2E tests

## Best Practices

### Writing Tests

1. **Descriptive Test Names**: Use clear, descriptive test names that explain what is being tested
2. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification phases
3. **Test One Thing**: Each test should verify one specific behavior
4. **Use Test Data Builders**: Create reusable functions for generating test data
5. **Mock External Dependencies**: Mock external services and APIs for reliable tests

### Test Organization

1. **Group Related Tests**: Use `describe` blocks to group related test cases
2. **Setup and Teardown**: Use `beforeEach`/`afterEach` for test isolation
3. **Shared Utilities**: Extract common test utilities to shared modules
4. **Test File Naming**: Use consistent naming conventions (`.test.ts`, `.spec.ts`)

### Performance Considerations

1. **Parallel Execution**: Run tests in parallel where possible
2. **Database Transactions**: Use transactions for test isolation
3. **Selective Testing**: Run only relevant tests during development
4. **Test Timeouts**: Set appropriate timeouts for different test types

## Debugging Tests

### Common Issues

1. **Flaky Tests**: Tests that pass/fail inconsistently
   - Solution: Improve test isolation, add proper waits, mock time-dependent code

2. **Slow Tests**: Tests that take too long to run
   - Solution: Mock external services, use test databases, optimize queries

3. **Test Pollution**: Tests affecting each other
   - Solution: Proper cleanup, database transactions, isolated test data

### Debugging Tools

- **VS Code Debugger**: Set breakpoints in test files
- **Console Logging**: Add temporary logging for debugging
- **Test Reporters**: Use detailed reporters for better error messages
- **Coverage Reports**: Identify untested code paths

## Monitoring and Metrics

### Test Metrics

- Test execution time
- Test success/failure rates
- Code coverage trends
- Flaky test identification

### Performance Metrics

- API response times
- Database query performance
- Memory usage patterns
- Concurrent user handling

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all test types are covered
3. Maintain coverage thresholds
4. Update test documentation
5. Run full test suite before submitting PR

## Troubleshooting

### Common Test Failures

1. **Database Connection Issues**
   ```bash
   # Check database is running
   docker ps | grep postgres
   
   # Check connection string
   echo $DATABASE_URL
   ```

2. **Port Conflicts**
   ```bash
   # Kill processes on test ports
   lsof -ti:3000 | xargs kill -9
   lsof -ti:5173 | xargs kill -9
   ```

3. **Missing Dependencies**
   ```bash
   # Reinstall dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Browser Issues (E2E Tests)**
   ```bash
   # Reinstall Playwright browsers
   npx playwright install --with-deps
   ```

### Getting Help

- Check test logs for detailed error messages
- Review CI/CD pipeline logs
- Consult team documentation
- Ask in team chat for assistance

## Future Improvements

1. **Visual Regression Testing**: Add screenshot comparison tests
2. **Contract Testing**: Implement API contract testing with Pact
3. **Chaos Engineering**: Add fault injection testing
4. **Load Testing**: Implement comprehensive load testing with k6
5. **Mutation Testing**: Add mutation testing for test quality assessment