import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  Button,
  Chip,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import { apiService } from '../../services/api'
import { UploadProgress, CADFile } from '../../types'

interface FileUploaderProps {
  onUploadComplete?: (files: CADFile[]) => void
  onUploadProgress?: (progress: UploadProgress[]) => void
  maxFiles?: number
  maxFileSize?: number // in bytes
  acceptedFileTypes?: string[]
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onUploadComplete,
  onUploadProgress,
  maxFiles = 10,
  maxFileSize = 100 * 1024 * 1024, // 100MB
  acceptedFileTypes = ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.obj'],
}) => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<CADFile[]>([])
  const [error, setError] = useState<string>('')

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError('')
      
      // Validate file count
      if (acceptedFiles.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`)
        return
      }

      // Validate file sizes
      const oversizedFiles = acceptedFiles.filter(file => file.size > maxFileSize)
      if (oversizedFiles.length > 0) {
        setError(`Files too large. Maximum size: ${Math.round(maxFileSize / (1024 * 1024))}MB`)
        return
      }

      // Initialize progress tracking
      const initialProgress: UploadProgress[] = acceptedFiles.map(file => ({
        fileId: `temp-${Date.now()}-${Math.random()}`,
        filename: file.name,
        progress: 0,
        status: 'uploading',
      }))

      setUploadProgress(initialProgress)
      onUploadProgress?.(initialProgress)

      // Upload files
      const uploadPromises = acceptedFiles.map(async (file, index) => {
        const formData = new FormData()
        formData.append('file', file)

        try {
          const response = await apiService.upload<CADFile[]>(
            '/files/upload',
            formData,
            (progress) => {
              setUploadProgress(prev => {
                const updated = [...prev]
                updated[index] = {
                  ...updated[index],
                  progress,
                  status: progress === 100 ? 'processing' : 'uploading',
                }
                onUploadProgress?.(updated)
                return updated
              })
            }
          )

          if (response.success && response.data) {
            setUploadProgress(prev => {
              const updated = [...prev]
              updated[index] = {
                ...updated[index],
                progress: 100,
                status: 'completed',
              }
              onUploadProgress?.(updated)
              return updated
            })
            return response.data[0] // Assuming single file upload returns array with one item
          } else {
            throw new Error(response.error?.message || 'Upload failed')
          }
        } catch (error: any) {
          setUploadProgress(prev => {
            const updated = [...prev]
            updated[index] = {
              ...updated[index],
              status: 'error',
              error: error.message,
            }
            onUploadProgress?.(updated)
            return updated
          })
          throw error
        }
      })

      try {
        const results = await Promise.allSettled(uploadPromises)
        const successfulUploads = results
          .filter((result): result is PromiseFulfilledResult<CADFile> => result.status === 'fulfilled')
          .map(result => result.value)

        setUploadedFiles(prev => [...prev, ...successfulUploads])
        onUploadComplete?.(successfulUploads)

        const failedUploads = results.filter(result => result.status === 'rejected')
        if (failedUploads.length > 0) {
          setError(`${failedUploads.length} file(s) failed to upload`)
        }
      } catch (error: any) {
        setError(error.message || 'Upload failed')
      }
    },
    [maxFiles, maxFileSize, onUploadComplete, onUploadProgress]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce((acc, type) => {
      acc[`application/${type.slice(1)}`] = [type]
      return acc
    }, {} as Record<string, string[]>),
    maxFiles,
    maxSize: maxFileSize,
  })

  const removeFile = (index: number) => {
    setUploadProgress(prev => prev.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    setUploadProgress([])
    setUploadedFiles([])
    setError('')
  }

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckIcon color="success" />
      case 'error':
        return <ErrorIcon color="error" />
      default:
        return null
    }
  }

  const getStatusColor = (status: UploadProgress['status']) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'error':
        return 'error'
      case 'processing':
        return 'warning'
      default:
        return 'primary'
    }
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper
        {...getRootProps()}
        sx={{
          p: 4,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive ? 'Drop files here' : 'Drag & drop CAD files here'}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          or click to select files
        </Typography>
        <Box sx={{ mt: 2 }}>
          {acceptedFileTypes.map(type => (
            <Chip key={type} label={type.toUpperCase()} size="small" sx={{ mr: 1, mb: 1 }} />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Maximum {maxFiles} files, {Math.round(maxFileSize / (1024 * 1024))}MB each
        </Typography>
      </Paper>

      {uploadProgress.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Upload Progress</Typography>
            <Button onClick={clearAll} size="small">
              Clear All
            </Button>
          </Box>

          <List>
            {uploadProgress.map((file, index) => (
              <ListItem key={file.fileId} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">{file.filename}</Typography>
                      <Chip
                        label={file.status.toUpperCase()}
                        size="small"
                        color={getStatusColor(file.status) as any}
                      />
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      {file.status === 'uploading' || file.status === 'processing' ? (
                        <LinearProgress
                          variant="determinate"
                          value={file.progress}
                          sx={{ width: '100%' }}
                        />
                      ) : null}
                      {file.error && (
                        <Typography variant="caption" color="error">
                          {file.error}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  {getStatusIcon(file.status)}
                  <IconButton
                    edge="end"
                    onClick={() => removeFile(index)}
                    size="small"
                    sx={{ ml: 1 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  )
}

export default FileUploader