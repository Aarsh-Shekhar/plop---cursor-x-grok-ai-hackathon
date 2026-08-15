// Procedural ATX build for the hardcoded PC demo. Every component is built
// at REAL specification dimensions (meters) and carries reference-build
// technical metadata for the Founder inspector. Each builder returns a
// THREE.Group whose origin is the component's center; `home` is its mounted
// position inside the case and `exploded` the offset for exploded view.
import * as THREE from 'three'

const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, metalness: 0.65 }),
  steelLight: () => new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.6 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x0d1b12, roughness: 0.75 }),
  pcbBlack: () => new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.7 }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: 0x99bbcc, roughness: 0.05, metalness: 0, transmission: 0.85,
    transparent: true, opacity: 0.1, side: THREE.DoubleSide,
  }),
  shroudAlu: () => new THREE.MeshStandardMaterial({ color: 0x3c414a, roughness: 0.4, metalness: 0.8 }),
  fin: () => new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.35, metalness: 0.9 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xb07040, roughness: 0.3, metalness: 0.9 }),
  fanBlade: () => new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6 }),
  fanRing: () => new THREE.MeshStandardMaterial({
    color: 0x3355ff, emissive: 0x2244cc, emissiveIntensity: 0.9, roughness: 0.4,
  }),
  rgb: (c: number) => new THREE.MeshStandardMaterial({
    color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.4,
  }),
  cableSleeve: () => new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.85 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.15, metalness: 1 }),
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
function cyl(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat)
  m.position.set(x, y, z)
  return m
}

/** 120mm fan; blades subgroup named 'blades' spins in the viewport. */
function fan120(size = 0.12): THREE.Group {
  const g = new THREE.Group()
  const frame = box(size, size, 0.025, M.steelLight())
  g.add(frame)
  g.add(new THREE.Mesh(new THREE.TorusGeometry(size * 0.42, 0.004, 8, 32), M.fanRing()))
  const blades = new THREE.Group()
  blades.name = 'blades'
  for (let i = 0; i < 7; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(size * 0.38, size * 0.13, 0.004), M.fanBlade())
    blade.position.x = size * 0.22
    const holder = new THREE.Group()
    holder.rotation.z = (i / 7) * Math.PI * 2
    blade.rotation.y = 0.5
    holder.add(blade)
    blades.add(holder)
  }
  blades.add(cyl(size * 0.14, 0.03, M.steel(), 0, 0, 0).rotateX(Math.PI / 2))
  g.add(blades)
  return g
}

export interface PCComponent {
  id: string
  name: string
  category: string
  home: [number, number, number]
  exploded: [number, number, number]   // offset added in exploded view
  dims: [number, number, number]       // real spec meters (w,h,d)
  build: () => THREE.Group
  spec: Record<string, unknown>        // inspector technical metadata
  removable?: boolean
}

// Case interior frame of reference: origin at case center.
// Case: mid-tower 210 W × 450 H × 450 D (x,y,z). Glass on -X side.
const W = 0.21, H = 0.45, D = 0.45

