import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Backdrop,
  Snackbar
} from '@mui/material'
import { ThreeJSViewer } from './ThreeJSViewer'
import { LayerPanel } from './LayerPanel'
import { ViewerControls } from './ViewerControls'
import { CADParserService } from '../../services/CADParserService'
import { ParsedCADData, ViewerControls as ViewerControlsType } from '../../types/cad'

interface CADViewerProps {
  fileId?: string
  fileUrl?: string
  filename?: string
}

const CADViewer: React.FC<CADViewerProps> = ({ 
  fileId: propFileId, 
  fileUrl: propFileUrl, 
  filename: propFilename 
}) => {
  const { fileId: paramFileId } = useParams<{ fileId: string }>()
  const fileId = propFileId || paramFileId
  
  const [cadData, setCadData] = useState<ParsedCADData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({})
  const [viewerControls, setViewerControls] = useState<ViewerControlsType>({
    zoom: 100,
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 100, y: 100, z: 100 },
    target: { x: 0, y: 0, z: 0 }
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [wireframeMode, setWireframeMode] = useState(false)
  const [progressiveLoading, setProgressiveLoading] = useState(true)
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)

  const parserService = CADParserService.getInstance()

  // Load CAD file
  useEffect(() => {
    if (!fileId && !propFileUrl) return

    const loadCADFile = async () => {
      setLoading(true)
      setError(null)

      try {
        let fileUrl = propFileUrl
        let filename = propFilename || 'unknown.cad'

        // If we have a fileId, fetch the file info from API
        if (fileId && !propFileUrl) {
          // In a real app, this would be an API call
          // For now, we'll simulate it
          fileUrl = `/api/files/${fileId}/download`
          filename = `file_${fileId}.dxf` // Simulated filename
        }

        if (!fileUrl) {
          throw new Error('No file URL provided')
        }

        // Check if format is supported
        if (!parserService.isSupportedFormat(filename)) {
          throw new Error(`Unsupported file format: ${filename}`)
        }

        // Fetch the file
        const response = await fetch(fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        
        // Parse the CAD file
        const parsedData = await parserService.parseCADFile(arrayBuffer, filename)
        setCadData(parsedData)

        // Initialize layer visibility
        const initialVisibility: Record<string, boolean> = {}
        parsedData.layers.forEach(layer => {
          initialVisibility[layer.id] = true
        })
        setLayerVisibility(initialVisibility)

        setSnackbarMessage(`Successfully loaded ${filename}`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load CAD file'
        setError(errorMessage)
        console.error('CAD file loading error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCADFile()
  }, [fileId, propFileUrl, propFilename])

  // Handle layer visibility changes
  const handleLayerVisibilityChange = useCallback((layerId: string, visible: boolean) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerId]: visible
    }))
  }, [])

  const handleToggleAllLayers = useCallback((visible: boolean) => {
    if (!cadData) return
    
    const newVisibility: Record<string, boolean> = {}
    cadData.layers.forEach(layer => {
      newVisibility[layer.id] = visible
    })
    setLayerVisibility(newVisibility)
  }, [cadData])

  // Viewer control handlers
  const handleZoomIn = useCallback(() => {
    setViewerControls(prev => ({
      ...prev,
      zoom: Math.max(1, prev.zoom * 0.8)
    }))
  }, [])

  const handleZoomOut = useCallback(() => {
    setViewerControls(prev => ({
      ...prev,
      zoom: Math.min(1000, prev.zoom * 1.2)
    }))
  }, [])

  const handleResetView = useCallback(() => {
    setViewerControls({
      zoom: 100,
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 100, y: 100, z: 100 },
      target: { x: 0, y: 0, z: 0 }
    })
  }, [])

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  const handleZoomChange = useCallback((zoom: number) => {
    setViewerControls(prev => ({
      ...prev,
      zoom
    }))
  }, [])

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const handleCloseSnackbar = () => {
    setSnackbarMessage(null)
  }

  if (loading) {
    return (
      <Backdrop open={true} sx={{ color: '#fff', zIndex: 1300 }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading CAD file...
          </Typography>
        </Box>
      </Backdrop>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="error" sx={{ maxWidth: 600 }}>
          <Typography variant="h6" gutterBottom>
            Failed to load CAD file
          </Typography>
          <Typography variant="body2">
            {error}
          </Typography>
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Layer Panel */}
      {cadData && (
        <Box sx={{ 
          position: 'absolute', 
          left: 16, 
          top: 16, 
          bottom: 16, 
          zIndex: 1000,
          maxHeight: 'calc(100vh - 32px)'
        }}>
          <LayerPanel
            layers={cadData.layers}
            layerVisibility={layerVisibility}
            onLayerVisibilityChange={handleLayerVisibilityChange}
            onToggleAllLayers={handleToggleAllLayers}
          />
        </Box>
      )}

      {/* Main Viewer */}
      <Box sx={{ 
        flex: 1, 
        position: 'relative',
        ml: cadData ? '312px' : 0, // Account for layer panel width + margin
        transition: 'margin-left 0.3s ease'
      }}>
        <ThreeJSViewer
          cadData={cadData}
          onControlsChange={setViewerControls}
          layerVisibility={layerVisibility}
          progressiveLoading={progressiveLoading}
        />

        {/* Viewer Controls */}
        <ViewerControls
          controls={viewerControls}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          showGrid={showGrid}
          onToggleGrid={setShowGrid}
          showAxes={showAxes}
          onToggleAxes={setShowAxes}
          wireframeMode={wireframeMode}
          onToggleWireframe={setWireframeMode}
          onZoomChange={handleZoomChange}
        />

        {/* File Info */}
        {cadData && (
          <Paper 
            elevation={2} 
            sx={{ 
              position: 'absolute', 
              bottom: 16, 
              left: 16, 
              p: 2,
              minWidth: 200,
              zIndex: 1000
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              File Information
            </Typography>
            <Typography variant="caption" display="block">
              Format: {cadData.metadata.format}
            </Typography>
            <Typography variant="caption" display="block">
              Units: {cadData.units}
            </Typography>
            <Typography variant="caption" display="block">
              Layers: {cadData.layers.length}
            </Typography>
            <Typography variant="caption" display="block">
              Objects: {cadData.layers.reduce((sum, layer) => sum + layer.objects.length, 0)}
            </Typography>
          </Paper>
        )}
      </Box>

      {/* Snackbar for notifications */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}

export default CADViewer