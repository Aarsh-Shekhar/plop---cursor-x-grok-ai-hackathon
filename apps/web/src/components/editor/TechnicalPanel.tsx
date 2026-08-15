// Technical View: the machine-readable guts — scene graph with derived
// spatial relations, reconstruction/geometry stats, and the last agent run.
import { useEffect, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { useEditor } from '../../state/editor'

interface Graph {
  objectCount: number
  scaleConfidence: string
  tree: Record<string, { id: string; name: string; dims_cm: number[]; dimSource: string; confidence: number }[]>
  relations: { from: string; rel: string; to: string; detail: string }[]
}

export default function TechnicalPanel({ onClose }: { onClose: () => void }) {
  const { scene, lastGoalRun } = useEditor()
  const [graph, setGraph] = useState<Graph | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!scene) return
    fetch(`${API_BASE}/api/scenes/${scene.id}/graph`)
      .then(async (r) => { if (!r.ok) throw new Error(r.statusText); setGraph(await r.json()) })
      .catch((e) => setError(e.message))
  }, [scene?.id, scene?.objects])

  const goal = lastGoalRun as any
  const triangles = scene ? scene.objects.length * 900 : 0  // coarse editor estimate

  return (
    <div className="panel inspector tech-panel">
      <div className="panel-header">
        <span>{'</>'} Technical View</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {scene && (
          <div className="insp-section">
            <div className="insp-section-title">Scene</div>
            <div className="insp-field"><span className="insp-label">Objects indexed</span><span className="insp-value">{scene.objects.filter(o => !o.state.hidden).length}</span></div>
            <div className="insp-field"><span className="insp-label">Scale</span><span className="insp-value">{scene.scaleConfidence}</span></div>
            <div className="insp-field"><span className="insp-label">Units</span><span className="insp-value">meters</span></div>
            <div className="insp-field"><span className="insp-label">Geometry (approx)</span><span className="insp-value">~{(triangles / 1000).toFixed(0)}k triangles</span></div>
            <div className="insp-field"><span className="insp-label">Mode</span><span className="insp-value">{scene.mode}</span></div>
          </div>
        )}

        {goal?.result && (
          <div className="insp-section">
            <div className="insp-section-title">Last agent run</div>
            <div className="insp-field"><span className="insp-label">Objects analyzed</span><span className="insp-value">{goal.result.analysis?.objects}</span></div>
            <div className="insp-field"><span className="insp-label">Relations</span><span className="insp-value">{goal.result.analysis?.relations}</span></div>
            <div className="insp-field"><span className="insp-label">Candidates kept</span><span className="insp-value">{goal.result.options?.length}</span></div>
            <div className="insp-field"><span className="insp-label">Rejected</span><span className="insp-value">{goal.result.analysis?.rejected} (collision/bounds)</span></div>
            <div className="insp-field"><span className="insp-label">Products researched</span><span className="insp-value">{goal.result.products?.length ?? 0}</span></div>
          </div>
        )}

        {error && <div className="error-note">{error}</div>}

        {graph && (
          <>
            <div className="insp-section">
              <div className="insp-section-title">Scene graph ({graph.objectCount} nodes)</div>
              {Object.entries(graph.tree).map(([cat, items]) => (
                <div key={cat} className="tech-tree-group">
                  <div className="tree-group-label">{cat}</div>
                  {items.map((it) => (
                    <div key={it.id} className="tech-node">
                      <span className="tech-node-name">{it.name}</span>
                      <span className="tech-node-dims">
                        {it.dims_cm.join('×')} cm <em className="insp-tag">{it.dimSource}</em>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="insp-section">
              <div className="insp-section-title">Relations ({graph.relations.length})</div>
              <div className="tech-rels">
                {graph.relations.slice(0, 40).map((r, i) => (
                  <div key={i} className="tech-rel">
                    <b>{r.from}</b> <span className="tech-rel-kind">{r.rel}</span> <b>{r.to}</b>
                    {r.detail && <span className="tech-rel-detail"> · {r.detail}</span>}
                  </div>
                ))}
                {graph.relations.length > 40 && (
                  <div className="empty-note">…and {graph.relations.length - 40} more</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
