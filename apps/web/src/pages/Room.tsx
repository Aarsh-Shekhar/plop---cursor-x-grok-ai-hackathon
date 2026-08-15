// Hardcoded photoreal demo room (/room): a real 3D scene you can walk through
// and edit. Objects come from the model's true geometry; the seeded scene doc
// makes NL commands, undo/redo and @hive swarm research work exactly like a
// reconstructed scene.
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { API_BASE } from '../lib/api'
import { useEditor } from '../state/editor'
import RoomViewport, { groupsToObjects } from '../components/room/RoomViewport'
import { useRoomGroups } from '../components/room/roomModel'
import SceneTree from '../components/editor/SceneTree'
import Inspector from '../components/editor/Inspector'
import CommandBar from '../components/editor/CommandBar'
import ShopPanel from '../components/editor/ShopPanel'
import HiveScan from '../components/hive/HiveScan'
import FactSheet from '../components/editor/FactSheet'
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
    identifyMode, setIdentifyMode, factSheetId, setFactSheetId,
  } = useEditor()
  const [shopTarget, setShopTarget] = useState<SceneObject | null>(null)
  const [seedError] = useState<string | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  // the real capture this twin was built from (photoreal source photo)
  const beforePhoto = '/demo3d/room-photo.png'

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
    }).catch(() => loadScene(doc))  // static hosting: no API — run fully client-side
  }, [groups])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).tagName === 'INPUT'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (!inField && e.key === 'Escape') {
        if (useEditor.getState().factSheetId) { setFactSheetId(null); return }
        if (useEditor.getState().identifyMode) { setIdentifyMode(false); return }
        select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Place the hive's standing pick for this room: a real Amazon chair, at its
  // listed dimensions, rendered from the object library — never a gray box.
  const placeItem = () => {
    if (!scene) return
    const center = bounds.getCenter(new THREE.Vector3())
    const floor = scene.environment.floorY
    const obj: SceneObject = {
      id: `obj_new_${Math.random().toString(36).slice(2, 8)}`,
      name: 'Rivet Aiden Accent Chair', label: 'armchair', category: 'seating', score: 1,
      // faces the coffee-table cluster like the rest of the seating
      transform: { position: [center.x + 0.4, floor + 0.4, center.z + 0.6], rotationY: Math.PI, scale: [1, 1, 1] },
      dimensions: { width: 0.69, height: 0.8, depth: 0.75, source: 'manufacturer-spec', confidence: 0.95 },
      geometry: { kind: 'library' as any, source: 'hive-pick', libraryKey: 'armchair' } as any,
      appearance: { material: { type: 'original' }, dominantColors: [] },
      perception: { confidence: 1, floorStanding: true },
      semantic: {
        description: 'Hive pick for this room',
        productMatches: [{
          title: 'Rivet Aiden Mid-Century Modern Tufted Leather Accent Chair',
          price_usd: 389.99, url: 'https://www.amazon.com/dp/B073W7RNJZ', retailer: 'Amazon',
          width_cm: 69, height_cm: 80, depth_cm: 75, rating: 4.5,
        }],
      },
      technical: {},
      state: { hidden: false, locked: false },
    }
    applyEdit((objects) => [...objects, obj])
    select(obj.id)
    pushChat('hive', 'Placed the hive pick: Rivet Aiden Tufted Leather Accent Chair — $389.99 on Amazon, listed 69×80×75 cm applied. Drag it into position.')
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
            <button onClick={() => setShowBefore(!showBefore)}
              className={showBefore ? 'on' : ''}
              title="Flip between the original phone photo and the editable 3D twin built from it">
              📸 {showBefore ? 'Back to 3D twin' : 'Original photo'}
            </button>
          </div>
          <div className="tool-group">
            <button className={`identify-btn ${identifyMode ? 'on' : ''}`}
              onClick={() => { setIdentifyMode(!identifyMode); setMeasureMode(false) }}
              title="Identify: neon cursor — hover any object, click for its fact sheet">🔎 identify</button>
            <button className={measureMode ? 'on' : ''} onClick={() => { setMeasureMode(!measureMode); setIdentifyMode(false) }}
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
        <div className={`viewport-wrap ${identifyMode ? 'identify-on' : ''}`}>
          {scene && <RoomViewport groups={groups} staticMeshes={staticMeshes} bounds={bounds} capturePhoto />}
          {identifyMode && !factSheetId && (
            <div className="identify-hint">🔎 IDENTIFY — hover an object, click for its fact sheet · Esc to exit</div>
          )}
          {factSheetId && <FactSheet />}
          {showBefore && (
            <div className="beforeafter-overlay" onClick={() => setShowBefore(false)}>
              <span className="beforeafter-tag">ORIGINAL PHONE PHOTO · tap for the 3D twin</span>
              <img src={beforePhoto} alt="Original phone photo of the room" />
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
