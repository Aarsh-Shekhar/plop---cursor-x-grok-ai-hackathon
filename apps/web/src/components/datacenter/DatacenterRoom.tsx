// GPU / storage server room: walk the aisles, click parts in racks, pull/swap
// them, and watch full facility telemetry (PUE, thermals, redundancy, network
// oversubscription, $/mo, tCO2) react like a real DCIM dashboard.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  PART_TYPES, type PartType, type Telemetry, blankSlot, buildRack, buildRoomShell,
  computeTelemetry, slotY,
} from './datacenter'
import ProcurePanel from './ProcurePanel'

const EYE = 1.5

interface SlotRef { rack: number; slot: number }
interface SlotState { partKey: string | null; group: THREE.Group }

// initial build-out per rack (8 slots bottom→top)
const DEFAULT_LAYOUT: (string | null)[][] = [
  ['psu', 'gpu-h100', 'gpu-h100', 'gpu-h100', 'gpu-h100', 'tor', 'rdhx', 'blank'],
  ['psu', 'hdd', 'hdd', 'hdd', 'hdd', 'nvme', 'tor', 'blank'],
  ['psu', 'gpu-b200', 'gpu-b200', 'gpu-b200', 'cdu', 'tor', 'spine', 'blank'],
  ['psu', 'nvme', 'nvme', 'nvme', 'hdd', 'hdd', 'tor', 'blank'],
  ['ups', 'gpu-h100', 'gpu-h100', 'gpu-a100', 'gpu-a100', 'cdu', 'tor', 'fan'],
  ['psu', 'tape', 'tape', 'hdd', 'hdd', 'cpu', 'tor', 'blank'],
]

const CATEGORIES: { key: PartType['category']; label: string }[] = [
  { key: 'compute', label: 'COMPUTE' },
  { key: 'storage', label: 'STORAGE' },
  { key: 'network', label: 'NETWORK' },
  { key: 'power', label: 'POWER' },
  { key: 'cooling', label: 'COOLING' },
]

