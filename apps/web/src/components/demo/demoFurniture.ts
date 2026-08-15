// Procedural furniture that matches the demo room's palette (white/gray fabric,
// light wood, brass, glass). Each builder returns a group sized w×h×d meters,
// origin at the center of its floor footprint.
import * as THREE from 'three'

const M = {
  fabricWhite: () => new THREE.MeshStandardMaterial({ color: 0xe9e5dd, roughness: 0.85 }),
  fabricGray: () => new THREE.MeshStandardMaterial({ color: 0xb6b2ab, roughness: 0.85 }),
  fabricMustard: () => new THREE.MeshStandardMaterial({ color: 0xd9a94e, roughness: 0.8 }),
  fabricGreen: () => new THREE.MeshStandardMaterial({ color: 0x93a58a, roughness: 0.8 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.55 }),
  darkWood: () => new THREE.MeshStandardMaterial({ color: 0x5e4a38, roughness: 0.6 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.6 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0xd8e4e2, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.4 }),
  leaf: () => new THREE.MeshStandardMaterial({ color: 0x5e7d4f, roughness: 0.9 }),
  terracotta: () => new THREE.MeshStandardMaterial({ color: 0xb96b4a, roughness: 0.8 }),
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
function cyl(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rTop = r): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, 24), mat)
  m.position.set(x, y, z)
  return m
}

export interface CatalogEntry {
  key: string
  label: string
  emoji: string
  // default dims in cm
  w: number
  h: number
  d: number
  build: (w: number, h: number, d: number) => THREE.Group
}

function sofa(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const legH = 0.12
  const baseH = h * 0.32
  const backT = d * 0.22
  const armW = w * 0.1
  const fabric = M.fabricWhite()
  const cushion = M.fabricGray()
  // legs
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.02, legH, M.wood(), sx * (w / 2 - 0.08), legH / 2, sz * (d / 2 - 0.08)))
  // base
  g.add(box(w, baseH, d, fabric, 0, legH + baseH / 2, 0))
  // back
  g.add(box(w, h - legH - baseH, backT, fabric, 0, legH + baseH + (h - legH - baseH) / 2, -(d - backT) / 2))
  // arms
  g.add(box(armW, h * 0.62 - legH, d, fabric, -(w - armW) / 2, legH + (h * 0.62 - legH) / 2, 0))
  g.add(box(armW, h * 0.62 - legH, d, fabric, (w - armW) / 2, legH + (h * 0.62 - legH) / 2, 0))
  // seat + back cushions
  const seats = Math.max(2, Math.round(w / 0.75))
  const seatW = (w - armW * 2) / seats - 0.02
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + armW + (i + 0.5) * ((w - armW * 2) / seats)
    g.add(box(seatW, 0.12, d - backT - 0.06, cushion, x, legH + baseH + 0.06, backT / 2 - 0.02))
    g.add(box(seatW, h * 0.42, 0.12, cushion, x, legH + baseH + h * 0.28, -(d - backT) / 2 + backT / 2 + 0.07))
  }
  return g
}

function armchair(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const legH = 0.14
  const fabric = M.fabricMustard()
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.018, legH, M.darkWood(), sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.07)))
  g.add(box(w, h * 0.3, d, fabric, 0, legH + h * 0.15, 0))
  // curved back: half-cylinder shell
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(w / 2, w / 2, h * 0.55, 24, 1, true, 0, Math.PI),
    fabric,
  )
  shell.rotation.y = Math.PI
  shell.position.set(0, legH + h * 0.3 + h * 0.27, 0)
  const shellMat = shell.material as THREE.MeshStandardMaterial
  shellMat.side = THREE.DoubleSide
  g.add(shell)
  g.add(box(w * 0.8, 0.1, d * 0.78, M.fabricWhite(), 0, legH + h * 0.32, d * 0.05))
  return g
}

function coffeeTable(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.02, 36), M.glass())
  top.scale.z = d / w
  top.position.y = h
  g.add(top)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    g.add(cyl(0.012, h, M.brass(), Math.cos(a) * (w / 2 - 0.1), h / 2, Math.sin(a) * (d / 2 - 0.1)))
  }
  return g
}

