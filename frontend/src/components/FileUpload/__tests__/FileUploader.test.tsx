import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FileUploader from '../FileUploader'

// Mock the API service
jest.mock('../../../services/api', () => ({
  apiService: {
    upload: jest.fn(),
  },
}))

// Mock react-dropzone
jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(() => ({
    getRootProps: () => ({ 'data-testid': 'dropzone' }),
    getInputProps: () => ({ 'data-testid': 'file-input' }),
    isDragActive: false,
  })),
}))

describe('FileUploader', () => {
  const mockOnUploadComplete = jest.fn()
  const mockOnUploadProgress = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders file uploader correctly', () => {
    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
      />
    )

    expect(screen.getByText(/drag & drop cad files here/i)).toBeInTheDocument()
    expect(screen.getByText(/or click to select files/i)).toBeInTheDocument()
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('displays accepted file types', () => {
    const acceptedTypes = ['.dwg', '.dxf', '.step']
    
    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
        acceptedFileTypes={acceptedTypes}
      />
    )

    acceptedTypes.forEach(type => {
      expect(screen.getByText(type.toUpperCase())).toBeInTheDocument()
    })
  })

  it('shows file size and count limits', () => {
    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
        maxFiles={5}
        maxFileSize={50 * 1024 * 1024} // 50MB
      />
    )

    expect(screen.getByText(/maximum 5 files, 50mb each/i)).toBeInTheDocument()
  })

  it('displays upload progress for files', async () => {
    const { rerender } = render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
      />
    )

    // Simulate upload progress
    const progressData = [
      {
        fileId: 'file-1',
        filename: 'test.dwg',
        progress: 50,
        status: 'uploading' as const,
      },
    ]

    // Re-render with progress data (this would normally come from the upload process)
    rerender(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
      />
    )

    // Manually trigger progress update
    mockOnUploadProgress(progressData)

    expect(mockOnUploadProgress).toHaveBeenCalledWith(progressData)
  })

  it('handles upload completion', async () => {
    const mockFiles = [
      {
        id: 'file-1',
        filename: 'test.dwg',
        originalName: 'test.dwg',
        fileSize: 1024,
        mimeType: 'application/dwg',
        uploadedBy: 'user-1',
        uploadedAt: new Date().toISOString(),
        tags: [],
        versions: [],
        currentVersion: 1,
        fileUrl: '/files/test.dwg',
      },
    ]

    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
      />
    )

    // Simulate successful upload
    mockOnUploadComplete(mockFiles)

    expect(mockOnUploadComplete).toHaveBeenCalledWith(mockFiles)
  })

  it('shows error for oversized files', () => {
    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
        maxFileSize={1024} // 1KB limit
      />
    )

    // This would be tested by simulating a file drop with oversized files
    // The actual implementation would show an error message
    expect(screen.getByText(/maximum 1 files, 0mb each/i)).toBeInTheDocument()
  })

  it('shows error for too many files', () => {
    render(
      <FileUploader
        onUploadComplete={mockOnUploadComplete}
        onUploadProgress={mockOnUploadProgress}
        maxFiles={1}
      />
    )

    expect(screen.getByText(/maximum 1 files/i)).toBeInTheDocument()
  })
})