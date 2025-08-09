import bcrypt from 'bcrypt';
import { User, UserRegistration, UserFilters, Pagination, UserActivity } from '../types/index.js';
import { BaseModel } from '../models/BaseModel.js';

export class UserService extends BaseModel {
  async getUsers(
    filters: UserFilters = {}, 
    options: { page: number; limit: number; search?: string }
  ): Promise<{ users: User[]; pagination: Pagination }> {
    const { page, limit, search } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters.role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }
    
    if (filters.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }
    
    if (filters.lastLoginAfter) {
      whereClause += ` AND last_login_at > $${paramIndex}`;
      params.push(filters.lastLoginAfter);
      paramIndex++;
    }
    
    if (search) {
      whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get users
    const usersQuery = `
      SELECT id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences
      FROM users 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);
    
    const result = await this.query(usersQuery, params);
    
    const users: User[] = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences || {
        theme: 'light',
        notificationSettings: {
          emailNotifications: true,
          trainingComplete: true,
          searchResults: false,
          systemUpdates: true
        }
      }
    }));
    
    const pagination: Pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
    
    return { users, pagination };
  }
  
  async getUserById(id: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences
      FROM users 
      WHERE id = $1
    `;
    
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences || {
        theme: 'light',
        notificationSettings: {
          emailNotifications: true,
          trainingComplete: true,
          searchResults: false,
          systemUpdates: true
        }
      }
    };
  }
  
  async createUser(userData: UserRegistration): Promise<User> {
    const { email, username, password, role = 'viewer' } = userData;
    
    // Check if user already exists
    const existingUser = await this.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      throw new Error('User with this email or username already exists');
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const defaultPreferences = {
      theme: 'light',
      notificationSettings: {
        emailNotifications: true,
        trainingComplete: true,
        searchResults: false,
        systemUpdates: true
      }
    };
    
    const query = `
      INSERT INTO users (email, username, password_hash, role, preferences, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences
    `;
    
    const result = await this.query(query, [
      email,
      username,
      passwordHash,
      role,
      JSON.stringify(defaultPreferences),
      true
    ]);
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences
    };
  }
  
  async updateUser(id: string, updateData: Partial<User>): Promise<User | null> {
    const allowedFields = ['email', 'username', 'role', 'isActive', 'preferences'];
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = key === 'isActive' ? 'is_active' : key;
        updates.push(`${dbField} = $${paramIndex}`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }
    
    if (updates.length === 0) {
      return this.getUserById(id);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences
    `;
    
    const result = await this.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences
    };
  }
  
  async deleteUser(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rowCount > 0;
  }
  
  async getUserActivity(
    userId: string,
    filters: any = {},
    options: { page: number; limit: number }
  ): Promise<{ activities: UserActivity[]; pagination: Pagination }> {
    const { page, limit } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (filters.action) {
      whereClause += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }
    
    if (filters.startDate) {
      whereClause += ` AND timestamp >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }
    
    if (filters.endDate) {
      whereClause += ` AND timestamp <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM audit_logs ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get activities
    const activitiesQuery = `
      SELECT id, action, resource_type, resource_id, timestamp, details
      FROM audit_logs 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);
    
    const result = await this.query(activitiesQuery, params);
    
    const activities: UserActivity[] = result.rows.map(row => ({
      id: row.id,
      userId,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      timestamp: row.timestamp,
      details: row.details || {}
    }));
    
    const pagination: Pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
    
    return { activities, pagination };
  }
  
  async updateLastLogin(userId: string): Promise<void> {
    const query = 'UPDATE users SET last_login_at = NOW() WHERE id = $1';
    await this.query(query, [userId]);
  }
  
  async getUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences, password_hash
      FROM users 
      WHERE email = $1
    `;
    
    const result = await this.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences || {
        theme: 'light',
        notificationSettings: {
          emailNotifications: true,
          trainingComplete: true,
          searchResults: false,
          systemUpdates: true
        }
      }
    };
  }
  
  async verifyPassword(email: string, password: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, role, created_at, updated_at, last_login_at, is_active, preferences, password_hash
      FROM users 
      WHERE email = $1 AND is_active = true
    `;
    
    const result = await this.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, row.password_hash);
    
    if (!isValidPassword) {
      return null;
    }
    
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active,
      preferences: row.preferences
    };
  }
}