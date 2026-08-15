// Procedural datacenter hardware: room shell, racks, and swappable parts,
// each carrying the technical specs the telemetry engine aggregates.
// All dims in meters. Parts are built to fit rack slots (1 slot ≈ 4U).
import * as THREE from 'three'

export const RACK = { w: 0.6, h: 2.0, d: 1.0, slots: 8 }
export const SLOT_H = (RACK.h - 0.2) / RACK.slots

const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6, metalness: 0.4 }),
  frame: () => new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.5 }),
  floor: () => new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.85 }),
  wall: () => new THREE.MeshStandardMaterial({ color: 0x383c46, roughness: 0.9 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x0e5c2f, roughness: 0.6 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.85 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.8 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0x9aa1ad, roughness: 0.35, metalness: 0.8 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.5 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xd7dae0, roughness: 0.5 }),
  led: (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }),
  hose: () => new THREE.MeshStandardMaterial({ color: 0x2266aa, roughness: 0.7 }),
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

export interface PartType {
  key: string
  label: string
  short: string
  emoji: string
  category: 'compute' | 'storage' | 'network' | 'power' | 'cooling'
  // --- telemetry specs ---
  powerW: number          // draw (negative none; cooling parts draw pump/fan power)
  capacityTB: number      // usable storage
  pflops: number          // fp16 dense
  gpus: number
  iopsK: number           // thousands of IOPS
  gbps: number            // network demand (nodes) — negative means supplied capacity (switches)
  netCapGbps: number      // switching capacity provided
  coolKW: number          // cooling capacity provided
  upsKW: number           // UPS/power-delivery capacity provided
  capexK: number          // $ thousands
  build: () => THREE.Group
}

const PW = 0.56
const PH = SLOT_H * 0.86
const PD = 0.9

function chassis(faceMat?: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  g.add(box(PW, PH, PD, M.steel()))
  if (faceMat) g.add(box(PW * 0.96, PH * 0.8, 0.015, faceMat, 0, 0, PD / 2 + 0.009))
  return g
}

function gpuFace(g: THREE.Group, accent: THREE.Material, led: number) {
  for (let i = 0; i < 4; i++) {
    const x = -PW / 2 + (i + 0.5) * (PW / 4)
    g.add(box(PW / 4 - 0.015, PH * 0.7, 0.02, accent, x, 0, PD / 2 + 0.011))
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(PH * 0.22, PH * 0.22, 0.015, 20), M.black())
    fan.rotation.x = Math.PI / 2
    fan.position.set(x, 0, PD / 2 + 0.026)
    g.add(fan)
  }
  g.add(box(PW * 0.9, 0.006, PD * 0.85, M.pcb(), 0, PH / 2 + 0.004, 0))
  g.add(box(0.02, 0.02, 0.006, M.led(led), PW / 2 - 0.05, PH / 2 - 0.03, PD / 2 + 0.012))
}

const gpuH100 = () => { const g = chassis(); gpuFace(g, M.gold(), 0x39ff6e); return g }
const gpuB200 = () => { const g = chassis(); gpuFace(g, M.copper(), 0xb26bff); return g }
const gpuA100 = () => { const g = chassis(); gpuFace(g, M.silver(), 0x3fa8ff); return g }

function cpuNode(): THREE.Group {
  const g = chassis()
  for (let i = 0; i < 4; i++) {
    const y = -PH / 2 + (i + 0.5) * (PH / 4)
    g.add(box(PW * 0.9, PH / 4 - 0.012, 0.015, M.black(), 0, y, PD / 2 + 0.009))
    g.add(box(0.01, 0.01, 0.005, M.led(0x39ff6e), PW * 0.4, y, PD / 2 + 0.018))
  }
  return g
}

function storageSled(): THREE.Group {
  const g = chassis()
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const x = -PW / 2 + (c + 0.5) * (PW / 6)
    const y = -PH / 2 + (r + 0.5) * (PH / 2)
    g.add(box(PW / 6 - 0.01, PH / 2 - 0.012, 0.018, M.black(), x, y, PD / 2 + 0.01))
    g.add(box(0.012, 0.012, 0.006, M.led(0x3fa8ff), x + PW / 12 - 0.02, y + PH / 4 - 0.022, PD / 2 + 0.021))
  }
  return g
}

