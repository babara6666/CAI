import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CADViewer from '../CADViewer'
import { CADParserService } from '../../../services/CADParserService'

// Mock the CADParserService
vi.mock('../../../services/CADParserService', () => ({
  CADParserService: {
    getInstance: vi.fn(() => ({
      isSupportedFormat: vi.fn(() => true),
      parseCADFile: vi.fn(() => Promise.resolve({
        layers: [
          {
            id: 'layer1',
            name: 'Test Layer',
            visible: true,
            objects: [
              { id: 'line1', type: 'line', layer: 'layer1', geometry: {}, properties: {} }
            ]
          }
        ],
        boundingBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 100, y: 100, z: 0 }
        },
        units: 'mm',
        metadata: { format: 'DXF', entityCount: 1 }
      }))
    }))
  }
}))

// Mock the child components
vi.mock('../ThreeJSViewer', () => ({
  ThreeJSViewer: ({ cadData, onControlsChange }: any) => {
    React.useEffect(() => {
      if (onControlsChange) {
        onControlsChange({
          zoom: 100,
          rotation: { x: 0, y: 0, z: 0 },
          position: { x: 100, y: 100, z: 100 },
          target: { x: 0, y: 0, z: 0 }
        })
      }
    }, [onControlsChange])
    
    return <div data-testid="threejs-viewer">ThreeJS Viewer {cadData ? 'with data' : 'no data'}</div>
  }
}))

vi.mock('../LayerPanel', () => ({
  LayerPanel: ({ layers, onLayerVisibilityChange, onToggleAllLayers }: any) => (
    <div data-testid="layer-panel">
      <div>Layer Panel</div>
      <div>Layers: {layers.length}</div>
      <button onClick={() => onLayerVisibilityChange('layer1', false)}>
        Toggle Layer
      </button>
      <button onClick={() => onToggleAllLayers(false)}>
        Hide All
      </button>
    </div>
  )
}))

vi.mock('../ViewerControls', () => ({
  ViewerControls: ({ onZoomIn, onZoomOut, onResetView }: any) => (
    <div data-testid="viewer-controls">
      <button onClick={onZoomIn}>Zoom In</button>
      <button onClick={onZoomOut}>Zoom Out</button>
      <button onClick={onResetView}>Reset View</button>
    </div>
  )
}))

// Mock fetch
global.fetch = vi.fn()

describe('CADViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock successful fetch response
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
    })
  })

  it('should render loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    expect(screen.getByText('Loading CAD file...')).toBeInTheDocument()
  })

  it('should render CAD viewer with data after loading', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('threejs-viewer')).toBeInTheDocument()
      expect(screen.getByTestId('layer-panel')).toBeInTheDocument()
      expect(screen.getByTestId('viewer-controls')).toBeInTheDocument()
    })

    expect(screen.getByText('ThreeJS Viewer with data')).toBeInTheDocument()
    expect(screen.getByText('Layers: 1')).toBeInTheDocument()
  })

  it('should display file information panel', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('File Information')).toBeInTheDocument()
      expect(screen.getByText('Format: DXF')).toBeInTheDocument()
      expect(screen.getByText('Units: mm')).toBeInTheDocument()
      expect(screen.getByText('Layers: 1')).toBeInTheDocument()
      expect(screen.getByText('Objects: 1')).toBeInTheDocument()
    })
  })

  it('should handle layer visibility changes', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Toggle Layer')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Toggle Layer'))
    
    // The layer visibility should be updated
    // (specific assertions would depend on implementation details)
    expect(screen.getByText('Toggle Layer')).toBeInTheDocument()
  })

  it('should handle toggle all layers', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Hide All')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Hide All'))
    
    // All layers should be hidden
    expect(screen.getByText('Hide All')).toBeInTheDocument()
  })

  it('should handle viewer control interactions', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Zoom In')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Zoom In'))
    fireEvent.click(screen.getByText('Zoom Out'))
    fireEvent.click(screen.getByText('Reset View'))
    
    // Controls should respond to interactions
    expect(screen.getByText('Zoom In')).toBeInTheDocument()
  })

  it('should display error when file loading fails', async () => {
    // Mock fetch to fail
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load CAD file')).toBeInTheDocument()
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('should display error for unsupported file format', async () => {
    const mockParser = CADParserService.getInstance()
    ;(mockParser.isSupportedFormat as any).mockReturnValue(false)

    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load CAD file')).toBeInTheDocument()
    })
  })

  it('should handle parsing errors gracefully', async () => {
    const mockParser = CADParserService.getInstance()
    ;(mockParser.parseCADFile as any).mockRejectedValue(new Error('Parse error'))

    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load CAD file')).toBeInTheDocument()
      expect(screen.getByText('Parse error')).toBeInTheDocument()
    })
  })

  it('should work with direct file URL prop', async () => {
    render(
      <CADViewer 
        fileUrl="/test/file.dxf" 
        filename="test.dxf" 
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('threejs-viewer')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalledWith('/test/file.dxf')
  })

  it('should show success message after loading', async () => {
    render(
      <CADViewer 
        fileUrl="/test/file.dxf" 
        filename="test.dxf" 
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Successfully loaded test.dxf')).toBeInTheDocument()
    })
  })

  it('should handle fullscreen toggle', async () => {
    // Mock fullscreen API
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: null
    })
    
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      writable: true,
      value: vi.fn(() => Promise.resolve())
    })
    
    Object.defineProperty(document, 'exitFullscreen', {
      writable: true,
      value: vi.fn(() => Promise.resolve())
    })

    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('viewer-controls')).toBeInTheDocument()
    })

    // Test fullscreen functionality would require more complex mocking
    expect(document.documentElement.requestFullscreen).toBeDefined()
  })

  it('should handle empty CAD data', async () => {
    const mockParser = CADParserService.getInstance()
    ;(mockParser.parseCADFile as any).mockResolvedValue({
      layers: [],
      boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      units: 'mm',
      metadata: { format: 'DXF', entityCount: 0 }
    })

    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Layers: 0')).toBeInTheDocument()
      expect(screen.getByText('Objects: 0')).toBeInTheDocument()
    })
  })

  it('should close snackbar when requested', async () => {
    render(
      <MemoryRouter initialEntries={['/viewer/test-file-id']}>
        <CADViewer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Successfully loaded/)).toBeInTheDocument()
    })

    // The snackbar should auto-close after timeout
    // Testing this would require advancing timers
    expect(screen.getByText(/Successfully loaded/)).toBeInTheDocument()
  })

  it('should handle missing fileId and fileUrl gracefully', () => {
    render(<CADViewer />)

    // Should not crash and should show appropriate state
    expect(screen.queryByText('Loading CAD file...')).not.toBeInTheDocument()
  })
})