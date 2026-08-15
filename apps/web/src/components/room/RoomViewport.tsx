// Walkable demo-scene viewport: renders grouped meshes (from the /room GLB or
// a procedural build like /office), makes every group selectable/movable/
// removable, and syncs transforms with the editor store so the inspector,
// NL commands, undo/redo and @hive all work.
// WASD walks, drag orbits, click selects, drag-selected moves, shift lifts.
import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MeasureOverlay from '../editor/MeasureOverlay'
import ObjectMesh from '../editor/ObjectMesh'
import { API_BASE } from '../../lib/api'
import { useEditor } from '../../state/editor'
import type { SceneObject } from '../../lib/types'

export interface RoomGroup {
  key: string           // group label used as object name
  label: string
  category: string
  meshes: THREE.Mesh[]
  center: THREE.Vector3
  size: THREE.Vector3
}

/** Build the SceneObject docs (real meters, from the groups' true geometry). */
export function groupsToObjects(groups: RoomGroup[], source = 'demo-glb'): SceneObject[] {
  return groups.map((g, i) => ({
    id: `obj_${i}`,
    name: g.label,
    label: g.label.toLowerCase(),
    category: g.category,
    score: 1,
    transform: {
      position: [g.center.x, g.center.y, g.center.z] as [number, number, number],
      rotationY: 0,
      scale: [1, 1, 1] as [number, number, number],
    },
    dimensions: {
      width: Math.max(0.02, +g.size.x.toFixed(3)),
      height: Math.max(0.02, +g.size.y.toFixed(3)),
      depth: Math.max(0.02, +g.size.z.toFixed(3)),
      source: 'user' as const,        // true model geometry, not an estimate
      confidence: 1,
    },
    geometry: { kind: 'model-part' as any, source },
    appearance: { material: { type: 'original' as const }, dominantColors: [] },
    perception: { confidence: 1 },
    semantic: { description: null, productMatches: [] },
    technical: {},
    state: { hidden: false, locked: false },
  }))
}

const dragPlane = new THREE.Plane()
const dragPoint = new THREE.Vector3()
const dragOffset = new THREE.Vector3()

function ModelObject({ obj, group }: { obj: SceneObject; group: RoomGroup }) {
  const { selectedId, highlighted, select, updateObject, setDragging, dragging, measureMode, identifyMode, setFactSheetId } = useEditor()
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const { camera, gl } = useThree()
  const dragState = useRef<{ active: boolean; vertical: boolean } | null>(null)
  const liveRef = useRef<[number, number, number] | null>(null)

  const isSelected = selectedId === obj.id
  const isHighlighted = highlighted.includes(obj.id)
  const pos = obj.transform.position

  // re-parent the group's meshes under our pivot at first mount
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const pivot = groupRef.current
    if (!pivot) return
    for (const mesh of group.meshes) {
      mesh.position.sub(group.center)
      pivot.add(mesh)
    }
    setReady(true)
    return () => {
      for (const mesh of group.meshes) mesh.position.add(group.center)
    }
  }, [group])

  // three's raycaster ignores `visible`, so a removed (hidden) object would
  // still swallow clicks/hover meant for whatever is behind it — disable its
  // meshes' raycast while hidden
  useEffect(() => {
    const noop = () => {}
    for (const mesh of group.meshes)
      (mesh as any).raycast = obj.state.hidden ? noop : THREE.Mesh.prototype.raycast
  }, [obj.state.hidden, group])

  useEffect(() => {
    if (identifyMode) return
    document.body.style.cursor = hovered ? (isSelected ? 'grab' : 'pointer') : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered, isSelected, identifyMode])

  const startDrag = (e: any) => {
    if (obj.state.locked || !isSelected || measureMode || identifyMode) return
    e.stopPropagation()
    const vertical = e.shiftKey
    dragState.current = { active: true, vertical }
    setDragging(true)
    if (vertical) {
      const normal = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(...pos))
      normal.y = 0
      normal.normalize()
      dragPlane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...pos))
    } else {
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pos))
    }
    e.ray.intersectPlane(dragPlane, dragPoint)
    dragOffset.copy(dragPoint).sub(new THREE.Vector3(...pos))
    gl.domElement.style.cursor = 'grabbing'
  }

  const moveDrag = (e: any) => {
    if (!dragState.current?.active) return
    e.stopPropagation()
    if (!e.ray.intersectPlane(dragPlane, dragPoint)) return
    const target = dragPoint.clone().sub(dragOffset)
    const next: [number, number, number] = dragState.current.vertical
      ? [pos[0], target.y, pos[2]]
      : [target.x, pos[1], target.z]
    liveRef.current = next
    groupRef.current?.position.set(...next)
  }

  const endDrag = (e: any) => {
    if (!dragState.current?.active) return
    e.stopPropagation()
    dragState.current = null
    setDragging(false)
    gl.domElement.style.cursor = 'auto'
    if (liveRef.current) {
      const final = liveRef.current
      liveRef.current = null
      updateObject(obj.id, (o) => ({ ...o, transform: { ...o.transform, position: final } }))
    }
  }

  const outlineColor = identifyMode && hovered ? '#ff7b1a' : isHighlighted ? '#ffd166' : isSelected ? '#4d96ff' : hovered ? '#8ab4ff' : null

  return (
    <group
      ref={groupRef}
      position={pos}
      rotation={[0, obj.transform.rotationY, 0]}
      scale={obj.transform.scale}
      visible={!obj.state.hidden && ready}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); if (identifyMode) { setFactSheetId(obj.id) } else { select(obj.id) } }}
    >
      {outlineColor && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(group.size.x * 1.03, group.size.y * 1.03, group.size.z * 1.03)]} />
          <lineBasicMaterial color={outlineColor} transparent opacity={0.9} />
        </lineSegments>
      )}
    </group>
  )
}

