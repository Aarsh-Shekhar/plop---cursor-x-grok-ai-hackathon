// Procedural demo office (/office): a 7×4.5 m room built entirely from
// primitives at real-world dimensions — no GLB download. Produces the same
// { groups, staticMeshes, bounds } shape as the /room GLB loader, so the
// walkable RoomViewport, inspector, NL commands and @hive all work unchanged.
// Each builder returns a group sized w×h×d meters, origin at the center of
// its floor footprint; placed groups are baked to world-space meshes.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { RoomGroup } from '../room/RoomViewport'

const ROOM_W = 7.0    // x
const ROOM_D = 4.5    // z
const WALL_H = 2.8

const M = {
  wallPaint: () => new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.95 }),
  carpet: () => new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 1 }),
  ceiling: () => new THREE.MeshStandardMaterial({ color: 0xf5f4f0, roughness: 0.9 }),
  trim: () => new THREE.MeshStandardMaterial({ color: 0xdcd9d2, roughness: 0.8 }),
  whiteTop: () => new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }),
  woodTop: () => new THREE.MeshStandardMaterial({ color: 0xb08d62, roughness: 0.55 }),
  darkWood: () => new THREE.MeshStandardMaterial({ color: 0x5e4a38, roughness: 0.6 }),
  blackMetal: () => new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, metalness: 0.5 }),
  grayMetal: () => new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 0.4, metalness: 0.6 }),
  meshFabric: () => new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
  fabricGray: () => new THREE.MeshStandardMaterial({ color: 0xb6b2ab, roughness: 0.85 }),
  fabricBlue: () => new THREE.MeshStandardMaterial({ color: 0x5d7b96, roughness: 0.85 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.15, emissive: 0x1c2f45, emissiveIntensity: 0.5 }),
  plastic: () => new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0xcfe0e8, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  leaf: () => new THREE.MeshStandardMaterial({ color: 0x5e7d4f, roughness: 0.9 }),
  terracotta: () => new THREE.MeshStandardMaterial({ color: 0xb96b4a, roughness: 0.8 }),
  whiteboard: () => new THREE.MeshStandardMaterial({ color: 0xfbfbf8, roughness: 0.25 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.85 }),
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

/* ---------- furniture builders (origin: center of floor footprint) ---------- */

function desk(w: number, h: number, d: number, topMat: () => THREE.Material): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, 0.03, d, topMat(), 0, h - 0.015, 0))
  // two rectangular leg frames
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.06)
    g.add(box(0.04, h - 0.03, 0.04, M.blackMetal(), x, (h - 0.03) / 2, -(d / 2 - 0.05)))
    g.add(box(0.04, h - 0.03, 0.04, M.blackMetal(), x, (h - 0.03) / 2, d / 2 - 0.05))
    g.add(box(0.04, 0.04, d - 0.1, M.blackMetal(), x, 0.06, 0))
  }
  // modesty panel
  g.add(box(w - 0.2, 0.3, 0.02, M.blackMetal(), 0, h - 0.25, -(d / 2 - 0.08)))
  return g
}

function officeChair(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const seatH = 0.47
  // five-star base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const arm = box(w * 0.42, 0.025, 0.045, M.blackMetal(), 0, 0.05, 0)
    arm.position.set(Math.cos(a) * w * 0.21, 0.05, Math.sin(a) * w * 0.21)
    arm.rotation.y = -a
    g.add(arm)
    g.add(cyl(0.028, 0.05, M.blackMetal(), Math.cos(a) * w * 0.4, 0.028, Math.sin(a) * w * 0.4))
  }
  g.add(cyl(0.025, seatH - 0.08, M.chrome(), 0, 0.08 + (seatH - 0.08) / 2, 0))
  g.add(box(w * 0.9, 0.07, d * 0.9, M.meshFabric(), 0, seatH, 0))
  // mesh back, slightly tilted
  const back = box(w * 0.85, h - seatH - 0.1, 0.05, M.meshFabric(), 0, 0, 0)
  back.position.set(0, seatH + (h - seatH) / 2, -(d / 2 - 0.05))
  back.rotation.x = -0.08
  g.add(back)
  // armrests
  for (const sx of [-1, 1]) {
    g.add(box(0.05, 0.02, d * 0.5, M.blackMetal(), sx * w * 0.44, seatH + 0.2, 0))
    g.add(box(0.03, 0.2, 0.03, M.blackMetal(), sx * w * 0.44, seatH + 0.1, d * 0.12))
  }
  return g
}