function bookshelf(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const t = 0.025
  const frame = M.white()
  g.add(box(t, h, d, frame, -(w - t) / 2, h / 2, 0))
  g.add(box(t, h, d, frame, (w - t) / 2, h / 2, 0))
  g.add(box(w, t, d, frame, 0, h - t / 2, 0))
  g.add(box(w, t, d, frame, 0, t / 2, 0))
  g.add(box(w - t, h, t, frame, 0, h / 2, -(d - t) / 2))
  const shelves = Math.max(2, Math.round(h / 0.38))
  const bookMats = [M.fabricGray(), M.wood(), M.fabricGreen(), M.fabricMustard(), M.darkWood()]
  for (let i = 1; i < shelves; i++) {
    const y = (i * h) / shelves
    g.add(box(w - t * 2, t, d, frame, 0, y, 0))
    // a run of books on each shelf
    let x = -w / 2 + t + 0.03
    const run = (0.55 + 0.4 * Math.abs(Math.sin(i * 7))) * (w - t * 2)
    while (x < -w / 2 + t + run) {
      const bw = 0.025 + 0.02 * Math.abs(Math.sin(x * 91 + i))
      const bh = h / shelves - t - 0.04 - 0.05 * Math.abs(Math.cos(x * 53))
      g.add(box(bw, bh, d * 0.7, bookMats[Math.floor(Math.abs(Math.sin(x * 131)) * bookMats.length)], x + bw / 2, y + t / 2 + bh / 2, 0))
      x += bw + 0.006
    }
  }
  return g
}

function plant(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  const potH = h * 0.3
  g.add(cyl(w * 0.32, potH, M.terracotta(), 0, potH / 2, 0, w * 0.28))
  const leaf = M.leaf()
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const blob = new THREE.Mesh(new THREE.SphereGeometry(w * 0.22, 12, 10), leaf)
    blob.scale.y = 1.7
    blob.position.set(Math.cos(a) * w * 0.16, potH + (h - potH) * (0.45 + 0.25 * Math.abs(Math.sin(a * 3))), Math.sin(a) * w * 0.16)
    g.add(blob)
  }
  return g
}

function floorLamp(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  // wooden tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = cyl(0.014, h * 0.75, M.wood())
    leg.position.set(Math.cos(a) * w * 0.28, h * 0.36, Math.sin(a) * w * 0.28)
    leg.lookAt(0, h * 0.78, 0)
    leg.rotateX(Math.PI / 2)
    g.add(leg)
  }
  const shade = cyl(w * 0.32, h * 0.22, M.fabricWhite(), 0, h * 0.85, 0, w * 0.28)
  ;(shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.2 }))
  bulb.position.y = h * 0.8
  g.add(bulb)
  return g
}

function sideTable(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(w / 2, 0.03, M.wood(), 0, h - 0.015, 0))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3
    g.add(cyl(0.014, h, M.darkWood(), Math.cos(a) * (w / 2 - 0.05), h / 2, Math.sin(a) * (w / 2 - 0.05)))
  }
  return g
}

function readingChair(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const legH = 0.15
  const fabric = M.fabricGreen()
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.016, legH, M.darkWood(), sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06)))
  g.add(box(w, h * 0.22, d, fabric, 0, legH + h * 0.11, 0))
  g.add(box(w, h * 0.66, 0.12, fabric, 0, legH + h * 0.22 + h * 0.33, -(d - 0.12) / 2))
  g.add(box(0.1, h * 0.3, d * 0.8, fabric, -(w - 0.1) / 2, legH + h * 0.22 + h * 0.15, 0.02))
  g.add(box(0.1, h * 0.3, d * 0.8, fabric, (w - 0.1) / 2, legH + h * 0.22 + h * 0.15, 0.02))
  return g
}

export const CATALOG: CatalogEntry[] = [
  { key: 'sofa', label: 'Sofa', emoji: '🛋', w: 210, h: 78, d: 92, build: sofa },
  { key: 'armchair', label: 'Armchair', emoji: '💺', w: 78, h: 74, d: 74, build: armchair },
  { key: 'reading-chair', label: 'Reading chair', emoji: '🪑', w: 70, h: 95, d: 78, build: readingChair },
  { key: 'coffee-table', label: 'Coffee table', emoji: '⬬', w: 90, h: 38, d: 70, build: coffeeTable },
  { key: 'side-table', label: 'Side table', emoji: '🥧', w: 45, h: 55, d: 45, build: sideTable },
  { key: 'bookshelf', label: 'Bookshelf', emoji: '📚', w: 120, h: 180, d: 35, build: bookshelf },
  { key: 'plant', label: 'Plant', emoji: '🪴', w: 55, h: 150, d: 55, build: plant },
  { key: 'floor-lamp', label: 'Floor lamp', emoji: '💡', w: 45, h: 155, d: 45, build: floorLamp },
]
