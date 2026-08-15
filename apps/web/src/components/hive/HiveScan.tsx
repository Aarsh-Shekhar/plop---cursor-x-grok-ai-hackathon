// @hive swarm overlay — ported from the team's item-finder (honey/amber UI,
// parallel per-retailer scan agents, queen's pick). Each retailer is one
// worker doing a domain-locked live web search; results are tangible:
// clickable product links, prices, ratings, match %, review summaries.
// PLOP addition: any found item can be placed in the 3D scene at real size.
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
}

export default function HiveScan({ initialQuery, onClose }: {
  initialQuery: string
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [cells, setCells] = useState<Map<string, Cell>>(new Map())
  const [scanning, setScanning] = useState(false)
  const runIdRef = useRef(0)
  const autoRan = useRef(false)
  const { scene, selectedId, applyEdit, select, pushChat } = useEditor()

  const setCell = (name: string, cell: Cell) =>
    setCells((m) => new Map(m).set(name, cell))

  const deploy = async (q?: string) => {
    const useQuery = (q ?? query).trim()
    if (!useQuery || scanning) return
    const runId = ++runIdRef.current
    setScanning(true)
    const init = new Map<string, Cell>()
    RETAILERS.forEach((r) => init.set(r.name, { status: 'queued' }))
    setCells(init)

    await Promise.all(
      RETAILERS.map(async (r, i) => {
        // stagger takeoff so the swarm visibly deploys
        await new Promise((res) => setTimeout(res, i * 350))
        if (runIdRef.current !== runId) return
        setCell(r.name, { status: 'running' })
        try {
          const res = await fetch(`${API_BASE}/api/scan`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: useQuery, retailer: r.name, domain: r.domain }),
          })
          if (!res.ok) throw new Error(`${res.status}`)
          const result: ScanResult = await res.json()
          if (runIdRef.current !== runId) return
          setCell(r.name, { status: result.found ? 'completed' : 'failed', result })
        } catch (e) {
          if (runIdRef.current !== runId) return
          setCell(r.name, { status: 'failed', error: String(e) })
        }
      }),
    )
    if (runIdRef.current === runId) setScanning(false)
  }

  // auto-deploy when opened from @hive
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

  const best = useMemo(() => {
    let bestEntry: { name: string; r: ScanResult } | null = null
    let bestScore = -1
    for (const [name, c] of cells) {
      if (c.status === 'completed' && c.result?.found) {
        const score =
          c.result.match_confidence * 2 +
          (c.result.rating ?? 3) / 5 +
          (c.result.price_usd != null ? 0.5 : 0)
        if (score > bestScore) { bestScore = score; bestEntry = { name, r: c.result } }
      }
    }
    return bestEntry
  }, [cells])

  return (
    <div className="hive-root" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div className="honeycomb-bg" />
      <div className="hive-spotlight" />
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="honey-particle" style={{ left: `${(i * 71) % 100}%`, bottom: `${(i * 37) % 40}%`, animationDelay: `${i * 0.7}s` }} />
      ))}

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', padding: '28px 20px' }}>
        <div style={{ width: 'min(880px, 100%)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div className="hex-badge animate-honey-glow" style={{ width: 44, height: 40, background: 'linear-gradient(135deg,#d4940a,#e8a317)', fontSize: 20 }}>🐝</div>
          <div>
            <h1 className="text-golden" style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.5 }}>hive scan</h1>
            <div style={{ color: 'var(--hv-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2 }}>deploy workers · find your item</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="hv-btn" style={{ background: 'transparent', color: 'var(--hv-muted)', border: '1px solid var(--hv-border)' }} onClick={onClose}>
            ← back to plop
          </button>
        </div>

        <div className="glass-panel" style={{ width: 'min(880px, 100%)', padding: 18, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <input
            placeholder="describe the item — e.g. greige linen 3-seat track arm sofa, ~213cm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && deploy()}
          />
          <button className="hv-btn animate-honey-glow" onClick={() => deploy()} disabled={scanning || !query.trim()} style={{ whiteSpace: 'nowrap' }}>
            {scanning ? 'workers deployed…' : '🐝 Deploy Workers'}
          </button>
        </div>

        {cells.size > 0 && (
          <div className="glass-panel" style={{ width: 'min(880px, 100%)', padding: '12px 18px', display: 'flex', gap: 26, marginBottom: 18, fontSize: 13 }}>
            <Stat label="workers" value={String(stats.total)} color="var(--hv-fg)" icon="⬡" />
            <Stat label="scanning" value={String(stats.running)} color="var(--hv-primary-light)" icon="⟳" pulse={stats.running > 0} />
            <Stat label="found" value={String(stats.found)} color="var(--hv-success)" icon="✓" />
            <Stat label="no match" value={String(stats.failed)} color="var(--hv-error)" icon="✕" />
            {stats.bestPrice != null && (
              <Stat label="best price" value={`$${stats.bestPrice.toLocaleString()}`} color="var(--hv-warning)" icon="◆" />
            )}
          </div>
        )}

        {cells.size > 0 && (
          <div className="honeycomb-grid" style={{ width: 'min(880px, 100%)' }}>
            {RETAILERS.map((r) => {
              const cell = cells.get(r.name) ?? { status: 'idle' as CellStatus }
              return <AgentCell key={r.name} retailer={r} cell={cell} onPlace={placeInScene} />
            })}
          </div>
        )}

        {best && !scanning && (
          <div className="glass-panel animate-honey-glow" style={{ width: 'min(880px, 100%)', padding: 20, marginTop: 20, border: '1px solid rgba(232,178,48,0.5)' }}>
            <div className="text-golden" style={{ fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
              👑 queen's pick
            </div>
            <a href={best.r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--hv-fg)', fontSize: 17, fontWeight: 700, textDecoration: 'none' }}>
              {best.r.title} ↗
            </a>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 14, alignItems: 'center' }}>
              {best.r.price_usd != null && <span style={{ color: 'var(--hv-warning)', fontWeight: 800 }}>${best.r.price_usd.toLocaleString()}</span>}
              <span style={{ color: 'var(--hv-muted)' }}>{best.name}</span>
              {best.r.rating != null && <span style={{ color: 'var(--hv-primary-light)' }}>{best.r.rating}★</span>}
              <span style={{ color: 'var(--hv-muted)' }}>{Math.round(best.r.match_confidence * 100)}% match</span>
              <span style={{ flex: 1 }} />
              {scene && (
                <button className="hv-btn" onClick={() => placeInScene(best.r)}>place in scene</button>
              )}
            </div>
            <div style={{ color: 'var(--hv-muted)', fontSize: 13, marginTop: 6 }}>{best.r.reviews_summary}</div>
          </div>
        )}

        {cells.size === 0 && (
          <div style={{ color: 'var(--hv-muted)', marginTop: 60, textAlign: 'center', lineHeight: 1.8 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>⬡⬡⬡</div>
            describe an item and deploy the swarm —<br />
            nine worker agents scan nine stores in parallel.
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color, icon, pulse }: { label: string; value: string; color: string; icon: string; pulse?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className={pulse ? 'animate-waggle' : ''}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontWeight: 800, color }}>{value}</span>
      <span style={{ color: 'var(--hv-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: 1.5 }}>{label}</span>
    </div>
  )
}

function AgentCell({ retailer, cell, onPlace }: {
  retailer: { name: string; domain: string; emoji: string }
  cell: Cell
  onPlace: (r: ScanResult) => void
}) {
  const { status, result } = cell
  return (
    <div
      className={`hv-cell hover-glow ${status === 'running' ? 'animate-border-warm animate-waggle' : ''}`}
      style={{
        borderColor:
          status === 'completed' ? 'rgba(160,217,17,0.45)' :
          status === 'failed' ? 'rgba(255,82,82,0.35)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(61,47,23,0.5)' }}>
        <span className="hex-badge" style={{ width: 26, height: 24, background: 'var(--hv-surface2)', fontSize: 13 }}>{retailer.emoji}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{retailer.name}</span>
        <span style={{ flex: 1 }} />
        {status === 'queued' && <span style={{ color: 'var(--hv-muted)', fontSize: 11 }}>◷ queued</span>}
        {status === 'running' && <div className="hv-spinner" />}
        {status === 'completed' && <span style={{ color: 'var(--hv-success)', fontSize: 15 }}>✓</span>}
        {status === 'failed' && <span style={{ color: 'var(--hv-error)', fontSize: 14 }}>✕</span>}
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {status === 'running' && (
          <div style={{ color: 'var(--hv-muted)', fontSize: 12 }} className="animate-waggle">
            scanning {retailer.domain}…
          </div>
        )}
        {status === 'queued' && (
          <div style={{ color: 'var(--hv-muted)', fontSize: 12, opacity: 0.6 }}>waiting for a free bee…</div>
        )}
        {result && status === 'completed' && (
          <>
            <a href={result.url} target="_blank" rel="noreferrer" style={{ color: 'var(--hv-fg)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', lineHeight: 1.35 }}>
              {result.title} ↗
            </a>
            <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
              {result.price_usd != null && <span style={{ color: 'var(--hv-warning)', fontWeight: 800 }}>${result.price_usd.toLocaleString()}</span>}
              {result.rating != null && <span style={{ color: 'var(--hv-primary-light)' }}>{result.rating}★</span>}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, alignSelf: 'center',
                background: result.match_confidence >= 0.8 ? 'rgba(160,217,17,0.15)' : result.match_confidence >= 0.5 ? 'rgba(232,163,23,0.15)' : 'rgba(255,82,82,0.15)',
                color: result.match_confidence >= 0.8 ? 'var(--hv-success)' : result.match_confidence >= 0.5 ? 'var(--hv-warning)' : 'var(--hv-error)',
              }}>
                {Math.round(result.match_confidence * 100)}%
              </span>
            </div>
            <div style={{ color: 'var(--hv-muted)', fontSize: 11, lineHeight: 1.4 }}>
              {result.reviews_summary || result.note}
            </div>
            <button className="hv-btn" style={{ marginTop: 'auto', fontSize: 11, padding: '5px 10px' }}
              onClick={() => onPlace(result)}>
              ⬡ place in scene
            </button>
          </>
        )}
        {status === 'failed' && (
          <div style={{ color: 'var(--hv-muted)', fontSize: 11.5, lineHeight: 1.4 }}>
            {result?.note || cell.error || 'no close match in this store'}
          </div>
        )}
        {status === 'idle' && <div style={{ color: 'var(--hv-muted)', opacity: 0.3, textAlign: 'center', marginTop: 20 }}>⬡</div>}
      </div>
    </div>
  )
}
