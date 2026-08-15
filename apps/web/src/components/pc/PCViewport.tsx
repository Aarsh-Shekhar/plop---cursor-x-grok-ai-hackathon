// Founder-mode PC rig viewport: procedural ATX build at real spec dims.
// Every component is selectable/draggable/removable and synced with the
// editor store; extras: exploded view, spinning fans, approximate airflow.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import ObjectMesh from '../editor/ObjectMesh'
import { useEditor } from '../../state/editor'
import { PC_COMPONENTS, type PCComponent } from './pcBuild'
import type { SceneObject } from '../../lib/types'

export function pcComponentsToObjects(): SceneObject[] {
  return PC_COMPONENTS.map((c) => ({
    id: `obj_${c.id}`,
    name: c.name,
    label: c.name.toLowerCase(),
    category: c.category,
    score: 1,
    transform: {
      position: [...c.home] as [number, number, number],
      rotationY: 0,
      scale: [1, 1, 1] as [number, number, number],
    },
    dimensions: {
      width: c.dims[0], height: c.dims[1], depth: c.dims[2],
      source: 'user' as const, confidence: 1,
    },
    geometry: { kind: 'model-part' as any, source: 'procedural-spec' },
    appearance: { material: { type: 'original' as const }, dominantColors: [] },
    perception: { confidence: 1 },
    semantic: { description: String(c.spec.note ?? ''), identified: c.spec, productMatches: [] },
    technical: c.spec,
    state: { hidden: false, locked: c.removable === false },
  }))
}

const dragPlane = new THREE.Plane()
const dragPoint = new THREE.Vector3()
const dragOffset = new THREE.Vector3()

function Component3D({ comp, obj, explode }: {
  comp: PCComponent
  obj: SceneObject
  explode: number
}) {
  const { selectedId, highlighted, select, updateObject, setDragging, dragging } = useEditor()
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const { camera, gl } = useThree()
  const dragState = useRef<{ active: boolean; vertical: boolean } | null>(null)
  const liveRef = useRef<[number, number, number] | null>(null)
  const built = useMemo(() => comp.build(), [comp])

  const isSelected = selectedId === obj.id
  const isHighlighted = highlighted.includes(obj.id)
  const pos: [number, number, number] = [
    obj.transform.position[0] + comp.exploded[0] * explode,
    obj.transform.position[1] + comp.exploded[1] * explode,
    obj.transform.position[2] + comp.exploded[2] * explode,
  ]

  // spin every fan blade group
  useFrame((_, dt) => {
    built.traverse((n) => { if (n.name === 'blades') n.rotation.z += dt * 9 })
  })

  useEffect(() => {
    document.body.style.cursor = hovered ? (isSelected ? 'grab' : 'pointer') : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered, isSelected])

  if (obj.state.hidden) return null

  const startDrag = (e: any) => {
    if (obj.state.locked || !isSelected || explode > 0.01) return
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
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); select(obj.id) }}
    >
      <primitive object={built} />
      {outlineColor && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(comp.dims[0] * 1.12, comp.dims[1] * 1.12, comp.dims[2] * 1.12)]} />
          <lineBasicMaterial color={outlineColor} transparent opacity={0.95} />
        </lineSegments>
      )}
    </group>
  )
}

/** Approximate airflow: blue intake front→back, orange rising exhaust at top/rear. */
function PCAirflow({ enabled }: { enabled: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const N = 340
  const { positions, colors, seeds } = useMemo(() => {
    const positions = new Float32Array(N * 3)
    const colors = new Float32Array(N * 3)
    const seeds = new Float32Array(N)
    const cool = new THREE.Color('#4ecdc4')
    const warm = new THREE.Color('#ff9f45')
    for (let i = 0; i < N; i++) {
      seeds[i] = Math.random()
      const c = i < N * 0.6 ? cool : warm
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    return { positions, colors, seeds }
  }, [])

  useFrame(({ clock }) => {
    if (!enabled || !ref.current) return
    const t = clock.elapsedTime
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      const s = seeds[i]
      const life = (t * 0.22 + s) % 1
      if (i < N * 0.6) {
        // intake: front (+z) flowing to back (-z) through the case interior
        pos.setXYZ(i,
          -0.06 + (s % 0.5) * 0.12 + Math.sin(s * 40 + t) * 0.008,
          -0.16 + ((s * 7) % 1) * 0.3,
          0.24 - life * 0.42,
        )
      } else {
        // exhaust: rising out of the top radiator + rear fan
        const rear = s > 0.8
        pos.setXYZ(i,
          -0.02 + (s % 0.3) * 0.1,
          rear ? 0.06 + ((s * 3) % 1) * 0.1 : 0.2 + life * 0.22,
          rear ? -0.24 - life * 0.2 : -0.02 + ((s * 11) % 1) * 0.12 - 0.06,
        )
      }
    }
    pos.needsUpdate = true
  })

  if (!enabled) return null
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.006} vertexColors transparent opacity={0.8} depthWrite={false} />
    </points>
  )
}

export default function PCViewport({ explode, airflow }: { explode: number; airflow: boolean }) {
  const { scene, select, dragging } = useEditor()
  if (!scene) return null
  const proxyObjects = scene.objects.filter((o) => o.geometry.kind === 'proxy-box')
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 45, near: 0.01, far: 20, position: [-0.55, 0.18, 0.52] }}
      style={{ background: 'radial-gradient(110% 80% at 50% 25%, #171c24 0%, #0a0c10 75%)' }}
      gl={{ preserveDrawingBuffer: true, alpha: true }}
      onPointerMissed={() => select(null)}
    >
      <ambientLight intensity={1.05} />
      <directionalLight position={[-2, 3, 2]} intensity={1.4} />
      <directionalLight position={[2, 1, -2]} intensity={0.5} color="#88aaff" />
      <pointLight position={[-0.4, 0, 0.3]} intensity={0.7} color="#7c88ff" />
      <pointLight position={[0, 0.04, 0]} intensity={1.6} distance={1.2} color="#cfd6ff" />
      {/* bench grid */}
      <gridHelper args={[8, 64, '#232a34', '#1a2029']} position={[0, -0.235, 0]} />
      {PC_COMPONENTS.map((comp) => {
        const obj = scene.objects.find((o) => o.id === `obj_${comp.id}`)
        return obj ? <Component3D key={comp.id} comp={comp} obj={obj} explode={explode} /> : null
      })}
      {proxyObjects.map((o) => <ObjectMesh key={o.id} obj={o} />)}
      <PCAirflow enabled={airflow} />
      <OrbitControls
        makeDefault
        enabled={!dragging}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.6}
        zoomToCursor
        target={[0, 0, 0]}
        minDistance={0.15}
        maxDistance={3.2}
      />
    </Canvas>
  )
}
