import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  Grid,
  Avatar,
  Chip,
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useAuth } from '../../contexts/AuthContext'
import { User, UserPreferences } from '../../types'
import { apiService } from '../../services/api'

const passwordSchema = yup.object({
  currentPassword: yup.string().required('Current password is required'),
  newPassword: yup.string().min(8, 'Password must be at least 8 characters').required('New password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('newPassword')], 'Passwords must match')
    .required('Please confirm your password'),
})

interface PasswordChangeData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const UserProfile: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences>(
    user?.preferences || {
      theme: 'light',
      notificationSettings: {
        emailNotifications: true,
        pushNotifications: false,
        trainingComplete: true,
        searchResults: false,
      },
    }
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PasswordChangeData>({
    resolver: yupResolver(passwordSchema),
  })

  const handlePasswordChange = async (data: PasswordChangeData) => {
    setIsLoading(true)
    setMessage(null)

    try {
      const response = await apiService.put('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })

      if (response.success) {
        setMessage({ type: 'success', text: 'Password changed successfully' })
        reset()
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Failed to change password' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to change password' })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreferencesChange = async (newPreferences: UserPreferences) => {
    setPreferences(newPreferences)
    
    try {
      const response = await apiService.put('/users/preferences', newPreferences)
      if (response.success) {
        refreshUser()
        setMessage({ type: 'success', text: 'Preferences updated successfully' })
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Failed to update preferences' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update preferences' })
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'error'
      case 'engineer':
        return 'primary'
      case 'viewer':
        return 'secondary'
      default:
        return 'default'
    }
  }

  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        User Profile
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Profile Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ width: 64, height: 64, mr: 2, bgcolor: 'primary.main' }}>
                  {user.username.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="h6">{user.username}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user.email}
                  </Typography>
                  <Chip
                    label={user.role.toUpperCase()}
                    color={getRoleColor(user.role) as any}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary">
                <strong>Member since:</strong> {new Date(user.createdAt).toLocaleDateString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Last login:</strong> {new Date(user.lastLoginAt).toLocaleDateString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Preferences */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Preferences
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.theme === 'dark'}
                    onChange={(e) =>
                      handlePreferencesChange({
                        ...preferences,
                        theme: e.target.checked ? 'dark' : 'light',
                      })
                    }
                  />
                }
                label="Dark Theme"
              />

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                Notifications
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.notificationSettings.emailNotifications}
                    onChange={(e) =>
                      handlePreferencesChange({
                        ...preferences,
                        notificationSettings: {
                          ...preferences.notificationSettings,
                          emailNotifications: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="Email Notifications"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.notificationSettings.trainingComplete}
                    onChange={(e) =>
                      handlePreferencesChange({
                        ...preferences,
                        notificationSettings: {
                          ...preferences.notificationSettings,
                          trainingComplete: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="Training Complete Notifications"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.notificationSettings.searchResults}
                    onChange={(e) =>
                      handlePreferencesChange({
                        ...preferences,
                        notificationSettings: {
                          ...preferences.notificationSettings,
                          searchResults: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="Search Result Notifications"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Change Password */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Change Password
              </Typography>

              <Box component="form" onSubmit={handleSubmit(handlePasswordChange)} noValidate>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      {...register('currentPassword')}
                      fullWidth
                      label="Current Password"
                      type="password"
                      error={!!errors.currentPassword}
                      helperText={errors.currentPassword?.message}
                      autoComplete="current-password"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      {...register('newPassword')}
                      fullWidth
                      label="New Password"
                      type="password"
                      error={!!errors.newPassword}
                      helperText={errors.newPassword?.message}
                      autoComplete="new-password"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      {...register('confirmPassword')}
                      fullWidth
                      label="Confirm New Password"
                      type="password"
                      error={!!errors.confirmPassword}
                      helperText={errors.confirmPassword?.message}
                      autoComplete="new-password"
                    />
                  </Grid>
                </Grid>

                <Button
                  type="submit"
                  variant="contained"
                  sx={{ mt: 2 }}
                  disabled={isLoading}
                >
                  {isLoading ? <CircularProgress size={24} /> : 'Change Password'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default UserProfile