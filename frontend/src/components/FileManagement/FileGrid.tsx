import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Pagination,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  MoreVert as MoreIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  History as HistoryIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { CADFile, PaginatedResponse, SearchFilters } from '../../types'
import { apiService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

interface FileGridProps {
  files?: CADFile[]
  filters?: SearchFilters
  onFileUpdate?: (file: CADFile) => void
  onFileDelete?: (fileId: string) => void
  loading?: boolean
}

const FileGrid: React.FC<FileGridProps> = ({
  files: propFiles,
  filters,
  onFileUpdate,
  onFileDelete,
  loading: propLoading,
}) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [files, setFiles] = useState<CADFile[]>(propFiles || [])
  const [loading, setLoading] = useState(propLoading || false)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedFile, setSelectedFile] = useState<CADFile | null>(null)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (!propFiles) {
      fetchFiles()
    }
  }, [filters, page, propFiles])

  useEffect(() => {
    if (propFiles) {
      setFiles(propFiles)
    }
  }, [propFiles])

  const fetchFiles = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiService.get<PaginatedResponse<CADFile>>('/files', {
        page,
        limit: 12,
        ...filters,
      })

      if (response.success && response.data) {
        setFiles(response.data.data)
        setTotalPages(response.data.pagination.totalPages)
      } else {
        setError(response.error?.message || 'Failed to fetch files')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch files')
    } finally {
      setLoading(false)
    }
  }

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, file: CADFile) => {
    setAnchorEl(event.currentTarget)
    setSelectedFile(file)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedFile(null)
  }

  const handleView = () => {
    if (selectedFile) {
      navigate(`/viewer/${selectedFile.id}`)
    }
    handleMenuClose()
  }

  const handleDownload = async () => {
    if (selectedFile) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/files/${selectedFile.id}/download`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        })
        
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = selectedFile.originalName
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        }
      } catch (error) {
        console.error('Download failed:', error)
      }
    }
    handleMenuClose()
  }

  const handleEdit = () => {
    setEditDialogOpen(true)
    handleMenuClose()
  }

  const handleDelete = () => {
    setDeleteDialogOpen(true)
    handleMenuClose()
  }

  const handleVersionHistory = () => {
    if (selectedFile) {
      navigate(`/files/${selectedFile.id}/versions`)
    }
    handleMenuClose()
  }

  const handleEditSave = async (updatedFile: Partial<CADFile>) => {
    if (!selectedFile) return

    try {
      const response = await apiService.put<CADFile>(`/files/${selectedFile.id}`, updatedFile)
      
      if (response.success && response.data) {
        const updated = response.data
        setFiles(prev => prev.map(f => f.id === updated.id ? updated : f))
        onFileUpdate?.(updated)
        setEditDialogOpen(false)
      } else {
        setError(response.error?.message || 'Failed to update file')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to update file')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!selectedFile) return

    try {
      const response = await apiService.delete(`/files/${selectedFile.id}`)
      
      if (response.success) {
        setFiles(prev => prev.filter(f => f.id !== selectedFile.id))
        onFileDelete?.(selectedFile.id)
        setDeleteDialogOpen(false)
      } else {
        setError(response.error?.message || 'Failed to delete file')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to delete file')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const canEditFile = (file: CADFile) => {
    return user?.role === 'admin' || file.uploadedBy === user?.id
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    )
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {files.map((file) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={file.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardMedia
                component="img"
                height="200"
                image={file.thumbnailUrl || '/placeholder-cad.png'}
                alt={file.originalName}
                sx={{ objectFit: 'cover', cursor: 'pointer' }}
                onClick={() => navigate(`/viewer/${file.id}`)}
              />
              
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="h3" noWrap title={file.originalName}>
                  {file.originalName}
                </Typography>
                
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {formatFileSize(file.fileSize)}
                </Typography>
                
                {file.projectName && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Project: {file.projectName}
                  </Typography>
                )}
                
                {file.partName && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Part: {file.partName}
                  </Typography>
                )}
                
                <Typography variant="caption" color="text.secondary">
                  Uploaded: {new Date(file.uploadedAt).toLocaleDateString()}
                </Typography>
                
                <Box sx={{ mt: 1 }}>
                  {file.tags.slice(0, 3).map((tag) => (
                    <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                  ))}
                  {file.tags.length > 3 && (
                    <Chip label={`+${file.tags.length - 3}`} size="small" />
                  )}
                </Box>
              </CardContent>
              
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Button size="small" startIcon={<ViewIcon />} onClick={() => navigate(`/viewer/${file.id}`)}>
                  View
                </Button>
                
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, file)}
                >
                  <MoreIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {files.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No CAD files found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload some files to get started
          </Typography>
        </Box>
      )}

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleView}>
          <ViewIcon sx={{ mr: 1 }} />
          View
        </MenuItem>
        <MenuItem onClick={handleDownload}>
          <DownloadIcon sx={{ mr: 1 }} />
          Download
        </MenuItem>
        <MenuItem onClick={handleVersionHistory}>
          <HistoryIcon sx={{ mr: 1 }} />
          Version History
        </MenuItem>
        {selectedFile && canEditFile(selectedFile) && (
          <>
            <MenuItem onClick={handleEdit}>
              <EditIcon sx={{ mr: 1 }} />
              Edit
            </MenuItem>
            <MenuItem onClick={handleDelete}>
              <DeleteIcon sx={{ mr: 1 }} />
              Delete
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Edit Dialog */}
      <EditFileDialog
        open={editDialogOpen}
        file={selectedFile}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEditSave}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete File</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedFile?.originalName}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Edit File Dialog Component
interface EditFileDialogProps {
  open: boolean
  file: CADFile | null
  onClose: () => void
  onSave: (updatedFile: Partial<CADFile>) => void
}

const EditFileDialog: React.FC<EditFileDialogProps> = ({ open, file, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    projectName: '',
    partName: '',
    description: '',
    tags: '',
  })

  useEffect(() => {
    if (file) {
      setFormData({
        projectName: file.projectName || '',
        partName: file.partName || '',
        description: file.description || '',
        tags: file.tags.join(', '),
      })
    }
  }, [file])

  const handleSave = () => {
    const updatedFile = {
      projectName: formData.projectName || undefined,
      partName: formData.partName || undefined,
      description: formData.description || undefined,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
    }
    onSave(updatedFile)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit File</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Project Name"
          value={formData.projectName}
          onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Part Name"
          value={formData.partName}
          onChange={(e) => setFormData(prev => ({ ...prev, partName: e.target.value }))}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          margin="normal"
          multiline
          rows={3}
        />
        <TextField
          fullWidth
          label="Tags (comma separated)"
          value={formData.tags}
          onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
          margin="normal"
          helperText="Separate tags with commas"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default FileGrid