function nvmeFlash(): THREE.Group {
  const g = chassis(M.silver())
  g.add(box(PW * 0.8, 0.014, 0.006, M.led(0xb26bff), 0, -PH / 2 + 0.03, PD / 2 + 0.018))
  return g
}

function tapeLibrary(): THREE.Group {
  const g = chassis(M.black())
  // little tape cartridge grid behind a dark window
  for (let c = 0; c < 8; c++)
    g.add(box(0.04, PH * 0.5, 0.008, M.white(), -PW / 2 + 0.06 + c * 0.06, 0, PD / 2 + 0.012))
  g.add(box(0.012, 0.012, 0.006, M.led(0xffb347), PW / 2 - 0.04, PH / 2 - 0.03, PD / 2 + 0.02))
  return g
}

function psu(): THREE.Group {
  const g = chassis()
  for (let i = 0; i < 2; i++) {
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(PH * 0.3, PH * 0.3, 0.015, 20), M.black())
    fan.rotation.x = Math.PI / 2
    fan.position.set(-PW / 4 + (i * PW) / 2, 0, PD / 2 + 0.012)
    g.add(fan)
  }
  g.add(box(0.02, 0.02, 0.006, M.led(0xffb347), PW / 2 - 0.04, PH / 2 - 0.03, PD / 2 + 0.012))
  return g
}

function upsModule(): THREE.Group {
  const g = chassis(M.frame())
  g.add(box(PW * 0.85, PH * 0.25, 0.02, M.black(), 0, PH * 0.2, PD / 2 + 0.012))
  g.add(box(PW * 0.6, 0.02, 0.008, M.led(0x39ff6e), 0, -PH * 0.2, PD / 2 + 0.014))
  return g
}

function torSwitch(): THREE.Group {
  const g = chassis()
  for (let c = 0; c < 12; c++) {
    const x = -PW / 2 + 0.04 + c * ((PW - 0.08) / 11)
    g.add(box(0.024, 0.02, 0.01, M.black(), x, 0, PD / 2 + 0.009))
    if (c % 2 === 0) g.add(box(0.008, 0.008, 0.005, M.led(0x39ff6e), x, 0.025, PD / 2 + 0.011))
  }
  return g
}

function spineSwitch(): THREE.Group {
  const g = chassis(M.black())
  for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) {
    const x = -PW / 2 + 0.05 + c * ((PW - 0.1) / 9)
    const y = -PH * 0.18 + r * PH * 0.36
    g.add(box(0.03, 0.022, 0.01, M.steel(), x, y, PD / 2 + 0.011))
    g.add(box(0.008, 0.008, 0.005, M.led(c % 3 ? 0x39ff6e : 0xffb347), x, y + 0.022, PD / 2 + 0.013))
  }
  return g
}

function rearDoorHX(): THREE.Group {
  const g = chassis()
  // finned white radiator face
  for (let c = 0; c < 10; c++)
    g.add(box(0.012, PH * 0.82, 0.02, M.white(), -PW / 2 + 0.05 + c * ((PW - 0.1) / 9), 0, PD / 2 + 0.011))
  g.add(box(0.02, 0.02, 0.006, M.led(0x3fa8ff), PW / 2 - 0.04, PH / 2 - 0.03, PD / 2 + 0.02))
  return g
}

function cduManifold(): THREE.Group {
  const g = chassis(M.frame())
  // blue coolant hoses
  for (let i = 0; i < 3; i++) {
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, PW * 0.8, 12), M.hose())
    hose.rotation.z = Math.PI / 2
    hose.position.set(0, -PH / 2 + (i + 1) * (PH / 4), PD / 2 + 0.03)
    g.add(hose)
  }
  return g
}

function fanTray(): THREE.Group {
  const g = chassis()
  for (let i = 0; i < 3; i++) {
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(PH * 0.32, PH * 0.32, 0.02, 24), M.black())
    fan.rotation.x = Math.PI / 2
    fan.position.set(-PW / 3 + (i * PW) / 3, 0, PD / 2 + 0.012)
    g.add(fan)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.024, 12), M.silver())
    hub.rotation.x = Math.PI / 2
    hub.position.copy(fan.position)
    g.add(hub)
  }
  return g
}

function blankPanel(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(PW, PH, PD * 0.1, M.frame(), 0, 0, PD * 0.45))
  return g
}