function meetingChair(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const seatH = 0.46
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.016, seatH, M.blackMetal(), sx * (w / 2 - 0.05), seatH / 2, sz * (d / 2 - 0.05)))
  g.add(box(w, 0.05, d, M.fabricBlue(), 0, seatH, 0))
  const back = box(w, h - seatH - 0.06, 0.04, M.fabricBlue(), 0, seatH + (h - seatH) / 2, -(d / 2 - 0.02))
  back.rotation.x = -0.06
  g.add(back)
  return g
}

function dualMonitors(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.26
    g.add(cyl(0.09, 0.015, M.blackMetal(), x, 0.008, 0))
    g.add(box(0.04, h * 0.45, 0.04, M.blackMetal(), x, h * 0.24, -0.02))
    const panel = box(w * 0.48, h * 0.55, 0.02, M.screen(), x, h * 0.68, 0)
    panel.rotation.y = sx * -0.12
    g.add(panel)
  }
  return g
}

function laptop(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, 0.012, d, M.grayMetal(), 0, 0.006, 0))
  const lid = box(w, h, 0.008, M.screen(), 0, 0, 0)
  lid.position.set(0, 0.012 + (h / 2) * 0.94, -(d / 2 - 0.004))
  lid.rotation.x = -0.35
  g.add(lid)
  return g
}

function deskLamp(_w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.07, 0.02, M.blackMetal(), 0, 0.01, 0))
  const arm = cyl(0.008, h * 0.7, M.blackMetal(), 0, h * 0.37, 0)
  arm.rotation.z = 0.3
  g.add(arm)
  const head = cyl(0.045, 0.1, M.blackMetal(), -h * 0.24, h * 0.72, 0)
  head.rotation.z = 1.2
  g.add(head)
  return g
}

function meetingTable(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.035, 40), M.woodTop())
  top.scale.z = d / w
  top.position.y = h - 0.018
  g.add(top)
  for (const sx of [-1, 1]) {
    g.add(box(0.08, h - 0.035, 0.5, M.blackMetal(), sx * (w / 2 - 0.45), (h - 0.035) / 2, 0))
    g.add(box(0.3, 0.03, 0.6, M.blackMetal(), sx * (w / 2 - 0.45), 0.015, 0))
  }
  return g
}

function bookshelf(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const t = 0.025
  const frame = M.darkWood()
  g.add(box(t, h, d, frame, -(w - t) / 2, h / 2, 0))
  g.add(box(t, h, d, frame, (w - t) / 2, h / 2, 0))
  g.add(box(w, t, d, frame, 0, h - t / 2, 0))
  g.add(box(w, t, d, frame, 0, t / 2, 0))
  g.add(box(w - t, h, t, frame, 0, h / 2, -(d - t) / 2))
  const shelves = Math.max(2, Math.round(h / 0.38))
  const bookMats = [M.fabricGray(), M.fabricBlue(), M.terracotta(), M.grayMetal(), M.woodTop()]
  for (let i = 1; i < shelves; i++) {
    const y = (i * h) / shelves
    g.add(box(w - t * 2, t, d, frame, 0, y, 0))
    let x = -w / 2 + t + 0.03
    const run = (0.5 + 0.4 * Math.abs(Math.sin(i * 7))) * (w - t * 2)
    while (x < -w / 2 + t + run) {
      const bw = 0.025 + 0.02 * Math.abs(Math.sin(x * 91 + i))
      const bh = h / shelves - t - 0.04 - 0.05 * Math.abs(Math.cos(x * 53))
      g.add(box(bw, bh, d * 0.7, bookMats[Math.floor(Math.abs(Math.sin(x * 131)) * bookMats.length)], x + bw / 2, y + t / 2 + bh / 2, 0))
      x += bw + 0.006
    }
  }
  return g
}

