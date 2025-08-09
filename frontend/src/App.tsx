import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import MainLayout from './components/Layout/MainLayout'
import LoginForm from './components/Auth/LoginForm'
import RegisterForm from './components/Auth/RegisterForm'
import UserProfile from './components/Auth/UserProfile'
import Dashboard from './pages/Dashboard'
import SearchPage from './pages/SearchPage'
import UploadPage from './pages/UploadPage'
import DatasetsPage from './pages/DatasetsPage'
import TrainingDashboard from './components/Training/TrainingDashboard'
import { AdminDashboard } from './components/AdminDashboard/AdminDashboard'
import CADViewer from './components/CADViewer/CADViewer'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { errorHandlingService } from './services/errorHandlingService'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Use our error handling service to determine if we should retry
        return failureCount < 3 && errorHandlingService.isRetryableError(error as Error);
      },
      refetchOnWindowFocus: false,
      onError: (error) => {
        // Log query errors
        errorHandlingService.logError(error as Error, 'react-query');
      }
    },
    mutations: {
      retry: (failureCount, error) => {
        return failureCount < 2 && errorHandlingService.isRetryableError(error as Error);
      },
      onError: (error) => {
        // Log mutation errors
        errorHandlingService.logError(error as Error, 'react-query-mutation');
      }
    }
  },
})

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
})

function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log React errors to our error handling service
        errorHandlingService.logError(error, 'react-error-boundary');
        console.error('React Error Boundary:', error, errorInfo);
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>
            <Router>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginForm />} />
                <Route path="/register" element={<RegisterForm />} />
                
                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="search" element={<SearchPage />} />
                  <Route
                    path="upload"
                    element={
                      <ProtectedRoute requiredRole="engineer">
                        <UploadPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="datasets"
                    element={
                      <ProtectedRoute requiredRole="engineer">
                        <DatasetsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="training"
                    element={
                      <ProtectedRoute requiredRole="engineer">
                        <TrainingDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="profile" element={<UserProfile />} />
                </Route>
                
                {/* Standalone routes */}
                <Route
                  path="/viewer/:fileId"
                  element={
                    <ProtectedRoute>
                      <CADViewer />
                    </ProtectedRoute>
                  }
                />
                
                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App