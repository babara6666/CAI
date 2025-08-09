import React, { useState } from 'react'
import { Box, Typography, Alert, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/FileUpload/FileUploader'
import FileGrid from '../components/FileManagement/FileGrid'
import { CADFile, UploadProgress } from '../types'

const UploadPage: React.FC = () => {
  const navigate = useNavigate()
  const [uploadedFiles, setUploadedFiles] = useState<CADFile[]>([])
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [showSuccess, setShowSuccess] = useState(false)

  const handleUploadComplete = (files: CADFile[]) => {
    setUploadedFiles(prev => [...prev, ...files])
    setShowSuccess(true)
    
    // Hide success message after 5 seconds
    setTimeout(() => {
      setShowSuccess(false)
    }, 5000)
  }

  const handleUploadProgress = (progress: UploadProgress[]) => {
    setUploadProgress(progress)
  }

  const handleFileUpdate = (updatedFile: CADFile) => {
    setUploadedFiles(prev =>
      prev.map(file => file.id === updatedFile.id ? updatedFile : file)
    )
  }

  const handleFileDelete = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Upload CAD Files
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Upload your CAD files to make them searchable with AI. Supported formats include
        DWG, DXF, STEP, IGES, STL, and OBJ files.
      </Typography>

      {showSuccess && (
        <Alert 
          severity="success" 
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/search')}>
              Search Files
            </Button>
          }
        >
          Files uploaded successfully! They are now available for search and dataset creation.
        </Alert>
      )}

      <FileUploader
        onUploadComplete={handleUploadComplete}
        onUploadProgress={handleUploadProgress}
        maxFiles={10}
        maxFileSize={100 * 1024 * 1024} // 100MB
        acceptedFileTypes={['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.obj']}
      />

      {uploadedFiles.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Recently Uploaded Files
          </Typography>
          
          <FileGrid
            files={uploadedFiles}
            onFileUpdate={handleFileUpdate}
            onFileDelete={handleFileDelete}
          />
        </Box>
      )}
    </Box>
  )
}

export default UploadPage