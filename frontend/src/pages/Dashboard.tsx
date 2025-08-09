import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  Search as SearchIcon,
  Dataset as DatasetIcon,
  ModelTraining as TrainingIcon,
  Visibility as ViewIcon,
  TrendingUp as TrendingUpIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/api'
import { CADFile, TrainingJob, Dataset, SearchQuery } from '../types'

interface DashboardStats {
  totalFiles: number
  totalDatasets: number
  activeTrainingJobs: number
  recentSearches: number
  storageUsed: number
  storageLimit: number
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    totalDatasets: 0,
    activeTrainingJobs: 0,
    recentSearches: 0,
    storageUsed: 0,
    storageLimit: 1000000000, // 1GB default
  })
  const [recentFiles, setRecentFiles] = useState<CADFile[]>([])
  const [activeJobs, setActiveJobs] = useState<TrainingJob[]>([])
  const [recentSearches, setRecentSearches] = useState<SearchQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Fetch dashboard statistics
      const [filesResponse, datasetsResponse, trainingResponse, searchResponse] = await Promise.all([
        apiService.get<{ data: CADFile[]; pagination: any }>('/files', { limit: 5 }),
        apiService.get<Dataset[]>('/ai/datasets'),
        apiService.get<TrainingJob[]>('/ai/training'),
        apiService.get<SearchQuery[]>('/search/history', { limit: 5 }),
      ])

      if (filesResponse.success && filesResponse.data) {
        setRecentFiles(filesResponse.data.data)
        setStats(prev => ({
          ...prev,
          totalFiles: filesResponse.data.pagination.total,
        }))
      }

      if (datasetsResponse.success && datasetsResponse.data) {
        setStats(prev => ({
          ...prev,
          totalDatasets: datasetsResponse.data.length,
        }))
      }

      if (trainingResponse.success && trainingResponse.data) {
        const activeJobs = trainingResponse.data.filter(job => 
          job.status === 'running' || job.status === 'queued'
        )
        setActiveJobs(activeJobs)
        setStats(prev => ({
          ...prev,
          activeTrainingJobs: activeJobs.length,
        }))
      }

      if (searchResponse.success && searchResponse.data) {
        setRecentSearches(searchResponse.data)
        setStats(prev => ({
          ...prev,
          recentSearches: searchResponse.data.length,
        }))
      }

      // Calculate storage usage (mock for now)
      const totalSize = recentFiles.reduce((sum, file) => sum + file.fileSize, 0)
      setStats(prev => ({
        ...prev,
        storageUsed: totalSize,
      }))

    } catch (error: any) {
      setError(error.message || 'Failed to fetch dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStoragePercentage = () => {
    return Math.min((stats.storageUsed / stats.storageLimit) * 100, 100)
  }

  const getJobStatusColor = (status: TrainingJob['status']) => {
    switch (status) {
      case 'running':
        return 'primary'
      case 'queued':
        return 'warning'
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      default:
        return 'default'
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <LinearProgress sx={{ width: '50%' }} />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Welcome back, {user?.username}!
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Quick Actions */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/upload')}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Upload Files</Typography>
              <Typography variant="body2" color="text.secondary">
                Add new CAD files
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/search')}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <SearchIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Search</Typography>
              <Typography variant="body2" color="text.secondary">
                Find CAD files with AI
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/datasets')}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <DatasetIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Datasets</Typography>
              <Typography variant="body2" color="text.secondary">
                Manage training data
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/training')}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <TrainingIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Training</Typography>
              <Typography variant="body2" color="text.secondary">
                Train AI models
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ fontSize: 40, color: 'info.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{stats.totalFiles}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    CAD Files
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <DatasetIcon sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{stats.totalDatasets}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Datasets
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SpeedIcon sx={{ fontSize: 40, color: 'warning.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{stats.activeTrainingJobs}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Training
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'error.main', mr: 2 }} />
                <Box>
                  <Typography variant="h4">{stats.recentSearches}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recent Searches
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Files */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Recent Files</Typography>
                <Button size="small" onClick={() => navigate('/files')}>
                  View All
                </Button>
              </Box>
              
              <List>
                {recentFiles.slice(0, 5).map((file) => (
                  <ListItem key={file.id} divider>
                    <ListItemText
                      primary={file.originalName}
                      secondary={`${formatFileSize(file.fileSize)} • ${new Date(file.uploadedAt).toLocaleDateString()}`}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => navigate(`/viewer/${file.id}`)}
                        size="small"
                      >
                        <ViewIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>

              {recentFiles.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No files uploaded yet
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Active Training Jobs */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Active Training</Typography>
                <Button size="small" onClick={() => navigate('/training')}>
                  View All
                </Button>
              </Box>
              
              <List>
                {activeJobs.slice(0, 5).map((job) => (
                  <ListItem key={job.id} divider>
                    <ListItemText
                      primary={job.name}
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Chip
                            label={job.status.toUpperCase()}
                            color={getJobStatusColor(job.status) as any}
                            size="small"
                          />
                          {job.status === 'running' && (
                            <LinearProgress
                              variant="determinate"
                              value={job.progress}
                              sx={{ flexGrow: 1, ml: 1 }}
                            />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>

              {activeJobs.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No active training jobs
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Storage Usage */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Storage Usage
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">
                    {formatFileSize(stats.storageUsed)} used
                  </Typography>
                  <Typography variant="body2">
                    {formatFileSize(stats.storageLimit)} total
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={getStoragePercentage()}
                  color={getStoragePercentage() > 80 ? 'error' : 'primary'}
                />
              </Box>

              {getStoragePercentage() > 80 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Storage is running low. Consider cleaning up old files.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Searches */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Recent Searches</Typography>
                <Button size="small" onClick={() => navigate('/search')}>
                  New Search
                </Button>
              </Box>
              
              <List>
                {recentSearches.slice(0, 5).map((search) => (
                  <ListItem key={search.id} divider>
                    <ListItemText
                      primary={search.query}
                      secondary={`${search.resultCount} results • ${new Date(search.timestamp).toLocaleDateString()}`}
                    />
                  </ListItem>
                ))}
              </List>

              {recentSearches.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No recent searches
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard