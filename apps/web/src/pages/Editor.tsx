// The main PLOP editor: header, scene tree, viewport, inspector, command bar.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getScene } from '../lib/api'
import { useEditor } from '../state/editor'
import Viewport from '../components/editor/Viewport'
import SceneTree from '../components/editor/SceneTree'
import Inspector from '../components/editor/Inspector'
import CommandBar from '../components/editor/CommandBar'
import ShopPanel from '../components/editor/ShopPanel'
import HivePanel from '../components/editor/HivePanel'
import type { SceneObject } from '../lib/types'

export default function Editor() {
  const { sceneId } = useParams()
  const {
    scene, loadScene, mode, setMode, undo, redo, setToolMode, toolMode,
    setCameraPreset, airflow, setAirflow, clearance, setClearance, select, selectedId,
    hiveRun, setHiveRun,
  } = useEditor()
  const [error, setError] = useState<string | null>(null)
  const [shopTarget, setShopTarget] = useState<SceneObject | null>(null)

  useEffect(() => {
    if (!sceneId) return
    getScene(sceneId).then(loadScene).catch((e) => setError(e.message))
  }, [sceneId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (inField) return
      if (e.key === 'Escape') select(null)
      if (e.key === 'g') setToolMode('translate')
      if (e.key === 'r') setToolMode('rotate')
      if (e.key === 's') setToolMode('scale')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  if (error) {
    return (
      <div className="editor-error">
        <p>Could not load this scene: {error}</p>
        <Link to="/projects" className="btn">Back to projects</Link>
      </div>
    )
  }
  if (!scene) return <div className="editor-loading">Loading scene…</div>

  return (
    <div className="editor" data-mode={mode}>
      <header className="editor-header">
        {/* full page load on exit: tears down the WebGL context so long
            editor sessions can't degrade the rest of the site's compositing */}
        <a href="/projects" className="brand">PLOP</a>
        <span className="scene-name">{scene.name}</span>
        <div className="mode-switch" role="tablist">
          <button role="tab" aria-selected={mode === 'consumer'}
            className={mode === 'consumer' ? 'on' : ''}
            onClick={() => setMode('consumer')}>Consumer</button>
          <button role="tab" aria-selected={mode === 'founder'}
            className={mode === 'founder' ? 'on' : ''}
            onClick={() => setMode('founder')}>Founder</button>
        </div>

        <div className="header-tools">
          <div className="tool-group">
            <button className={toolMode === 'translate' ? 'on' : ''} title="Move (G)"
              onClick={() => setToolMode('translate')}>Move</button>
            <button className={toolMode === 'rotate' ? 'on' : ''} title="Rotate (R)"
              onClick={() => setToolMode('rotate')}>Rotate</button>
            <button className={toolMode === 'scale' ? 'on' : ''} title="Scale (S)"
              onClick={() => setToolMode('scale')}>Scale</button>
          </div>
          <div className="tool-group">
            <button onClick={() => setCameraPreset('default')} title="Reset camera">⌂</button>
            <button onClick={() => setCameraPreset('top')} title="Top view">Top</button>
            <button onClick={() => setCameraPreset('front')} title="Front view">Front</button>
            <button onClick={() => setCameraPreset('side')} title="Side view">Side</button>
          </div>
          {mode === 'founder' && (
            <div className="tool-group">
              <button className={airflow ? 'on' : ''} onClick={() => setAirflow(!airflow)}
                title="Approximate airflow visualization — not CFD">
                Airflow{airflow && <em className="approx-tag">approx</em>}
              </button>
              <button className={clearance ? 'on' : ''} onClick={() => setClearance(!clearance)}
                title="Highlight overlapping components">Clearance</button>
            </div>
          )}
          <div className="tool-group">
            <button onClick={undo} title="Undo (⌘Z)">↩</button>
            <button onClick={redo} title="Redo (⇧⌘Z)">↪</button>
          </div>
        </div>

        <div className="header-status">
          {scene.stats && (
            <span className="status-pill" title="Fraction of the capture that is indexed — not a geometry accuracy claim">
              {scene.stats.coveragePct}% scene coverage
            </span>
          )}
          <span className="status-pill subtle" title="Scale from monocular metric depth + assumed FOV">
            scale: {scene.scaleConfidence}
          </span>
        </div>
      </header>

      <div className="editor-main">
        <SceneTree />
        <div className="viewport-wrap">
          <Viewport scene={scene} />
          {mode === 'founder' && airflow && (
            <div className="overlay-note">Approximate airflow — heuristic visualization, not CFD</div>
          )}
          <CommandBar />
        </div>
        {hiveRun
          ? <HivePanel runId={hiveRun.runId} hiveUrl={hiveRun.hiveUrl} onClose={() => setHiveRun(null)} />
          : shopTarget
            ? <ShopPanel target={shopTarget} onClose={() => setShopTarget(null)} />
            : <Inspector onReplace={setShopTarget} />}
      </div>
      {selectedId === null && scene.objects.length > 0 && (
        <div className="hint-bar">Drag to orbit · scroll to zoom · click an object to select it, then drag it to move · shift-drag lifts</div>
      )}
    </div>
  )
}