export function blankSlot(): THREE.Group {
  const g = new THREE.Group()
  const front = box(PW, PH, 0.01, M.black(), 0, 0, PD / 2)
  ;(front.material as THREE.MeshStandardMaterial).opacity = 0.4
  ;(front.material as THREE.MeshStandardMaterial).transparent = true
  g.add(front)
  return g
}

const P = (p: Partial<PartType> & Pick<PartType, 'key' | 'label' | 'short' | 'emoji' | 'category' | 'build'>): PartType => ({
  powerW: 0, capacityTB: 0, pflops: 0, gpus: 0, iopsK: 0, gbps: 0, netCapGbps: 0, coolKW: 0, upsKW: 0, capexK: 0,
  ...p,
})

export const PART_TYPES: PartType[] = [
  // --- compute ---
  P({ key: 'gpu-h100', label: 'GPU node · 8× H100 SXM', short: 'H100×8', emoji: '🎮', category: 'compute',
      powerW: 5600, pflops: 15.8, gpus: 8, gbps: 3200, capexK: 290, build: gpuH100 }),
  P({ key: 'gpu-b200', label: 'GPU node · 8× B200 NVL', short: 'B200×8', emoji: '🚀', category: 'compute',
      powerW: 10200, pflops: 36, gpus: 8, gbps: 6400, capexK: 520, build: gpuB200 }),
  P({ key: 'gpu-a100', label: 'GPU node · 8× A100', short: 'A100×8', emoji: '🕹', category: 'compute',
      powerW: 3200, pflops: 5, gpus: 8, gbps: 1600, capexK: 120, build: gpuA100 }),
  P({ key: 'cpu', label: 'CPU node · 4× dual-EPYC', short: 'CPU×8', emoji: '🧠', category: 'compute',
      powerW: 2200, pflops: 0.35, gbps: 400, capexK: 45, build: cpuNode }),
  // --- storage ---
  P({ key: 'hdd', label: 'HDD sled · 12× 22TB', short: 'HDD 264TB', emoji: '💾', category: 'storage',
      powerW: 180, capacityTB: 264, iopsK: 2.4, gbps: 24, capexK: 18, build: storageSled }),
  P({ key: 'nvme', label: 'NVMe flash · 24× 15TB', short: 'NVMe 360TB', emoji: '⚡', category: 'storage',
      powerW: 420, capacityTB: 360, iopsK: 4800, gbps: 640, capexK: 95, build: nvmeFlash }),
  P({ key: 'tape', label: 'Tape library · 1.2PB LTO-9', short: 'Tape 1.2PB', emoji: '📼', category: 'storage',
      powerW: 90, capacityTB: 1200, iopsK: 0.01, gbps: 3, capexK: 38, build: tapeLibrary }),
  // --- network ---
  P({ key: 'tor', label: 'ToR switch · 51.2T', short: 'ToR 12.8T', emoji: '🌐', category: 'network',
      powerW: 350, netCapGbps: 12800, capexK: 28, build: torSwitch }),
  P({ key: 'spine', label: 'Spine switch · 51.2T', short: 'Spine 51.2T', emoji: '🕸', category: 'network',
      powerW: 800, netCapGbps: 51200, capexK: 95, build: spineSwitch }),
  // --- power ---
  P({ key: 'psu', label: 'Power shelf · 33kW N+1', short: 'PSU 33kW', emoji: '🔌', category: 'power',
      powerW: 120, upsKW: 33, capexK: 14, build: psu }),
  P({ key: 'ups', label: 'UPS module · 50kW Li-ion', short: 'UPS 50kW', emoji: '🔋', category: 'power',
      powerW: 250, upsKW: 50, capexK: 46, build: upsModule }),
  // --- cooling ---
  P({ key: 'rdhx', label: 'Rear-door heat exchanger', short: 'RDHx 15kW', emoji: '❄️', category: 'cooling',
      powerW: 150, coolKW: 15, capexK: 12, build: rearDoorHX }),
  P({ key: 'cdu', label: 'Liquid cooling CDU', short: 'CDU 40kW', emoji: '💧', category: 'cooling',
      powerW: 400, coolKW: 40, capexK: 32, build: cduManifold }),
  P({ key: 'fan', label: 'Fan tray · 1800 CFM', short: 'Fans 5kW', emoji: '🌀', category: 'cooling',
      powerW: 120, coolKW: 5, capexK: 3, build: fanTray }),
  P({ key: 'blank', label: 'Blanking panel (airflow)', short: 'Blank', emoji: '⬜', category: 'cooling',
      coolKW: 1, capexK: 0.1, build: blankPanel }),
]