export const PC_COMPONENTS: PCComponent[] = [
  {
    id: 'case', name: 'Mid-tower Case', category: 'enclosure',
    home: [0, 0, 0], exploded: [0, 0, 0], dims: [W, H, D],
    removable: false,
    build: () => {
      const g = new THREE.Group()
      const t = 0.004
      g.add(box(W, t, D, M.steel(), 0, -H / 2, 0))          // floor
      g.add(box(W, t, D, M.steel(), 0, H / 2, 0))           // top
      g.add(box(W, H, t, M.steel(), 0, 0, -D / 2))          // rear
      g.add(box(W, H, t, M.steelLight(), 0, 0, D / 2))      // front panel
      g.add(box(t, H, D, M.steel(), W / 2, 0, 0))           // right (mobo tray)
      g.add(box(t, H - 0.02, D - 0.02, M.glass(), -W / 2, 0, 0)) // tempered glass
      g.add(box(W, 0.09, D, M.shroudAlu(), 0, -H / 2 + 0.048, 0)) // PSU shroud
      // front dust-mesh strip
      g.add(box(0.16, H - 0.06, 0.002, M.pcbBlack(), 0, 0.02, D / 2 + 0.004))
      return g
    },
    spec: {
      component_name: 'Mid-tower ATX case (tempered glass)', component_type: 'Enclosure',
      est_power_w: 0, thermal_role: 'passive',
      connectors: ['2× USB 3.0 front', 'USB-C front', 'HD audio'],
      note: 'Reference build. Dimensions are the modeled spec: 210 × 450 × 450 mm.',
    },
  },
  {
    id: 'mobo', name: 'ATX Motherboard', category: 'compute',
    home: [W / 2 - 0.02, 0.045, -0.02],
    exploded: [0.05, 0, 0], dims: [0.008, 0.305, 0.244],
    build: () => {
      const g = new THREE.Group()
      const pcbMesh = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.305, 0.244), M.pcb())
      g.add(pcbMesh)
      // VRM heatsinks
      g.add(box(0.012, 0.09, 0.02, M.fin(), -0.008, 0.09, 0.1))
      g.add(box(0.012, 0.02, 0.16, M.fin(), -0.008, 0.135, 0))
      // chipset heatsink
      g.add(box(0.008, 0.05, 0.05, M.shroudAlu(), -0.006, -0.09, -0.04))
      // I/O ports block
      g.add(box(0.018, 0.05, 0.14, M.steelLight(), -0.01, 0.11, -0.19 + 0.09))
      return g
    },
    spec: {
      component_name: 'ATX motherboard', component_type: 'Motherboard',
      est_power_w: 45, thermal_role: 'heat-source',
      connectors: ['LGA socket', '4× DDR5 DIMM', '2× PCIe x16', '3× M.2', '24-pin ATX'],
      note: 'ATX spec: 305 × 244 mm.',
    },
  },
  {
    id: 'cpu-block', name: 'AIO Pump Block', category: 'cooling',
    home: [W / 2 - 0.045, 0.09, -0.02],
    exploded: [-0.07, 0, 0], dims: [0.055, 0.07, 0.07],
    build: () => {
      const g = new THREE.Group()
      const blk = cyl(0.033, 0.04, M.steel())
      blk.rotation.z = Math.PI / 2
      g.add(blk)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 32), M.rgb(0x8844ff))
      ring.rotation.y = Math.PI / 2
      g.add(ring)
      const cold = box(0.006, 0.045, 0.045, M.copper(), 0.023, 0, 0)
      g.add(cold)
      return g
    },
    spec: {
      component_name: 'AIO liquid cooler pump block', component_type: 'CPU cooling (liquid)',
      est_power_w: 15, thermal_role: 'cooling',
      connectors: ['CPU cold plate', '2× G1/4 tubing', 'PWM + ARGB header'],
      note: 'Covers a ~150 W CPU underneath; heat is moved to the top radiator.',
    },
  },
  {
    id: 'radiator', name: '240mm Radiator + Fans', category: 'cooling',
    home: [0.01, H / 2 - 0.045, -0.02],
    exploded: [0, 0.12, 0], dims: [0.12, 0.052, 0.277],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.12, 0.027, 0.277, M.steel(), 0, 0.014, 0))
      // fin stack lines
      for (let i = 0; i < 9; i++) {
        g.add(box(0.11, 0.002, 0.26, M.fin(), 0, 0.006 + 0, -0.12 + i * 0.03))
      }
      const f1 = fan120(); f1.rotation.x = Math.PI / 2; f1.position.set(0, -0.014, -0.065)
      const f2 = fan120(); f2.rotation.x = Math.PI / 2; f2.position.set(0, -0.014, 0.065)
      g.add(f1, f2)
      return g
    },
    spec: {
      component_name: '240 mm AIO radiator, 2× 120 mm fans', component_type: 'Cooling (exhaust, top)',
      est_power_w: 6, thermal_role: 'cooling',
      connectors: ['2× G1/4 tubing', '2× PWM fan'],
      note: 'Radiator spec 277 × 120 × 27 mm; exhausts CPU heat through the case top.',
    },
  },
  {
    id: 'gpu', name: 'Triple-fan GPU', category: 'compute',
    home: [W / 2 - 0.075, -0.045, -0.015],
    exploded: [-0.11, -0.02, 0], dims: [0.05, 0.12, 0.31],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.045, 0.115, 0.31, M.pcbBlack()))
      // shroud + 3 fans on the visible (-x/bottom?) face: fans face down in
      // standard mount; make them face -y for visibility through glass
      for (let i = 0; i < 3; i++) {
        const f = fan120(0.085)
        f.rotation.x = Math.PI / 2
        f.position.set(0, -0.062, -0.1 + i * 0.1)
        g.add(f)
      }
      // backplate + RGB strip
      g.add(box(0.002, 0.115, 0.3, M.chrome(), 0.024, 0, 0))
      g.add(box(0.04, 0.004, 0.29, M.rgb(0xff33aa), 0, 0.058, 0))
      // PCIe bracket
      g.add(box(0.018, 0.11, 0.004, M.chrome(), -0.015, 0, -0.157))
      return g
    },
    spec: {
      component_name: 'Triple-fan graphics card (310 mm class)', component_type: 'GPU',
      est_power_w: 320, thermal_role: 'heat-source',
      connectors: ['PCIe 5.0 x16', '2× 8-pin (or 12V-2×6) power', '3× DP 2.1', 'HDMI 2.1'],
      note: 'Spec 310 × 120 × 50 mm (2.5-slot). The hottest part of the build.',
    },
  },
  {
    id: 'ram', name: 'DDR5 RAM (4× DIMM)', category: 'compute',
    home: [W / 2 - 0.038, 0.09, 0.045],
    exploded: [-0.05, 0.05, 0], dims: [0.03, 0.133, 0.032],
    build: () => {
      const g = new THREE.Group()
      for (let i = 0; i < 4; i++) {
        g.add(box(0.0035, 0.133, 0.007, M.pcbBlack(), 0, 0, i * 0.011))
        g.add(box(0.005, 0.008, 0.007, M.rgb([0x33ddff, 0x8844ff, 0xff33aa, 0x33ff88][i]), 0, 0.07, i * 0.011))
      }
      return g
    },
    spec: {
      component_name: 'DDR5 kit, 4 DIMMs with ARGB', component_type: 'Memory',
      est_power_w: 12, thermal_role: 'heat-source',
      connectors: ['DDR5 DIMM ×4'],
      note: 'DIMM spec 133.35 mm long; RGB diffusers on top edge.',
    },
  },
  {
    id: 'psu', name: '850W PSU', category: 'power',
    home: [0, -H / 2 + 0.047, -0.12],
    exploded: [0, -0.1, -0.06], dims: [0.15, 0.086, 0.16],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.15, 0.086, 0.16, M.steel()))
      g.add(box(0.13, 0.07, 0.002, M.pcbBlack(), 0, 0, 0.081))
      return g
    },
    spec: {
      component_name: '850 W modular PSU (ATX 3.0)', component_type: 'Power supply',
      est_power_w: 0, thermal_role: 'heat-source',
      connectors: ['24-pin ATX', '2× EPS 8-pin', '12V-2×6', '6× SATA'],
      note: 'ATX PSU spec 150 × 86 × 160 mm, hidden under the shroud.',
    },
  },
  {
    id: 'ssd', name: 'NVMe SSD + Heatsink', category: 'storage',
    home: [W / 2 - 0.03, -0.005, 0.05],
    exploded: [-0.045, 0, 0.05], dims: [0.012, 0.024, 0.08],
    build: () => {
      const g = new THREE.Group()
      g.add(box(0.004, 0.022, 0.08, M.pcbBlack()))
      g.add(box(0.008, 0.022, 0.08, M.fin(), -0.006, 0, 0))
      return g
    },
    spec: {
      component_name: 'M.2 NVMe SSD (2280) under heatsink', component_type: 'Storage',
      est_power_w: 8, thermal_role: 'heat-source',
      connectors: ['M.2 PCIe 4.0 x4'],
      note: 'M.2 2280 spec: 22 × 80 mm.',
    },
  },
  {
    id: 'front-fans', name: 'Front Intake Fans (3×120mm)', category: 'cooling',
    home: [0.01, 0.03, D / 2 - 0.02],
    exploded: [0, 0, 0.14], dims: [0.026, 0.37, 0.12],
    build: () => {
      const g = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        const f = fan120()
        f.position.set(0, -0.125 + i * 0.125, 0)
        g.add(f)
      }
      return g
    },
    spec: {
      component_name: '3× 120 mm ARGB intake fans', component_type: 'Cooling (intake, front)',
      est_power_w: 9, thermal_role: 'cooling',
      connectors: ['3× PWM', 'ARGB daisy chain'],
      note: 'Pull cool air through the front mesh across GPU and board.',
    },
  },
  {
    id: 'rear-fan', name: 'Rear Exhaust Fan', category: 'cooling',
    home: [0.01, 0.10, -D / 2 + 0.02],
    exploded: [0, 0, -0.12], dims: [0.026, 0.12, 0.12],
    build: () => fan120(),
    spec: {
      component_name: '120 mm rear exhaust fan', component_type: 'Cooling (exhaust, rear)',
      est_power_w: 3, thermal_role: 'cooling',
      connectors: ['PWM'],
      note: 'Pushes warm air out behind the motherboard I/O.',
    },
  },
  {
    id: 'cables', name: 'Sleeved Power Cables', category: 'cabling',
    home: [W / 2 - 0.05, -0.01, 0.08],
    exploded: [-0.03, -0.06, 0.06], dims: [0.04, 0.16, 0.05],
    build: () => {
      const g = new THREE.Group()
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.09, 0.02), new THREE.Vector3(-0.01, -0.02, 0.035),
        new THREE.Vector3(0, 0.05, 0.02), new THREE.Vector3(0.01, 0.08, -0.01),
      ])
      for (let i = 0; i < 3; i++) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.004, 8), M.cableSleeve())
        tube.position.z = i * 0.012
        g.add(tube)
      }
      return g
    },
    spec: {
      component_name: 'Sleeved 24-pin + GPU power runs', component_type: 'Cabling',
      est_power_w: 0, thermal_role: 'passive',
      connectors: ['24-pin ATX', '12V-2×6'],
      note: 'Routed through the tray grommets.',
    },
  },
]

// PC-part retailers for the hive swarm on this page
export const PC_RETAILERS = [
  { name: 'Newegg', domain: 'newegg.com', emoji: '🖥' },
  { name: 'Amazon', domain: 'amazon.com', emoji: '📦' },
  { name: 'Micro Center', domain: 'microcenter.com', emoji: '🔧' },
  { name: 'Best Buy', domain: 'bestbuy.com', emoji: '🔵' },
  { name: 'B&H', domain: 'bhphotovideo.com', emoji: '📷' },
  { name: 'eBay', domain: 'ebay.com', emoji: '🏷' },
  { name: 'Walmart', domain: 'walmart.com', emoji: '🛒' },
  { name: 'Adorama', domain: 'adorama.com', emoji: '🎛' },
  { name: 'MemoryC', domain: 'memoryc.com', emoji: '💾' },
]
