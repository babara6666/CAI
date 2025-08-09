import React from 'react'
import {
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Typography,
  Box,
  Slider,
  FormControlLabel,
  Switch
} from '@mui/material'
import {
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  ThreeDRotation,
  PanTool,
  Fullscreen,
  FullscreenExit,
  GridOn,
  GridOff,
  Visibility,
  Settings
} from '@mui/icons-material'
import { ViewerControls as ViewerControlsType } from '../../types/cad'

interface ViewerControlsProps {
  controls: ViewerControlsType
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
  showGrid: boolean
  onToggleGrid: (show: boolean) => void
  showAxes: boolean
  onToggleAxes: (show: boolean) => void
  wireframeMode: boolean
  onToggleWireframe: (wireframe: boolean) => void
  onZoomChange: (zoom: number) => void
}

export const ViewerControls: React.FC<ViewerControlsProps> = ({
  controls,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleFullscreen,
  isFullscreen,
  showGrid,
  onToggleGrid,
  showAxes,
  onToggleAxes,
  wireframeMode,
  onToggleWireframe,
  onZoomChange
}) => {
  const [showSettings, setShowSettings] = React.useState(false)

  const handleZoomSliderChange = (_: Event, value: number | number[]) => {
    onZoomChange(Array.isArray(value) ? value[0] : value)
  }

  return (
    <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
      {/* Main Controls */}
      <Paper 
        elevation={3} 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          p: 1,
          mb: 1,
          minWidth: 48
        }}
      >
        <Tooltip title="Zoom In" placement="left">
          <IconButton onClick={onZoomIn} size="small">
            <ZoomIn />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Zoom Out" placement="left">
          <IconButton onClick={onZoomOut} size="small">
            <ZoomOut />
          </IconButton>
        </Tooltip>
        
        <Divider sx={{ my: 0.5 }} />
        
        <Tooltip title="Reset View" placement="left">
          <IconButton onClick={onResetView} size="small">
            <CenterFocusStrong />
          </IconButton>
        </Tooltip>
        
        <Divider sx={{ my: 0.5 }} />
        
        <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} placement="left">
          <IconButton onClick={onToggleFullscreen} size="small">
            {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Settings" placement="left">
          <IconButton 
            onClick={() => setShowSettings(!showSettings)} 
            size="small"
            color={showSettings ? "primary" : "default"}
          >
            <Settings />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Settings Panel */}
      {showSettings && (
        <Paper elevation={3} sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="subtitle2" gutterBottom>
            Display Settings
          </Typography>
          
          <FormControlLabel
            control={
              <Switch
                checked={showGrid}
                onChange={(e) => onToggleGrid(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {showGrid ? <GridOn fontSize="small" /> : <GridOff fontSize="small" />}
                Grid
              </Box>
            }
            sx={{ mb: 1 }}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={showAxes}
                onChange={(e) => onToggleAxes(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ThreeDRotation fontSize="small" />
                Axes
              </Box>
            }
            sx={{ mb: 1 }}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={wireframeMode}
                onChange={(e) => onToggleWireframe(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Visibility fontSize="small" />
                Wireframe
              </Box>
            }
            sx={{ mb: 2 }}
          />
          
          <Typography variant="caption" gutterBottom display="block">
            Zoom Level
          </Typography>
          <Slider
            value={controls.zoom}
            onChange={handleZoomSliderChange}
            min={1}
            max={1000}
            size="small"
            valueLabelDisplay="auto"
            sx={{ mb: 2 }}
          />
          
          <Divider sx={{ my: 1 }} />
          
          <Typography variant="caption" color="text.secondary">
            Controls:
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" display="block" color="text.secondary">
              • Left click + drag: Rotate
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              • Right click + drag: Pan
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              • Mouse wheel: Zoom
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Status Panel */}
      <Paper elevation={2} sx={{ p: 1.5, mt: 1, minWidth: 200 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Camera Position
        </Typography>
        <Typography variant="caption" display="block">
          X: {controls.position.x.toFixed(1)}
        </Typography>
        <Typography variant="caption" display="block">
          Y: {controls.position.y.toFixed(1)}
        </Typography>
        <Typography variant="caption" display="block">
          Z: {controls.position.z.toFixed(1)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          Zoom: {controls.zoom.toFixed(1)}
        </Typography>
      </Paper>
    </Box>
  )
}