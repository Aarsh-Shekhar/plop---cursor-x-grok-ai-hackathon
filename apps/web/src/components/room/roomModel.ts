// GLB loading for the /room demo: parses the photoreal living-room model and
// clusters its meshes into semantic groups (see roomConfig). Kept separate
// from RoomViewport so procedural walkthroughs (e.g. /office) can reuse the
// viewport without pulling the 22 MB GLB.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { MATERIAL_GROUPS, STATIC_MATERIALS } from './roomConfig'
import type { RoomGroup } from './RoomViewport'

const GLB_URL = '/demo3d/room.glb'

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

useGLTF.preload(GLB_URL)
