// Built-in 3D object library: procedural builders for common furniture and
// hardware, matched by name/synonym. "add a sofa" inserts a real mesh at
// real default dimensions — never a gray box. Builders return a group whose
// footprint is w×h×d meters, origin at the center of the bounding box.
import * as THREE from 'three'

const mat = {
  fabric: (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.55 }),
  darkWood: () => new THREE.MeshStandardMaterial({ color: 0x5e4a38, roughness: 0.6 }),
  metal: () => new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.35, metalness: 0.85 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.5 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xf0ede7, roughness: 0.7 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0xd8e4e2, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.35 }),
  leaf: () => new THREE.MeshStandardMaterial({ color: 0x5e7d4f, roughness: 0.9 }),
  pot: () => new THREE.MeshStandardMaterial({ color: 0xb96b4a, roughness: 0.8 }),
  canvas: (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.25, metalness: 0.2 }),
  rug: (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  return mesh
}
function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rt = r) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, 20), m)
  mesh.position.set(x, y, z)
  return mesh
}

export interface LibraryItem {
  key: string
  label: string
  category: string
  synonyms: string[]
  /** default real-world dims (m): w, h, d */
  dims: [number, number, number]
  build: () => THREE.Group
}

// Builders model at their default dims; the viewport scales the group to the
// object's actual dimensions, so listed product sizes render true to scale.
export const LIBRARY: LibraryItem[] = [
  {
    key: 'sofa', label: 'Sofa', category: 'seating',
    synonyms: ['sofa', 'couch', 'loveseat', 'settee', 'sectional'],
    dims: [2.0, 0.85, 0.95],
    build: () => {
      const g = new THREE.Group()
      const f = mat.fabric(0xb6b2ab)
      g.add(box(2.0, 0.3, 0.95, f, 0, -0.2, 0))                    // base
      g.add(box(2.0, 0.35, 0.22, f, 0, 0.08, -0.36))               // back
      g.add(box(0.22, 0.3, 0.95, f, -0.89, 0.02, 0))               // arms
      g.add(box(0.22, 0.3, 0.95, f, 0.89, 0.02, 0))
      g.add(box(0.82, 0.12, 0.6, mat.fabric(0xc4c0b8), -0.44, -0.02, 0.08))
      g.add(box(0.82, 0.12, 0.6, mat.fabric(0xc4c0b8), 0.44, -0.02, 0.08))
      for (const [x, z] of [[-0.9, 0.4], [0.9, 0.4], [-0.9, -0.4], [0.9, -0.4]] as const)
        g.add(cyl(0.03, 0.12, mat.darkWood(), x, -0.38, z))
      return g
    },
  },
  {
    key: 'armchair', label: 'Armchair', category: 'seating',
    synonyms: ['armchair', 'accent chair', 'lounge chair', 'reading chair'],
    dims: [0.85, 0.9, 0.85],
    build: () => {
      const g = new THREE.Group()
      const f = mat.fabric(0xd9a94e)
      g.add(box(0.85, 0.3, 0.85, f, 0, -0.2, 0))
      g.add(box(0.85, 0.45, 0.2, f, 0, 0.12, -0.32))
      g.add(box(0.18, 0.28, 0.8, f, -0.33, 0, 0))
      g.add(box(0.18, 0.28, 0.8, f, 0.33, 0, 0))
      for (const [x, z] of [[-0.35, 0.35], [0.35, 0.35], [-0.35, -0.35], [0.35, -0.35]] as const)
        g.add(cyl(0.025, 0.14, mat.metal(), x, -0.38, z))
      return g
    },
  },
  {
    key: 'chair', label: 'Chair', category: 'seating',
    synonyms: ['chair', 'dining chair', 'desk chair', 'office chair', 'stool'],
    dims: [0.5, 0.9, 0.55],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.46, 0.05, 0.46, mat.wood(), 0, -0.1, 0))
      g.add(box(0.46, 0.45, 0.05, mat.wood(), 0, 0.15, -0.2))
      for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]] as const)
        g.add(cyl(0.02, 0.35, mat.darkWood(), x, -0.28, z))
      return g
    },
  },
  {
    key: 'coffee-table', label: 'Coffee Table', category: 'table',
    synonyms: ['coffee table', 'center table', 'cocktail table'],
    dims: [1.1, 0.45, 0.6],
    build: () => {
      const g = new THREE.Group()
      g.add(box(1.1, 0.04, 0.6, mat.glass(), 0, 0.2, 0))
      g.add(box(1.0, 0.03, 0.5, mat.darkWood(), 0, -0.05, 0))
      for (const [x, z] of [[-0.5, 0.25], [0.5, 0.25], [-0.5, -0.25], [0.5, -0.25]] as const)
        g.add(cyl(0.02, 0.42, mat.metal(), x, 0, z))
      return g
    },
  },
  {
    key: 'desk', label: 'Desk', category: 'table',
    synonyms: ['desk', 'work desk', 'standing desk', 'workstation', 'table', 'folding table', 'banquet table', 'buffet table'],
    dims: [1.4, 0.75, 0.7],
    build: () => {
      const g = new THREE.Group()
      g.add(box(1.4, 0.04, 0.7, mat.wood(), 0, 0.35, 0))
      g.add(box(0.05, 0.7, 0.65, mat.metal(), -0.65, 0, 0))
      g.add(box(0.05, 0.7, 0.65, mat.metal(), 0.65, 0, 0))
      return g
    },
  },
  {
    key: 'bookshelf', label: 'Bookshelf', category: 'storage',
    synonyms: ['bookshelf', 'bookcase', 'shelf', 'shelving', 'shelving unit'],
    dims: [0.8, 1.8, 0.3],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.8, 1.8, 0.03, mat.white(), 0, 0, -0.13))
      g.add(box(0.03, 1.8, 0.3, mat.white(), -0.39, 0, 0))
      g.add(box(0.03, 1.8, 0.3, mat.white(), 0.39, 0, 0))
      for (let i = 0; i < 5; i++) {
        g.add(box(0.78, 0.025, 0.3, mat.white(), 0, -0.85 + i * 0.42, 0))
        // books
        let x = -0.3
        while (x < 0.3 && i < 4) {
          const w = 0.03 + Math.random() * 0.03
          g.add(box(w, 0.22 + Math.random() * 0.08,
            0.18, mat.canvas([0x8a4b3a, 0x3a5a7a, 0x6b7a4b, 0x8a7a3a][Math.floor(Math.random() * 4)]),
            x + w / 2, -0.71 + i * 0.42, 0))
          x += w + 0.008
        }
      }
      return g
    },
  },
  {
    key: 'painting', label: 'Wall Art', category: 'decor',
    synonyms: ['painting', 'art', 'wall art', 'artwork', 'picture', 'print', 'poster', 'frame'],
    dims: [0.8, 0.6, 0.04],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.8, 0.6, 0.03, mat.darkWood()))
      g.add(box(0.72, 0.52, 0.035, mat.canvas(0x7a8ba0), 0, 0, 0.004))
      g.add(box(0.3, 0.2, 0.04, mat.canvas(0xc9a06b), -0.1, 0.06, 0.006))
      g.add(box(0.2, 0.28, 0.04, mat.canvas(0x5e7d4f), 0.15, -0.04, 0.006))
      return g
    },
  },
  {
    key: 'plant', label: 'Potted Plant', category: 'decor',
    synonyms: ['plant', 'potted plant', 'houseplant', 'monstera', 'fig', 'fern', 'tree'],
    dims: [0.45, 1.2, 0.45],
    build: () => {
      const g = new THREE.Group()
      g.add(cyl(0.14, 0.24, mat.pot(), 0, -0.48, 0, 0.11))
      g.add(cyl(0.02, 0.5, mat.leaf(), 0, -0.1, 0))
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat.leaf())
        leaf.scale.set(1, 0.5, 1.6)
        const a = (i / 7) * Math.PI * 2
        leaf.position.set(Math.cos(a) * 0.14, 0.2 + (i % 3) * 0.14, Math.sin(a) * 0.14)
        leaf.rotation.y = -a
        leaf.rotation.z = 0.4
        g.add(leaf)
      }
      return g
    },
  },
  {
    key: 'floor-lamp', label: 'Floor Lamp', category: 'lighting',
    synonyms: ['lamp', 'floor lamp', 'standing lamp', 'light'],
    dims: [0.4, 1.6, 0.4],
    build: () => {
      const g = new THREE.Group()
      g.add(cyl(0.16, 0.02, mat.metal(), 0, -0.79, 0))
      g.add(cyl(0.012, 1.3, mat.metal(), 0, -0.1, 0))
      g.add(cyl(0.16, 0.28, new THREE.MeshStandardMaterial({
        color: 0xe8dcc0, emissive: 0xe8c96a, emissiveIntensity: 0.35, roughness: 0.8,
      }), 0, 0.66, 0, 0.12))
      return g
    },
  },
  {
    key: 'rug', label: 'Area Rug', category: 'textile',
    synonyms: ['rug', 'carpet', 'area rug', 'runner', 'mat'],
    dims: [2.0, 0.02, 1.4],
    build: () => {
      const g = new THREE.Group()
      g.add(box(2.0, 0.015, 1.4, mat.rug(0x4a5568)))
      g.add(box(1.7, 0.018, 1.1, mat.rug(0x64748b)))
      g.add(box(1.2, 0.02, 0.7, mat.rug(0x94a3b8)))
      return g
    },
  },
  {
    key: 'tv', label: 'TV', category: 'electronics',
    synonyms: ['tv', 'television', 'flatscreen', 'oled', 'screen'],
    dims: [1.2, 0.7, 0.08],
    build: () => {
      const g = new THREE.Group()
      g.add(box(1.2, 0.68, 0.04, mat.black()))
      g.add(box(1.14, 0.62, 0.045, mat.screen(), 0, 0.01, 0.002))
      g.add(box(0.3, 0.02, 0.08, mat.black(), 0, -0.34, 0))
      return g
    },
  },
  {
    key: 'monitor', label: 'Monitor', category: 'electronics',
    synonyms: ['monitor', 'display', 'ultrawide', 'computer monitor', 'gaming monitor'],
    dims: [0.62, 0.45, 0.2],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.62, 0.36, 0.03, mat.black(), 0, 0.045, 0))
      g.add(box(0.58, 0.32, 0.035, mat.screen(), 0, 0.045, 0.001))
      g.add(cyl(0.02, 0.14, mat.metal(), 0, -0.15, -0.02))
      g.add(box(0.22, 0.015, 0.16, mat.metal(), 0, -0.215, -0.02))
      return g
    },
  },
  {
    key: 'side-table', label: 'Side Table', category: 'table',
    synonyms: ['side table', 'end table', 'nightstand', 'bedside table'],
    dims: [0.5, 0.55, 0.5],
    build: () => {
      const g = new THREE.Group()
      g.add(cyl(0.24, 0.03, mat.darkWood(), 0, 0.25, 0))
      g.add(cyl(0.02, 0.5, mat.metal(), 0, 0, 0))
      g.add(cyl(0.16, 0.02, mat.metal(), 0, -0.26, 0))
      return g
    },
  },
  {
    key: 'dresser', label: 'Dresser', category: 'storage',
    synonyms: ['dresser', 'chest of drawers', 'drawers', 'cabinet', 'sideboard', 'credenza'],
    dims: [1.2, 0.8, 0.45],
    build: () => {
      const g = new THREE.Group()
      g.add(box(1.2, 0.8, 0.45, mat.wood()))
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 2; c++) {
          g.add(box(0.5, 0.2, 0.02, mat.darkWood(), -0.28 + c * 0.56, 0.25 - r * 0.25, 0.23))
          g.add(cyl(0.015, 0.03, mat.metal(), -0.28 + c * 0.56, 0.25 - r * 0.25, 0.25))
        }
      return g
    },
  },
  {
    key: 'cake', label: 'Celebration Cake', category: 'decor',
    synonyms: ['cake', 'birthday cake', 'celebration cake'],
    dims: [0.3, 0.25, 0.3],
    build: () => {
      const g = new THREE.Group()
      const frosting = new THREE.MeshStandardMaterial({ color: 0xf6e7e0, roughness: 0.6 })
      const accent = new THREE.MeshStandardMaterial({ color: 0xd96a8b, roughness: 0.55 })
      g.add(cyl(0.15, 0.10, frosting, 0, -0.075, 0))          // bottom tier
      g.add(cyl(0.15, 0.012, accent, 0, -0.019, 0))           // filling line
      g.add(cyl(0.095, 0.09, frosting, 0, 0.032, 0))          // top tier
      g.add(cyl(0.095, 0.012, accent, 0, 0.082, 0))
      for (let i = 0; i < 5; i++) {                            // candles + flames
        const a = (i / 5) * Math.PI * 2
        const x = Math.cos(a) * 0.055, z = Math.sin(a) * 0.055
        g.add(cyl(0.006, 0.05, mat.canvas([0x4d96ff, 0xf2b64c, 0x6bcb77, 0xd96a8b, 0x9b6bcb][i]), x, 0.115, z))
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 2 }))
        flame.position.set(x, 0.147, z)
        flame.scale.y = 1.6
        g.add(flame)
      }
      return g
    },
  },
  {
    key: 'balloons', label: 'Balloon Cluster', category: 'decor',
    synonyms: ['balloon', 'balloons', 'balloon cluster'],
    dims: [0.55, 1.6, 0.55],
    build: () => {
      const g = new THREE.Group()
      const colors = [0xe25563, 0x4d96ff, 0xf2b64c, 0x6bcb77, 0x9b6bcb]
      const string = new THREE.MeshStandardMaterial({ color: 0xcfcac2, roughness: 0.9 })
      g.add(cyl(0.045, 0.05, mat.metal(), 0, -0.775, 0))       // weight at the floor
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const x = Math.cos(a) * 0.13, z = Math.sin(a) * 0.13
        const y = 0.55 + (i % 3) * 0.11
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12),
          new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.25, metalness: 0.1 }))
        b.position.set(x, y, z)
        b.scale.y = 1.18
        g.add(b)
        const line = cyl(0.0015, y + 0.75, string, x * 0.6, (y - 0.775) / 2, z * 0.6)
        line.rotation.z = x * 0.12
        g.add(line)
      }
      return g
    },
  },
  {
    key: 'confetti', label: 'Confetti', category: 'decor',
    synonyms: ['confetti', 'party confetti'],
    dims: [2.0, 0.02, 1.4],
    build: () => {
      const g = new THREE.Group()
      const colors = [0xe25563, 0x4d96ff, 0xf2b64c, 0x6bcb77, 0x9b6bcb, 0xf0ede7]
      let seed = 7
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
      for (let i = 0; i < 140; i++) {
        const piece = box(0.028, 0.003, 0.018,
          new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }),
          (rand() - 0.5) * 1.9, 0, (rand() - 0.5) * 1.3)
        piece.rotation.y = rand() * Math.PI
        g.add(piece)
      }
      return g
    },
  },
  {
    key: 'speaker', label: 'Party Speaker', category: 'electronics',
    synonyms: ['speaker', 'party speaker', 'partybox', 'bluetooth speaker', 'soundbar', 'subwoofer'],
    dims: [0.34, 1.05, 0.32],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.34, 1.05, 0.32, mat.black()))
      // woofer + tweeter cones
      g.add(cyl(0.11, 0.02, mat.metal(), 0, -0.22, 0.16).rotateX(Math.PI / 2))
      g.add(cyl(0.06, 0.02, mat.metal(), 0, 0.18, 0.16).rotateX(Math.PI / 2))
      // LED ring accent
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.008, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x7c3aed, emissiveIntensity: 1.2 }))
        .translateY(-0.22).translateZ(0.165))
      g.add(box(0.3, 0.02, 0.26, mat.metal(), 0, 0.5, 0))   // handle plate
      return g
    },
  },
  {
    key: 'gpu', label: 'GPU', category: 'compute',
    synonyms: ['gpu', 'graphics card', 'video card', 'rtx', 'geforce', 'radeon'],
    dims: [0.31, 0.12, 0.05],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.31, 0.115, 0.045, mat.black()))
      for (let i = 0; i < 3; i++)
        g.add(cyl(0.042, 0.01, mat.metal(), -0.1 + i * 0.1, 0, 0.026).rotateX(Math.PI / 2))
      g.add(box(0.29, 0.004, 0.05, new THREE.MeshStandardMaterial({
        color: 0xff33aa, emissive: 0xff33aa, emissiveIntensity: 1, roughness: 0.4 }), 0, 0.06, 0))
      return g
    },
  },
  {
    key: 'case-fan', label: 'Case Fan', category: 'cooling',
    synonyms: ['fan', 'case fan', '120mm fan', 'cooling fan', 'exhaust fan', 'intake fan'],
    dims: [0.12, 0.12, 0.025],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.12, 0.12, 0.025, mat.black()))
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x2244cc, emissiveIntensity: 0.9 })))
      for (let i = 0; i < 7; i++) {
        const b = box(0.045, 0.014, 0.004, mat.metal(), 0.026, 0, 0)
        const h = new THREE.Group()
        h.rotation.z = (i / 7) * Math.PI * 2
        h.add(b)
        g.add(h)
      }
      return g
    },
  },
]

/** Match free text ("add a mid century sofa") to a library item. */
export function matchLibrary(text: string): LibraryItem | null {
  const t = text.toLowerCase()
  let best: { item: LibraryItem; len: number } | null = null
  for (const item of LIBRARY) {
    for (const syn of item.synonyms) {
      if (t.includes(syn) && (!best || syn.length > best.len)) {
        best = { item, len: syn.length }
      }
    }
  }
  return best?.item ?? null
}

const builtCache = new Map<string, THREE.Group>()

/** Build (once) and clone a library mesh, scaled to the requested dims. */
export function buildLibraryMesh(key: string, dims: { width: number; height: number; depth: number }): THREE.Group | null {
  const item = LIBRARY.find((i) => i.key === key)
  if (!item) return null
  if (!builtCache.has(key)) builtCache.set(key, item.build())
  const clone = builtCache.get(key)!.clone(true)
  clone.scale.set(
    dims.width / item.dims[0],
    dims.height / item.dims[1],
    dims.depth / item.dims[2],
  )
  return clone
}