function filingCabinet(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, h, d, M.grayMetal(), 0, h / 2, 0))
  const drawers = 3
  for (let i = 0; i < drawers; i++) {
    const y = (i + 0.5) * (h / drawers)
    g.add(box(w * 0.92, h / drawers - 0.03, 0.01, M.blackMetal(), 0, y, d / 2 + 0.005))
    g.add(box(w * 0.4, 0.02, 0.02, M.chrome(), 0, y + h / drawers * 0.28, d / 2 + 0.02))
  }
  return g
}

function whiteboard(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  // wall-mounted: origin at floor under its center, board hangs at eye height
  const boardY = 1.5
  g.add(box(w, h, 0.03, M.whiteboard(), 0, boardY, 0))
  g.add(box(w + 0.06, h + 0.06, 0.02, M.grayMetal(), 0, boardY, -0.008))
  g.add(box(w * 0.7, 0.04, 0.06, M.grayMetal(), 0, boardY - h / 2 - 0.04, 0.02))
  // marker scribbles
  const ink = new THREE.MeshStandardMaterial({ color: 0x3556a8, roughness: 0.8 })
  for (let i = 0; i < 4; i++)
    g.add(box(w * (0.2 + 0.12 * Math.abs(Math.sin(i * 5))), 0.015, 0.005, ink, -w * 0.2 + i * 0.06, boardY + h * 0.28 - i * 0.12, 0.018))
  return g
}

function loungeSofa(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const legH = 0.1
  const fabric = M.fabricGray()
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.02, legH, M.blackMetal(), sx * (w / 2 - 0.08), legH / 2, sz * (d / 2 - 0.08)))
  g.add(box(w, h * 0.35, d, fabric, 0, legH + h * 0.175, 0))
  g.add(box(w, h - legH - h * 0.35, d * 0.2, fabric, 0, legH + h * 0.35 + (h - legH - h * 0.35) / 2, -(d - d * 0.2) / 2))
  for (const sx of [-1, 1])
    g.add(box(w * 0.08, h * 0.55 - legH, d, fabric, sx * (w - w * 0.08) / 2, legH + (h * 0.55 - legH) / 2, 0))
  const seats = 2
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + w * 0.08 + (i + 0.5) * ((w - w * 0.16) / seats)
    g.add(box((w - w * 0.16) / seats - 0.02, 0.1, d * 0.68, M.fabricBlue(), x, legH + h * 0.35 + 0.05, d * 0.08))
  }
  return g
}

function plant(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  const potH = h * 0.28
  g.add(cyl(w * 0.32, potH, M.plastic(), 0, potH / 2, 0, w * 0.28))
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

function sideboard(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, h - 0.1, d, M.darkWood(), 0, 0.1 + (h - 0.1) / 2, 0))
  g.add(box(w, 0.02, d, M.woodTop(), 0, h - 0.01, 0))
  for (const [sx] of [[-1], [1]])
    g.add(box(w * 0.46, h - 0.16, 0.01, M.trim(), sx * w * 0.24, 0.1 + (h - 0.1) / 2, d / 2 + 0.005))
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(cyl(0.015, 0.1, M.blackMetal(), sx * (w / 2 - 0.06), 0.05, sz * (d / 2 - 0.06)))
  return g
}

function coffeeMachine(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, h, d * 0.6, M.blackMetal(), 0, h / 2, -(d * 0.2)))
  g.add(box(w * 0.8, h * 0.25, d * 0.4, M.blackMetal(), 0, h * 0.85, d * 0.1))
  g.add(box(w * 0.5, 0.01, d * 0.4, M.chrome(), 0, h * 0.12, d * 0.1))
  g.add(cyl(0.035, 0.07, M.plastic(), 0, h * 0.12 + 0.045, d * 0.1))
  return g
}

