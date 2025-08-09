import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Chip,
  Rating,
  Button,
  Grid,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'
import {
  Visibility as ViewIcon,
  Download as DownloadIcon,
  Feedback as FeedbackIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { SearchResult, UserFeedback } from '../../types'
import { apiService } from '../../services/api'

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  loading?: boolean
  onFeedback?: (resultId: string, feedback: UserFeedback) => void
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  query,
  loading = false,
  onFeedback,
}) => {
  const navigate = useNavigate()
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean
    result: SearchResult | null
  }>({ open: false, result: null })
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 0,
    comment: '',
    helpful: true,
  })

  const handleView = (result: SearchResult) => {
    if (result.file) {
      navigate(`/viewer/${result.file.id}`)
    }
  }

  const handleDownload = async (result: SearchResult) => {
    if (result.file) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/files/${result.file.id}/download`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            },
          }
        )
        
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = result.file.originalName
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        }
      } catch (error) {
        console.error('Download failed:', error)
      }
    }
  }

  const handleFeedbackOpen = (result: SearchResult) => {
    setFeedbackDialog({ open: true, result })
    setFeedbackForm({
      rating: result.userFeedback?.rating || 0,
      comment: result.userFeedback?.comment || '',
      helpful: result.userFeedback?.helpful ?? true,
    })
  }

  const handleFeedbackSubmit = async () => {
    if (!feedbackDialog.result) return

    try {
      const feedback: UserFeedback = {
        rating: feedbackForm.rating,
        comment: feedbackForm.comment,
        helpful: feedbackForm.helpful,
        timestamp: new Date().toISOString(),
      }

      const response = await apiService.post('/search/feedback', {
        queryId: query, // This should be the actual query ID from the search
        resultId: feedbackDialog.result.fileId,
        ...feedback,
      })

      if (response.success) {
        onFeedback?.(feedbackDialog.result.fileId, feedback)
        setFeedbackDialog({ open: false, result: null })
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'success'
    if (score >= 0.6) return 'warning'
    return 'error'
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success'
    if (confidence >= 0.6) return 'info'
    return 'warning'
  }

  if (loading) {
    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Searching...
        </Typography>
        <LinearProgress />
      </Box>
    )
  }

  if (results.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No results found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try adjusting your search query or filters
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Search Results ({results.length} found)
      </Typography>

      <Grid container spacing={3}>
        {results.map((result, index) => (
          <Grid item xs={12} key={result.fileId}>
            <Card sx={{ display: 'flex', height: 200 }}>
              <CardMedia
                component="img"
                sx={{ width: 200, objectFit: 'cover' }}
                image={result.file?.thumbnailUrl || '/placeholder-cad.png'}
                alt={result.file?.originalName}
              />
              
              <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" component="h3">
                    {result.file?.originalName}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                      label={`${Math.round(result.relevanceScore * 100)}% relevant`}
                      color={getRelevanceColor(result.relevanceScore) as any}
                      size="small"
                    />
                    <Chip
                      label={`${Math.round(result.confidence * 100)}% confidence`}
                      color={getConfidenceColor(result.confidence) as any}
                      size="small"
                    />
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {result.file?.description || 'No description available'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  {result.file?.projectName && (
                    <Chip label={`Project: ${result.file.projectName}`} size="small" variant="outlined" />
                  )}
                  {result.file?.partName && (
                    <Chip label={`Part: ${result.file.partName}`} size="small" variant="outlined" />
                  )}
                  <Chip label={formatFileSize(result.file?.fileSize || 0)} size="small" variant="outlined" />
                </Box>

                {result.matchedFeatures.length > 0 && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Matched features:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {result.matchedFeatures.slice(0, 5).map((feature, idx) => (
                        <Chip key={idx} label={feature} size="small" color="primary" />
                      ))}
                      {result.matchedFeatures.length > 5 && (
                        <Chip label={`+${result.matchedFeatures.length - 5}`} size="small" />
                      )}
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, mt: 'auto', alignItems: 'center' }}>
                  <Button
                    startIcon={<ViewIcon />}
                    onClick={() => handleView(result)}
                    variant="contained"
                    size="small"
                  >
                    View
                  </Button>
                  
                  <Button
                    startIcon={<DownloadIcon />}
                    onClick={() => handleDownload(result)}
                    variant="outlined"
                    size="small"
                  >
                    Download
                  </Button>

                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {result.userFeedback && (
                      <Rating
                        value={result.userFeedback.rating}
                        size="small"
                        readOnly
                      />
                    )}
                    
                    <Tooltip title="Provide feedback">
                      <IconButton
                        size="small"
                        onClick={() => handleFeedbackOpen(result)}
                        color={result.userFeedback ? 'primary' : 'default'}
                      >
                        <FeedbackIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Feedback Dialog */}
      <Dialog
        open={feedbackDialog.open}
        onClose={() => setFeedbackDialog({ open: false, result: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Provide Feedback</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            How relevant was this result to your search query?
          </Typography>
          
          <Box sx={{ my: 2 }}>
            <Typography component="legend">Rating</Typography>
            <Rating
              value={feedbackForm.rating}
              onChange={(_, newValue) =>
                setFeedbackForm(prev => ({ ...prev, rating: newValue || 0 }))
              }
            />
          </Box>

          <TextField
            fullWidth
            label="Comments (optional)"
            multiline
            rows={3}
            value={feedbackForm.comment}
            onChange={(e) =>
              setFeedbackForm(prev => ({ ...prev, comment: e.target.value }))
            }
            margin="normal"
            placeholder="Tell us more about this result..."
          />

          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button
              variant={feedbackForm.helpful ? 'contained' : 'outlined'}
              startIcon={<ThumbUpIcon />}
              onClick={() => setFeedbackForm(prev => ({ ...prev, helpful: true }))}
              size="small"
            >
              Helpful
            </Button>
            <Button
              variant={!feedbackForm.helpful ? 'contained' : 'outlined'}
              startIcon={<ThumbDownIcon />}
              onClick={() => setFeedbackForm(prev => ({ ...prev, helpful: false }))}
              size="small"
            >
              Not Helpful
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeedbackDialog({ open: false, result: null })}>
            Cancel
          </Button>
          <Button onClick={handleFeedbackSubmit} variant="contained">
            Submit Feedback
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default SearchResults