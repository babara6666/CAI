import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  ModelTraining as TrainingIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import DatasetCreator from '../components/Dataset/DatasetCreator'
import { Dataset } from '../types'
import { apiService } from '../services/api'

const DatasetsPage: React.FC = () => {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    dataset: Dataset | null
  }>({ open: false, dataset: null })

  useEffect(() => {
    fetchDatasets()
  }, [])

  const fetchDatasets = async () => {
    try {
      setLoading(true)
      const response = await apiService.get<Dataset[]>('/ai/datasets')
      
      if (response.success && response.data) {
        setDatasets(response.data)
      } else {
        setError(response.error?.message || 'Failed to fetch datasets')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch datasets')
    } finally {
      setLoading(false)
    }
  }

  const handleDatasetCreated = (newDataset: Dataset) => {
    setDatasets(prev => [newDataset, ...prev])
    setCreateDialogOpen(false)
  }

  const handleDeleteDataset = async () => {
    if (!deleteDialog.dataset) return

    try {
      const response = await apiService.delete(`/ai/datasets/${deleteDialog.dataset.id}`)
      
      if (response.success) {
        setDatasets(prev => prev.filter(d => d.id !== deleteDialog.dataset!.id))
        setDeleteDialog({ open: false, dataset: null })
      } else {
        setError(response.error?.message || 'Failed to delete dataset')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to delete dataset')
    }
  }

  const handleStartTraining = (dataset: Dataset) => {
    navigate('/training', { state: { selectedDataset: dataset } })
  }

  const getStatusColor = (status: Dataset['status']) => {
    switch (status) {
      case 'ready':
        return 'success'
      case 'creating':
        return 'warning'
      case 'training':
        return 'info'
      case 'error':
        return 'error'
      default:
        return 'default'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          Datasets
        </Typography>
        <LinearProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Datasets
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage datasets for training AI models
          </Typography>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Dataset
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {datasets.map((dataset) => (
          <Grid item xs={12} sm={6} md={4} key={dataset.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" component="h3" noWrap>
                    {dataset.name}
                  </Typography>
                  <Chip
                    label={dataset.status.toUpperCase()}
                    color={getStatusColor(dataset.status) as any}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {dataset.description || 'No description provided'}
                </Typography>

                <Typography variant="body2" gutterBottom>
                  <strong>Files:</strong> {dataset.fileCount}
                </Typography>

                <Typography variant="body2" gutterBottom>
                  <strong>Labels:</strong> {dataset.labels.length}
                </Typography>

                <Typography variant="body2" gutterBottom>
                  <strong>Created:</strong> {formatDate(dataset.createdAt)}
                </Typography>

                {dataset.tags.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    {dataset.tags.slice(0, 3).map((tag) => (
                      <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                    {dataset.tags.length > 3 && (
                      <Chip label={`+${dataset.tags.length - 3}`} size="small" />
                    )}
                  </Box>
                )}
              </CardContent>

              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Box>
                  <IconButton size="small" title="View Details">
                    <ViewIcon />
                  </IconButton>
                  <IconButton size="small" title="Edit Dataset">
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete Dataset"
                    onClick={() => setDeleteDialog({ open: true, dataset })}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>

                {dataset.status === 'ready' && (
                  <Button
                    size="small"
                    startIcon={<TrainingIcon />}
                    onClick={() => handleStartTraining(dataset)}
                  >
                    Train Model
                  </Button>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {datasets.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No datasets found
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Create your first dataset to start training AI models
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ mt: 2 }}
          >
            Create Dataset
          </Button>
        </Box>
      )}

      {/* Create Dataset Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen
      >
        <DatasetCreator
          onDatasetCreated={handleDatasetCreated}
          onClose={() => setCreateDialogOpen(false)}
        />
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, dataset: null })}
      >
        <DialogTitle>Delete Dataset</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the dataset "{deleteDialog.dataset?.name}"?
            This action cannot be undone and will affect any models trained on this dataset.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, dataset: null })}>
            Cancel
          </Button>
          <Button onClick={handleDeleteDataset} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default DatasetsPage