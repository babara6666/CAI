# Authentication and Authorization System

This document describes the comprehensive authentication and authorization system implemented for the CAD AI Platform.

## Overview

The authentication system provides:
- JWT-based authentication with access and refresh tokens
- Role-based access control (admin, engineer, viewer)
- Multi-factor authentication (MFA) for admin accounts
- Password strength validation
- Secure password hashing with bcrypt
- Request validation using Joi schemas
- Comprehensive error handling
- Full test coverage

## Architecture

### Components

1. **AuthService** (`src/services/AuthService.ts`)
   - User registration and login
   - JWT token generation and verification
   - Password validation and hashing

2. **MFAService** (`src/services/MFAService.ts`)
   - TOTP-based multi-factor authentication
   - Backup codes generation and management
   - MFA setup and verification

3. **Authentication Middleware** (`src/middleware/auth.ts`)
   - JWT token verification
   - Role-based authorization
   - Request authentication

4. **Validation Schemas** (`src/validation/authValidation.ts`)
   - Input validation using Joi
   - Password strength requirements
   - Email format validation

5. **Auth Routes** (`src/routes/auth.ts`)
   - RESTful API endpoints
   - Request handling and response formatting
   - Error handling

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "StrongPassword123!",
  "role": "engineer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "username",
      "role": "engineer",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "isActive": true
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token"
    }
  }
}
```

#### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "mfaCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "username",
      "role": "engineer",
      "lastLoginAt": "2023-01-01T00:00:00.000Z",
      "isActive": true,
      "preferences": {
        "theme": "light",
        "notificationSettings": {
          "emailNotifications": true,
          "trainingComplete": true,
          "searchResults": false,
          "systemUpdates": true
        }
      }
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token"
    }
  }
}
```

#### POST /api/auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "new-jwt-access-token",
      "refreshToken": "new-jwt-refresh-token"
    }
  }
}
```

#### POST /api/auth/logout
Logout current user (client-side token removal).

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

#### GET /api/auth/me
Get current user profile.

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "username",
      "role": "engineer",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z",
      "lastLoginAt": "2023-01-01T00:00:00.000Z",
      "isActive": true,
      "preferences": {
        "theme": "light",
        "notificationSettings": {
          "emailNotifications": true,
          "trainingComplete": true,
          "searchResults": false,
          "systemUpdates": true
        }
      }
    }
  }
}
```

#### POST /api/auth/change-password
Change user password.

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

### Multi-Factor Authentication Endpoints

#### POST /api/auth/mfa/setup
Setup MFA for current user (admin only).

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "TESTSECRET123456789012345678901234",
    "qrCodeUrl": "otpauth://totp/CAD%20AI%20Platform:admin@example.com?secret=TESTSECRET123456789012345678901234&issuer=CAD%20AI%20Platform",
    "backupCodes": [
      "BACKUP01",
      "BACKUP02",
      "..."
    ]
  }
}
```

#### POST /api/auth/mfa/enable
Enable MFA after verification (admin only).

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Request Body:**
```json
{
  "verificationCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "MFA enabled successfully"
  }
}
```

#### POST /api/auth/mfa/disable
Disable MFA (admin only).

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Request Body:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "MFA disabled successfully"
  }
}
```

#### GET /api/auth/mfa/status
Get MFA status for current user.

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "required": true
  }
}
```

#### POST /api/auth/mfa/regenerate-backup-codes
Regenerate backup codes (admin only).

**Headers:**
```
Authorization: Bearer jwt-access-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "NEWBACKUP01",
      "NEWBACKUP02",
      "..."
    ]
  }
}
```

## Middleware Usage

### Authentication Middleware

```typescript
import { authenticate } from './middleware/auth.js';

// Require authentication for all routes
app.use('/api/protected', authenticate);
```

### Authorization Middleware

```typescript
import { adminOnly, adminOrEngineer, allRoles } from './middleware/auth.js';

