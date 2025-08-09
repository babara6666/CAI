import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Chip,
  Autocomplete,
  Grid,
  Card,
  CardContent,
  Collapse,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Alert,
} from '@mui/material'
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { SearchFilters, SearchResult, AIModel } from '../../types'
import { apiService } from '../../services/api'

interface SearchInterfaceProps {
  onSearch: (query: string, filters: SearchFilters, modelId?: string) => void
  onClearResults?: () => void
  loading?: boolean
  error?: string
}

const SearchInterface: React.FC<SearchInterfaceProps> = ({
  onSearch,
  onClearResults,
  loading = false,
  error,
}) => {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [availableModels, setAvailableModels] = useState<AIModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [availableProjects, setAvailableProjects] = useState<string[]>([])

  useEffect(() => {
    fetchAvailableModels()
    fetchAvailableTags()
    fetchAvailableProjects()
  }, [])

  useEffect(() => {
    if (query.length > 2) {
      fetchSuggestions(query)
    } else {
      setSuggestions([])
    }
  }, [query])

  const fetchAvailableModels = async () => {
    try {
      const response = await apiService.get<AIModel[]>('/ai/models')
      if (response.success && response.data) {
        setAvailableModels(response.data.filter(model => model.status === 'ready'))
        // Set default model
        const defaultModel = response.data.find(model => model.isDefault && model.status === 'ready')
        if (defaultModel) {
          setSelectedModel(defaultModel.id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  const fetchAvailableTags = async () => {
    try {
      const response = await apiService.get<string[]>('/files/tags')
      if (response.success && response.data) {
        setAvailableTags(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    }
  }

  const fetchAvailableProjects = async () => {
    try {
      const response = await apiService.get<string[]>('/files/projects')
      if (response.success && response.data) {
        setAvailableProjects(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const fetchSuggestions = async (partial: string) => {
    try {
      const response = await apiService.get<string[]>('/search/suggestions', { partial })
      if (response.success && response.data) {
        setSuggestions(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error)
    }
  }

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim(), filters, selectedModel || undefined)
    }
  }

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }

  const handleClearFilters = () => {
    setFilters({})
    setQuery('')
    onClearResults?.()
  }

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  const removeTag = (tagToRemove: string) => {
    updateFilter('tags', filters.tags?.filter(tag => tag !== tagToRemove) || [])
  }

  const hasActiveFilters = () => {
    return Object.values(filters).some(value => {
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0
      return value !== undefined && value !== ''
    })
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <Autocomplete
                freeSolo
                options={suggestions}
                value={query}
                onInputChange={(_, newValue) => setQuery(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    placeholder="Search CAD files using natural language..."
                    variant="outlined"
                    onKeyPress={handleKeyPress}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                    }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>AI Model</InputLabel>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  label="AI Model"
                >
                  <MenuItem value="">
                    <em>Default</em>
                  </MenuItem>
                  {availableModels.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      {model.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  disabled={loading || !query.trim()}
                  fullWidth
                >
                  {loading ? 'Searching...' : 'Search'}
                </Button>
                <IconButton
                  onClick={() => setShowFilters(!showFilters)}
                  color={hasActiveFilters() ? 'primary' : 'default'}
                >
                  <FilterIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>

          {/* Active Filters Display */}
          {hasActiveFilters() && (
            <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Active filters:
              </Typography>
              
              {filters.tags?.map((tag) => (
                <Chip
                  key={tag}
                  label={`Tag: ${tag}`}
                  onDelete={() => removeTag(tag)}
                  size="small"
                  color="primary"
                />
              ))}
              
              {filters.projectName && (
                <Chip
                  label={`Project: ${filters.projectName}`}
                  onDelete={() => updateFilter('projectName', undefined)}
                  size="small"
                  color="primary"
                />
              )}
              
              {filters.partName && (
                <Chip
                  label={`Part: ${filters.partName}`}
                  onDelete={() => updateFilter('partName', undefined)}
                  size="small"
                  color="primary"
                />
              )}
              
              {filters.dateRange && (
                <Chip
                  label={`Date: ${new Date(filters.dateRange.start).toLocaleDateString()} - ${new Date(filters.dateRange.end).toLocaleDateString()}`}
                  onDelete={() => updateFilter('dateRange', undefined)}
                  size="small"
                  color="primary"
                />
              )}
              
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleClearFilters}
              >
                Clear All
              </Button>
            </Box>
          )}

          {/* Advanced Filters */}
          <Collapse in={showFilters}>
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Advanced Filters</Typography>
                  <IconButton
                    onClick={() => setShowFilters(false)}
                    sx={{ ml: 'auto' }}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      multiple
                      options={availableTags}
                      value={filters.tags || []}
                      onChange={(_, newValue) => updateFilter('tags', newValue)}
                      renderInput={(params) => (
                        <TextField {...params} label="Tags" placeholder="Select tags" />
                      )}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip
                            variant="outlined"
                            label={option}
                            {...getTagProps({ index })}
                            key={option}
                          />
                        ))
                      }
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      options={availableProjects}
                      value={filters.projectName || ''}
                      onChange={(_, newValue) => updateFilter('projectName', newValue)}
                      renderInput={(params) => (
                        <TextField {...params} label="Project Name" placeholder="Select project" />
                      )}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Part Name"
                      value={filters.partName || ''}
                      onChange={(e) => updateFilter('partName', e.target.value)}
                      placeholder="Enter part name"
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Typography gutterBottom>File Size (MB)</Typography>
                    <Slider
                      value={[
                        filters.fileSize?.min ? filters.fileSize.min / (1024 * 1024) : 0,
                        filters.fileSize?.max ? filters.fileSize.max / (1024 * 1024) : 100,
                      ]}
                      onChange={(_, newValue) => {
                        const [min, max] = newValue as number[]
                        updateFilter('fileSize', {
                          min: min * 1024 * 1024,
                          max: max * 1024 * 1024,
                        })
                      }}
                      valueLabelDisplay="auto"
                      min={0}
                      max={100}
                      marks={[
                        { value: 0, label: '0MB' },
                        { value: 50, label: '50MB' },
                        { value: 100, label: '100MB' },
                      ]}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <DatePicker
                      label="Start Date"
                      value={filters.dateRange?.start ? new Date(filters.dateRange.start) : null}
                      onChange={(date) => {
                        if (date) {
                          updateFilter('dateRange', {
                            ...filters.dateRange,
                            start: date.toISOString(),
                          })
                        }
                      }}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <DatePicker
                      label="End Date"
                      value={filters.dateRange?.end ? new Date(filters.dateRange.end) : null}
                      onChange={(date) => {
                        if (date) {
                          updateFilter('dateRange', {
                            ...filters.dateRange,
                            end: date.toISOString(),
                          })
                        }
                      }}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Collapse>
        </Paper>
      </Box>
    </LocalizationProvider>
  )
}

export default SearchInterface