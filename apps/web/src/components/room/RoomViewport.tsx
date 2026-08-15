// Walkable photoreal demo room: renders the real GLB scene, makes every
// grouped object selectable/movable/removable, and syncs transforms with the
// editor store so the inspector, NL commands, undo/redo and @hive all work.
// WASD walks, drag orbits, click selects, drag-selected moves, shift lifts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import MeasureOverlay from '../editor/MeasureOverlay'
import ObjectMesh from '../editor/ObjectMesh'
import { API_BASE } from '../../lib/api'
import { useEditor } from '../../state/editor'
import { MATERIAL_GROUPS, STATIC_MATERIALS } from './roomConfig'
import type { SceneObject } from '../../lib/types'

const GLB_URL = '/demo3d/room.glb'

export interface RoomGroup {
  key: string           // group label used as object name
  label: string
  category: string
  meshes: THREE.Mesh[]
  center: THREE.Vector3
  size: THREE.Vector3
}

/** Parse the GLB once and cluster its meshes into semantic groups. */
export function useRoomGroups(): { groups: RoomGroup[]; staticMeshes: THREE.Mesh[]; bounds: THREE.Box3 } {
  const gltf = useGLTF(GLB_URL)
  return useMemo(() => {
    const byGroup = new Map<string, THREE.Mesh[]>()
    const staticMeshes: THREE.Mesh[] = []
    const bounds = new THREE.Box3()
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      // OBJ-derived materials are single-sided; walls viewed from outside
      // (or thin geometry) would vanish into black otherwise
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.side = THREE.DoubleSide
      }
      bounds.expandByObject(mesh)
      const matName = (Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name) ?? ''
      const def = MATERIAL_GROUPS[matName]
      if (!def || STATIC_MATERIALS.has(matName)) {
        staticMeshes.push(mesh)
        return
      }
      const list = byGroup.get(def.label) ?? []
      list.push(mesh)
      byGroup.set(def.label, list)
    })
    const groups: RoomGroup[] = []
    for (const [label, meshes] of byGroup.entries()) {
      const box = new THREE.Box3()
      for (const m of meshes) box.expandByObject(m)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const def = Object.values(MATERIAL_GROUPS).find((d) => d.label === label)!
      groups.push({ key: label, label, category: def.category, meshes, center, size })
    }
    groups.sort((a, b) => b.size.x * b.size.y * b.size.z - a.size.x * a.size.y * a.size.z)
    return { groups, staticMeshes, bounds }
  }, [gltf])
}

/** Build the SceneObject docs (real meters, from the GLB's true geometry). */
export function groupsToObjects(groups: RoomGroup[]): SceneObject[] {
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
    geometry: { kind: 'model-part' as any, source: 'demo-glb' },
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
  const { selectedId, highlighted, select, updateObject, setDragging, dragging, measureMode } = useEditor()
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

  useEffect(() => {
    document.body.style.cursor = hovered ? (isSelected ? 'grab' : 'pointer') : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered, isSelected])

  const startDrag = (e: any) => {
    if (obj.state.locked || !isSelected || measureMode) return
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

  const outlineColor = isHighlighted ? '#ffd166' : isSelected ? '#4d96ff' : hovered ? '#8ab4ff' : null

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
      onClick={(e) => { e.stopPropagation(); select(obj.id) }}
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

/** One-time capture of the room's matching 2D photo, taken from a real
 * rendered frame on the user's machine (skipped once the file exists). */
function PhotoCapture() {
  const frames = useRef(0)
  const done = useRef(false)
  const { gl } = useThree()
  useFrame(() => {
    if (done.current) return
    frames.current++
    if (frames.current !== 90) return
    done.current = true
    fetch('/demo3d/room-photo.png', { method: 'HEAD' }).then((r) => {
      // vite serves index.html for missing files; treat non-png as missing
      if (r.ok && r.headers.get('content-type')?.includes('image')) return
      const dataUrl = gl.domElement.toDataURL('image/png')
      if (dataUrl.length < 20000) return  // blank frame; try again next visit
      fetch(`${API_BASE}/api/demo/photo`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
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

export default function RoomViewport({ groups, staticMeshes, bounds }: {
  groups: RoomGroup[]
  staticMeshes: THREE.Mesh[]
  bounds: THREE.Box3
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
      shadows={false}
      gl={{ preserveDrawingBuffer: true }}  // enables canvas snapshots (before-photo capture)
      onPointerMissed={() => select(null)}
    >
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#8a8f99', 0.9]} />
      <directionalLight position={[2, 5, 2]} intensity={1.1} />
      <directionalLight position={[-3, 3, -2]} intensity={0.5} />
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
      <PhotoCapture />
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

useGLTF.preload(GLB_URL)
