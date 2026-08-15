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