function waterCooler(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, h * 0.72, w, M.plastic(), 0, h * 0.36, 0))
  const jug = cyl(w * 0.36, h * 0.24, M.glass(), 0, h * 0.72 + h * 0.12, 0, w * 0.3)
  g.add(jug)
  g.add(box(w * 0.5, 0.04, 0.06, M.grayMetal(), 0, h * 0.55, w / 2 + 0.02))
  return g
}

function wallClock(w: number, _h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  // wall-mounted at origin height (placed near ceiling by caller)
  const face = cyl(w / 2, 0.03, M.plastic(), 0, 0, 0)
  face.rotation.x = Math.PI / 2
  g.add(face)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.012, 10, 32), M.blackMetal())
  g.add(rim)
  const hand1 = box(0.008, w * 0.32, 0.008, M.blackMetal(), 0, w * 0.1, 0.02)
  const hand2 = box(0.008, w * 0.24, 0.008, M.blackMetal(), 0, 0, 0.02)
  hand2.rotation.z = 1.9
  g.add(hand1, hand2)
  return g
}

function framedPrints(w: number, _h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  // two frames side by side, wall-mounted (placed at height by caller)
  const art = [0x5d7b96, 0xb96b4a]
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.27
    g.add(box(w * 0.42, w * 0.56, 0.025, M.darkWood(), x, 0, 0))
    g.add(box(w * 0.36, w * 0.5, 0.01, new THREE.MeshStandardMaterial({ color: art[(sx + 1) / 2], roughness: 0.9 }), x, 0, 0.012))
  }
  return g
}

function trashBin(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  const body = cyl(w / 2, h, M.grayMetal(), 0, h / 2, 0, w * 0.42)
  g.add(body)
  return g
}

function floorLamp(w: number, h: number, _d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(w * 0.3, 0.02, M.blackMetal(), 0, 0.01, 0))
  g.add(cyl(0.014, h * 0.78, M.blackMetal(), 0, h * 0.4, 0))
  const shade = cyl(w * 0.32, h * 0.18, M.plastic(), 0, h * 0.87, 0, w * 0.26)
  ;(shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.2 }))
  bulb.position.y = h * 0.82
  g.add(bulb)
  return g
}

function rug(w: number, _h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, 0.012, d, M.fabricBlue(), 0, 0.006, 0))
  g.add(box(w * 0.9, 0.013, d * 0.86, M.fabricGray(), 0, 0.0065, 0))
  return g
}

/* ---------- room shell (static) ---------- */

