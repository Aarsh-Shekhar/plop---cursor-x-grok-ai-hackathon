// Procedural material edits applied to object cutout textures.
// The original photo pixels provide shading (luminance); the requested
// color/pattern replaces albedo — so a recolored rug keeps its real folds
// and shadows instead of turning into a flat sticker. Alpha is preserved.
import * as THREE from 'three'
import type { MaterialSpec } from './types'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function patternValue(
  pattern: string, x: number, y: number, w: number, h: number,
): number {
  // returns 0..1 — fraction of primary color at this pixel
  const u = x / w
  const v = y / h
  switch (pattern) {
    case 'zebra': {
      // organic-ish diagonal stripes with wobble
      const s = Math.sin(u * 26 + Math.sin(v * 9) * 2.2 + v * 7)
      return s > 0 ? 1 : 0
    }
    case 'checker':
      return (Math.floor(u * 8) + Math.floor(v * 8)) % 2
    case 'stripes':
      return Math.floor(u * 10) % 2
    case 'dots': {
      const gx = (u * 10) % 1 - 0.5
      const gy = (v * 10) % 1 - 0.5
      return gx * gx + gy * gy < 0.06 ? 1 : 0
    }
    case 'wood': {
      const rings = Math.sin((u * 3 + Math.sin(v * 4) * 0.25) * Math.PI * 6)
      return 0.5 + rings * 0.28
    }
    default:
      return 1
  }
}

/** Compose the edited texture for an object from its original cutout image. */
export function applyMaterial(
  source: HTMLImageElement, material: MaterialSpec,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth
  canvas.height = source.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  if (material.type === 'original') return canvas

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const primary = hexToRgb(material.color ?? '#888888')
  const secondary = hexToRgb(
    material.secondaryColor ?? (material.pattern === 'zebra' ? '#f4f1ea' : '#1a1a1a'),
  )
  const isPattern = material.type === 'pattern' && material.pattern

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (d[i + 3] === 0) continue
      // luminance of the captured pixel keeps real-world shading
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255
      const shade = 0.35 + lum * 0.75
      let rgb = primary
      if (isPattern) {
        const t = patternValue(material.pattern!, x, y, canvas.width, canvas.height)
        rgb = [
          primary[0] * t + secondary[0] * (1 - t),
          primary[1] * t + secondary[1] * (1 - t),
          primary[2] * t + secondary[2] * (1 - t),
        ]
      }
      d[i] = Math.min(255, rgb[0] * shade)
      d[i + 1] = Math.min(255, rgb[1] * shade)
      d[i + 2] = Math.min(255, rgb[2] * shade)
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

const textureCache = new Map<string, THREE.Texture>()

export function materialCacheKey(objectId: string, material: MaterialSpec): string {
  return `${objectId}:${JSON.stringify(material)}`
}

export async function getObjectTexture(
  objectId: string, textureUrl: string, material: MaterialSpec,
): Promise<THREE.Texture> {
  const key = materialCacheKey(objectId, material)
  const cached = textureCache.get(key)
  if (cached) return cached
  // '?canvas=1' keeps these CORS-mode loads on a separate cache key from any
  // plain <img> loads of the same file (a cached non-CORS response would
  // otherwise fail the crossOrigin load and silently drop the texture)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = textureUrl + (textureUrl.includes('?') ? '&' : '?') + 'canvas=1'
  })
  const canvas = applyMaterial(img, material)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  textureCache.set(key, tex)
  return tex
}
