// @hive swarm — original Hive UI: a dark honey field of drifting hexagon
// workers, "Deploy Workers" panel, swarm stats, and a "Hive Needs Input" dock
// where a specific bee asks the user a question chat-style. Functionality is
// the per-retailer scan swarm: each worker does a domain-locked live web
// search and returns a clickable product with price/rating/match %, placeable
// in the 3D scene at listed dimensions.
import { useMemo, useRef, useState, useEffect } from 'react'
import '../../hive.css'
import { API_BASE } from '../../lib/api'
import { makeProxyObject } from '../../lib/candidates'
import { useEditor } from '../../state/editor'

const RETAILERS: { name: string; domain: string; emoji: string }[] = [
  { name: 'Amazon', domain: 'amazon.com', emoji: '📦' },
  { name: 'Wayfair', domain: 'wayfair.com', emoji: '🛋' },
  { name: 'IKEA', domain: 'ikea.com', emoji: '🪑' },
  { name: 'Target', domain: 'target.com', emoji: '🎯' },
  { name: 'Walmart', domain: 'walmart.com', emoji: '🛒' },
  { name: 'West Elm', domain: 'westelm.com', emoji: '🏠' },
  { name: 'CB2', domain: 'cb2.com', emoji: '✨' },
  { name: 'Pottery Barn', domain: 'potterybarn.com', emoji: '🏺' },
  { name: 'Etsy', domain: 'etsy.com', emoji: '🧶' },
]

// scattered field positions (%) — organic honeycomb spread like the OG UI
const HEX_POS: { left: number; top: number }[] = [
  { left: 30, top: 4 },  { left: 52, top: 12 }, { left: 74, top: 3 },
  { left: 41, top: 36 }, { left: 63, top: 44 }, { left: 84, top: 32 },
  { left: 30, top: 66 }, { left: 53, top: 72 }, { left: 76, top: 63 },
]

const GHOSTS: { left: number; top: number; delay?: number }[] = [
  { left: 24, top: 22 }, { left: 91, top: 16 }, { left: 46, top: 58 },
  { left: 88, top: 52 }, { left: 35, top: 88 }, { left: 68, top: 90 },
  { left: 95, top: 78 }, { left: 27, top: 45 },
]

type CellStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed'

interface ScanResult {
  found: boolean
  title: string
  price_usd: number | null
  url: string
  rating: number | null
  reviews_summary: string
  match_confidence: number
  width_cm: number | null
  height_cm: number | null
  depth_cm: number | null
  note: string
}

interface Cell {
  status: CellStatus
  result?: ScanResult
  error?: string
  answered?: boolean   // user already clarified this worker once
}