function buildShell(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  const hw = ROOM_W / 2
  const hd = ROOM_D / 2
  const t = 0.08
  // floor + ceiling
  meshes.push(box(ROOM_W, 0.02, ROOM_D, M.carpet(), 0, -0.01, 0))
  const ceiling = box(ROOM_W, 0.02, ROOM_D, M.ceiling(), 0, WALL_H + 0.01, 0)
  meshes.push(ceiling)
  // left / right walls
  meshes.push(box(t, WALL_H, ROOM_D, M.wallPaint(), -hw - t / 2, WALL_H / 2, 0))
  meshes.push(box(t, WALL_H, ROOM_D, M.wallPaint(), hw + t / 2, WALL_H / 2, 0))
  // back wall (window wall, z = -hd): sill strip, header strip, mullions, glass
  const sillH = 0.9
  const headY = 2.4
  meshes.push(box(ROOM_W, sillH, t, M.wallPaint(), 0, sillH / 2, -hd - t / 2))
  meshes.push(box(ROOM_W, WALL_H - headY, t, M.wallPaint(), 0, headY + (WALL_H - headY) / 2, -hd - t / 2))
  const winW = (ROOM_W - 0.5) / 3
  for (let i = 0; i < 3; i++) {
    const cx = -ROOM_W / 2 + 0.25 + winW * (i + 0.5)
    meshes.push(box(winW - 0.12, headY - sillH, 0.02, M.glass(), cx, sillH + (headY - sillH) / 2, -hd - 0.02))
    meshes.push(box(winW, 0.06, t, M.trim(), cx, sillH + 0.03, -hd - t / 2))
  }
  for (let i = 0; i <= 3; i++) {
    const mx = -ROOM_W / 2 + 0.25 + winW * i
    meshes.push(box(0.1, headY - sillH, t, M.wallPaint(), mx, sillH + (headY - sillH) / 2, -hd - t / 2))
  }
  meshes.push(box(0.25, headY - sillH, t, M.wallPaint(), -hw + 0.125, sillH + (headY - sillH) / 2, -hd - t / 2))
  meshes.push(box(0.25, headY - sillH, t, M.wallPaint(), hw - 0.125, sillH + (headY - sillH) / 2, -hd - t / 2))
  // front wall (z = +hd) with a door opening
  const doorW = 0.95
  const doorH = 2.1
  const doorX = 0.6
  const leftW = doorX - doorW / 2 + hw
  const rightW = hw - doorX - doorW / 2
  meshes.push(box(leftW, WALL_H, t, M.wallPaint(), -hw + leftW / 2, WALL_H / 2, hd + t / 2))
  meshes.push(box(rightW, WALL_H, t, M.wallPaint(), hw - rightW / 2, WALL_H / 2, hd + t / 2))
  meshes.push(box(doorW, WALL_H - doorH, t, M.wallPaint(), doorX, doorH + (WALL_H - doorH) / 2, hd + t / 2))
  // door leaf (static, ajar) + frame + handle
  const leaf = box(doorW - 0.06, doorH - 0.04, 0.045, M.darkWood(), 0, 0, 0)
  leaf.position.set(doorX - 0.12, (doorH - 0.04) / 2, hd + 0.1)
  leaf.rotation.y = -0.5
  meshes.push(leaf)
  meshes.push(box(0.06, doorH, t + 0.02, M.trim(), doorX - doorW / 2, doorH / 2, hd + t / 2))
  meshes.push(box(0.06, doorH, t + 0.02, M.trim(), doorX + doorW / 2, doorH / 2, hd + t / 2))
  meshes.push(box(doorW + 0.12, 0.06, t + 0.02, M.trim(), doorX, doorH + 0.03, hd + t / 2))
  // baseboards
  for (const sz of [-1, 1]) meshes.push(box(ROOM_W, 0.1, 0.02, M.trim(), 0, 0.05, sz * (hd - 0.01)))
  for (const sx of [-1, 1]) meshes.push(box(0.02, 0.1, ROOM_D, M.trim(), sx * (hw - 0.01), 0.05, 0))
  // bright "outdoors" behind the window wall so the glass reads as daylight
  const sky = new THREE.MeshBasicMaterial({ color: 0xdcebf5 })
  meshes.push(box(ROOM_W + 4, WALL_H + 2, 0.02, sky, 0, WALL_H / 2, -hd - 1.2))
  const skyline = new THREE.MeshBasicMaterial({ color: 0xb8c9d6 })
  for (let i = 0; i < 5; i++) {
    const bw = 0.5 + 0.5 * Math.abs(Math.sin(i * 13))
    const bh = 0.8 + 1.2 * Math.abs(Math.sin(i * 7 + 2))
    meshes.push(box(bw, bh, 0.02, skyline, -2.6 + i * 1.35, bh / 2 + 0.6, -hd - 1.1))
  }
  // ceiling light panels (emissive)
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.6 })
  const lightPanels: THREE.Mesh[] = []
  for (const sx of [-1, 1]) {
    const p = box(1.2, 0.02, 0.6, lightMat, sx * 1.6, WALL_H - 0.02, 0)
    lightPanels.push(p)
    meshes.push(p)
  }
  // shadow roles: walls/trim cast+receive; glass and the sky backdrop let sun
  // through; ceiling + its light panels must not cast (they'd black out the sun)
  for (const m of meshes) {
    const mat = m.material as any
    const basic = !!mat.isMeshBasicMaterial
    const glassy = !!mat.isMeshPhysicalMaterial
    m.receiveShadow = !basic && !glassy
    m.castShadow = !basic && !glassy
  }
  ceiling.castShadow = false
  for (const p of lightPanels) p.castShadow = false
  return meshes
}

