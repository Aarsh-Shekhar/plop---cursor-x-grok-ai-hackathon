// Founder-mode PC rig viewport: procedural ATX build at real spec dims.
// Every component is selectable/draggable/removable and synced with the
// editor store; extras: exploded view, spinning fans, approximate airflow.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MeasureOverlay from '../editor/MeasureOverlay'
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
  const { selectedId, highlighted, select, updateObject, setDragging, dragging, measureMode } = useEditor()
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
    if (obj.state.locked || !isSelected || explode > 0.01 || measureMode) return
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

/** APPROXIMATE AIRFLOW MODEL — a real (if simplified) vector field computed
 * from the live fan objects each frame: every visible fan contributes a
 * directed, distance-decaying jet; heat sources add buoyancy. Move or remove
 * a fan in the scene and the field — and any hotspot — changes with it. */
function PCAirflow({ enabled }: { enabled: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const hotspotRef = useRef<THREE.Mesh>(null)
  const N = 380
  const { positions, colors, seeds } = useMemo(() => {
    const positions = new Float32Array(N * 3)
    const colors = new Float32Array(N * 3)
    const seeds = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      seeds[i] = Math.random()
      positions[i * 3] = -0.05 + (seeds[i] % 0.3) * 0.2
      positions[i * 3 + 1] = -0.2 + ((seeds[i] * 7) % 1) * 0.4
      positions[i * 3 + 2] = 0.2 - ((seeds[i] * 13) % 1) * 0.4
    }
    return { positions, colors, seeds }
  }, [])

  useFrame((_, dt) => {
    if (!enabled || !ref.current) return
    const store = useEditor.getState()
    const objs = store.scene?.objects ?? []
    const get = (id: string) => objs.find((o) => o.id === id && !o.state.hidden)
    // live fan jets: [position, direction, strength, radius]
    const jets: { p: number[]; d: number[]; s: number; r: number }[] = []
    const front = get('obj_front-fans')
    if (front) jets.push({ p: front.transform.position, d: [0, 0, -1], s: 0.55, r: 0.2 })
    const rear = get('obj_rear-fan')
    if (rear) jets.push({ p: rear.transform.position, d: [0, 0, -1], s: 0.5, r: 0.09 })
    const rad = get('obj_radiator')
    if (rad) jets.push({ p: rad.transform.position, d: [0, 1, 0], s: 0.45, r: 0.15 })
    const gpu = get('obj_gpu')
    const heat: number[][] = []
    if (gpu) heat.push(gpu.transform.position)
    const cpu = get('obj_cpu-block')
    if (cpu) heat.push(cpu.transform.position)

    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute
    const col = ref.current.geometry.attributes.color as THREE.BufferAttribute
    const step = Math.min(dt, 0.05)
    for (let i = 0; i < N; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      let vx = 0, vy = 0, vz = 0
      let speed = 0
      for (const j of jets) {
        const dx = x - j.p[0], dy = y - j.p[1], dz = z - j.p[2]
        // distance along the jet axis + perpendicular offset
        const along = dx * j.d[0] + dy * j.d[1] + dz * j.d[2]
        const px = dx - along * j.d[0], py = dy - along * j.d[1], pz = dz - along * j.d[2]
        const perp2 = px * px + py * py + pz * pz
        if (along > -0.05 && along < 0.55) {
          const g = Math.exp(-perp2 / (j.r * j.r)) * Math.exp(-Math.max(0, along) / 0.4) * j.s
          vx += j.d[0] * g; vy += j.d[1] * g; vz += j.d[2] * g
          speed += g
        }
      }
      for (const h of heat) {
        const dx = x - h[0], dy = y - h[1], dz = z - h[2]
        const d2 = dx * dx + dy * dy + dz * dz
        vy += 0.12 * Math.exp(-d2 / 0.01)  // buoyant rise off hot parts
      }
      x += vx * step; y += vy * step; z += vz * step
      // respawn when out of the working volume or stalled
      const stalled = speed < 0.02 && Math.abs(vy) < 0.02
      if (x < -0.35 || x > 0.35 || y < -0.3 || y > 0.4 || z < -0.5 || z > 0.35 ||
          (stalled && seeds[i] < 0.3)) {
        x = -0.05 + (Math.random() - 0.5) * 0.14
        y = -0.18 + Math.random() * 0.34
        z = 0.24
      }
      pos.setXYZ(i, x, y, z)
      // color by temperature: fast/cool intake = teal, slow near heat = orange
      let warm = 0
      for (const h of heat) {
        const d2 = (x - h[0]) ** 2 + (y - h[1]) ** 2 + (z - h[2]) ** 2
        warm = Math.max(warm, Math.exp(-d2 / 0.02))
      }
      col.setXYZ(i, 0.3 + 0.7 * warm, 0.8 - 0.35 * warm, 0.77 - 0.5 * warm)
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    // hotspot: flow magnitude sampled at the GPU — no intake = red warning
    if (hotspotRef.current && gpu) {
      let flow = 0
      const g = gpu.transform.position
      for (const j of jets) {
        const dx = g[0] - j.p[0], dy = g[1] - j.p[1], dz = g[2] - j.p[2]
        const along = dx * j.d[0] + dy * j.d[1] + dz * j.d[2]
        const px = dx - along * j.d[0], py = dy - along * j.d[1], pz = dz - along * j.d[2]
        if (along > -0.05 && along < 0.6) {
          flow += Math.exp(-(px * px + py * py + pz * pz) / (j.r * j.r * 4)) * j.s
        }
      }
      const hot = flow < 0.08
      hotspotRef.current.visible = hot
      if (hot) {
        hotspotRef.current.position.set(g[0], g[1], g[2])
        const m = hotspotRef.current.material as THREE.MeshBasicMaterial
        m.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 200)
      }
    } else if (hotspotRef.current) {
      hotspotRef.current.visible = false
    }
  })

  if (!enabled) return null
  return (
    <group>
      <points ref={ref} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.006} vertexColors transparent opacity={0.85} depthWrite={false} />
      </points>
      <mesh ref={hotspotRef} visible={false}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ff3b2f" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function PCViewport({ explode, airflow }: { explode: number; airflow: boolean }) {
  const { scene, select, dragging, measureMode, pushMeasurePoint } = useEditor()
  const onMeasure = (e: any) => {
    if (!measureMode || !e.point) return
    e.stopPropagation()
    pushMeasurePoint([e.point.x, e.point.y, e.point.z])
  }
  if (!scene) return null
  const proxyObjects = scene.objects.filter((o) => o.geometry.kind === 'proxy-box' || o.geometry.kind === 'library')
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
      <group onPointerDown={onMeasure}>
      {PC_COMPONENTS.map((comp) => {
        const obj = scene.objects.find((o) => o.id === `obj_${comp.id}`)
        return obj ? <Component3D key={comp.id} comp={comp} obj={obj} explode={explode} /> : null
      })}
      {proxyObjects.map((o) => <ObjectMesh key={o.id} obj={o} />)}
      </group>
      <MeasureOverlay />
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
