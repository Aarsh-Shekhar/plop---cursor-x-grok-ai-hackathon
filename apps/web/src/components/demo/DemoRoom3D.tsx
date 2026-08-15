// Editable photorealistic 3D room (demo):
//  · walk the room with street-view style arrows
//  · select / drag-move / remove / restore objects
//  · place themed furniture from a catalog, resize it
//  · measure real dimensions with the ruler tool
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CATALOG } from './demoFurniture'

interface Props {
  glbUrl: string
  camera: { pos: [number, number, number]; target: [number, number, number] }
}

const STRUCTURAL = /^(base|walls|floor|ceiling|window|door|balustrade|handle|shelfs?|mirror)/i
const EYE = 1.12 // walking eye height above floor

export default function DemoRoom3D({ glbUrl, camera: camPose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const [placing, setPlacing] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measureCount, setMeasureCount] = useState(0)
  const measureModeRef = useRef(false)
  measureModeRef.current = measureMode
  const apiRef = useRef<{
    removeSelected: () => void
    restore: (name: string) => void
    beginPlace: (key: string) => void
    scaleSelected: (f: number) => void
    clearMeasures: () => void
  } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    const labelLayer = labelsRef.current
    if (!mount || !labelLayer) return
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xdfd8cc)
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2)
    sun.position.set(6, 9, 4)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb0a795, 0.5))

    const camera = new THREE.PerspectiveCamera(63, 1, 0.01, 200)
    camera.position.set(...camPose.pos)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(...camPose.target)
    controls.update()

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    // ---------- state ----------
    let root: THREE.Group | null = null
    let selectedObj: THREE.Object3D | null = null
    const savedEmissive = new Map<THREE.Mesh, THREE.Color>()
    const byName = new Map<string, THREE.Object3D>()
    let floorY = 0
    let placingSpec: { key: string } | null = null
    let ghost: THREE.Group | null = null
    let addCount = 0
    const raycaster = new THREE.Raycaster()

    // ---------- nav arrows (google-maps style) ----------
    const navGroup = new THREE.Group()
    scene.add(navGroup)
    const chevronGeo = (() => {
      const s = new THREE.Shape()
      s.moveTo(0, 0.22)
      s.lineTo(0.17, -0.1)
      s.lineTo(0, 0.02)
      s.lineTo(-0.17, -0.1)
      s.closePath()
      return new THREE.ShapeGeometry(s)
    })()
    const navArrows: { mesh: THREE.Group; dir: number }[] = []
    // 8 directions, google-maps style: crisp black chevron with white outline
    for (let i = 0; i < 8; i++) {
      const dir = (i * Math.PI) / 4
      const group = new THREE.Group()
      const outline = new THREE.Mesh(
        chevronGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
      )
      outline.scale.setScalar(1.3)
      const black = new THREE.Mesh(
        chevronGeo,
        new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.95, depthWrite: false }),
      )
      black.position.z = 0.001
      outline.renderOrder = 5
      black.renderOrder = 6
      group.add(outline, black)
      group.rotation.x = -Math.PI / 2
      group.userData.nav = true
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
      navGroup.visible = !placingSpec && !measureModeRef.current
    }

    const walk = (dir: number) => {
      const fwd = new THREE.Vector3().subVectors(controls.target, camera.position)
      fwd.y = 0
      fwd.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), dir)
      const step = fwd.multiplyScalar(1.5)
      glide = {
        fromP: camera.position.clone(),
        toP: camera.position.clone().add(step).setY(floorY + EYE),
        fromT: controls.target.clone(),
        toT: controls.target.clone().add(step),
        t: 0,
      }
    }

    // ---------- measuring ----------
    interface Measurement { a: THREE.Vector3; b: THREE.Vector3; line: THREE.Object3D; label: HTMLDivElement; markers: THREE.Mesh[] }
    const measures: Measurement[] = []
    let measureStart: { pt: THREE.Vector3; marker: THREE.Mesh } | null = null

    const makeMarker = (pt: THREE.Vector3) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x7c6cff }),
      )
      m.position.copy(pt)
      m.renderOrder = 6
      scene.add(m)
      return m
    }

    const finishMeasure = (a: THREE.Vector3, b: THREE.Vector3, markA: THREE.Mesh) => {
      const markB = makeMarker(b)
      const dir = new THREE.Vector3().subVectors(b, a)
      const len = dir.length()
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, len, 8),
        new THREE.MeshBasicMaterial({ color: 0x7c6cff }),
      )
      cylinder.position.copy(a).add(b).multiplyScalar(0.5)
      cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      cylinder.renderOrder = 6
      scene.add(cylinder)
      const label = document.createElement('div')
      label.textContent = len >= 1 ? `${len.toFixed(2)} m` : `${Math.round(len * 100)} cm`
      Object.assign(label.style, {
        position: 'absolute', transform: 'translate(-50%, -120%)', background: '#7c6cff',
        color: '#fff', fontWeight: '700', fontSize: '12px', padding: '3px 8px',
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
        const x = ((mid.x + 1) / 2) * rect.width
        const y = ((-mid.y + 1) / 2) * rect.height
        m.label.style.left = `${x}px`
        m.label.style.top = `${y}px`
        m.label.style.display = mid.z < 1 ? 'block' : 'none'
      }
    }

    // ---------- selection helpers ----------
    const selectionRoot = (obj: THREE.Object3D): THREE.Object3D | null => {
      let cur: THREE.Object3D | null = obj
      while (cur && cur.parent && cur.parent !== scene && !(root && cur.parent === root)) cur = cur.parent
      return cur
    }

    const setEmissive = (obj: THREE.Object3D, on: boolean) => {
      obj.traverse((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial
          if (!mat.emissive) continue
          if (on) {
            if (!savedEmissive.has(mesh)) savedEmissive.set(mesh, mat.emissive.clone())
            mat.emissive.setHex(0x5a4fd0)
            mat.emissiveIntensity = 0.35
          } else {
            const orig = savedEmissive.get(mesh)
            if (orig) mat.emissive.copy(orig)
            mat.emissiveIntensity = 1
          }
        }
      })
      if (!on) savedEmissive.clear()
    }

    const doSelect = (obj: THREE.Object3D | null) => {
      if (selectedObj) setEmissive(selectedObj, false)
      selectedObj = obj
      if (obj) setEmissive(obj, true)
      setSelected(obj ? obj.name : null)
    }

    new GLTFLoader().load(glbUrl, (gltf) => {
      if (disposed) return
      root = gltf.scene
      scene.add(root)
      root.children.forEach((c) => byName.set(c.name, c))
      const floor = byName.get('Floor')
      if (floor) floorY = new THREE.Box3().setFromObject(floor).max.y
    })

    // ---------- pointer handling ----------
    const ndc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
    }

    const floorPoint = (e: PointerEvent, y: number): THREE.Vector3 | null => {
      raycaster.setFromCamera(ndc(e), camera)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
      const pt = new THREE.Vector3()
      return raycaster.ray.intersectPlane(plane, pt) ? pt : null
    }

    const scenePoint = (e: PointerEvent): THREE.Vector3 | null => {
      if (!root) return null
      raycaster.setFromCamera(ndc(e), camera)
      const hit = raycaster.intersectObjects(root.children, true)[0]
      return hit ? hit.point.clone() : null
    }

    let drag: { obj: THREE.Object3D; planeY: number; offset: THREE.Vector3 } | null = null

    const onPointerDown = (e: PointerEvent) => {
      raycaster.setFromCamera(ndc(e), camera)

      // nav arrows take priority
      if (navGroup.visible) {
        const navHit = raycaster.intersectObjects(navGroup.children, true)[0]
        if (navHit && navHit.object.userData.navDir !== undefined) {
          walk(navHit.object.userData.navDir)
          return
        }
      }

      // measuring
      if (measureModeRef.current) {
        const pt = scenePoint(e)
        if (!pt) return
        if (!measureStart) {
          measureStart = { pt, marker: makeMarker(pt) }
        } else {
          finishMeasure(measureStart.pt, pt, measureStart.marker)
          measureStart = null
        }
        return
      }

      // placing a catalog item
      if (placingSpec && ghost) {
        ghost.traverse((c) => {
          const mesh = c as THREE.Mesh
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach((m) => { (m as THREE.Material).transparent = false; (m as THREE.Material).opacity = 1 })
          }
        })
        byName.set(ghost.name, ghost)
        doSelect(ghost)
        ghost = null
        placingSpec = null
        setPlacing(null)
        return
      }

      // selecting / dragging
      if (!root) return
      for (const hit of raycaster.intersectObjects(root.children.concat(scene.children.filter((c) => c.userData.added)), true)) {
        const sel = selectionRoot(hit.object)
        if (!sel || !sel.visible || sel.userData.nav) continue
        if (STRUCTURAL.test(sel.name)) continue
        doSelect(sel)
        const planeY = new THREE.Box3().setFromObject(sel).min.y
        const pt = floorPoint(e, planeY)
        if (pt) {
          drag = { obj: sel, planeY, offset: sel.position.clone().sub(pt) }
          controls.enabled = false
        }
        return
      }
      doSelect(null)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (placingSpec && ghost) {
        const pt = floorPoint(e, floorY)
        if (pt) ghost.position.set(pt.x, floorY, pt.z)
        return
      }
      if (drag) {
        const pt = floorPoint(e, drag.planeY)
        if (pt) {
          drag.obj.position.x = pt.x + drag.offset.x
          drag.obj.position.z = pt.z + drag.offset.z
        }
      }
    }

    const onPointerUp = () => {
      drag = null
      controls.enabled = true
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // ---------- toolbar API ----------
    apiRef.current = {
      removeSelected: () => {
        if (!selectedObj) return
        const obj = selectedObj
        doSelect(null)
        obj.visible = false
        setRemoved((r) => [...r, obj.name])
      },
      restore: (name: string) => {
        const obj = byName.get(name)
        if (obj) obj.visible = true
        setRemoved((r) => r.filter((n) => n !== name))
      },
      beginPlace: (key: string) => {
        const entry = CATALOG.find((c) => c.key === key)
        if (!entry) return
        placingSpec = { key }
        ghost = entry.build(entry.w / 100, entry.h / 100, entry.d / 100)
        ghost.name = `${entry.label} #${++addCount}`
        ghost.userData.added = true
        ghost.traverse((c) => {
          const mesh = c as THREE.Mesh
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach((m) => { (m as THREE.Material).transparent = true; (m as THREE.Material).opacity = 0.55 })
          }
        })
        ghost.position.set(camPose.target[0], floorY, camPose.target[2])
        scene.add(ghost)
        setPlacing(entry.label)
      },
      scaleSelected: (f: number) => {
        if (!selectedObj) return
        const base = new THREE.Box3().setFromObject(selectedObj).min.y
        selectedObj.scale.multiplyScalar(f)
        // keep feet on the floor
        const newBase = new THREE.Box3().setFromObject(selectedObj).min.y
        selectedObj.position.y += base - newBase
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

    // ---------- loop ----------
    // dev/debug hook
    ;(window as unknown as Record<string, unknown>).__demo3d = {
      arrowScreenPos: () => {
        const rect = renderer.domElement.getBoundingClientRect()
        return navArrows.map(({ mesh, dir }) => {
          const p = mesh.position.clone().project(camera)
          return { dir: Math.round((dir * 180) / Math.PI), x: ((p.x + 1) / 2) * rect.width, y: ((-p.y + 1) / 2) * rect.height, visible: navGroup.visible, z: p.z }
        })
      },
      camPos: () => camera.position.toArray(),
      walkFwd: () => walk(0),
      probe: (cx: number, cy: number) => {
        const rect = renderer.domElement.getBoundingClientRect()
        raycaster.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera)
        const nav = raycaster.intersectObjects(navGroup.children)
        return { navHits: nav.length, navVisible: navGroup.visible, first: nav[0]?.point?.toArray?.() }
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
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      labelLayer.innerHTML = ''
    }
  }, [glbUrl])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />
      <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />

      {/* toolbar */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(14,16,20,0.85)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', backdropFilter: 'blur(10px)', maxWidth: '92%', flexWrap: 'wrap', justifyContent: 'center' }}>
        {measureMode ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--accent)' }}>📏 click two points to measure</span>
            {measureCount > 0 && (
              <button className="small" onClick={() => apiRef.current?.clearMeasures()}>clear {measureCount}</button>
            )}
            <button className="small primary" onClick={() => setMeasureMode(false)}>done</button>
          </>
        ) : placing ? (
          <span style={{ fontSize: 13, color: 'var(--gold)' }}>placing {placing} — click the floor to set it down</span>
        ) : selected ? (
          <>
            <span style={{ fontSize: 13, textTransform: 'capitalize' }}>◈ {selected.replace(/_/g, ' ')}</span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>drag to move</span>
            <button className="small" onClick={() => apiRef.current?.scaleSelected(1 / 1.12)}>−</button>
            <button className="small" onClick={() => apiRef.current?.scaleSelected(1.12)}>＋</button>
            <button className="small danger" onClick={() => apiRef.current?.removeSelected()}>🗑</button>
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>click objects to edit · arrows to walk · scroll to zoom</span>
        )}
        {!measureMode && !placing && (
          <>
            <button className="small" onClick={() => setCatalogOpen((o) => !o)}>＋ add</button>
            <button className="small" onClick={() => { setMeasureMode(true); setCatalogOpen(false) }}>📏 measure</button>
          </>
        )}
      </div>

      {/* catalog */}
      {catalogOpen && !placing && (
        <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, background: 'rgba(14,16,20,0.92)', border: '1px solid var(--border)', borderRadius: 14, padding: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
          {CATALOG.map((c) => (
            <button
              key={c.key}
              onClick={() => { apiRef.current?.beginPlace(c.key); setCatalogOpen(false) }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 12px', minWidth: 76 }}
            >
              <span style={{ fontSize: 22 }}>{c.emoji}</span>
              <span style={{ fontSize: 11 }}>{c.label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{c.w}×{c.h}cm</span>
            </button>
          ))}
        </div>
      )}

      {/* removed items */}
      {removed.length > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>removed — click to restore</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 300 }}>
            {removed.map((name) => (
              <button key={name} className="small" onClick={() => apiRef.current?.restore(name)}>
                ↩ {name.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