/* ---------- placement ---------- */

interface Placed {
  label: string
  category: string
  build: (w: number, h: number, d: number) => THREE.Group
  w: number; h: number; d: number          // meters
  x: number; z: number                     // floor position
  y?: number                               // lift (items on desks, wall art)
  rotY?: number
}

const HD = ROOM_D / 2

const PLACEMENTS: Placed[] = [
  // desk zone along the window wall (chairs face the windows)
  { label: 'Standing Desk', category: 'table', build: (w, h, d) => desk(w, h, d, M.whiteTop), w: 1.6, h: 0.75, d: 0.8, x: -2.3, z: -HD + 0.65 },
  { label: 'Work Desk', category: 'table', build: (w, h, d) => desk(w, h, d, M.woodTop), w: 1.6, h: 0.75, d: 0.8, x: -0.55, z: -HD + 0.65 },
  { label: 'Desk Chair A', category: 'seating', build: officeChair, w: 0.66, h: 1.05, d: 0.66, x: -2.3, z: -HD + 1.35, rotY: Math.PI },
  { label: 'Desk Chair B', category: 'seating', build: officeChair, w: 0.66, h: 1.05, d: 0.66, x: -0.55, z: -HD + 1.35, rotY: Math.PI },
  { label: 'Dual Monitors', category: 'electronics', build: dualMonitors, w: 1.3, h: 0.55, d: 0.2, x: -2.3, z: -HD + 0.5, y: 0.75 },
  { label: 'Laptop', category: 'electronics', build: laptop, w: 0.32, h: 0.22, d: 0.22, x: -0.55, z: -HD + 0.6, y: 0.75 },
  { label: 'Desk Lamp', category: 'lighting', build: deskLamp, w: 0.18, h: 0.45, d: 0.18, x: -0.05, z: -HD + 0.45, y: 0.75 },
  { label: 'Filing Cabinet', category: 'object', build: filingCabinet, w: 0.45, h: 1.05, d: 0.6, x: 0.55, z: -HD + 0.4 },
  { label: 'Trash Bin', category: 'object', build: trashBin, w: 0.3, h: 0.35, d: 0.3, x: -1.45, z: -HD + 0.45 },

  // meeting zone (right half)
  { label: 'Area Rug', category: 'textile', build: rug, w: 3.2, h: 0.02, d: 2.2, x: 1.75, z: 0.45 },
  { label: 'Meeting Table', category: 'table', build: meetingTable, w: 2.0, h: 0.75, d: 1.1, x: 1.75, z: 0.45 },
  { label: 'Meeting Chair A', category: 'seating', build: meetingChair, w: 0.55, h: 0.85, d: 0.55, x: 1.15, z: -0.35 },
  { label: 'Meeting Chair B', category: 'seating', build: meetingChair, w: 0.55, h: 0.85, d: 0.55, x: 2.35, z: -0.35 },
  { label: 'Meeting Chair C', category: 'seating', build: meetingChair, w: 0.55, h: 0.85, d: 0.55, x: 1.15, z: 1.25, rotY: Math.PI },
  { label: 'Meeting Chair D', category: 'seating', build: meetingChair, w: 0.55, h: 0.85, d: 0.55, x: 2.35, z: 1.25, rotY: Math.PI },

  // storage / walls
  { label: 'Bookshelf', category: 'object', build: bookshelf, w: 0.9, h: 1.9, d: 0.35, x: -3.25, z: 0.1, rotY: Math.PI / 2 },
  { label: 'Whiteboard', category: 'decor', build: whiteboard, w: 1.8, h: 1.2, d: 0.06, x: 3.4, z: -0.6, rotY: -Math.PI / 2 },
  { label: 'Framed Prints', category: 'decor', build: framedPrints, w: 1.3, h: 0.75, d: 0.04, x: -3.42, z: 1.6, y: 1.55, rotY: Math.PI / 2 },
  { label: 'Wall Clock', category: 'decor', build: wallClock, w: 0.35, h: 0.35, d: 0.05, x: 1.9, z: HD - 0.06, y: 2.15, rotY: Math.PI },

  // lounge corner (front-left)
  { label: 'Lounge Sofa', category: 'seating', build: loungeSofa, w: 1.7, h: 0.8, d: 0.85, x: -1.7, z: HD - 0.6, rotY: Math.PI },
  { label: 'Floor Lamp', category: 'lighting', build: floorLamp, w: 0.45, h: 1.6, d: 0.45, x: -2.85, z: HD - 0.55 },
  { label: 'Office Plant A', category: 'decor', build: plant, w: 0.55, h: 1.5, d: 0.55, x: -3.15, z: -HD + 0.5 },
  { label: 'Office Plant B', category: 'decor', build: plant, w: 0.5, h: 1.3, d: 0.5, x: 3.2, z: HD - 0.5 },

  // refreshments (front-right)
  { label: 'Sideboard', category: 'object', build: sideboard, w: 1.4, h: 0.8, d: 0.45, x: 2.75, z: HD - 0.35, rotY: Math.PI },
  { label: 'Coffee Machine', category: 'electronics', build: coffeeMachine, w: 0.3, h: 0.42, d: 0.4, x: 2.45, z: HD - 0.35, y: 0.8, rotY: Math.PI },
  { label: 'Water Cooler', category: 'object', build: waterCooler, w: 0.35, h: 1.25, d: 0.35, x: 3.35, z: 1.15 },
]

