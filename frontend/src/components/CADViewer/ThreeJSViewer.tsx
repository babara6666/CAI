import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { ParsedCADData, CADLayer, CADObject, ViewerControls } from '../../types/cad'

interface ThreeJSViewerProps {
  cadData: ParsedCADData | null
  onControlsChange?: (controls: ViewerControls) => void
  layerVisibility: Record<string, boolean>
  progressiveLoading?: boolean
}

export const ThreeJSViewer: React.FC<ThreeJSViewerProps> = ({
  cadData,
  onControlsChange,
  layerVisibility,
  progressiveLoading = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const controlsRef = useRef<any>()
  const layerGroupsRef = useRef<Map<string, THREE.Group>>(new Map())
  const animationIdRef = useRef<number>()
  
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth
    const height = mountRef.current.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000)
    camera.position.set(100, 100, 100)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(100, 100, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    // Grid helper
    const gridHelper = new THREE.GridHelper(1000, 100, 0x888888, 0xcccccc)
    scene.add(gridHelper)

    // Axes helper
    const axesHelper = new THREE.AxesHelper(100)
    scene.add(axesHelper)

    // Controls (simplified orbit controls implementation)
    const controls = {
      enabled: true,
      target: new THREE.Vector3(0, 0, 0),
      minDistance: 1,
      maxDistance: 1000,
      enableDamping: true,
      dampingFactor: 0.05,
      enableZoom: true,
      enableRotate: true,
      enablePan: true,
      mouseButtons: {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }
    }
    controlsRef.current = controls

    mountRef.current.appendChild(renderer.domElement)

    // Mouse event handlers for controls
    let isMouseDown = false
    let mouseButton = -1
    let previousMousePosition = { x: 0, y: 0 }

    const handleMouseDown = (event: MouseEvent) => {
      isMouseDown = true
      mouseButton = event.button
      previousMousePosition = { x: event.clientX, y: event.clientY }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isMouseDown) return

      const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
      }

      if (mouseButton === 0) { // Left mouse - rotate
        const spherical = new THREE.Spherical()
        spherical.setFromVector3(camera.position.clone().sub(controls.target))
        
        spherical.theta -= deltaMove.x * 0.01
        spherical.phi += deltaMove.y * 0.01
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi))
        
        camera.position.setFromSpherical(spherical).add(controls.target)
        camera.lookAt(controls.target)
      } else if (mouseButton === 2) { // Right mouse - pan
        const panOffset = new THREE.Vector3()
        const cameraDirection = new THREE.Vector3()
        camera.getWorldDirection(cameraDirection)
        
        const right = new THREE.Vector3()
        right.crossVectors(cameraDirection, camera.up).normalize()
        const up = new THREE.Vector3()
        up.crossVectors(right, cameraDirection).normalize()
        
        panOffset.addScaledVector(right, -deltaMove.x * 0.1)
        panOffset.addScaledVector(up, deltaMove.y * 0.1)
        
        camera.position.add(panOffset)
        controls.target.add(panOffset)
      }

      previousMousePosition = { x: event.clientX, y: event.clientY }
      
      // Notify parent of control changes
      if (onControlsChange) {
        onControlsChange({
          zoom: camera.position.distanceTo(controls.target),
          rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
        })
      }
    }

    const handleMouseUp = () => {
      isMouseDown = false
      mouseButton = -1
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const scale = event.deltaY > 0 ? 1.1 : 0.9
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance = camera.position.distanceTo(controls.target)
      const newDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, distance * scale))
      
      camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance))
      
      if (onControlsChange) {
        onControlsChange({
          zoom: newDistance,
          rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
        })
      }
    }

    renderer.domElement.addEventListener('mousedown', handleMouseDown)
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
    renderer.domElement.addEventListener('mouseup', handleMouseUp)
    renderer.domElement.addEventListener('wheel', handleWheel)
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return
      const width = mountRef.current.clientWidth
      const height = mountRef.current.clientHeight
      
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      renderer.domElement.removeEventListener('mouseup', handleMouseUp)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      window.removeEventListener('resize', handleResize)
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  // Load CAD data into scene
  useEffect(() => {
    if (!cadData || !sceneRef.current) return

    setIsLoading(true)
    setLoadingProgress(0)

    // Clear existing layer groups
    layerGroupsRef.current.forEach(group => {
      sceneRef.current!.remove(group)
    })
    layerGroupsRef.current.clear()

    const loadLayers = async () => {
      const totalLayers = cadData.layers.length
      
      for (let i = 0; i < cadData.layers.length; i++) {
        const layer = cadData.layers[i]
        
        if (progressiveLoading) {
          // Add delay for progressive loading demonstration
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        const layerGroup = new THREE.Group()
        layerGroup.name = layer.name
        layerGroup.visible = layerVisibility[layer.id] !== false
        
        // Create objects for this layer
        layer.objects.forEach(obj => {
          const mesh = this.createMeshFromCADObject(obj)
          if (mesh) {
            layerGroup.add(mesh)
          }
        })
        
        layerGroupsRef.current.set(layer.id, layerGroup)
        sceneRef.current!.add(layerGroup)
        
        setLoadingProgress(((i + 1) / totalLayers) * 100)
      }
      
      // Fit camera to view all objects
      this.fitCameraToObjects()
      setIsLoading(false)
    }

    loadLayers()
  }, [cadData, progressiveLoading])

  // Update layer visibility
  useEffect(() => {
    layerGroupsRef.current.forEach((group, layerId) => {
      group.visible = layerVisibility[layerId] !== false
    })
  }, [layerVisibility])

  private createMeshFromCADObject = (cadObject: CADObject): THREE.Object3D | null => {
    const { geometry, type } = cadObject

    switch (type) {
      case 'line':
        return this.createLineGeometry(geometry)
      case 'circle':
        return this.createCircleGeometry(geometry)
      case 'polyline':
        return this.createMeshGeometry(geometry)
      default:
        return null
    }
  }

  private createLineGeometry = (geometry: any): THREE.Line => {
    const points = [
      new THREE.Vector3(geometry.start.x, geometry.start.y, geometry.start.z || 0),
      new THREE.Vector3(geometry.end.x, geometry.end.y, geometry.end.z || 0)
    ]
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 })
    
    return new THREE.Line(lineGeometry, lineMaterial)
  }

  private createCircleGeometry = (geometry: any): THREE.Line => {
    const { center, radius } = geometry
    const segments = 32
    const points: THREE.Vector3[] = []
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        center.z || 0
      ))
    }
    
    const circleGeometry = new THREE.BufferGeometry().setFromPoints(points)
    const circleMaterial = new THREE.LineBasicMaterial({ color: 0x000000 })
    
    return new THREE.Line(circleGeometry, circleMaterial)
  }

  private createMeshGeometry = (geometry: any): THREE.Mesh => {
    const { vertices, faces } = geometry
    
    const threeGeometry = new THREE.BufferGeometry()
    
    // Convert vertices to flat array
    const vertexArray = new Float32Array(vertices.length * 3)
    vertices.forEach((vertex: number[], index: number) => {
      vertexArray[index * 3] = vertex[0]
      vertexArray[index * 3 + 1] = vertex[1]
      vertexArray[index * 3 + 2] = vertex[2] || 0
    })
    
    threeGeometry.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3))
    
    // Convert faces to indices
    if (faces && faces.length > 0) {
      const indexArray = new Uint32Array(faces.length * 3)
      faces.forEach((face: number[], faceIndex: number) => {
        indexArray[faceIndex * 3] = face[0]
        indexArray[faceIndex * 3 + 1] = face[1]
        indexArray[faceIndex * 3 + 2] = face[2]
      })
      threeGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1))
    }
    
    threeGeometry.computeVertexNormals()
    
    const material = new THREE.MeshLambertMaterial({ 
      color: 0x888888,
      side: THREE.DoubleSide,
      wireframe: false
    })
    
    return new THREE.Mesh(threeGeometry, material)
  }

  private fitCameraToObjects = () => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return

    const box = new THREE.Box3()
    
    // Calculate bounding box of all visible objects
    layerGroupsRef.current.forEach(group => {
      if (group.visible) {
        box.expandByObject(group)
      }
    })
    
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    
    // Position camera to view all objects
    const distance = maxDim * 2
    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    )
    
    controlsRef.current.target.copy(center)
    cameraRef.current.lookAt(center)
    
    if (onControlsChange) {
      onControlsChange({
        zoom: distance,
        rotation: { x: cameraRef.current.rotation.x, y: cameraRef.current.rotation.y, z: cameraRef.current.rotation.z },
        position: { x: cameraRef.current.position.x, y: cameraRef.current.position.y, z: cameraRef.current.position.z },
        target: { x: center.x, y: center.y, z: center.z }
      })
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div>Loading CAD file...</div>
          <div style={{ marginTop: '10px' }}>
            <div style={{
              width: '200px',
              height: '4px',
              background: '#e0e0e0',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${loadingProgress}%`,
                height: '100%',
                background: '#2196f3',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              {Math.round(loadingProgress)}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}