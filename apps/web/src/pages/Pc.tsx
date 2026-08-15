// Hardcoded PC rig demo (/pc): an intricate ATX build at true spec
// dimensions in the Founder workspace — component tree, technical inspector,
// exploded view, spinning fans, approximate airflow, and the hive swarm
// pointed at PC-part retailers.
import { useEffect, useState } from 'react'
import { API_BASE } from '../lib/api'
import { useEditor } from '../state/editor'
import PCViewport, { pcComponentsToObjects } from '../components/pc/PCViewport'
import { PC_RETAILERS } from '../components/pc/pcBuild'
import SceneTree from '../components/editor/SceneTree'
import Inspector from '../components/editor/Inspector'
import CommandBar from '../components/editor/CommandBar'
import ShopPanel from '../components/editor/ShopPanel'
import HiveScan from '../components/hive/HiveScan'
import FactSheet from '../components/editor/FactSheet'
import GoalPanel from '../components/editor/GoalPanel'
import TechnicalPanel from '../components/editor/TechnicalPanel'
import VoiceBubble from '../components/editor/VoiceBubble'
import type { Scene, SceneObject } from '../lib/types'

const PC_SCENE_ID = 'scene_demo_pc'

export default function Pc() {
  const {
    scene, loadScene, undo, redo, select, selectedId,
    hiveScanQuery, setHiveScanQuery,
    goalJobId, setGoalJobId, techView, setTechView,
    measureMode, setMeasureMode, measureUnit, cycleMeasureUnit,
    identifyMode, setIdentifyMode, factSheetId,
  } = useEditor()
  const [shopTarget, setShopTarget] = useState<SceneObject | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [explode, setExplode] = useState(0)
  const [airflow, setAirflow] = useState(false)

  useEffect(() => {
    const objects = pcComponentsToObjects()
    const doc: Scene = {
      id: PC_SCENE_ID,
      projectId: 'proj_demo_pc',
      name: 'Reference ATX Build',
      mode: 'founder',
      status: 'ready',
      units: 'm',
      scaleConfidence: 'model',
      capture: {
        imageUri: '/demo3d/room-photo.png', cleanedUri: '/demo3d/room-photo.png',
        depthUri: '/demo3d/room-photo.png',
        width: 1600, height: 1000, depthMinM: 0.2, depthMaxM: 1.2, hfovDeg: 45,
      },
      environment: { floorY: -0.235, backdrop: 'model' },
      objects,
    }
    fetch(`${API_BASE}/api/scenes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
      loadScene(doc)
    }).catch((e) => setSeedError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA'
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

  if (seedError) {
    return <div className="editor-error"><p>PC demo failed to initialize: {seedError}</p></div>
  }

  return (
    <div className="editor" data-mode="founder">
      <header className="editor-header">
        <a href="/" className="brand">PLOP</a>
        <span className="scene-name">Reference ATX Build — component digital twin</span>
        <div className="header-tools">
          <div className="tool-group" style={{ alignItems: 'center', padding: '0 10px', gap: 8, display: 'flex' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>exploded</span>
            <input
              type="range" min={0} max={1} step={0.01} value={explode}
              onChange={(e) => setExplode(parseFloat(e.target.value))}
              style={{ width: 110 }}
            />
          </div>
          <div className="tool-group">
            <a className="btn" href="/datacenter" style={{ border: 'none' }}
              title="Zoom out: this server inside a walkable datacenter">🏢 datacenter</a>
          </div>
          <div className="tool-group">
            <button className={airflow ? 'on' : ''} onClick={() => setAirflow(!airflow)}
              title="Approximate airflow — heuristic visualization, not CFD">
              Airflow{airflow && <em className="approx-tag">approx</em>}
            </button>
          </div>
          <div className="tool-group">
            <button className={`identify-btn ${identifyMode ? 'on' : ''}`}
              onClick={() => { setIdentifyMode(!identifyMode); setMeasureMode(false) }}
              title="Identify: neon cursor — hover any component, click for its fact sheet">🔎 identify</button>
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
          <span className="status-pill">spec dimensions</span>
          <span className="status-pill subtle">reference build</span>
        </div>
      </header>
      <div className="editor-main">
        <SceneTree />
        <div className={`viewport-wrap ${identifyMode ? 'identify-on' : ''}`}>
          {scene && <PCViewport explode={explode} airflow={airflow} />}
          {identifyMode && !factSheetId && (
            <div className="identify-hint">🔎 IDENTIFY — hover a component, click for its fact sheet · Esc to exit</div>
          )}
          {factSheetId && <FactSheet />}
          {airflow && (
            <div className="overlay-note">Approximate airflow — heuristic visualization, not CFD</div>
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
        <HiveScan initialQuery={hiveScanQuery} onClose={() => setHiveScanQuery(null)}
          retailers={PC_RETAILERS} />
      )}
      {selectedId === null && (
        <div className="hint-bar">Drag to orbit · scroll to zoom · click a component, then drag to pull it out · exploded slider up top</div>
      )}
    </div>
  )
}