// Admin only routes
app.use('/api/admin', authenticate, adminOnly);

// Admin or Engineer routes
app.use('/api/files', authenticate, adminOrEngineer);

// All authenticated users
app.use('/api/search', authenticate, allRoles);
```

### Optional Authentication

```typescript
import { optionalAuth } from './middleware/auth.js';

// Optional authentication (user may or may not be logged in)
app.use('/api/public', optionalAuth);
```

## Security Features

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

### JWT Configuration
- Access tokens expire in 15 minutes (configurable)
- Refresh tokens expire in 7 days (configurable)
- Separate secrets for access and refresh tokens
- Token type validation

### Multi-Factor Authentication
- TOTP-based (Time-based One-Time Password)
- Required for admin accounts
- Backup codes for recovery
- QR code generation for authenticator apps

### Password Security
- bcrypt hashing with 12 salt rounds
- Secure password comparison
- Password change requires current password verification

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "requestId": "unique-request-id",
    "details": ["Additional error details"],
    "suggestions": ["Suggested actions"]
  }
}
```

### Common Error Codes
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `VALIDATION_ERROR`: Input validation failed
- `REGISTRATION_FAILED`: User registration failed
- `LOGIN_FAILED`: Login attempt failed
- `INVALID_TOKEN`: JWT token is invalid or expired
- `MFA_REQUIRED`: Multi-factor authentication required
- `INVALID_MFA_CODE`: MFA code is invalid

## Environment Variables

```bash
# JWT Configuration
JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Security Configuration
BCRYPT_ROUNDS=12
```

## Testing

The authentication system includes comprehensive tests:

- **Unit Tests**: Service and middleware logic
- **Integration Tests**: API endpoint testing
- **Security Tests**: Authentication and authorization flows

### Running Tests

```bash
npm run test
npm run test:watch
npm run test:run
```

### Test Coverage

- AuthService: Registration, login, token management
- MFAService: MFA setup, verification, backup codes
- Auth Middleware: Authentication and authorization
- Auth Routes: API endpoint functionality
- Validation: Input validation and error handling

## Usage Examples

### Basic Authentication Flow

```typescript
// 1. Register user
const registerResponse = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    username: 'username',
    password: 'StrongPassword123!',
    role: 'engineer'
  })
});

// 2. Login user
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'StrongPassword123!'
  })
});

const { tokens } = await loginResponse.json();

// 3. Use access token for authenticated requests
const profileResponse = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${tokens.accessToken}`
  }
});
```

### MFA Setup Flow (Admin Users)

```typescript
// 1. Setup MFA
const setupResponse = await fetch('/api/auth/mfa/setup', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const { secret, qrCodeUrl, backupCodes } = await setupResponse.json();

// 2. User scans QR code with authenticator app

// 3. Enable MFA with verification code
const enableResponse = await fetch('/api/auth/mfa/enable', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    verificationCode: '123456' // From authenticator app
  })
});

// 4. Future logins require MFA code
const loginWithMFA = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    mfaCode: '654321' // From authenticator app
  })
});
```

## Best Practices

1. **Token Storage**: Store tokens securely on the client side (httpOnly cookies or secure storage)
2. **Token Refresh**: Implement automatic token refresh before expiration
3. **Error Handling**: Handle authentication errors gracefully in the UI
4. **MFA Backup**: Store backup codes securely for account recovery
5. **Password Policy**: Enforce strong password requirements
6. **Rate Limiting**: Implement rate limiting for authentication endpoints
7. **Audit Logging**: Log authentication events for security monitoring

## Future Enhancements

1. **OAuth Integration**: Support for Google, GitHub, etc.
2. **WebAuthn**: Passwordless authentication with biometrics
3. **Session Management**: Active session tracking and management
4. **Password Reset**: Email-based password reset functionality
5. **Account Lockout**: Temporary lockout after failed attempts
6. **Device Management**: Track and manage user devices
7. **Advanced MFA**: SMS, email, or hardware token support