export function buildRack(): THREE.Group {
  const g = new THREE.Group()
  const t = 0.04
  const frame = M.frame()
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(box(t, RACK.h, t, frame, sx * (RACK.w / 2 + t / 2), RACK.h / 2, sz * (RACK.d / 2 - t / 2)))
  g.add(box(RACK.w + t * 2, t, RACK.d, frame, 0, RACK.h + t / 2, 0))
  g.add(box(RACK.w + t * 2, 0.08, RACK.d, frame, 0, 0.04, 0))
  g.add(box(0.012, RACK.h, RACK.d, M.steel(), -(RACK.w / 2 + t + 0.006), RACK.h / 2, 0))
  g.add(box(0.012, RACK.h, RACK.d, M.steel(), RACK.w / 2 + t + 0.006, RACK.h / 2, 0))
  return g
}

export function slotY(slot: number): number {
  return 0.1 + (slot + 0.5) * SLOT_H
}

export function buildRoomShell(width: number, depth: number, height: number): THREE.Group {
  const g = new THREE.Group()
  const floor = box(width, 0.02, depth, M.floor(), 0, -0.01, 0)
  floor.name = 'Floor'
  g.add(floor)
  const grid = new THREE.GridHelper(Math.max(width, depth), Math.max(width, depth) / 0.6, 0x3a3e48, 0x33363f)
  grid.position.y = 0.005
  g.add(grid)
  for (const [w, h, d, x, y, z, name] of [
    [width, height, 0.05, 0, height / 2, -depth / 2, 'Walls north'],
    [width, height, 0.05, 0, height / 2, depth / 2, 'Walls south'],
    [0.05, height, depth, width / 2, height / 2, 0, 'Walls east'],
    [0.05, height, depth, -width / 2, height / 2, 0, 'Walls west'],
  ] as const) {
    const wall = box(w as number, h as number, d as number, M.wall(), x as number, y as number, z as number)
    wall.name = name as string
    g.add(wall)
  }
  const ceil = box(width, 0.05, depth, M.frame(), 0, height, 0)
  ceil.name = 'Ceiling'
  g.add(ceil)
  for (let x = -width / 2 + 1.5; x < width / 2; x += 3) {
    const strip = box(0.15, 0.02, depth * 0.8, M.led(0xcfe8ff), x, height - 0.05, 0)
    strip.name = 'Ceiling light'
    g.add(strip)
  }

  // --- CRAC units along the north wall (base cooling: 2 × 60 kW) ---
  for (const x of [-width / 4, width / 4]) {
    const crac = new THREE.Group()
    crac.name = 'CRAC unit'
    crac.add(box(1.6, 2.2, 0.8, M.white(), 0, 1.1, 0))
    for (let c = 0; c < 6; c++)
      crac.add(box(1.4, 0.05, 0.02, M.black(), 0, 0.5 + c * 0.28, 0.41))
    crac.add(box(0.3, 0.12, 0.02, M.led(0x3fa8ff), 0.5, 1.95, 0.41))
    crac.position.set(x, 0, -depth / 2 + 0.45)
    g.add(crac)
  }

  // --- overhead cable trays above the aisle ---
  for (const z of [-2, 2]) {
    const tray = box(0.5, 0.06, depth * 0.75, M.steel(), 0, height - 0.5, z)
    tray.name = 'Cable tray'
    g.add(tray)
    // a few cable bundles
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, depth * 0.72, 8), M.hose())
      cable.rotation.x = Math.PI / 2
      cable.position.set(-0.15 + i * 0.15, height - 0.44, z)
      cable.name = 'Cable bundle'
      g.add(cable)
    }
  }

  // --- PDU pillars at row ends ---
  for (const [x, z] of [[-2.2, 5.2], [2.2, 5.2]]) {
    const pdu = new THREE.Group()
    pdu.name = 'PDU'
    pdu.add(box(0.5, 1.9, 0.5, M.black(), 0, 0.95, 0))
    pdu.add(box(0.34, 0.5, 0.02, M.led(0x39ff6e), 0, 1.45, 0.26))
    pdu.position.set(x, 0, z)
    g.add(pdu)
  }
  return g
}

