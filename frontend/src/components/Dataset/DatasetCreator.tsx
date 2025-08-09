import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Checkbox,
  FormControlLabel,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { CADFile, Dataset, DatasetLabel } from '../../types'
import { apiService } from '../../services/api'
import FileGrid from '../FileManagement/FileGrid'

const schema = yup.object({
  name: yup.string().required('Dataset name is required'),
  description: yup.string(),
  tags: yup.string(),
})

interface DatasetFormData {
  name: string
  description: string
  tags: string
}

interface DatasetCreatorProps {
  onDatasetCreated?: (dataset: Dataset) => void
  onClose?: () => void
}

const steps = ['Dataset Info', 'Select Files', 'Add Labels', 'Review & Create']

const DatasetCreator: React.FC<DatasetCreatorProps> = ({
  onDatasetCreated,
  onClose,
}) => {
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [availableFiles, setAvailableFiles] = useState<CADFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<CADFile[]>([])
  const [labels, setLabels] = useState<DatasetLabel[]>([])
  const [labelDialog, setLabelDialog] = useState<{
    open: boolean
    file: CADFile | null
    label: string
  }>({ open: false, file: null, label: '' })

  const {
    control,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<DatasetFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      tags: '',
    },
  })

  useEffect(() => {
    fetchAvailableFiles()
  }, [])

  const fetchAvailableFiles = async () => {
    try {
      const response = await apiService.get<{ data: CADFile[] }>('/files', {
        limit: 100, // Get more files for dataset creation
      })
      if (response.success && response.data) {
        setAvailableFiles(response.data.data)
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch files')
    }
  }

  const handleNext = () => {
    if (activeStep === 1 && selectedFiles.length === 0) {
      setError('Please select at least one file')
      return
    }
    setError('')
    setActiveStep((prevActiveStep) => prevActiveStep + 1)
  }

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1)
  }

  const handleFileSelection = (file: CADFile, selected: boolean) => {
    if (selected) {
      setSelectedFiles(prev => [...prev, file])
    } else {
      setSelectedFiles(prev => prev.filter(f => f.id !== file.id))
      setLabels(prev => prev.filter(l => l.fileId !== file.id))
    }
  }

  const handleAddLabel = (file: CADFile) => {
    setLabelDialog({ open: true, file, label: '' })
  }

  const handleSaveLabel = () => {
    if (labelDialog.file && labelDialog.label.trim()) {
      const newLabel: DatasetLabel = {
        fileId: labelDialog.file.id,
        label: labelDialog.label.trim(),
        createdBy: '', // Will be set by backend
        createdAt: new Date().toISOString(),
      }

      setLabels(prev => {
        const existing = prev.find(l => l.fileId === labelDialog.file!.id)
        if (existing) {
          return prev.map(l => l.fileId === labelDialog.file!.id ? newLabel : l)
        }
        return [...prev, newLabel]
      })

      setLabelDialog({ open: false, file: null, label: '' })
    }
  }

  const handleRemoveLabel = (fileId: string) => {
    setLabels(prev => prev.filter(l => l.fileId !== fileId))
  }

  const handleCreateDataset = async (formData: DatasetFormData) => {
    setLoading(true)
    setError('')

    try {
      const datasetData = {
        name: formData.name,
        description: formData.description,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        files: selectedFiles.map(f => f.id),
        labels: labels,
      }

      const response = await apiService.post<Dataset>('/ai/datasets', datasetData)

      if (response.success && response.data) {
        onDatasetCreated?.(response.data)
        onClose?.()
      } else {
        setError(response.error?.message || 'Failed to create dataset')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create dataset')
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Dataset Information
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Dataset Name"
                      error={!!errors.name}
                      helperText={errors.name?.message}
                      required
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Description"
                      multiline
                      rows={3}
                      helperText="Describe the purpose and contents of this dataset"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Tags"
                      helperText="Comma-separated tags for categorization"
                      placeholder="mechanical, automotive, prototype"
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        )

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select Files ({selectedFiles.length} selected)
            </Typography>
            <Grid container spacing={2}>
              {availableFiles.map((file) => (
                <Grid item xs={12} sm={6} md={4} key={file.id}>
                  <Card sx={{ height: '100%' }}>
                    <Box sx={{ position: 'relative' }}>
                      <img
                        src={file.thumbnailUrl || '/placeholder-cad.png'}
                        alt={file.originalName}
                        style={{ width: '100%', height: 150, objectFit: 'cover' }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedFiles.some(f => f.id === file.id)}
                            onChange={(e) => handleFileSelection(file, e.target.checked)}
                          />
                        }
                        label=""
                        sx={{ position: 'absolute', top: 8, right: 8 }}
                      />
                    </Box>
                    <CardContent>
                      <Typography variant="body2" noWrap title={file.originalName}>
                        {file.originalName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(file.fileSize / 1024)} KB
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Add Labels to Selected Files
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Labels help train AI models to understand your CAD files better
            </Typography>
            
            <List>
              {selectedFiles.map((file) => {
                const label = labels.find(l => l.fileId === file.id)
                return (
                  <ListItem key={file.id} divider>
                    <ListItemText
                      primary={file.originalName}
                      secondary={
                        label ? (
                          <Chip label={label.label} size="small" color="primary" />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No label assigned
                          </Typography>
                        )
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        onClick={() => handleAddLabel(file)}
                        size="small"
                        color="primary"
                      >
                        {label ? <EditIcon /> : <AddIcon />}
                      </IconButton>
                      {label && (
                        <IconButton
                          onClick={() => handleRemoveLabel(file.id)}
                          size="small"
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                )
              })}
            </List>
          </Box>
        )

      case 3:
        const formData = getValues()
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Dataset
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Dataset Information
                    </Typography>
                    <Typography variant="body2">
                      <strong>Name:</strong> {formData.name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Description:</strong> {formData.description || 'None'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Tags:</strong> {formData.tags || 'None'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Files & Labels
                    </Typography>
                    <Typography variant="body2">
                      <strong>Total Files:</strong> {selectedFiles.length}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Labeled Files:</strong> {labels.length}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Unlabeled Files:</strong> {selectedFiles.length - labels.length}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {labels.length < selectedFiles.length && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Some files don't have labels. You can add labels later, but labeled data helps train better AI models.
              </Alert>
            )}
          </Box>
        )

      default:
        return null
    }
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create Dataset
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card>
        <CardContent sx={{ minHeight: 400 }}>
          {renderStepContent(activeStep)}
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onClose && (
            <Button onClick={onClose}>
              Cancel
            </Button>
          )}
          
          {activeStep === steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleSubmit(handleCreateDataset)}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              {loading ? 'Creating...' : 'Create Dataset'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>

      {/* Label Dialog */}
      <Dialog
        open={labelDialog.open}
        onClose={() => setLabelDialog({ open: false, file: null, label: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Add Label for {labelDialog.file?.originalName}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Label"
            value={labelDialog.label}
            onChange={(e) => setLabelDialog(prev => ({ ...prev, label: e.target.value }))}
            placeholder="e.g., gear, bracket, housing"
            margin="normal"
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelDialog({ open: false, file: null, label: '' })}>
            Cancel
          </Button>
          <Button onClick={handleSaveLabel} variant="contained">
            Save Label
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default DatasetCreator