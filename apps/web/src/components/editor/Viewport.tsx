// The 3D viewport: reality backdrop + editable objects + overlays.
// Orbit (left-drag) / pan (right-drag) / zoom (wheel); direct object drag
// (shift-drag = vertical); R/S switch the gizmo to rotate/scale on the
// selection; camera presets tween smoothly. Orbit is disabled while any
// object drag or gizmo drag is active so the camera never fights the edit.
import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import BackdropMesh from './BackdropMesh'
import ObjectMesh from './ObjectMesh'
import AirflowOverlay from './AirflowOverlay'
import { useEditor } from '../../state/editor'
import type { Scene } from '../../lib/types'

function CameraPresets() {
  const { cameraPreset, setCameraPreset, scene } = useEditor()
  const { camera, controls } = useThree() as any

  useEffect(() => {
    if (!cameraPreset || !scene) return
    const mid = -(scene.capture.depthMinM + scene.capture.depthMaxM) / 2
    const target = new THREE.Vector3(0, 0, mid)
    const dist = Math.abs(mid) + 1.5
    const presets: Record<string, THREE.Vector3> = {
      default: new THREE.Vector3(0, 0.5, 1.2),
      top: new THREE.Vector3(0, dist, mid + 0.01),
      front: new THREE.Vector3(0, 0.2, mid + dist),
      side: new THREE.Vector3(dist, 0.3, mid),
    }
    const to = presets[cameraPreset] ?? presets.default
    const fromPos = camera.position.clone()
    const fromTarget = controls ? controls.target.clone() : new THREE.Vector3()
    const start = performance.now()
    const dur = 450
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      camera.position.lerpVectors(fromPos, to, e)
      if (controls) {
        controls.target.lerpVectors(fromTarget, target, e)
        controls.update()
      }
      if (t < 1) raf = requestAnimationFrame(tick)
      else setCameraPreset(null)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cameraPreset, scene?.id])
  return null
}

function SelectionGizmo() {
  const { scene, selectedId, toolMode, updateObject, setDragging } = useEditor()
  const obj = scene?.objects.find((o) => o.id === selectedId)
  if (!obj || obj.state.locked || toolMode === 'translate') return null
  return <GizmoInner key={obj.id} obj={obj} toolMode={toolMode} updateObject={updateObject} setDragging={setDragging} />
}

function GizmoInner({ obj, toolMode, updateObject, setDragging }: any) {
  const [node, setNode] = useState<THREE.Group | null>(null)

  // proxy group mirrors the object; edits commit back on release
  useEffect(() => {
    if (!node) return
    node.position.set(...(obj.transform.position as [number, number, number]))
    node.rotation.set(0, obj.transform.rotationY, 0)
    node.scale.set(...(obj.transform.scale as [number, number, number]))
  }, [node, obj.id, obj.transform])

  return (
    <>
      <group ref={setNode}>
        <mesh visible={false}>
          <boxGeometry args={[obj.dimensions.width, obj.dimensions.height, Math.max(obj.dimensions.depth, 0.05)]} />
        </mesh>
      </group>
      {node && (
        <TransformControls
          object={node}
          mode={toolMode}
          showX={toolMode !== 'rotate'}
          showZ={toolMode !== 'rotate'}
          size={0.7}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => {
            setDragging(false)
            updateObject(obj.id, (o: any) => ({
              ...o,
              transform: {
                position: [node.position.x, node.position.y, node.position.z],
                rotationY: node.rotation.y,
                scale: [node.scale.x, node.scale.y, node.scale.z],
              },
            }))
          }}
        />
      )}
    </>
  )
}

function EditorCanvasEnvironment({ scene }: { scene: Scene }) {
  // The "editor canvas" look: a grid floor plane + fog so regions outside the
  // captured photo read as workspace, not as broken rendering.
  const floorY = scene.environment.floorY
  const mid = -(scene.capture.depthMinM + scene.capture.depthMaxM) / 2
  const gridColor = scene.mode === 'founder' ? '#2a3038' : '#3a3f4a'
  return (
    <group>
      <gridHelper
        args={[60, 120, gridColor, gridColor]}
        position={[0, floorY - 0.015, mid]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY - 0.02, mid]}>
        <circleGeometry args={[30, 48]} />
        <meshBasicMaterial color={scene.mode === 'founder' ? '#0e1116' : '#171a21'} />
      </mesh>
    </group>
  )
}

export default function Viewport({ scene }: { scene: Scene }) {
  const { select, dragging, mode } = useEditor()
  const bg = mode === 'founder' ? '#0b0d10' : '#14161c'

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.05, far: 100, position: [0, 0.5, 1.2] }}
      style={{ background: `radial-gradient(120% 90% at 50% 20%, ${mode === 'founder' ? '#141920' : '#1d212b'} 0%, ${bg} 70%)` }}
      gl={{ alpha: true }}
      onPointerMissed={() => select(null)}
    >
      <fog attach="fog" args={[bg, 12, 40]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]} intensity={0.6} />
      <EditorCanvasEnvironment scene={scene} />
      <BackdropMesh scene={scene} onMiss={() => select(null)} />
      {scene.objects.map((o) => <ObjectMesh key={o.id} obj={o} />)}
      <AirflowOverlay />
      <SelectionGizmo />
      <CameraPresets />
      <OrbitControls
        makeDefault
        enabled={!dragging}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        panSpeed={0.8}
        zoomToCursor
        target={[0, 0, -(scene.capture.depthMinM + scene.capture.depthMaxM) / 2]}
        // stay in the capture hemisphere: a single-view reconstruction reads
        // best from near the original viewpoint, so clamp orbit rather than
        // letting the camera swing behind the depth shell
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.62}
        minAzimuthAngle={-Math.PI * 0.38}
        maxAzimuthAngle={Math.PI * 0.38}
        minDistance={0.35}
        maxDistance={Math.max(6, scene.capture.depthMaxM * 2)}
      />
    </Canvas>
  )
}
