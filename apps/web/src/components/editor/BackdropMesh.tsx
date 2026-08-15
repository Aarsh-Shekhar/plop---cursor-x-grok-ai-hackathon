// Reality layer: the depth map unprojected into a textured mesh, using the
// inpainted "empty room" image so moved objects leave no ghosts behind.
// Triangles spanning large depth discontinuities are dropped to avoid smearing.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { artifactUrl } from '../../lib/api'
import type { Scene } from '../../lib/types'

function loadImage(url: string): Promise<HTMLImageElement> {
  // separate cache key for CORS-mode loads — see materials.ts
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url + (url.includes('?') ? '&' : '?') + 'canvas=1'
  })
}

function decodeGray(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) out[i] = data[i * 4]
  return out
}

export default function BackdropMesh({ scene, onMiss }: {
  scene: Scene
  onMiss?: () => void
}) {
  const [built, setBuilt] = useState<{ geo: THREE.BufferGeometry; tex: THREE.Texture } | null>(null)

  useEffect(() => {
    let disposed = false
    ;(async () => {
      const { width: W, height: H, depthMinM, depthMaxM, hfovDeg } = scene.capture
      const depthImg = await loadImage(artifactUrl(scene.capture.depthUri))
      const depth = decodeGray(depthImg, W, H)
      const fx = (W / 2) / Math.tan(((hfovDeg / 2) * Math.PI) / 180)
      const dRange = depthMaxM - depthMinM

      const step = Math.max(1, Math.floor(W / 300))
      const cols = Math.floor((W - 1) / step) + 1
      const rows = Math.floor((H - 1) / step) + 1
      const positions = new Float32Array(cols * rows * 3)
      const uvs = new Float32Array(cols * rows * 2)

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * step
          const py = r * step
          const d = depthMinM + (depth[py * W + px] / 255) * dRange
          const i = r * cols + c
          positions[i * 3] = ((px - W / 2) / fx) * d
          positions[i * 3 + 1] = (-(py - H / 2) / fx) * d
          positions[i * 3 + 2] = -d
          uvs[i * 2] = px / (W - 1)
          uvs[i * 2 + 1] = 1 - py / (H - 1)
        }
      }

      const indices: number[] = []
      const depthOf = (i: number) => -positions[i * 3 + 2]
      // discontinuity threshold scales with scene depth: room-scale scenes
      // keep more triangles (fewer black voids), close-up scenes drop the
      // foreground "bridges" that would wrap the scene in an occluding shell
      const maxJump = Math.min(0.7, Math.max(0.25, dRange * 0.12))
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c
          const b = a + 1
          const d2 = a + cols
          const e = d2 + 1
          if (Math.abs(depthOf(a) - depthOf(e)) < maxJump) {
            if (Math.abs(depthOf(a) - depthOf(b)) < maxJump && Math.abs(depthOf(b) - depthOf(e)) < maxJump)
              indices.push(a, e, b)
            if (Math.abs(depthOf(a) - depthOf(d2)) < maxJump && Math.abs(depthOf(d2) - depthOf(e)) < maxJump)
              indices.push(a, d2, e)
          }
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      geo.setIndex(indices)
      geo.computeVertexNormals()

      const cleanedUrl = artifactUrl(scene.capture.cleanedUri)
      const tex = new THREE.TextureLoader().load(
        cleanedUrl + (cleanedUrl.includes('?') ? '&' : '?') + 'canvas=1')
      tex.colorSpace = THREE.SRGBColorSpace
      if (!disposed) setBuilt({ geo, tex })
    })()
    return () => { disposed = true }
  }, [scene.id, scene.capture])

  if (!built) return null
  return (
    <mesh
      geometry={built.geo}
      onClick={(e) => { e.stopPropagation(); onMiss?.() }}
    >
      <meshBasicMaterial map={built.tex} side={THREE.DoubleSide} />
    </mesh>
  )
}