// ---------------- telemetry engine ----------------
export const FACILITY = {
  baseCoolKW: 120,   // 2× CRAC @ 60 kW
  baseUpsKW: 150,    // central UPS plant
  utilityFeedKW: 500,
  kwhPriceUSD: 0.12,
  gridKgCO2PerKWh: 0.35,
  coolingCOP: 3.2,
}

export interface Telemetry {
  itLoadKW: number
  facilityKW: number
  pue: number
  upsCapKW: number
  upsUtil: number
  redundancy: string
  heatKW: number
  coolCapKW: number
  coolUtil: number
  inletC: number
  thermalStatus: 'OK' | 'WARN' | 'CRITICAL'
  pflops: number
  gpus: number
  densityAvgKW: number
  densityPeakKW: number
  tb: number
  iopsM: number
  storageGBps: number
  netCapTbps: number
  netDemandTbps: number
  oversub: number
  capexM: number
  opexKMo: number
  co2TMo: number
}

export function computeTelemetry(installed: PartType[], perRackW: number[]): Telemetry {
  let itW = 0, tb = 0, pflops = 0, gpus = 0, iopsK = 0, demand = 0, netCap = 0, coolKW = FACILITY.baseCoolKW,
    upsKW = FACILITY.baseUpsKW, capexK = 0, storageGbps = 0
  for (const p of installed) {
    itW += p.powerW
    tb += p.capacityTB
    pflops += p.pflops
    gpus += p.gpus
    iopsK += p.iopsK
    if (p.category === 'storage') storageGbps += p.gbps
    else demand += p.gbps
    netCap += p.netCapGbps
    coolKW += p.coolKW
    upsKW += p.upsKW
    capexK += p.capexK
  }
  const itLoadKW = itW / 1000
  const heatKW = itLoadKW * 0.99
  const coolUtil = coolKW > 0 ? heatKW / coolKW : 9
  const coolingPowerKW = heatKW / FACILITY.coolingCOP * (coolUtil > 0.85 ? 1.15 : 1)
  const facilityKW = itLoadKW + coolingPowerKW + itLoadKW * 0.04
  const pue = itLoadKW > 0 ? facilityKW / itLoadKW : 1
  const upsUtil = itLoadKW / upsKW
  const redundancy = upsUtil < 0.45 ? '2N' : upsUtil < 0.7 ? 'N+1' : upsUtil < 0.95 ? 'N' : 'AT RISK'
  const inletC = 18 + Math.max(0, coolUtil - 0.55) * 30
  const thermalStatus = inletC > 27 ? 'CRITICAL' : inletC > 23 ? 'WARN' : 'OK'
  const rackKW = perRackW.map((w) => w / 1000)
  return {
    itLoadKW: round1(itLoadKW),
    facilityKW: round1(facilityKW),
    pue: Math.round(pue * 100) / 100,
    upsCapKW: upsKW,
    upsUtil: Math.round(upsUtil * 100),
    redundancy,
    heatKW: round1(heatKW),
    coolCapKW: coolKW,
    coolUtil: Math.round(coolUtil * 100),
    inletC: round1(inletC),
    thermalStatus,
    pflops: round1(pflops),
    gpus,
    densityAvgKW: round1(rackKW.reduce((a, b) => a + b, 0) / Math.max(1, rackKW.length)),
    densityPeakKW: round1(Math.max(0, ...rackKW)),
    tb,
    iopsM: Math.round(iopsK / 100) / 10,
    storageGBps: Math.round(storageGbps / 8),
    netCapTbps: Math.round(netCap / 100) / 10,
    netDemandTbps: Math.round(demand / 100) / 10,
    oversub: netCap > 0 ? Math.round((demand / netCap) * 10) / 10 : 99,
    capexM: Math.round(capexK / 100) / 10,
    opexKMo: Math.round((facilityKW * 24 * 30 * FACILITY.kwhPriceUSD) / 1000),
    co2TMo: Math.round((facilityKW * 24 * 30 * FACILITY.gridKgCO2PerKWh) / 1000),
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
