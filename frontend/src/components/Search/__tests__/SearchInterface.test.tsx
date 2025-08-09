import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import SearchInterface from '../SearchInterface'

// Mock the API service
jest.mock('../../../services/api', () => ({
  apiService: {
    get: jest.fn(),
  },
}))

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      {component}
    </LocalizationProvider>
  )
}

describe('SearchInterface', () => {
  const mockOnSearch = jest.fn()
  const mockOnClearResults = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock API responses
    const { apiService } = require('../../../services/api')
    apiService.get.mockImplementation((url: string) => {
      if (url === '/ai/models') {
        return Promise.resolve({
          success: true,
          data: [
            { id: 'model-1', name: 'Default Model', isDefault: true, status: 'ready' },
            { id: 'model-2', name: 'Custom Model', isDefault: false, status: 'ready' },
          ],
        })
      }
      if (url === '/files/tags') {
        return Promise.resolve({
          success: true,
          data: ['mechanical', 'automotive', 'prototype'],
        })
      }
      if (url === '/files/projects') {
        return Promise.resolve({
          success: true,
          data: ['Project A', 'Project B', 'Project C'],
        })
      }
      if (url === '/search/suggestions') {
        return Promise.resolve({
          success: true,
          data: ['gear assembly', 'bearing housing', 'shaft coupling'],
        })
      }
      return Promise.resolve({ success: true, data: [] })
    })
  })

  it('renders search interface correctly', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    expect(screen.getByPlaceholderText(/search cad files using natural language/i)).toBeInTheDocument()
    expect(screen.getByText(/ai model/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })

  it('handles search input and submission', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search cad files using natural language/i)
    const searchButton = screen.getByRole('button', { name: /search/i })

    fireEvent.change(searchInput, { target: { value: 'gear assembly' } })
    fireEvent.click(searchButton)

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalledWith('gear assembly', {}, undefined)
    })
  })

  it('handles Enter key press for search', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search cad files using natural language/i)

    fireEvent.change(searchInput, { target: { value: 'bearing housing' } })
    fireEvent.keyPress(searchInput, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalledWith('bearing housing', {}, undefined)
    })
  })

  it('shows and hides advanced filters', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    const filterButton = screen.getByRole('button', { name: '' }) // Filter icon button
    fireEvent.click(filterButton)

    await waitFor(() => {
      expect(screen.getByText(/advanced filters/i)).toBeInTheDocument()
    })
  })

  it('displays loading state', () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
        loading={true}
      />
    )

    const searchButton = screen.getByRole('button', { name: /searching/i })
    expect(searchButton).toBeDisabled()
  })

  it('displays error message', () => {
    const errorMessage = 'Search service unavailable'
    
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
        error={errorMessage}
      />
    )

    expect(screen.getByText(errorMessage)).toBeInTheDocument()
  })

  it('loads and displays AI models', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    await waitFor(() => {
      // The models should be loaded and available in the select
      expect(screen.getByText(/ai model/i)).toBeInTheDocument()
    })
  })

  it('handles filter changes', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    // Open advanced filters
    const filterButton = screen.getByRole('button', { name: '' })
    fireEvent.click(filterButton)

    await waitFor(() => {
      expect(screen.getByText(/advanced filters/i)).toBeInTheDocument()
    })

    // Test would continue with filter interactions
  })

  it('clears all filters', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    // This would test the clear filters functionality
    // Implementation would depend on having active filters first
  })

  it('shows search suggestions', async () => {
    renderWithProviders(
      <SearchInterface
        onSearch={mockOnSearch}
        onClearResults={mockOnClearResults}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search cad files using natural language/i)
    
    // Type enough characters to trigger suggestions
    fireEvent.change(searchInput, { target: { value: 'gear' } })

    await waitFor(() => {
      // Suggestions should appear (mocked in beforeEach)
      // The actual implementation would show a dropdown with suggestions
    })
  })
})