export default function HiveScan({ initialQuery, onClose }: {
  initialQuery: string
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [cells, setCells] = useState<Map<string, Cell>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const runIdRef = useRef(0)
  const autoRan = useRef(false)
  const { scene, selectedId, applyEdit, select, pushChat } = useEditor()

  const setCell = (name: string, cell: Cell) =>
    setCells((m) => new Map(m).set(name, cell))

  const scanOne = async (r: { name: string; domain: string }, useQuery: string, runId: number, answered = false) => {
    setCell(r.name, { status: 'running', answered })
    try {
      const res = await fetch(`${API_BASE}/api/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: useQuery, retailer: r.name, domain: r.domain }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const result: ScanResult = await res.json()
      if (runIdRef.current !== runId) return
      setCell(r.name, { status: result.found ? 'completed' : 'failed', result, answered })
    } catch (e) {
      if (runIdRef.current !== runId) return
      setCell(r.name, { status: 'failed', error: String(e), answered })
    }
  }

  const deploy = async (q?: string) => {
    const useQuery = (q ?? query).trim()
    if (!useQuery || scanning) return
    const runId = ++runIdRef.current
    setScanning(true)
    setExpanded(null)
    const init = new Map<string, Cell>()
    RETAILERS.forEach((r) => init.set(r.name, { status: 'queued' }))
    setCells(init)
    await Promise.all(
      RETAILERS.map(async (r, i) => {
        // stagger takeoff so the swarm visibly deploys
        await new Promise((res) => setTimeout(res, i * 350))
        if (runIdRef.current !== runId) return
        await scanOne(r, useQuery, runId)
      }),
    )
    if (runIdRef.current === runId) setScanning(false)
  }

  // a worker asks for input, the user answers, that bee re-flies
  const answerWorker = (name: string) => {
    const guidance = (answers[name] ?? '').trim()
    if (!guidance) return
    const r = RETAILERS.find((x) => x.name === name)!
    setAnswers((a) => ({ ...a, [name]: '' }))
    scanOne(r, `${query.trim()}. User guidance for this store: ${guidance}`, runIdRef.current, true)
  }

  useEffect(() => {
    if (initialQuery.trim() && !autoRan.current) {
      autoRan.current = true
      deploy(initialQuery)
    }
  }, [])

  const placeInScene = (r: ScanResult) => {
    if (!scene) return
    const anchor = scene.objects.find((o) => o.id === selectedId) ?? null
    const proxy = makeProxyObject(
      { title: r.title, price_usd: r.price_usd ?? undefined, url: r.url,
        width_cm: r.width_cm, height_cm: r.height_cm, depth_cm: r.depth_cm,
        why: r.reviews_summary },
      anchor, [0, 0, -2.5], scene.environment.floorY,
    )
    applyEdit((objects) => [...objects, proxy])
    select(proxy.id)
    pushChat('plop', `Placed "${r.title.slice(0, 50)}" — ${r.width_cm != null ? 'listed dimensions' : 'approximate size'}. Undo with ⌘Z.`)
    onClose()
  }

  const stats = useMemo(() => {
    const list = [...cells.values()]
    const found = list.filter((c) => c.status === 'completed' && c.result?.found)
    const prices = found.map((c) => c.result!.price_usd).filter((p): p is number => p != null)
    return {
      total: list.length,
      running: list.filter((c) => c.status === 'running').length,
      found: found.length,
      failed: list.filter((c) => c.status === 'failed').length,
      bestPrice: prices.length ? Math.min(...prices) : null,
    }
  }, [cells])

  // workers that need the user's input: no match, or a weak one, not yet answered
  const questions = useMemo(() => {
    const out: { name: string; question: string }[] = []
    for (const [name, c] of cells) {
      if (c.answered || c.status === 'running' || c.status === 'queued') continue
      const r = c.result
      if (c.status === 'failed' || (r && r.found && r.match_confidence < 0.45)) {
        const why = r?.note || c.error || 'no close match surfaced'
        out.push({
          name,
          question: r && r.found
            ? `My best find at ${name} is only a ${Math.round((r.match_confidence) * 100)}% match ("${r.title.slice(0, 60)}"). Should I keep it, or search this store differently? Tell me what to try.`
            : `I couldn't find a solid match at ${name} — ${why}. How should I adjust the search for this store? (e.g. different size, material, or budget)`,
        })
      }
    }
    return out
  }, [cells])

  const best = useMemo(() => {
    let bestEntry: { name: string; r: ScanResult } | null = null
    let bestScore = -1
    for (const [name, c] of cells) {
      if (c.status === 'completed' && c.result?.found) {
        const score = c.result.match_confidence * 2 + (c.result.rating ?? 3) / 5 +
          (c.result.price_usd != null ? 0.5 : 0)
        if (score > bestScore) { bestScore = score; bestEntry = { name, r: c.result } }
      }
    }
    return bestEntry
  }, [cells])

  const expandedCell = expanded ? cells.get(expanded) : null
  const expandedIdx = expanded ? RETAILERS.findIndex((r) => r.name === expanded) : -1

  return (
    <div className="hive-root" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div className="honeycomb-bg" />
      <div className="hive-spotlight" />
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="honey-particle" style={{ left: `${(i * 71) % 100}%`, bottom: `${(i * 37) % 40}%`, animationDelay: `${i * 0.7}s` }} />
      ))}
      {GHOSTS.map((g, i) => (
        <div key={i} className="hv-ghost-hex" style={{
          left: `${g.left}%`, top: `${g.top}%`,
          animation: `hex-drift-${['a', 'b', 'c'][i % 3]} ${7 + (i % 4)}s ease-in-out infinite`,
          animationDelay: `${g.delay ?? i * 0.6}s`,
        }} />
      ))}

      {/* header */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px' }}>
        <div className="hex-badge animate-honey-glow" style={{ width: 40, height: 36, background: 'linear-gradient(135deg,#d4940a,#e8a317)', fontSize: 18 }}>⬡</div>
        <span className="text-golden" style={{ fontSize: 24, fontWeight: 900 }}>Hive</span>
        <span className="hv-chip">swarm intelligence</span>
        <span style={{ flex: 1 }} />
        <button className="hv-btn" style={{ background: 'transparent', color: 'var(--hv-muted)', border: '1px solid var(--hv-border)' }} onClick={onClose}>
          ← back to plop
        </button>
      </div>

      {/* left column: deploy + stats + swarm */}
      <div className="hv-side">
        <div className="glass-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="hex-badge" style={{ width: 26, height: 24, background: 'linear-gradient(135deg,#d4940a,#e8a317)', fontSize: 12 }}>🐝</span>
            <span style={{ fontWeight: 800, color: 'var(--hv-fg)', fontSize: 14 }}>Deploy Workers</span>
          </div>
          <textarea
            placeholder={'describe the item —\ne.g. light gray linen square throw pillow 45x45 cm'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) deploy() }}
          />
          <button className="hv-btn animate-honey-glow" style={{ width: '100%', marginTop: 10 }}
            onClick={() => deploy()} disabled={scanning || !query.trim()}>
            {scanning ? 'workers deployed…' : '🐝 Deploy Swarm'}
          </button>
        </div>

        {cells.size > 0 && (
          <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>
            <span><b style={{ color: 'var(--hv-fg)', fontSize: 17 }}>{stats.total}</b> <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>TOTAL</span></span>
            <span style={{ color: 'var(--hv-success)' }}>✓ <b>{stats.found}</b> <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>FOUND</span></span>
            <span style={{ color: 'var(--hv-error)' }}>✕ <b>{stats.failed}</b> <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>NO MATCH</span></span>
            {stats.bestPrice != null && (
              <span style={{ color: 'var(--hv-warning)' }}>◆ <b>${stats.bestPrice.toLocaleString()}</b> <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>BEST</span></span>
            )}
          </div>
        )}

        {cells.size > 0 && (
          <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, color: 'var(--hv-fg)', fontSize: 13 }}>⬡ SWARM</span>
            <span className="hv-chip">{stats.running} buzzing</span>
            {best && <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>👑 {best.name}</span>}
          </div>
        )}
      </div>

      {/* hex worker field */}
      <div className="hv-field" style={{ left: 340, right: 0, top: 70, bottom: 0 }}>
        {cells.size > 0 && RETAILERS.map((r, i) => {
          const cell = cells.get(r.name) ?? { status: 'idle' as CellStatus }
          const pos = HEX_POS[i]
          const cls = cell.status === 'running' ? 'running'
            : cell.status === 'completed' ? 'done'
            : cell.status === 'failed' ? 'nomatch'
            : 'queued'
          return (
            <div key={r.name} className={`hv-hex ${cls}`}
              style={{ left: `calc(${pos.left}% - 150px)`, top: `${pos.top}%` }}
              onClick={() => setExpanded(expanded === r.name ? null : r.name)}
            >
              <div className="hv-hex-body">
                <span style={{ fontSize: 20 }}>{r.emoji}</span>
                <span className="hv-hex-name">{r.name}</span>
                {cell.status === 'running' && <><div className="hv-spinner" /><span className="hv-hex-status">scanning {r.domain}</span></>}
                {cell.status === 'queued' && <span className="hv-hex-status">◷ queued</span>}
                {cell.status === 'completed' && cell.result && (
                  <>
                    <span className="hv-hex-title">{cell.result.title}</span>
                    <span className="hv-hex-price">
                      {cell.result.price_usd != null ? `$${cell.result.price_usd.toLocaleString()}` : ''}
                      {cell.result.rating != null ? `  ${cell.result.rating}★` : ''}
                    </span>
                    <span className="hv-hex-status">{Math.round(cell.result.match_confidence * 100)}% match · tap for details</span>
                  </>
                )}
                {cell.status === 'failed' && (
                  <span className="hv-hex-status" style={{ color: '#ffb35c' }}>needs your input ↓</span>
                )}
              </div>
            </div>
          )
        })}

        {/* expanded detail card next to its hex */}
        {expanded && expandedCell?.result && expandedIdx >= 0 && (
          <div className="hv-detail glass-panel" style={{
            left: `calc(${HEX_POS[expandedIdx].left}% - 165px)`,
            top: `calc(${HEX_POS[expandedIdx].top}% + 200px)`,
            padding: 14,
          }}>
            <a href={expandedCell.result.url} target="_blank" rel="noreferrer"
              style={{ color: 'var(--hv-fg)', fontWeight: 700, fontSize: 13, textDecoration: 'none', lineHeight: 1.4 }}>
              {expandedCell.result.title} ↗
            </a>
            <div style={{ display: 'flex', gap: 10, margin: '8px 0', fontSize: 12.5, alignItems: 'center' }}>
              {expandedCell.result.price_usd != null && <span style={{ color: 'var(--hv-warning)', fontWeight: 800 }}>${expandedCell.result.price_usd.toLocaleString()}</span>}
              {expandedCell.result.rating != null && <span style={{ color: 'var(--hv-primary-light)' }}>{expandedCell.result.rating}★</span>}
              <span style={{ color: 'var(--hv-muted)' }}>{Math.round(expandedCell.result.match_confidence * 100)}% match</span>
              {expandedCell.result.width_cm != null && (
                <span style={{ color: 'var(--hv-muted)' }}>{expandedCell.result.width_cm}×{expandedCell.result.height_cm ?? '?'} cm</span>
              )}
            </div>
            <div style={{ color: 'var(--hv-muted)', fontSize: 11.5, lineHeight: 1.45, marginBottom: 10 }}>
              {expandedCell.result.reviews_summary || expandedCell.result.note}
            </div>
            {scene && expandedCell.result.found && (
              <button className="hv-btn" style={{ width: '100%', fontSize: 12 }} onClick={() => placeInScene(expandedCell.result!)}>
                ⬡ place in scene
              </button>
            )}
          </div>
        )}

        {cells.size === 0 && (
          <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', color: 'var(--hv-muted)', textAlign: 'center', lineHeight: 1.8 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>⬡⬡⬡</div>
            describe an item and deploy the swarm —<br />
            nine worker bees scan nine stores in parallel.
          </div>
        )}
      </div>

      {/* Hive Needs Input dock */}
      {questions.length > 0 && (
        <div className="hv-dock glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--hv-border)' }}>
            <span className="hex-badge" style={{ width: 24, height: 22, background: 'linear-gradient(135deg,#d4940a,#e8a317)', fontSize: 11 }}>⬡</span>
            <span style={{ fontWeight: 800, color: 'var(--hv-fg)', fontSize: 14 }}>Hive Needs Input</span>
            <span className="hv-pending">{questions.length} pending</span>
          </div>
          {questions.map((q) => (
            <div key={q.name} className="hv-question">
              <div className="hv-question-head">
                <span style={{ fontWeight: 700, color: 'var(--hv-fg)', fontSize: 12.5 }}>
                  {RETAILERS.find((r) => r.name === q.name)?.emoji} {q.name} worker
                </span>
                <span className="hv-pending">pending</span>
              </div>
              <div className="hv-question-text">{q.question}</div>
              <div className="hv-answer-row">
                <input
                  placeholder="Type your answer…"
                  value={answers[q.name] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.name]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') answerWorker(q.name) }}
                />
                <button className="hv-btn" style={{ fontSize: 12 }} onClick={() => answerWorker(q.name)}
                  disabled={!(answers[q.name] ?? '').trim()}>
                  ➤
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
