import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { TrainingJob, Dataset, ModelConfig, TrainingMetrics } from '../../types'
import { apiService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface TrainingDashboardProps {
  onModelTrained?: (modelId: string) => void
}

const TrainingDashboard: React.FC<TrainingDashboardProps> = ({
  onModelTrained,
}) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const [trainingJobs, setTrainingJobs] = useState<TrainingJob[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [createJobDialog, setCreateJobDialog] = useState(false)
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null)
  const [metricsDialog, setMetricsDialog] = useState(false)

  const [newJobForm, setNewJobForm] = useState({
    name: '',
    datasetId: '',
    architecture: 'cnn',
    epochs: 50,
    batchSize: 32,
    learningRate: 0.001,
    optimizer: 'adam',
    lossFunction: 'categorical_crossentropy',
  })

  useEffect(() => {
    fetchTrainingJobs()
    fetchDatasets()
    
    // Set up polling for active jobs
    const interval = setInterval(() => {
      fetchTrainingJobs()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const fetchTrainingJobs = async () => {
    try {
      const response = await apiService.get<TrainingJob[]>('/ai/training')
      if (response.success && response.data) {
        setTrainingJobs(response.data)
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch training jobs')
    }
  }

  const fetchDatasets = async () => {
    try {
      const response = await apiService.get<Dataset[]>('/ai/datasets')
      if (response.success && response.data) {
        setDatasets(response.data.filter(d => d.status === 'ready'))
      }
    } catch (error: any) {
      console.error('Failed to fetch datasets:', error)
    }
  }

  const handleCreateJob = async () => {
    setLoading(true)
    setError('')

    try {
      const modelConfig: ModelConfig = {
        architecture: newJobForm.architecture,
        hyperparameters: {
          epochs: newJobForm.epochs,
          batchSize: newJobForm.batchSize,
          learningRate: newJobForm.learningRate,
          optimizer: newJobForm.optimizer,
          lossFunction: newJobForm.lossFunction,
        },
        trainingConfig: {
          epochs: newJobForm.epochs,
          batchSize: newJobForm.batchSize,
          learningRate: newJobForm.learningRate,
          optimizer: newJobForm.optimizer,
          lossFunction: newJobForm.lossFunction,
        },
      }

      const response = await apiService.post<TrainingJob>('/ai/train', {
        name: newJobForm.name,
        datasetId: newJobForm.datasetId,
        modelConfig,
      })

      if (response.success && response.data) {
        setTrainingJobs(prev => [response.data!, ...prev])
        setCreateJobDialog(false)
        setNewJobForm({
          name: '',
          datasetId: '',
          architecture: 'cnn',
          epochs: 50,
          batchSize: 32,
          learningRate: 0.001,
          optimizer: 'adam',
          lossFunction: 'categorical_crossentropy',
        })
      } else {
        setError(response.error?.message || 'Failed to create training job')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create training job')
    } finally {
      setLoading(false)
    }
  }

  const handleStopJob = async (jobId: string) => {
    try {
      const response = await apiService.post(`/ai/training/${jobId}/stop`)
      if (response.success) {
        fetchTrainingJobs()
      }
    } catch (error: any) {
      setError(error.message || 'Failed to stop training job')
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await apiService.delete(`/ai/training/${jobId}`)
      if (response.success) {
        setTrainingJobs(prev => prev.filter(job => job.id !== jobId))
      }
    } catch (error: any) {
      setError(error.message || 'Failed to delete training job')
    }
  }

  const handleViewMetrics = (job: TrainingJob) => {
    setSelectedJob(job)
    setMetricsDialog(true)
  }

  const getStatusColor = (status: TrainingJob['status']) => {
    switch (status) {
      case 'running':
        return 'primary'
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      case 'cancelled':
        return 'warning'
      default:
        return 'default'
    }
  }

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return 'Not started'
    if (!end && start) return 'Running...'
    
    const startTime = new Date(start).getTime()
    const endTime = new Date(end!).getTime()
    const duration = endTime - startTime
    
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }

  const renderTrainingJobsList = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Training Jobs</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchTrainingJobs}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setCreateJobDialog(true)}
            variant="contained"
          >
            New Training Job
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {trainingJobs.map((job) => (
          <Grid item xs={12} md={6} lg={4} key={job.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" noWrap>
                    {job.name}
                  </Typography>
                  <Chip
                    label={job.status.toUpperCase()}
                    color={getStatusColor(job.status) as any}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Dataset: {datasets.find(d => d.id === job.datasetId)?.name || 'Unknown'}
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Architecture: {job.modelConfig.architecture.toUpperCase()}
                </Typography>

                {job.status === 'running' && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      Progress: {job.progress}%
                    </Typography>
                    <LinearProgress variant="determinate" value={job.progress} />
                    
                    {job.metrics && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
                        <Typography variant="caption">
                          Epoch: {job.metrics.epoch}
                        </Typography>
                        <Typography variant="caption">
                          Loss: {job.metrics.loss.toFixed(4)}
                        </Typography>
                        <Typography variant="caption">
                          Accuracy: {(job.metrics.accuracy * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {job.status === 'completed' && job.metrics && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      Final Accuracy: {(job.metrics.accuracy * 100).toFixed(1)}%
                    </Typography>
                    <Typography variant="body2">
                      Duration: {formatDuration(job.startedAt, job.completedAt)}
                    </Typography>
                  </Box>
                )}

                {job.status === 'failed' && job.error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {job.error}
                  </Alert>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                  <Button
                    startIcon={<ViewIcon />}
                    onClick={() => handleViewMetrics(job)}
                    size="small"
                  >
                    Metrics
                  </Button>
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {job.status === 'running' && (
                      <IconButton
                        onClick={() => handleStopJob(job.id)}
                        size="small"
                        color="warning"
                      >
                        <StopIcon />
                      </IconButton>
                    )}
                    
                    {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                      <IconButton
                        onClick={() => handleDeleteJob(job.id)}
                        size="small"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {trainingJobs.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No training jobs found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first training job to get started
          </Typography>
        </Box>
      )}
    </Box>
  )

  const renderActiveJobs = () => {
    const activeJobs = trainingJobs.filter(job => job.status === 'running' || job.status === 'queued')
    
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Active Training Jobs ({activeJobs.length})
        </Typography>
        
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Job Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Current Metrics</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{job.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={job.status.toUpperCase()}
                      color={getStatusColor(job.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={job.progress}
                        sx={{ width: 100 }}
                      />
                      <Typography variant="body2">
                        {job.progress}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {job.metrics && (
                      <Box>
                        <Typography variant="caption" display="block">
                          Loss: {job.metrics.loss.toFixed(4)}
                        </Typography>
                        <Typography variant="caption" display="block">
                          Acc: {(job.metrics.accuracy * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDuration(job.startedAt)}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleViewMetrics(job)}
                      size="small"
                    >
                      <ViewIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleStopJob(job.id)}
                      size="small"
                      color="warning"
                    >
                      <StopIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {activeJobs.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No active training jobs
            </Typography>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Training Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="All Jobs" />
          <Tab label="Active Jobs" />
        </Tabs>
      </Box>

      {activeTab === 0 && renderTrainingJobsList()}
      {activeTab === 1 && renderActiveJobs()}

      {/* Create Job Dialog */}
      <Dialog
        open={createJobDialog}
        onClose={() => setCreateJobDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create Training Job</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Job Name"
                value={newJobForm.name}
                onChange={(e) => setNewJobForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Dataset</InputLabel>
                <Select
                  value={newJobForm.datasetId}
                  onChange={(e) => setNewJobForm(prev => ({ ...prev, datasetId: e.target.value }))}
                  label="Dataset"
                >
                  {datasets.map((dataset) => (
                    <MenuItem key={dataset.id} value={dataset.id}>
                      {dataset.name} ({dataset.fileCount} files)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Architecture</InputLabel>
                <Select
                  value={newJobForm.architecture}
                  onChange={(e) => setNewJobForm(prev => ({ ...prev, architecture: e.target.value }))}
                  label="Architecture"
                >
                  <MenuItem value="cnn">CNN</MenuItem>
                  <MenuItem value="transformer">Transformer</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Epochs"
                type="number"
                value={newJobForm.epochs}
                onChange={(e) => setNewJobForm(prev => ({ ...prev, epochs: parseInt(e.target.value) }))}
                inputProps={{ min: 1, max: 1000 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Batch Size"
                type="number"
                value={newJobForm.batchSize}
                onChange={(e) => setNewJobForm(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                inputProps={{ min: 1, max: 256 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Learning Rate"
                type="number"
                value={newJobForm.learningRate}
                onChange={(e) => setNewJobForm(prev => ({ ...prev, learningRate: parseFloat(e.target.value) }))}
                inputProps={{ min: 0.0001, max: 1, step: 0.0001 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Optimizer</InputLabel>
                <Select
                  value={newJobForm.optimizer}
                  onChange={(e) => setNewJobForm(prev => ({ ...prev, optimizer: e.target.value }))}
                  label="Optimizer"
                >
                  <MenuItem value="adam">Adam</MenuItem>
                  <MenuItem value="sgd">SGD</MenuItem>
                  <MenuItem value="rmsprop">RMSprop</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Loss Function</InputLabel>
                <Select
                  value={newJobForm.lossFunction}
                  onChange={(e) => setNewJobForm(prev => ({ ...prev, lossFunction: e.target.value }))}
                  label="Loss Function"
                >
                  <MenuItem value="categorical_crossentropy">Categorical Crossentropy</MenuItem>
                  <MenuItem value="binary_crossentropy">Binary Crossentropy</MenuItem>
                  <MenuItem value="mse">Mean Squared Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateJobDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateJob}
            variant="contained"
            disabled={loading || !newJobForm.name || !newJobForm.datasetId}
          >
            {loading ? 'Creating...' : 'Start Training'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Metrics Dialog */}
      <Dialog
        open={metricsDialog}
        onClose={() => setMetricsDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Training Metrics - {selectedJob?.name}
        </DialogTitle>
        <DialogContent>
          {selectedJob?.metrics && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Current Metrics
                      </Typography>
                      <Typography variant="body2">
                        Epoch: {selectedJob.metrics.epoch}
                      </Typography>
                      <Typography variant="body2">
                        Loss: {selectedJob.metrics.loss.toFixed(4)}
                      </Typography>
                      <Typography variant="body2">
                        Accuracy: {(selectedJob.metrics.accuracy * 100).toFixed(2)}%
                      </Typography>
                      <Typography variant="body2">
                        Validation Loss: {selectedJob.metrics.validationLoss.toFixed(4)}
                      </Typography>
                      <Typography variant="body2">
                        Validation Accuracy: {(selectedJob.metrics.validationAccuracy * 100).toFixed(2)}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Configuration
                      </Typography>
                      <Typography variant="body2">
                        Architecture: {selectedJob.modelConfig.architecture}
                      </Typography>
                      <Typography variant="body2">
                        Batch Size: {selectedJob.modelConfig.trainingConfig.batchSize}
                      </Typography>
                      <Typography variant="body2">
                        Learning Rate: {selectedJob.modelConfig.trainingConfig.learningRate}
                      </Typography>
                      <Typography variant="body2">
                        Optimizer: {selectedJob.modelConfig.trainingConfig.optimizer}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default TrainingDashboard