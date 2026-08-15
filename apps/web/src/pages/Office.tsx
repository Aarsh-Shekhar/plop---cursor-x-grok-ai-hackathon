// Procedural demo office (/office): a walkable editable office twin built the
// same way as /room — the seeded scene doc makes NL commands, undo/redo,
// Goal Mode and @hive swarm research work exactly like a reconstructed scene.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { API_BASE } from '../lib/api'
import { makeProxyObject } from '../lib/candidates'
import { useEditor } from '../state/editor'
import RoomViewport, { groupsToObjects } from '../components/room/RoomViewport'
import { OFFICE_SCENE_ID, useOfficeGroups } from '../components/office/officeBuild'
import SceneTree from '../components/editor/SceneTree'
import FactSheet from '../components/editor/FactSheet'
import Inspector from '../components/editor/Inspector'
import CommandBar from '../components/editor/CommandBar'
import ShopPanel from '../components/editor/ShopPanel'
import HiveScan from '../components/hive/HiveScan'
import GoalPanel from '../components/editor/GoalPanel'
import TechnicalPanel from '../components/editor/TechnicalPanel'
import VoiceBubble from '../components/editor/VoiceBubble'
import type { Scene, SceneObject } from '../lib/types'

export default function Office() {
  const { groups, staticMeshes, bounds } = useOfficeGroups()
  const {
    scene, loadScene, undo, redo, select, selectedId, applyEdit,
    hiveScanQuery, setHiveScanQuery, pushChat,
    goalJobId, setGoalJobId, techView, setTechView,
    measureMode, setMeasureMode, measureUnit, cycleMeasureUnit,
    identifyMode, setIdentifyMode, factSheetId,
  } = useEditor()
  const [shopTarget, setShopTarget] = useState<SceneObject | null>(null)
  const [seedError] = useState<string | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  // the phone capture this twin was built from (generated from a real
  // rendered frame, processed to read as a handheld photo)
  const beforePhoto = '/demo3d/office-photo.png'

  // Build the scene doc from the procedural geometry, seed it to the backend
  // (so /commands and /hive/runs see it), then load it into the store.
  useEffect(() => {
    if (!groups.length) return
    const objects = groupsToObjects(groups, 'office-procedural')
    const doc: Scene = {
      id: OFFICE_SCENE_ID,
      projectId: 'proj_demo_office',
      name: 'Demo Office (3D)',
      mode: 'consumer',
      status: 'ready',
      units: 'm',
      scaleConfidence: 'model',      // procedural geometry — real meters
      capture: {
        imageUri: '', cleanedUri: '', depthUri: '',
        width: 1600, height: 1000, depthMinM: 1, depthMaxM: 8, hfovDeg: 60,
      },
      environment: { floorY: 0, backdrop: 'model' },
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
      if (!inField && e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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
    return <div className="editor-error"><p>Demo office failed to initialize: {seedError}</p></div>
  }

  return (
    <div className="editor" data-mode="consumer">
      <header className="editor-header">
        <a href="/" className="brand">PLOP</a>
        <span className="scene-name">WALKTHROUGH · Office — free-roam editable twin</span>
        <div className="header-tools">
          <div className="tool-group">
            <button onClick={placeItem} title="Place a new item in the office">+ Place item</button>
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
          <span className="status-pill subtle">procedural scene</span>
        </div>
      </header>
      <div className="editor-main">
        <SceneTree />
        <div className={`viewport-wrap ${identifyMode ? 'identify-on' : ''}`}>
          {scene && <RoomViewport groups={groups} staticMeshes={staticMeshes} bounds={bounds} sunlight capturePhoto photoName="office" />}
          {identifyMode && !factSheetId && (
            <div className="identify-hint">🔎 IDENTIFY — hover an object, click for its fact sheet · Esc to exit</div>
          )}
          {factSheetId && <FactSheet />}
          {showBefore && (
            <div className="beforeafter-overlay" onClick={() => setShowBefore(false)}>
              <span className="beforeafter-tag">ORIGINAL PHONE PHOTO · tap for the 3D twin</span>
              <img src={beforePhoto} alt="Original phone photo of the office" />
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