export default function DatacenterRoom({ onBack, onZoomPc }: { onBack: () => void; onZoomPc?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<SlotRef | null>(null)
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [tel, setTel] = useState<Telemetry | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [measureMode, setMeasureMode] = useState(false)
  const [measureCount, setMeasureCount] = useState(0)
  const measureModeRef = useRef(false)
  measureModeRef.current = measureMode
  const apiRef = useRef<{
    removePart: () => void
    installPart: (key: string) => void
    installAuto: (key: string) => string | null
    clearMeasures: () => void
  } | null>(null)
  const [procOpen, setProcOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    const labelLayer = labelsRef.current
    if (!mount || !labelLayer) return
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x15171c)
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x22242a, 0.75))
    const key = new THREE.DirectionalLight(0xeef4ff, 1.0)
    key.position.set(4, 8, 2)
    scene.add(key)

    const camera = new THREE.PerspectiveCamera(63, 1, 0.01, 100)
    camera.position.set(0, EYE, 6.2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1.2, 0)
    controls.update()

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    // ---------- build room ----------
    const ROOM_W = 12
    const ROOM_D = 14
    scene.add(buildRoomShell(ROOM_W, ROOM_D, 3.2))
    const floorY = 0

    const racks: THREE.Group[] = []
    const slotStates: SlotState[][] = []
    DEFAULT_LAYOUT.forEach((layout, i) => {
      const row = i % 2
      const col = Math.floor(i / 2)
      const x = row === 0 ? -2.2 : 2.2
      const z = -3.5 + col * 2.6
      const rack = buildRack()
      rack.position.set(x, 0, z)
      rack.rotation.y = row === 0 ? Math.PI / 2 : -Math.PI / 2
      rack.name = `Rack ${i + 1}`
      scene.add(rack)
      racks.push(rack)

      const slots: SlotState[] = []
      layout.forEach((partKey, s) => {
        const part = partKey ? PART_TYPES.find((p) => p.key === partKey)!.build() : blankSlot()
        part.position.y = slotY(s)
        part.userData.slotRef = { rack: i, slot: s }
        rack.add(part)
        slots.push({ partKey, group: part })
      })
      slotStates.push(slots)
    })

    const recompute = () => {
      const installed: PartType[] = []
      const perRackW: number[] = []
      for (const slots of slotStates) {
        let w = 0
        for (const s of slots) {
          if (!s.partKey) continue
          const pt = PART_TYPES.find((p) => p.key === s.partKey)!
          installed.push(pt)
          w += pt.powerW
        }
        perRackW.push(w)
      }
      setTel(computeTelemetry(installed, perRackW))
    }
    recompute()

    // ---------- nav arrows ----------
    const navGroup = new THREE.Group()
    scene.add(navGroup)
    const chevronGeo = (() => {
      const s = new THREE.Shape()
      s.moveTo(0, 0.22); s.lineTo(0.17, -0.1); s.lineTo(0, 0.02); s.lineTo(-0.17, -0.1); s.closePath()
      return new THREE.ShapeGeometry(s)
    })()
    const navArrows: { mesh: THREE.Group; dir: number }[] = []
    for (let i = 0; i < 8; i++) {
      const dir = (i * Math.PI) / 4
      const group = new THREE.Group()
      const outline = new THREE.Mesh(chevronGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }))
      outline.scale.setScalar(1.3)
      const black = new THREE.Mesh(chevronGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.95, depthWrite: false }))
      black.position.z = 0.001
      outline.renderOrder = 5
      black.renderOrder = 6
      group.add(outline, black)
      group.rotation.x = -Math.PI / 2
      group.traverse((c) => { c.userData.navDir = dir })
      navGroup.add(group)
      navArrows.push({ mesh: group, dir })
    }
    let glide: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null

    const updateNavArrows = () => {
      const fwd = new THREE.Vector3().subVectors(controls.target, camera.position)
      fwd.y = 0
      if (fwd.lengthSq() < 1e-6) return
      fwd.normalize()
      for (const { mesh, dir } of navArrows) {
        const d = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), dir)
        mesh.rotation.z = Math.atan2(-d.x, -d.z)
        mesh.position.copy(camera.position).add(d.multiplyScalar(2.1))
        mesh.position.y = floorY + 0.02
      }
      navGroup.visible = !measureModeRef.current
    }

    const walk = (dir: number) => {
      const fwd = new THREE.Vector3().subVectors(controls.target, camera.position)
      fwd.y = 0
      fwd.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), dir)
      const step = fwd.multiplyScalar(1.5)
      const toP = camera.position.clone().add(step).setY(floorY + EYE)
      toP.x = Math.max(-ROOM_W / 2 + 0.5, Math.min(ROOM_W / 2 - 0.5, toP.x))
      toP.z = Math.max(-ROOM_D / 2 + 0.5, Math.min(ROOM_D / 2 - 0.5, toP.z))
      glide = { fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT: controls.target.clone().add(step), t: 0 }
    }

    // ---------- measuring ----------
    interface Measurement { a: THREE.Vector3; b: THREE.Vector3; line: THREE.Object3D; label: HTMLDivElement; markers: THREE.Mesh[] }
    const measures: Measurement[] = []
    let measureStart: { pt: THREE.Vector3; marker: THREE.Mesh } | null = null
    const makeMarker = (pt: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }))
      m.position.copy(pt)
      m.renderOrder = 6
      scene.add(m)
      return m
    }
    const finishMeasure = (a: THREE.Vector3, b: THREE.Vector3, markA: THREE.Mesh) => {
      const markB = makeMarker(b)
      const dir = new THREE.Vector3().subVectors(b, a)
      const len = dir.length()
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 8), new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }))
      cylinder.position.copy(a).add(b).multiplyScalar(0.5)
      cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      cylinder.renderOrder = 6
      scene.add(cylinder)
      const label = document.createElement('div')
      label.textContent = len >= 1 ? `${len.toFixed(2)} m` : `${Math.round(len * 100)} cm`
      Object.assign(label.style, {
        position: 'absolute', transform: 'translate(-50%, -120%)', background: '#4ecdc4',
        color: '#0e1014', fontWeight: '700', fontSize: '12px', padding: '3px 8px',
        borderRadius: '7px', pointerEvents: 'none', whiteSpace: 'nowrap',
      } as CSSStyleDeclaration)
      labelLayer.appendChild(label)
      measures.push({ a, b, line: cylinder, label, markers: [markA, markB] })
      setMeasureCount(measures.length)
    }
    const updateLabels = () => {
      const rect = renderer.domElement.getBoundingClientRect()
      for (const m of measures) {
        const mid = new THREE.Vector3().addVectors(m.a, m.b).multiplyScalar(0.5).project(camera)
        m.label.style.left = `${((mid.x + 1) / 2) * rect.width}px`
        m.label.style.top = `${((-mid.y + 1) / 2) * rect.height}px`
        m.label.style.display = mid.z < 1 ? 'block' : 'none'
      }
    }

    // ---------- selection ----------
    let selectedSlot: SlotRef | null = null
    const savedEmissive = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>()
    const raycaster = new THREE.Raycaster()

    const setEmissive = (obj: THREE.Object3D, on: boolean) => {
      obj.traverse((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial
          if (!mat.emissive) continue
          if (on) {
            if (!savedEmissive.has(mesh)) savedEmissive.set(mesh, { color: mat.emissive.clone(), intensity: mat.emissiveIntensity })
            mat.emissive.setHex(0x4ecdc4)
            mat.emissiveIntensity = 0.4
          } else {
            const orig = savedEmissive.get(mesh)
            if (orig) { mat.emissive.copy(orig.color); mat.emissiveIntensity = orig.intensity }
          }
        }
      })
      if (!on) savedEmissive.clear()
    }

    const doSelect = (ref: SlotRef | null) => {
      if (selectedSlot) setEmissive(slotStates[selectedSlot.rack][selectedSlot.slot].group, false)
      selectedSlot = ref
      if (ref) setEmissive(slotStates[ref.rack][ref.slot].group, true)
      setSelected(ref)
      setSelectedPart(ref ? slotStates[ref.rack][ref.slot].partKey : null)
      setSwapOpen(false)
    }

    // ---------- pointer ----------
    const ndc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }

    const onPointerDown = (e: PointerEvent) => {
      raycaster.setFromCamera(ndc(e), camera)
      if (navGroup.visible) {
        const navHit = raycaster.intersectObjects(navGroup.children, true)[0]
        if (navHit && navHit.object.userData.navDir !== undefined) { walk(navHit.object.userData.navDir); return }
      }
      if (measureModeRef.current) {
        const hit = raycaster.intersectObjects(scene.children.filter((c) => c !== navGroup), true)[0]
        if (!hit) return
        if (!measureStart) measureStart = { pt: hit.point.clone(), marker: makeMarker(hit.point) }
        else { finishMeasure(measureStart.pt, hit.point.clone(), measureStart.marker); measureStart = null }
        return
      }
      for (const hit of raycaster.intersectObjects(racks, true)) {
        let cur: THREE.Object3D | null = hit.object
        while (cur && cur.userData.slotRef === undefined) cur = cur.parent
        if (cur?.userData.slotRef !== undefined) { doSelect(cur.userData.slotRef as SlotRef); return }
      }
      doSelect(null)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    // keyboard walkthrough: WASD / arrow keys (Q/E strafe diagonals)
    const KEYMAP: Record<string, number> = {
      w: 0, arrowup: 0,
      s: Math.PI, arrowdown: Math.PI,
      a: Math.PI / 2, arrowleft: Math.PI / 2,
      d: -Math.PI / 2, arrowright: -Math.PI / 2,
      q: Math.PI / 4, e: -Math.PI / 4,
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const dir = KEYMAP[e.key.toLowerCase()]
      if (dir === undefined) return
      e.preventDefault()
      walk(dir)
    }
    window.addEventListener('keydown', onKeyDown)

    // ---------- API ----------
    const mountPart = (ref: SlotRef, key: string | null) => {
      const state = slotStates[ref.rack][ref.slot]
      const rack = racks[ref.rack]
      rack.remove(state.group)
      const next = key ? PART_TYPES.find((p) => p.key === key)!.build() : blankSlot()
      next.position.y = slotY(ref.slot)
      next.userData.slotRef = ref
      rack.add(next)
      state.group = next
      state.partKey = key
      recompute()
    }

    apiRef.current = {
      removePart: () => { if (selectedSlot) { mountPart(selectedSlot, null); doSelect(selectedSlot) } },
      installPart: (key: string) => { if (selectedSlot) { mountPart(selectedSlot, key); doSelect(selectedSlot) } },
      installAuto: (key: string) => {
        // preferred target: selected slot, else first empty bay, else first blanking panel
        let target = selectedSlot
        if (!target) {
          outer: for (let ri = 0; ri < slotStates.length; ri++) {
            for (let si = 0; si < slotStates[ri].length; si++) {
              if (slotStates[ri][si].partKey === null) { target = { rack: ri, slot: si }; break outer }
            }
          }
        }
        if (!target) {
          outer2: for (let ri = 0; ri < slotStates.length; ri++) {
            for (let si = 0; si < slotStates[ri].length; si++) {
              if (slotStates[ri][si].partKey === 'blank') { target = { rack: ri, slot: si }; break outer2 }
            }
          }
        }
        if (!target) return null
        mountPart(target, key)
        doSelect(target)
        return `Rack ${target.rack + 1} · U${target.slot * 4 + 1}–${target.slot * 4 + 4}`
      },
      clearMeasures: () => {
        for (const m of measures) {
          scene.remove(m.line)
          m.markers.forEach((mk) => scene.remove(mk))
          m.label.remove()
        }
        measures.length = 0
        if (measureStart) { scene.remove(measureStart.marker); measureStart = null }
        setMeasureCount(0)
      },
    }

    const animate = () => {
      if (disposed) return
      requestAnimationFrame(animate)
      if (glide) {
        glide.t = Math.min(1, glide.t + 0.045)
        const k = 1 - Math.pow(1 - glide.t, 3)
        camera.position.lerpVectors(glide.fromP, glide.toP, k)
        controls.target.lerpVectors(glide.fromT, glide.toT, k)
        if (glide.t >= 1) glide = null
      }
      controls.update()
      updateNavArrows()
      updateLabels()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      labelLayer.innerHTML = ''
    }
  }, [])

  const partMeta = selectedPart ? PART_TYPES.find((p) => p.key === selectedPart) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#15171c', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <b style={{ fontSize: 16 }}>🖥 plop datacenter</b>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>WASD/arrows to walk · click parts to swap · watch the telemetry react</span>
        <button className="small" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => setProcOpen((o) => !o)}>🛒 procure</button>
        <div style={{ flex: 1 }} />
        {tel && (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--muted)' }}>
            IT <b style={{ color: 'var(--text)' }}>{tel.itLoadKW}kW</b> · PUE <b style={{ color: tel.pue <= 1.4 ? 'var(--accent2)' : tel.pue <= 1.6 ? 'var(--gold)' : 'var(--danger)' }}>{tel.pue.toFixed(2)}</b>
          </span>
        )}
        <button className="small" onClick={() => setPanelOpen((o) => !o)}>📊 telemetry</button>
        <button className="small" onClick={onBack}>← back to plop</button>
      </header>

      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
          <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />

          {/* toolbar */}
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(14,16,20,0.88)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', backdropFilter: 'blur(10px)', maxWidth: '92%', flexWrap: 'wrap', justifyContent: 'center' }}>
            {measureMode ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--accent2)' }}>📏 click two points to measure</span>
                {measureCount > 0 && <button className="small" onClick={() => apiRef.current?.clearMeasures()}>clear {measureCount}</button>}
                <button className="small primary" onClick={() => setMeasureMode(false)}>done</button>
              </>
            ) : selected ? (
              <>
                <span style={{ fontSize: 13 }}>
                  ◈ Rack {selected.rack + 1} · U{selected.slot * 4 + 1}–{selected.slot * 4 + 4}: <b>{partMeta ? `${partMeta.emoji} ${partMeta.label}` : 'empty bay'}</b>
                </span>
                {partMeta && partMeta.category === 'compute' && onZoomPc && (
                  <button className="small primary" onClick={onZoomPc}
                    title="Expand this server into its component-level PC digital twin — airflow, exploded view, part swaps">
                    ⤢ expand server
                  </button>
                )}
                {partMeta && (
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                    {partMeta.powerW > 0 && `${partMeta.powerW}W `}
                    {partMeta.capacityTB > 0 && `· ${partMeta.capacityTB}TB `}
                    {partMeta.pflops > 0 && `· ${partMeta.pflops}PF `}
                    {partMeta.netCapGbps > 0 && `· ${partMeta.netCapGbps / 1000}Tbps `}
                    {partMeta.coolKW > 0 && `· +${partMeta.coolKW}kW cool `}
                    {partMeta.upsKW > 0 && `· +${partMeta.upsKW}kW power`}
                  </span>
                )}
                {selectedPart && <button className="small danger" onClick={() => apiRef.current?.removePart()}>⏏ pull out</button>}
                <button className="small primary" onClick={() => setSwapOpen((o) => !o)}>
                  {selectedPart ? '⇄ swap part' : '＋ install part'}
                </button>
              </>
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>click a part in a rack · arrows to walk · scroll to zoom</span>
            )}
            {!measureMode && <button className="small" onClick={() => setMeasureMode(true)}>📏 measure</button>}
          </div>

          {/* procurement swarm */}
          {procOpen && (
            <ProcurePanel
              onClose={() => setProcOpen(false)}
              onInstall={(key) => {
                const where = apiRef.current?.installAuto(key) ?? null
                if (where) {
                  setToast(`installed in ${where}`)
                  setTimeout(() => setToast(null), 5000)
                }
                return where
              }}
            />
          )}
          {toast && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent2)', color: '#0e1014', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 10 }}>
              ⚙️ {toast}
            </div>
          )}

          {/* part picker */}
          {swapOpen && selected && (
            <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', background: 'rgba(14,16,20,0.95)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, maxWidth: '94%', maxHeight: '60%', overflowY: 'auto' }}>
              {CATEGORIES.map((cat) => (
                <div key={cat.key} style={{ marginBottom: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>{cat.label}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PART_TYPES.filter((p) => p.category === cat.key).map((p) => (
                      <button key={p.key} onClick={() => { apiRef.current?.installPart(p.key); setSwapOpen(false) }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 10px', minWidth: 150 }}>
                        <span style={{ fontSize: 12 }}>{p.emoji} <b>{p.label}</b></span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                          {p.powerW}W{p.capacityTB > 0 ? ` · ${p.capacityTB}TB` : ''}{p.pflops > 0 ? ` · ${p.pflops}PF` : ''}
                          {p.netCapGbps > 0 ? ` · ${p.netCapGbps / 1000}T` : ''}{p.coolKW > 0 ? ` · +${p.coolKW}kW❄` : ''}
                          {p.upsKW > 0 ? ` · +${p.upsKW}kW🔋` : ''} · ${p.capexK}k
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* telemetry panel */}
        {panelOpen && tel && (
          <aside style={{ width: 270, borderLeft: '1px solid var(--border)', background: 'var(--bg)', overflowY: 'auto', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>
            <TelSection title="POWER CHAIN">
              <TelRow k="IT load" v={`${tel.itLoadKW} kW`} />
              <TelRow k="facility load" v={`${tel.facilityKW} kW`} />
              <TelRow k="PUE" v={tel.pue.toFixed(2)} status={tel.pue <= 1.4 ? 'ok' : tel.pue <= 1.6 ? 'warn' : 'bad'} />
              <TelRow k="UPS capacity" v={`${tel.upsCapKW} kW`} />
              <TelRow k="UPS utilization" v={`${tel.upsUtil}%`} status={tel.upsUtil < 70 ? 'ok' : tel.upsUtil < 95 ? 'warn' : 'bad'} />
              <TelRow k="redundancy" v={tel.redundancy} status={tel.redundancy === '2N' || tel.redundancy === 'N+1' ? 'ok' : tel.redundancy === 'N' ? 'warn' : 'bad'} />
            </TelSection>
            <TelSection title="THERMAL">
              <TelRow k="heat rejection" v={`${tel.heatKW} kW`} />
              <TelRow k="cooling capacity" v={`${tel.coolCapKW} kW`} />
              <TelRow k="cooling utilization" v={`${tel.coolUtil}%`} status={tel.coolUtil < 70 ? 'ok' : tel.coolUtil < 90 ? 'warn' : 'bad'} />
              <TelRow k="cold-aisle inlet" v={`${tel.inletC} °C`} status={tel.thermalStatus === 'OK' ? 'ok' : tel.thermalStatus === 'WARN' ? 'warn' : 'bad'} />
              <TelRow k="ASHRAE status" v={tel.thermalStatus} status={tel.thermalStatus === 'OK' ? 'ok' : tel.thermalStatus === 'WARN' ? 'warn' : 'bad'} />
            </TelSection>
            <TelSection title="COMPUTE">
              <TelRow k="accelerators" v={`${tel.gpus} GPUs`} />
              <TelRow k="fp16 throughput" v={`${tel.pflops} PFLOPS`} />
              <TelRow k="rack density avg" v={`${tel.densityAvgKW} kW/rack`} />
              <TelRow k="rack density peak" v={`${tel.densityPeakKW} kW/rack`} status={tel.densityPeakKW <= 40 ? 'ok' : tel.densityPeakKW <= 60 ? 'warn' : 'bad'} />
            </TelSection>
            <TelSection title="STORAGE">
              <TelRow k="raw capacity" v={`${tel.tb.toLocaleString()} TB`} />
              <TelRow k="random IOPS" v={`${tel.iopsM} M`} />
              <TelRow k="throughput" v={`${tel.storageGBps} GB/s`} />
            </TelSection>
            <TelSection title="NETWORK FABRIC">
              <TelRow k="switching capacity" v={`${tel.netCapTbps} Tbps`} />
              <TelRow k="node demand" v={`${tel.netDemandTbps} Tbps`} />
              <TelRow k="oversubscription" v={`${tel.oversub}:1`} status={tel.oversub <= 1.5 ? 'ok' : tel.oversub <= 3 ? 'warn' : 'bad'} />
            </TelSection>
            <TelSection title="ECONOMICS">
              <TelRow k="capex (installed)" v={`$${tel.capexM} M`} />
              <TelRow k="energy opex" v={`$${tel.opexKMo}k /mo`} />
              <TelRow k="carbon" v={`${tel.co2TMo} tCO₂ /mo`} />
            </TelSection>
          </aside>
        )}
      </div>
    </div>
  )
}

function TelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: 'var(--accent2)', fontSize: 10, letterSpacing: 2, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>{title}</div>
      {children}
    </div>
  )
}

function TelRow({ k, v, status }: { k: string; v: string; status?: 'ok' | 'warn' | 'bad' }) {
  const color = status === 'ok' ? 'var(--accent2)' : status === 'warn' ? 'var(--gold)' : status === 'bad' ? 'var(--danger)' : 'var(--text)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span style={{ color, fontWeight: 700 }}>{v}</span>
    </div>
  )
}