/** Bake a placed group's meshes into standalone world-space meshes. */
function bake(p: Placed): THREE.Mesh[] {
  const g = p.build(p.w, p.h, p.d)
  g.position.set(p.x, p.y ?? 0, p.z)
  if (p.rotY) g.rotation.y = p.rotY
  g.updateMatrixWorld(true)
  const out: THREE.Mesh[] = []
  g.traverse((n) => { if ((n as THREE.Mesh).isMesh) out.push(n as THREE.Mesh) })
  for (const m of out) {
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale)
    m.removeFromParent()
    m.updateMatrixWorld(true)
    m.castShadow = true
    m.receiveShadow = true
  }
  return out
}

export const OFFICE_SCENE_ID = 'scene_demo_office'

/** Build the whole office once: same shape as the /room GLB loader. */
export function useOfficeGroups(): { groups: RoomGroup[]; staticMeshes: THREE.Mesh[]; bounds: THREE.Box3 } {
  return useMemo(() => {
    const staticMeshes = buildShell()
    for (const m of staticMeshes) m.updateMatrixWorld(true)
    // fixed room bounds (the sky backdrop outside the windows must not
    // inflate them — they drive the camera spawn and floor height)
    const bounds = new THREE.Box3(
      new THREE.Vector3(-ROOM_W / 2, 0, -ROOM_D / 2),
      new THREE.Vector3(ROOM_W / 2, WALL_H, ROOM_D / 2),
    )
    const groups: RoomGroup[] = PLACEMENTS.map((p) => {
      const meshes = bake(p)
      const box3 = new THREE.Box3()
      for (const m of meshes) box3.expandByObject(m)
      return {
        key: p.label,
        label: p.label,
        category: p.category,
        meshes,
        center: box3.getCenter(new THREE.Vector3()),
        size: box3.getSize(new THREE.Vector3()),
      }
    })
    return { groups, staticMeshes, bounds }
  }, [])
}
