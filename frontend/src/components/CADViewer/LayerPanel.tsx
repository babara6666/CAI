import React from 'react'
import {
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Divider,
  IconButton,
  Collapse,
  Box
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  ExpandLess,
  ExpandMore,
  Layers as LayersIcon,
  Circle as CircleIcon
} from '@mui/icons-material'
import { CADLayer } from '../../types/cad'

interface LayerPanelProps {
  layers: CADLayer[]
  layerVisibility: Record<string, boolean>
  onLayerVisibilityChange: (layerId: string, visible: boolean) => void
  onToggleAllLayers: (visible: boolean) => void
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  layerVisibility,
  onLayerVisibilityChange,
  onToggleAllLayers
}) => {
  const [expanded, setExpanded] = React.useState(true)
  
  const visibleLayerCount = layers.filter(layer => layerVisibility[layer.id] !== false).length
  const allVisible = visibleLayerCount === layers.length
  const someVisible = visibleLayerCount > 0 && visibleLayerCount < layers.length

  const handleToggleExpanded = () => {
    setExpanded(!expanded)
  }

  const handleToggleAll = () => {
    onToggleAllLayers(!allVisible)
  }

  const getLayerObjectCount = (layer: CADLayer): number => {
    return layer.objects.length
  }

  const getLayerIcon = (layer: CADLayer) => {
    // Return different icons based on layer content
    const hasLines = layer.objects.some(obj => obj.type === 'line')
    const hasCircles = layer.objects.some(obj => obj.type === 'circle')
    const hasMeshes = layer.objects.some(obj => obj.type === 'polyline')
    
    if (hasMeshes) return <LayersIcon fontSize="small" />
    if (hasCircles) return <CircleIcon fontSize="small" />
    return <LayersIcon fontSize="small" />
  }

  return (
    <Paper 
      elevation={2} 
      sx={{ 
        width: 280, 
        maxHeight: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LayersIcon />
            Layers ({layers.length})
          </Typography>
          <IconButton size="small" onClick={handleToggleExpanded}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <Checkbox
            checked={allVisible}
            indeterminate={someVisible}
            onChange={handleToggleAll}
            size="small"
          />
          <Typography variant="body2" color="text.secondary">
            {allVisible ? 'Hide All' : 'Show All'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {visibleLayerCount} visible
          </Typography>
        </Box>
      </Box>

      {/* Layer List */}
      <Collapse in={expanded} sx={{ flex: 1, overflow: 'hidden' }}>
        <List 
          sx={{ 
            flex: 1, 
            overflow: 'auto',
            maxHeight: 'calc(100vh - 200px)',
            '& .MuiListItem-root': {
              borderBottom: '1px solid',
              borderColor: 'divider'
            }
          }}
        >
          {layers.map((layer) => {
            const isVisible = layerVisibility[layer.id] !== false
            const objectCount = getLayerObjectCount(layer)
            
            return (
              <ListItem
                key={layer.id}
                dense
                sx={{
                  opacity: isVisible ? 1 : 0.6,
                  transition: 'opacity 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    edge="start"
                    checked={isVisible}
                    onChange={(e) => onLayerVisibilityChange(layer.id, e.target.checked)}
                    size="small"
                    icon={<VisibilityOff />}
                    checkedIcon={<Visibility />}
                  />
                </ListItemIcon>
                
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Box sx={{ color: layer.color || 'text.secondary' }}>
                    {getLayerIcon(layer)}
                  </Box>
                </ListItemIcon>
                
                <ListItemText
                  primary={
                    <Typography variant="body2" noWrap>
                      {layer.name}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {objectCount} object{objectCount !== 1 ? 's' : ''}
                    </Typography>
                  }
                />
                
                {layer.color && (
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: layer.color,
                      border: '1px solid',
                      borderColor: 'divider',
                      ml: 1
                    }}
                  />
                )}
              </ListItem>
            )
          })}
          
          {layers.length === 0 && (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary" align="center">
                    No layers found
                  </Typography>
                }
              />
            </ListItem>
          )}
        </List>
      </Collapse>
      
      {/* Footer with layer statistics */}
      <Divider />
      <Box sx={{ p: 1.5, backgroundColor: 'grey.50' }}>
        <Typography variant="caption" color="text.secondary">
          Total objects: {layers.reduce((sum, layer) => sum + layer.objects.length, 0)}
        </Typography>
      </Box>
    </Paper>
  )
}