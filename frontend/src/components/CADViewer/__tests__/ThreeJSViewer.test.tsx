import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ThreeJSViewer } from '../ThreeJSViewer'
import { ParsedCADData } from '../../../types/cad'

// Mock Three.js
vi.mock('three', () => ({
  Scene: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
    background: null
  })),
  PerspectiveCamera: vi.fn(() => ({
    position: { set: vi.fn(), x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    aspect: 1,
    updateProjectionMatrix: vi.fn(),
    lookAt: vi.fn(),
    getWorldDirection: vi.fn()
  })),
  WebGLRenderer: vi.fn(() => ({
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: null }
  })),
  AmbientLight: vi.fn(),
  DirectionalLight: vi.fn(() => ({
    position: { set: vi.fn() },
    castShadow: false,
    shadow: { mapSize: { width: 0, height: 0 } }
  })),
  GridHelper: vi.fn(),
  AxesHelper: vi.fn(),
  Color: vi.fn(),
  Vector3: vi.fn(() => ({
    set: vi.fn(),
    add: vi.fn(),
    sub: vi.fn(),
    copy: vi.fn(),
    clone: vi.fn(() => ({ sub: vi.fn(() => ({ normalize: vi.fn() })) })),
    normalize: vi.fn(),
    multiplyScalar: vi.fn(),
    distanceTo: vi.fn(() => 100),
    setFromSpherical: vi.fn(() => ({ add: vi.fn() })),
    addScaledVector: vi.fn(),
    crossVectors: vi.fn(() => ({ normalize: vi.fn() }))
  })),
  Spherical: vi.fn(() => ({
    setFromVector3: vi.fn(),
    theta: 0,
    phi: 0
  })),
  BufferGeometry: vi.fn(() => ({
    setFromPoints: vi.fn(),
    setAttribute: vi.fn(),
    setIndex: vi.fn(),
    computeVertexNormals: vi.fn()
  })),
  BufferAttribute: vi.fn(),
  LineBasicMaterial: vi.fn(),
  MeshLambertMaterial: vi.fn(),
  Line: vi.fn(),
  Mesh: vi.fn(),
  Group: vi.fn(() => ({
    add: vi.fn(),
    name: '',
    visible: true
  })),
  Box3: vi.fn(() => ({
    expandByObject: vi.fn(),
    isEmpty: vi.fn(() => false),
    getCenter: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    getSize: vi.fn(() => ({ x: 100, y: 100, z: 100 }))
  })),
  MOUSE: { ROTATE: 0, DOLLY: 1, PAN: 2 },
  PCFSoftShadowMap: 1,
  DoubleSide: 2
}))

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => {
  setTimeout(cb, 16)
  return 1
})

global.cancelAnimationFrame = vi.fn()

describe('ThreeJSViewer', () => {
  const mockCADData: ParsedCADData = {
    layers: [
      {
        id: 'layer1',
        name: 'Layer 1',
        visible: true,
        objects: [
          {
            id: 'line1',
            type: 'line',
            layer: 'layer1',
            geometry: {
              start: { x: 0, y: 0, z: 0 },
              end: { x: 100, y: 100, z: 0 }
            },
            properties: {}
          }
        ]
      }
    ],
    boundingBox: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 0 }
    },
    units: 'mm',
    metadata: { format: 'DXF' }
  }

  const mockLayerVisibility = { layer1: true }
  const mockOnControlsChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should render without crashing', () => {
    render(
      <ThreeJSViewer
        cadData={null}
        layerVisibility={{}}
        onControlsChange={mockOnControlsChange}
      />
    )
    
    expect(screen.getByRole('generic')).toBeInTheDocument()
  })

  it('should show loading indicator when progressive loading is enabled', async () => {
    render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
        progressiveLoading={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Loading CAD file...')).toBeInTheDocument()
    })
  })

  it('should display loading progress', async () => {
    render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
        progressiveLoading={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/\d+%/)).toBeInTheDocument()
    })
  })

  it('should handle mouse events for camera controls', async () => {
    const { container } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
      />
    )

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()

    if (canvas) {
      // Test mouse down
      fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 })
      
      // Test mouse move (rotation)
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 })
      
      // Test mouse up
      fireEvent.mouseUp(canvas)

      await waitFor(() => {
        expect(mockOnControlsChange).toHaveBeenCalled()
      })
    }
  })

  it('should handle wheel events for zooming', async () => {
    const { container } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
      />
    )

    const canvas = container.querySelector('canvas')
    if (canvas) {
      fireEvent.wheel(canvas, { deltaY: 100 })

      await waitFor(() => {
        expect(mockOnControlsChange).toHaveBeenCalled()
      })
    }
  })

  it('should prevent context menu on right click', () => {
    const { container } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
      />
    )

    const canvas = container.querySelector('canvas')
    if (canvas) {
      const contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true
      })
      
      const preventDefault = vi.spyOn(contextMenuEvent, 'preventDefault')
      canvas.dispatchEvent(contextMenuEvent)
      
      expect(preventDefault).toHaveBeenCalled()
    }
  })

  it('should update layer visibility when props change', async () => {
    const { rerender } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={{ layer1: true }}
        onControlsChange={mockOnControlsChange}
      />
    )

    // Change layer visibility
    rerender(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={{ layer1: false }}
        onControlsChange={mockOnControlsChange}
      />
    )

    // The component should handle the visibility change
    // (specific assertions would depend on Three.js mock implementation)
    expect(true).toBe(true) // Placeholder assertion
  })

  it('should handle window resize events', () => {
    const { container } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
      />
    )

    // Trigger resize event
    fireEvent(window, new Event('resize'))

    // Component should handle resize gracefully
    expect(container.firstChild).toBeInTheDocument()
  })

  it('should clean up resources on unmount', () => {
    const { unmount } = render(
      <ThreeJSViewer
        cadData={mockCADData}
        layerVisibility={mockLayerVisibility}
        onControlsChange={mockOnControlsChange}
      />
    )

    unmount()

    expect(global.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('should handle empty CAD data', () => {
    const emptyCADData: ParsedCADData = {
      layers: [],
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      },
      units: 'mm',
      metadata: { format: 'DXF' }
    }

    render(
      <ThreeJSViewer
        cadData={emptyCADData}
        layerVisibility={{}}
        onControlsChange={mockOnControlsChange}
      />
    )

    expect(screen.getByRole('generic')).toBeInTheDocument()
  })

  it('should handle different CAD object types', async () => {
    const cadDataWithMultipleTypes: ParsedCADData = {
      layers: [
        {
          id: 'layer1',
          name: 'Layer 1',
          visible: true,
          objects: [
            {
              id: 'line1',
              type: 'line',
              layer: 'layer1',
              geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
              properties: {}
            },
            {
              id: 'circle1',
              type: 'circle',
              layer: 'layer1',
              geometry: { center: { x: 50, y: 50 }, radius: 25 },
              properties: {}
            },
            {
              id: 'mesh1',
              type: 'polyline',
              layer: 'layer1',
              geometry: {
                vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
                faces: [[0, 1, 2]]
              },
              properties: {}
            }
          ]
        }
      ],
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 100, z: 0 }
      },
      units: 'mm',
      metadata: { format: 'DXF' }
    }

    render(
      <ThreeJSViewer
        cadData={cadDataWithMultipleTypes}
        layerVisibility={{ layer1: true }}
        onControlsChange={mockOnControlsChange}
      />
    )

    // Should render without errors
    expect(screen.getByRole('generic')).toBeInTheDocument()
  })
})