// Goal Mode agent panel: live tool-call log, ranked options with PASS/FAIL
// constraint checks and score breakdowns, hive product results with fit
// reports, one-click apply, and a "what changed" diff.
import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { makeProxyObject } from '../../lib/candidates'
import { matchLibrary } from '../../lib/objectLibrary'
import { useEditor } from '../../state/editor'

interface Check { label: string; passed: boolean; hard: boolean; detail: string; preexisting?: boolean }
interface Option {
  id: string; label: string; note: string; score: number
  transforms: Record<string, [number, number, number]>
  checks: Check[]
  breakdown: Record<string, string>
}
interface GoalResult {
  objective: { objective_summary: string }
  options: Option[]
  products: any[]
  recommendedId: string | null
  rationale: string
  analysis: Record<string, number>
}
interface GoalJob {
  id: string; status: string; goal: string
  steps: { t: number; text: string }[]
  result: GoalResult | null
  error: string | null
}

export default function GoalPanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { scene, applyEdit, pushChat, select, setLastGoalRun } = useEditor()
  const [job, setJob] = useState<GoalJob | null>(null)
  const [appliedId, setAppliedId] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ name: string; dist: number }[] | null>(null)

  useEffect(() => {
    let live = true
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/goal-jobs/${jobId}`)
        if (r.ok) {
          const data = await r.json()
          if (!live) return
          setJob(data)
          if (data.status !== 'running') { setLastGoalRun(data); return }
        }
      } catch { /* transient; keep polling */ }
      if (live) setTimeout(poll, 1500)
    }
    poll()
    return () => { live = false }
  }, [jobId])

  const options = job?.result?.options ?? []
  const products = job?.result?.products ?? []
  const recommended = job?.result?.recommendedId

  const apply = (opt: Option) => {
    if (!scene) return
    const before = new Map(scene.objects.map((o) => [o.id, [...o.transform.position]] as const))
    applyEdit((objects) => objects.map((o) => {
      const t = opt.transforms[o.id]
      return t ? { ...o, transform: { ...o.transform, position: t } } : o
    }))
    setAppliedId(opt.id)
    const moved = Object.keys(opt.transforms)
      .map((id) => {
        const o = scene.objects.find((x) => x.id === id)
        const b = before.get(id)
        if (!o || !b) return null
        const t = opt.transforms[id]
        const dist = Math.hypot(t[0] - b[0], t[2] - b[2])
        return dist > 0.02 ? { name: o.name, dist } : null
      })
      .filter((x): x is { name: string; dist: number } => !!x)
    setDiff(moved)
    pushChat('plop', `Applied ${opt.label} — ${moved.length} objects moved. Undo with ⌘Z.`)
  }

  const previewProduct = (p: any) => {
    if (!scene) return
    const lib = matchLibrary(p.title ?? '')
    const proxy = makeProxyObject(
      { title: p.title, price_usd: p.price_usd ?? undefined, url: p.url,
        width_cm: p.width_cm, height_cm: p.height_cm, depth_cm: p.depth_cm, why: p.reviews_summary },
      null, [0, 0, 0], scene.environment.floorY,
    )
    if (lib) {
      proxy.geometry = { kind: 'library' as any, source: 'hive-product', libraryKey: lib.key } as any
      proxy.category = lib.category
    }
    applyEdit((objects) => [...objects, proxy])
    select(proxy.id)
    pushChat('plop', `Previewing "${(p.title ?? '').slice(0, 50)}" at listed dimensions.`)
  }

  const stepLines = useMemo(() => (job?.steps ?? []).map((s) => s.text), [job])

  return (
    <div className="panel inspector goal-panel">
      <div className="panel-header">
        <span>◎ Goal Agent</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {job && <div className="goal-text">“{job.goal}”</div>}

        {/* agent run log */}
        <div className="insp-section">
          <div className="insp-section-title">
            Agent run {job?.status === 'running' && <span className="goal-spin">⟳</span>}
          </div>
          <div className="agent-log">
            {stepLines.map((t, i) => (
              <div key={i} className="agent-step">
                <span className="agent-dot" />{t}
              </div>
            ))}
            {job?.status === 'failed' && (
              <div className="error-note">{job.error}</div>
            )}
          </div>
        </div>

        {/* ranked options */}
        {options.map((opt) => (
          <div key={opt.id}
            className={`goal-option ${opt.id === recommended ? 'recommended' : ''} ${opt.id === appliedId ? 'applied' : ''}`}>
            <div className="goal-option-head">
              <b>{opt.label}</b>
              <span className="goal-score">{opt.score}<em>/100</em></span>
            </div>
            <div className="goal-note">{opt.note}</div>
            <div className="goal-checks">
              {opt.checks.map((c, i) => (
                <div key={i} className={`goal-check ${c.passed ? 'ok' : c.preexisting ? 'pre' : 'bad'}`}
                  title={c.detail}>
                  {c.passed ? '✓' : c.preexisting ? '◦' : '✕'} {c.label}
                  <span className="goal-check-detail">{c.detail}</span>
                </div>
              ))}
            </div>
            <div className="goal-breakdown">
              {Object.entries(opt.breakdown).map(([k, v]) => (
                <span key={k}>{k} <b>{v}</b></span>
              ))}
            </div>
            <button className="btn primary full" onClick={() => apply(opt)}
              disabled={opt.id === appliedId}>
              {opt.id === appliedId ? 'Applied ✓' : Object.keys(opt.transforms).length
                ? `Apply (${Object.keys(opt.transforms).length} moves)` : 'Keep current'}
            </button>
          </div>
        ))}

        {/* what changed */}
        {diff && diff.length > 0 && (
          <div className="insp-section">
            <div className="insp-section-title">What changed</div>
            {diff.map((d, i) => (
              <div key={i} className="insp-field">
                <span className="insp-label">{d.name}</span>
                <span className="insp-value">moved {(d.dist * 100).toFixed(0)} cm</span>
              </div>
            ))}
          </div>
        )}

        {/* researched products */}
        {products.length > 0 && (
          <div className="insp-section">
            <div className="insp-section-title">Hive research ({products.length})</div>
            {products.map((p, i) => (
              <div key={i} className="listing">
                <div className="listing-title">
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title} ↗</a> : p.title}
                </div>
                <div className="listing-meta">
                  {p.price_usd != null && <span className="price">${p.price_usd}</span>}
                  <span>{p.retailer}</span>
                  {p.width_cm != null && <span>{p.width_cm}×{p.height_cm ?? '?'} cm</span>}
                </div>
                {p.fit && (
                  <div className={`fit-tag ${p.fit.fits ? 'ok' : 'bad'}`}>
                    {p.fit.fits
                      ? `fits — ${p.fit.clearance_cm} cm clearance to ${p.fit.nearest}`
                      : p.fit.in_room ? `does not fit — ${Math.abs(p.fit.clearance_cm)} cm short vs ${p.fit.nearest}` : 'does not fit in room'}
                  </div>
                )}
                <div className="listing-actions">
                  <button className="btn primary" onClick={() => previewProduct(p)}>Preview in scene</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* rationale */}
        {job?.result?.rationale && (
          <div className="insp-section">
            <div className="insp-section-title">Recommendation</div>
            <div className="goal-rationale">{job.result.rationale}</div>
          </div>
        )}
      </div>
    </div>
  )
}
