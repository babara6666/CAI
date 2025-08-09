import React, { useState } from 'react'
import { Box, Typography } from '@mui/material'
import SearchInterface from '../components/Search/SearchInterface'
import SearchResults from '../components/Search/SearchResults'
import { SearchFilters, SearchResult, UserFeedback } from '../types'
import { apiService } from '../services/api'

const SearchPage: React.FC = () => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [currentQuery, setCurrentQuery] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const handleSearch = async (query: string, filters: SearchFilters, modelId?: string) => {
    setLoading(true)
    setError('')
    setCurrentQuery(query)

    try {
      const response = await apiService.post<{ results: SearchResult[] }>('/search/query', {
        query,
        filters,
        modelId,
      })

      if (response.success && response.data) {
        setSearchResults(response.data.results)
      } else {
        setError(response.error?.message || 'Search failed')
        setSearchResults([])
      }
    } catch (error: any) {
      setError(error.message || 'Search failed')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleClearResults = () => {
    setSearchResults([])
    setCurrentQuery('')
    setError('')
  }

  const handleFeedback = (resultId: string, feedback: UserFeedback) => {
    setSearchResults(prev =>
      prev.map(result =>
        result.fileId === resultId
          ? { ...result, userFeedback: feedback }
          : result
      )
    )
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Search CAD Files
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Use natural language to find CAD files in your collection. Our AI understands
        technical terms, part descriptions, and design features.
      </Typography>

      <SearchInterface
        onSearch={handleSearch}
        onClearResults={handleClearResults}
        loading={loading}
        error={error}
      />

      <SearchResults
        results={searchResults}
        query={currentQuery}
        loading={loading}
        onFeedback={handleFeedback}
      />
    </Box>
  )
}

export default SearchPage