function StaticRoom({ meshes }: { meshes: THREE.Mesh[] }) {
  const ref = useRef<THREE.Group>(null)
  const { select } = useEditor()
  useEffect(() => {
    const g = ref.current
    if (!g) return
    for (const m of meshes) g.add(m)
  }, [meshes])
  return <group ref={ref} onClick={(e) => { e.stopPropagation(); select(null) }} />
}

/** One-time capture of the scene's matching 2D photo, taken from a real
 * rendered frame on the user's machine (skipped once the file exists). */
function PhotoCapture({ name = 'room' }: { name?: string }) {
  const frames = useRef(0)
  const done = useRef(false)
  const { gl, scene, camera } = useThree()

  // dev hook: window.__plopCapture(w, h) renders one frame at the given
  // resolution (independent of the pane size) and saves it via the API
  useEffect(() => {
    ;(window as any).__plopCapture = async (w = 1600, h = 1000) => {
      const cam = camera as THREE.PerspectiveCamera
      const prevPR = gl.getPixelRatio()
      const prevSize = new THREE.Vector2()
      gl.getSize(prevSize)
      const prevAspect = cam.aspect
      gl.setPixelRatio(1)
      gl.setSize(w, h, false)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      gl.render(scene, cam)
      const dataUrl = gl.domElement.toDataURL('image/png')
      gl.setPixelRatio(prevPR)
      gl.setSize(prevSize.x, prevSize.y, false)
      cam.aspect = prevAspect
      cam.updateProjectionMatrix()
      const r = await fetch(`${API_BASE}/api/demo/photo`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataUrl, name }),
      })
      return r.json()
    }
    return () => { delete (window as any).__plopCapture }
  }, [gl, scene, camera, name])
  useFrame(() => {
    if (done.current) return
    frames.current++
    if (frames.current !== 90) return
    done.current = true
    fetch(`/demo3d/${name}-photo.png`, { method: 'HEAD' }).then((r) => {
      // vite serves index.html for missing files; treat non-png as missing
      if (r.ok && r.headers.get('content-type')?.includes('image')) return
      const dataUrl = gl.domElement.toDataURL('image/png')
      if (dataUrl.length < 20000) return  // blank frame; try again next visit
      fetch(`${API_BASE}/api/demo/photo`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataUrl, name }),
      }).catch(() => {})
    }).catch(() => {})
  })
  return null
}

