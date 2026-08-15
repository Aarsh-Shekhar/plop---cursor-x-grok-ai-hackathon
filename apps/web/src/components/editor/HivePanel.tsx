// Live status of the Hive run started from PLOP + the return path:
// when the swarm finishes, results are parsed into structured candidates
// the user can preview inside the scene at true (or clearly-approximate) scale.
import { useEffect, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { makeProxyObject, type Candidate } from '../../lib/candidates'
import { useEditor } from '../../state/editor'

interface HiveRun {
  id: string
  status: string
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
}

export default function HivePanel({ runId, hiveUrl, onClose }: {
  runId: string
  hiveUrl: string
  onClose: () => void
}) {
  const { scene, selectedId, applyEdit, select, pushChat } = useEditor()
  const [run, setRun] = useState<HiveRun | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [summary, setSummary] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/hive/runs/${runId}`)
        if (!r.ok) return
        const data = await r.json()
        if (live) setRun(data)
        if (live && ['completed', 'failed', 'cancelled'].includes(data.status)) return
      } catch { /* backend may be busy; keep polling */ }
      if (live) setTimeout(poll, 3000)
    }
    poll()
    return () => { live = false }
  }, [runId])

  const extract = async () => {
    setExtracting(true)
    setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/hive/runs/${runId}/extract-candidates`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
      const data = await r.json()
      setCandidates(data.candidates)
      setSummary(data.summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const preview = (c: Candidate) => {
    if (!scene) return
    const anchor = scene.objects.find((o) => o.id === selectedId) ?? null
    const mid = -(scene.capture.depthMinM + scene.capture.depthMaxM) / 2
    const proxy = makeProxyObject(c, anchor, [0, scene.environment.floorY + 0.4, mid])
    applyEdit((objects) => [...objects, proxy])
    select(proxy.id)
    pushChat('plop', `Previewing "${c.title.slice(0, 50)}" — ${c.width_cm != null ? 'listed dimensions' : 'approximate size'}. Undo with ⌘Z.`)
  }

  const done = run && ['completed', 'failed', 'cancelled'].includes(run.status)

  return (
    <div className="shop-panel hive-panel">
      <div className="panel-header">
        <span>⬡ Hive run</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="hive-run-status">
        <span className={`hive-status-dot ${run?.status ?? 'queued'}`} />
        <span>{run ? `${run.status} — ${run.completed_jobs}/${run.total_jobs || '?'} workers done` : 'connecting…'}</span>
        <a className="btn" href={hiveUrl} target="plop-hive" rel="noreferrer"
          onClick={(e) => { e.preventDefault(); window.open(hiveUrl, 'plop-hive', 'width=1440,height=920') }}>
          Open Hive UI
        </a>
      </div>
      <div className="shop-body">
        {!done && <div className="empty-note">The swarm is working. Watch it live in the Hive window — results return here.</div>}
        {done && !candidates && (
          <button className="btn primary full" onClick={extract} disabled={extracting}>
            {extracting ? 'Parsing results…' : 'Pull results into PLOP'}
          </button>
        )}
        {error && <div className="error-note">{error}</div>}
        {summary && <div className="shop-notes">{summary}</div>}
        {candidates?.map((c, i) => (
          <div key={i} className="listing">
            <div className="listing-title">
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
            </div>
            <div className="listing-meta">
              {c.price_usd != null && <span className="price">${c.price_usd}</span>}
              {c.source && <span>{c.source}</span>}
              {c.width_cm != null && <span>{c.width_cm}×{c.height_cm ?? '?'} cm</span>}
            </div>
            {c.why && <div className="listing-why">{c.why}</div>}
            <div className="listing-actions">
              <button className="btn primary" onClick={() => preview(c)}>Preview in scene</button>
            </div>
          </div>
        ))}
        {candidates && candidates.length === 0 && (
          <div className="empty-note">No concrete product candidates in the run output.</div>
        )}
      </div>
    </div>
  )
}
