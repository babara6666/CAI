import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { ApiResponse } from '../types'

class ApiService {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('authToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.api.get(url, { params })
      return response.data
    } catch (error: any) {
      return this.handleError(error)
    }
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.api.post(url, data)
      return response.data
    } catch (error: any) {
      return this.handleError(error)
    }
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.api.put(url, data)
      return response.data
    } catch (error: any) {
      return this.handleError(error)
    }
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.api.delete(url)
      return response.data
    } catch (error: any) {
      return this.handleError(error)
    }
  }

  async upload<T>(url: string, formData: FormData, onProgress?: (progress: number) => void): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.api.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      })
      return response.data
    } catch (error: any) {
      return this.handleError(error)
    }
  }

  private handleError(error: any): ApiResponse<any> {
    if (error.response?.data) {
      return error.response.data
    }
    
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        requestId: '',
      },
    }
  }

  setAuthToken(token: string) {
    localStorage.setItem('authToken', token)
  }

  removeAuthToken() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('refreshToken')
  }

  getAuthToken(): string | null {
    return localStorage.getItem('authToken')
  }
}

export const apiService = new ApiService()
export default apiService