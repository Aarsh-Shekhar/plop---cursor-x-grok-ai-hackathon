// Hardcoded photoreal demo room (/room): a real 3D scene you can walk through
// and edit. Objects come from the model's true geometry; the seeded scene doc
// makes NL commands, undo/redo and @hive swarm research work exactly like a
// reconstructed scene.
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { API_BASE } from '../lib/api'
import { makeProxyObject } from '../lib/candidates'
import { useEditor } from '../state/editor'
import RoomViewport, { groupsToObjects, useRoomGroups } from '../components/room/RoomViewport'
import SceneTree from '../components/editor/SceneTree'
import Inspector from '../components/editor/Inspector'
import CommandBar from '../components/editor/CommandBar'
import ShopPanel from '../components/editor/ShopPanel'
import HiveScan from '../components/hive/HiveScan'
import GoalPanel from '../components/editor/GoalPanel'
import TechnicalPanel from '../components/editor/TechnicalPanel'
import VoiceBubble from '../components/editor/VoiceBubble'
import { DEMO_SCENE_ID } from '../components/room/roomConfig'
import type { Scene, SceneObject } from '../lib/types'

function RoomInner() {
  const { groups, staticMeshes, bounds } = useRoomGroups()
  const {
    scene, loadScene, undo, redo, select, selectedId, applyEdit,
    hiveScanQuery, setHiveScanQuery, pushChat,
    goalJobId, setGoalJobId, techView, setTechView,
    measureMode, setMeasureMode, measureUnit, cycleMeasureUnit,
  } = useEditor()
  const [shopTarget, setShopTarget] = useState<SceneObject | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null)
  const [showBefore, setShowBefore] = useState(false)

  // Build the scene doc from the real GLB geometry, seed it to the backend
  // (so /commands and /hive/runs see it), then load it into the store.
  useEffect(() => {
    if (!groups.length) return
    const objects = groupsToObjects(groups)
    const doc: Scene = {
      id: DEMO_SCENE_ID,
      projectId: 'proj_demo_room',
      name: 'Demo Living Room (3D)',
      mode: 'consumer',
      status: 'ready',
      units: 'm',
      scaleConfidence: 'model',      // true model geometry — real meters
      capture: {
        imageUri: '/demo3d/room-photo.png', cleanedUri: '/demo3d/room-photo.png',
        depthUri: '/demo3d/room-photo.png',
        width: 1600, height: 1000, depthMinM: 1, depthMaxM: 6, hfovDeg: 60,
      },
      environment: { floorY: bounds.min.y, backdrop: 'model' },
      objects,
    }
    fetch(`${API_BASE}/api/scenes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
      loadScene(doc)
    }).catch((e) => setSeedError(e.message))
  }, [groups])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).tagName === 'INPUT'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (!inField && e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Capture the live viewport as an "iPhone photo" — warm cast, vignette,
  // grain, timestamp — the BEFORE shot for the before/after story.
  const captureBefore = () => {
    const canvas = document.querySelector('.viewport-wrap canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const w = 1170, h = 1560  // iPhone portrait-ish 3:4
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    // center-crop the live frame to portrait
    const srcAR = canvas.width / canvas.height
    const dstAR = w / h
    let sw = canvas.width, sh = canvas.height, sx = 0, sy = 0
    if (srcAR > dstAR) { sw = canvas.height * dstAR; sx = (canvas.width - sw) / 2 }
    else { sh = canvas.width / dstAR; sy = (canvas.height - sh) / 2 }
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h)
    // warm iPhone-ish cast + vignette + grain
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = 'rgba(255, 190, 120, 0.10)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)
    const noise = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < noise.data.length; i += 16) {
      const n = (Math.random() - 0.5) * 10
      noise.data[i] += n; noise.data[i + 1] += n; noise.data[i + 2] += n
    }
    ctx.putImageData(noise, 0, 0)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '28px -apple-system, sans-serif'
    ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 40, h - 44)
    const dataUrl = cv.toDataURL('image/jpeg', 0.88)
    setBeforePhoto(dataUrl)
    setShowBefore(true)
    // persist for the hackathon submission (served at /demo3d/room-photo.png)
    fetch(`${API_BASE}/api/demo/photo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: cv.toDataURL('image/png') }),
    }).catch(() => {})
    pushChat('plop', 'Captured the "before" photo — toggle Before/After to compare the phone shot with the live twin.')
  }

  const placeItem = () => {
    if (!scene) return
    const anchor = scene.objects.find((o) => o.id === selectedId) ?? null
    const center = bounds.getCenter(new THREE.Vector3())
    const proxy = makeProxyObject(
      { title: 'New item (60×60×40 cm)', width_cm: 60, height_cm: 60, depth_cm: 40 },
      anchor,
      [center.x, 0, center.z],
      scene.environment.floorY,
    )
    applyEdit((objects) => [...objects, proxy])
    select(proxy.id)
    pushChat('plop', 'Placed a 60×60×40 cm item — drag it into position, or Replace/Compare to make it a real product.')
  }

  if (seedError) {
    return <div className="editor-error"><p>Demo room failed to initialize: {seedError}</p></div>
  }

  return (
    <div className="editor" data-mode="consumer">
      <header className="editor-header">
        <a href="/" className="brand">PLOP</a>
        <span className="scene-name">WALKTHROUGH · Living Room — free-roam editable twin</span>
        <div className="header-tools">
          <div className="tool-group">
            <button onClick={placeItem} title="Place a new item in the room">+ Place item</button>
          </div>
          <div className="tool-group">
            <button onClick={() => { if (!beforePhoto) captureBefore(); else setShowBefore(!showBefore) }}
              className={showBefore ? 'on' : ''}
              title="Capture an iPhone-style photo of the room and flip between BEFORE (photo) and AFTER (editable 3D twin)">
              📸 {beforePhoto ? (showBefore ? 'After' : 'Before') : 'Before/After'}
            </button>
          </div>
          <div className="tool-group">
            <button className={measureMode ? 'on' : ''} onClick={() => setMeasureMode(!measureMode)}
              title="Measure: click two points">📏</button>
            {measureMode && (
              <button onClick={cycleMeasureUnit} title="Cycle units">{measureUnit}</button>
            )}
            <button className={techView ? 'on' : ''} onClick={() => setTechView(!techView)}
              title="Technical view">{'</>'}</button>
          </div>
          <div className="tool-group">
            <button onClick={undo} title="Undo (⌘Z)">↩</button>
            <button onClick={redo} title="Redo (⇧⌘Z)">↪</button>
          </div>
        </div>
        <div className="header-status">
          <span className="status-pill">real model geometry</span>
          <span className="status-pill subtle">CC-BY scene</span>
        </div>
      </header>
      <div className="editor-main">
        <SceneTree />
        <div className="viewport-wrap">
          {scene && <RoomViewport groups={groups} staticMeshes={staticMeshes} bounds={bounds} />}
          {showBefore && beforePhoto && (
            <div className="beforeafter-overlay" onClick={() => setShowBefore(false)}>
              <span className="beforeafter-tag">BEFORE — iPHONE PHOTO · tap for the 3D twin</span>
              <img src={beforePhoto} alt="Before: phone photo of the room" />
            </div>
          )}
          {!showBefore && beforePhoto && (
            <div className="beforeafter-tag" style={{ position: 'absolute', top: 14, zIndex: 5 }}>
              AFTER — EDITABLE 3D TWIN
            </div>
          )}
          <CommandBar />
        </div>
        {goalJobId
          ? <GoalPanel jobId={goalJobId} onClose={() => setGoalJobId(null)} />
          : techView
            ? <TechnicalPanel onClose={() => setTechView(false)} />
            : shopTarget
              ? <ShopPanel target={shopTarget} onClose={() => setShopTarget(null)} />
              : <Inspector onReplace={setShopTarget} />}
      </div>
      <VoiceBubble />
      {hiveScanQuery != null && (
        <HiveScan initialQuery={hiveScanQuery} onClose={() => setHiveScanQuery(null)} />
      )}
      {selectedId === null && (
        <div className="hint-bar">WASD to walk · drag to look around · scroll to zoom · click an object, then drag it to move</div>
      )}
    </div>
  )
}

export default function Room() {
  return (
    <Suspense fallback={
      <div className="editor-loading">Loading the demo room (22 MB model)…</div>
    }>
      <RoomInner />
    </Suspense>
  )
}