/** WASD first-person-ish walking: moves camera + orbit target together. */
function WalkControls({ floorY }: { floorY: number }) {
  const keys = useRef<Record<string, boolean>>({})
  const { camera, controls } = useThree() as any
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      keys.current[e.key.toLowerCase()] = true
    }
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  useFrame((_, dt) => {
    const k = keys.current
    const speed = 2.2 * Math.min(dt, 0.05)
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0))
    const move = new THREE.Vector3()
    if (k['w']) move.add(fwd)
    if (k['s']) move.sub(fwd)
    if (k['d']) move.add(right)
    if (k['a']) move.sub(right)
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed)
      camera.position.add(move)
      camera.position.y = Math.max(camera.position.y, floorY + 0.35)
      if (controls) { controls.target.add(move); controls.update() }
    }
  })
  return null
}

export default function RoomViewport({ groups, staticMeshes, bounds, capturePhoto = false, photoName = 'room', sunlight = false }: {
  groups: RoomGroup[]
  staticMeshes: THREE.Mesh[]
  bounds: THREE.Box3
  capturePhoto?: boolean
  photoName?: string
  sunlight?: boolean   // shadow-casting sun (procedural scenes with a window wall)
}) {
  const { scene, select, dragging, measureMode, pushMeasurePoint } = useEditor()
  const onMeasure = (e: any) => {
    if (!measureMode || !e.point) return
    e.stopPropagation()
    pushMeasurePoint([e.point.x, e.point.y, e.point.z])
  }
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const floorY = bounds.min.y
  // eye position INSIDE the room (35% toward a corner), standing height
  const eye: [number, number, number] = [
    center.x + size.x * 0.32,
    floorY + 1.55,
    center.z + size.z * 0.32,
  ]

  if (!scene) return null
  const modelObjects = scene.objects.filter((o) => (o.geometry.kind as string) === 'model-part')
  const proxyObjects = scene.objects.filter((o) => o.geometry.kind === 'proxy-box' || o.geometry.kind === 'library')

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 60, near: 0.05, far: 100, position: eye }}
      style={{ background: '#101318' }}
      shadows={sunlight}
      gl={{ preserveDrawingBuffer: true }}  // enables canvas snapshots (before-photo capture)
      onPointerMissed={() => select(null)}
    >
      {sunlight ? (
        <>
          <ambientLight intensity={0.6} />
          <hemisphereLight args={['#eaf2ff', '#8a8f99', 0.55]} />
          {/* warm sun coming in through the window wall */}
          <directionalLight
            position={[2, 4.5, -7]} intensity={1.7} color="#ffeed6" castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-radius={4}
            shadow-camera-left={-6} shadow-camera-right={6}
            shadow-camera-top={6} shadow-camera-bottom={-6}
            shadow-camera-near={0.5} shadow-camera-far={25}
          />
          <directionalLight position={[-3, 3, 3]} intensity={0.45} />
        </>
      ) : (
        <>
          <ambientLight intensity={1.15} />
          <hemisphereLight args={['#ffffff', '#8a8f99', 0.9]} />
          <directionalLight position={[2, 5, 2]} intensity={1.1} />
          <directionalLight position={[-3, 3, -2]} intensity={0.5} />
        </>
      )}
      <group onPointerDown={onMeasure}>
      <StaticRoom meshes={staticMeshes} />
      {modelObjects.map((o) => {
        const g = groups.find((gr) => gr.label === o.name)
        return g ? <ModelObject key={o.id} obj={o} group={g} /> : null
      })}
      {proxyObjects.map((o) => <ObjectMesh key={o.id} obj={o} />)}
      </group>
      <MeasureOverlay />
      <WalkControls floorY={floorY} />
      {capturePhoto && <PhotoCapture name={photoName} />}
      <OrbitControls
        makeDefault
        enabled={!dragging}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        zoomToCursor
        target={[center.x, floorY + 1.1, center.z]}
        maxPolarAngle={Math.PI * 0.55}
        minDistance={0.3}
        maxDistance={14}
      />
    </Canvas>
  )
}
