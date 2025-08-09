import { apiService } from './api'
import { User } from '../types'

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  username: string
  password: string
  role?: 'engineer' | 'viewer'
}

export interface AuthResponse {
  token: string
  refreshToken: string
  user: User
}

export interface PasswordResetRequest {
  email: string
}

export interface PasswordReset {
  token: string
  password: string
}

class AuthService {
  async login(credentials: LoginCredentials) {
    const response = await apiService.post<AuthResponse>('/auth/login', credentials)
    
    if (response.success && response.data) {
      apiService.setAuthToken(response.data.token)
      localStorage.setItem('refreshToken', response.data.refreshToken)
      localStorage.setItem('user', JSON.stringify(response.data.user))
    }
    
    return response
  }

  async register(userData: RegisterData) {
    const response = await apiService.post<{ user: User }>('/auth/register', userData)
    return response
  }

  async logout() {
    try {
      await apiService.post('/auth/logout')
    } finally {
      apiService.removeAuthToken()
      localStorage.removeItem('user')
      localStorage.removeItem('refreshToken')
    }
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiService.post<{ token: string }>('/auth/refresh', {
      refreshToken,
    })

    if (response.success && response.data) {
      apiService.setAuthToken(response.data.token)
      return response.data.token
    }

    throw new Error('Failed to refresh token')
  }

  async forgotPassword(data: PasswordResetRequest) {
    return apiService.post('/auth/forgot-password', data)
  }

  async resetPassword(data: PasswordReset) {
    return apiService.post('/auth/reset-password', data)
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        return JSON.parse(userStr)
      } catch {
        return null
      }
    }
    return null
  }

  isAuthenticated(): boolean {
    return !!apiService.getAuthToken() && !!this.getCurrentUser()
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser()
    return user?.role === role
  }

  isAdmin(): boolean {
    return this.hasRole('admin')
  }

  isEngineer(): boolean {
    return this.hasRole('engineer')
  }

  isViewer(): boolean {
    return this.hasRole('viewer')
  }
}

export const authService = new AuthService()
export default authService