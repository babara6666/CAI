import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User.js';
import { User, UserRegistration } from '../types/index.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
  type: 'refresh';
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access';
}

export class AuthService {
  private static readonly ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret-key';
  private static readonly REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
  private static readonly ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  private static readonly REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  /**
   * Register a new user
   */
  static async register(userData: UserRegistration): Promise<AuthResult> {
    // Check if email already exists
    const existingUser = await UserModel.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    const existingUsername = await UserModel.findByUsername(userData.username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Validate password strength
    this.validatePassword(userData.password);

    // Create user
    const user = await UserModel.create(userData);
    
    // Generate tokens
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }

  /**
   * Login user with email and password
   */
  static async login(email: string, password: string): Promise<AuthResult> {
    // Authenticate user
    const user = await UserModel.authenticate(email, password);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, this.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get user
      const user = await UserModel.findById(payload.userId);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new tokens
      return await this.generateTokens(user);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify access token and return user
   */
  static async verifyAccessToken(token: string): Promise<User> {
    try {
      const payload = jwt.verify(token, this.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
      
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Get user
      const user = await UserModel.findById(payload.userId);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Generate access and refresh tokens for user
   */
  private static async generateTokens(user: User): Promise<AuthTokens> {
    const accessTokenPayload: AccessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    const refreshTokenPayload: RefreshTokenPayload = {
      userId: user.id,
      tokenVersion: 1, // In production, this should be stored in DB and incremented
      type: 'refresh'
    };

    const accessToken = jwt.sign(
      accessTokenPayload,
      this.ACCESS_TOKEN_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      refreshTokenPayload,
      this.REFRESH_TOKEN_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Validate password strength
   */
  private static validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one number');
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      throw new Error('Password must contain at least one special character (@$!%*?&)');
    }
  }

  /**
   * Hash password
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}