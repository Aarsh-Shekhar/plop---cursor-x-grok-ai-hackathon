// Editable semantic layer: one selectable, draggable mesh per SceneObject.
// Cutout objects render their real captured pixels (RGBA crop) on a card at
// true world size; proxy objects (previewed replacements) render as
// dimension-accurate boxes clearly marked approximate.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { artifactUrl } from '../../lib/api'
import { getObjectTexture } from '../../lib/materials'
import { buildLibraryMesh } from '../../lib/objectLibrary'
import { useEditor } from '../../state/editor'
import type { SceneObject } from '../../lib/types'

function useMemoLibrary(key: string, dims: { width: number; height: number; depth: number }) {
  return useMemo(() => buildLibraryMesh(key, dims) ?? new THREE.Group(),
    [key, dims.width, dims.height, dims.depth])
}

const dragPlane = new THREE.Plane()
const dragPoint = new THREE.Vector3()
const dragOffset = new THREE.Vector3()

export default function ObjectMesh({ obj }: { obj: SceneObject }) {
  const { selectedId, highlighted, select, updateObject, setDragging, dragging, clearance, scene, measureMode, identifyMode, setFactSheetId } = useEditor()
  const groupRef = useRef<THREE.Group>(null)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const [hovered, setHovered] = useState(false)
  const { camera, gl } = useThree()
  const dragState = useRef<{ active: boolean; vertical: boolean } | null>(null)

  const isSelected = selectedId === obj.id
  const isHighlighted = highlighted.includes(obj.id)

  useEffect(() => {
    let ok = true
    if (obj.geometry.kind === 'cutout' && obj.geometry.textureUri) {
      getObjectTexture(obj.id, artifactUrl(obj.geometry.textureUri), obj.appearance.material)
        .then((t) => { if (ok) setTex(t) })
        .catch(() => {})
    }
    return () => { ok = false }
  }, [obj.id, obj.geometry.textureUri, obj.appearance.material])

  useEffect(() => {
    // pointer = clickable, grab = draggable (already selected); identify
    // mode keeps its own neon cursor (set on the viewport wrapper)
    if (identifyMode) return
    document.body.style.cursor = hovered ? (isSelected ? 'grab' : 'pointer') : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered, isSelected, identifyMode])

  // all hooks must be above this line — an early return before a hook
  // crashes React when `hidden` flips
  const liveRef = useRef<[number, number, number] | null>(null)
  const libMesh = useMemoLibrary(obj.geometry.libraryKey ?? '', obj.dimensions)

  if (obj.state.hidden) return null

  const { width, height, depth } = obj.dimensions
  const [sx, sy, sz] = obj.transform.scale
  const pos = obj.transform.position

  // Horizontal surfaces (rugs, mats) captured in perspective look wrong as
  // vertical billboards — lay them flat on the floor instead.
  const isFlat = /rug|carpet|mat\b/.test(obj.label)

  // does this object overlap another? (clearance overlay)
  let colliding = false
  if (clearance && scene) {
    for (const other of scene.objects) {
      if (other.id === obj.id || other.state.hidden) continue
      const dx = Math.abs(pos[0] - other.transform.position[0])
      const dy = Math.abs(pos[1] - other.transform.position[1])
      const dz = Math.abs(pos[2] - other.transform.position[2])
      const ow = (width * sx + other.dimensions.width * other.transform.scale[0]) / 2
      const oh = (height * sy + other.dimensions.height * other.transform.scale[1]) / 2
      const od = (depth * sz + other.dimensions.depth * other.transform.scale[2]) / 2
      if (dx < ow && dy < oh && dz < od) { colliding = true; break }
    }
  }

  const startDrag = (e: any) => {
    if (obj.state.locked || measureMode || identifyMode) return
    // Orbit-first: an unselected object never grabs the pointer — the first
    // click selects it (camera drag stays free), dragging moves it only once
    // it's selected. This keeps traversal from "sticking" to objects.
    if (!isSelected) return
    e.stopPropagation()
    select(obj.id)
    const vertical = e.shiftKey
    dragState.current = { active: true, vertical }
    setDragging(true)
    if (vertical) {
      // vertical: plane facing the camera through the object
      const normal = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(...pos))
      normal.y = 0
      normal.normalize()
      dragPlane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...pos))
    } else {
      // horizontal: plane at the object's current height
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pos))
    }
    e.ray.intersectPlane(dragPlane, dragPoint)
    dragOffset.copy(dragPoint).sub(new THREE.Vector3(...pos))
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }

  const moveDrag = (e: any) => {
    if (!dragState.current?.active) return
    e.stopPropagation()
    if (!e.ray.intersectPlane(dragPlane, dragPoint)) return
    const target = dragPoint.clone().sub(dragOffset)
    updateObjectLive(target, dragState.current.vertical)
  }

  const updateObjectLive = (target: THREE.Vector3, vertical: boolean) => {
    const next: [number, number, number] = vertical
      ? [pos[0], target.y, pos[2]]
      : [target.x, pos[1], target.z]
    liveRef.current = next
    // move the three.js group directly for 60fps feedback; commit on release
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
      updateObject(obj.id, (o) => ({
        ...o, transform: { ...o.transform, position: final },
      }))
    }
  }

  const outlineColor = identifyMode && hovered ? '#ff7b1a'
    : colliding ? '#ff4d4d'
    : isHighlighted ? '#ffd166'
    : isSelected ? '#4d96ff'
    : hovered ? '#8ab4ff' : null

  return (
    <group
      ref={groupRef}
      position={pos}
      rotation={[0, obj.transform.rotationY, 0]}
      scale={[sx, sy, sz]}
    >
      {obj.geometry.kind === 'library' && obj.geometry.libraryKey ? (
        <group
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHovered(true) }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); if (identifyMode) { setFactSheetId(obj.id) } else { select(obj.id) } }}
        >
          <primitive object={libMesh} />
        </group>
      ) : obj.geometry.kind === 'cutout' && !tex ? null /* no gray placeholder pop-in */
      : obj.geometry.kind === 'cutout' && tex ? (
        <mesh
          rotation={isFlat ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
          position={isFlat ? [0, -height / 2 + 0.02, 0] : [0, 0, 0]}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHovered(true) }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); if (identifyMode) { setFactSheetId(obj.id) } else { select(obj.id) } }}
        >
          <planeGeometry args={isFlat ? [width, Math.max(depth, width * 0.55)] : [width, height]} />
          <meshBasicMaterial
            map={tex}
            transparent
            alphaTest={0.15}
            side={THREE.DoubleSide}
            depthWrite
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ) : (
        // dimension-accurate proxy for previewed replacement candidates
        <mesh
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerOver={(e) => { e.stopPropagation(); if (!dragging) setHovered(true) }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); if (identifyMode) { setFactSheetId(obj.id) } else { select(obj.id) } }}
        >
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color={obj.appearance.material.color ?? '#9aa3b2'}
            roughness={0.75}
            transparent
            opacity={0.92}
          />
        </mesh>
      )}

      {outlineColor && (
        <lineSegments position={isFlat ? [0, -height / 2 + 0.02, 0] : [0, 0, 0]}>
          <edgesGeometry args={[isFlat
            ? new THREE.BoxGeometry(width * 1.02, 0.03, Math.max(depth, width * 0.55) * 1.02)
            : new THREE.BoxGeometry(width * 1.02, height * 1.02, Math.max(depth, 0.05) * 1.02)]} />
          <lineBasicMaterial color={outlineColor} transparent opacity={0.95} />
        </lineSegments>
      )}

      {isSelected && (
        // ground shadow disc anchors the selection visually
        <mesh position={[0, -height / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[Math.max(width, depth) * 0.55, 32]} />
          <meshBasicMaterial color="#4d96ff" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
