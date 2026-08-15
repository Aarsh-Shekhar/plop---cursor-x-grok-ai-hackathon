// Procurement swarm for the datacenter: describe what you need, agents scan
// enterprise hardware vendors for optimal pricing, best pick gets installed.
import { useMemo, useRef, useState } from 'react'
import { PART_TYPES } from './datacenter'

const VENDORS: { name: string; domain: string; emoji: string }[] = [
  { name: 'CDW', domain: 'cdw.com', emoji: '🏢' },
  { name: 'Newegg', domain: 'newegg.com', emoji: '🥚' },
  { name: 'ServerSupply', domain: 'serversupply.com', emoji: '🔩' },
  { name: 'Provantage', domain: 'provantage.com', emoji: '📦' },
  { name: 'Insight', domain: 'insight.com', emoji: '💼' },
  { name: 'eBay (refurb)', domain: 'ebay.com', emoji: '♻️' },
]

interface ScanResult {
  found: boolean
  title: string
  price_usd: number | null
  url: string
  rating: number | null
  reviews_summary: string
  match_confidence: number
  note: string
}
type CellStatus = 'queued' | 'running' | 'completed' | 'failed'
interface Cell { status: CellStatus; result?: ScanResult }

import { API_BASE } from '../../lib/api'

// map a requirement/product title to the closest catalog part for installation
export function matchPartKey(text: string): string {
  const t = text.toLowerCase()
  const rules: [RegExp, string][] = [
    [/b200|blackwell|gb200/, 'gpu-b200'],
    [/h100|hopper|hgx/, 'gpu-h100'],
    [/a100|ampere/, 'gpu-a100'],
    [/\bgpu|accelerator|ai (server|node)|dgx/, 'gpu-h100'],
    [/nvme|flash|ssd|all-flash|u\.2|e1\.s/, 'nvme'],
    [/tape|lto|archive/, 'tape'],
    [/hdd|hard (disk|drive)|jbod|disk shelf|spinning|sata.*(drive|storage)|storage/, 'hdd'],
    [/spine|100g|400g|800g.*switch/, 'spine'],
    [/switch|tor|ethernet|network/, 'tor'],
    [/\bups\b|battery|li-ion/, 'ups'],
    [/psu|power (shelf|supply)|rectifier|pdu/, 'psu'],
    [/rear.?door|rdhx|heat exchanger/, 'rdhx'],
    [/cdu|liquid|coolant|water/, 'cdu'],
    [/fan|airflow|cfm/, 'fan'],
    [/cpu|epyc|xeon|compute node/, 'cpu'],
  ]
  for (const [re, key] of rules) if (re.test(t)) return key
  return 'hdd'
}

export default function ProcurePanel({
  onInstall, onClose,
}: {
  onInstall: (partKey: string, note: string) => string | null
  onClose: () => void
}) {
  const [req, setReq] = useState('')
  const [cells, setCells] = useState<Map<string, Cell>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [installed, setInstalled] = useState<string | null>(null)
  const runRef = useRef(0)

  const deploy = async () => {
    if (!req.trim() || scanning) return
    const runId = ++runRef.current
    setScanning(true)
    setInstalled(null)
    const init = new Map<string, Cell>()
    VENDORS.forEach((v) => init.set(v.name, { status: 'queued' }))
    setCells(init)
    await Promise.all(VENDORS.map(async (v, i) => {
      await new Promise((r) => setTimeout(r, i * 300))
      if (runRef.current !== runId) return
      setCells((m) => new Map(m).set(v.name, { status: 'running' }))
      try {
        const res = await fetch(`${API_BASE}/api/scan`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: `${req} (datacenter / enterprise server hardware)`,
            retailer: v.name, domain: v.domain }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const result: ScanResult = await res.json()
        if (runRef.current !== runId) return
        setCells((m) => new Map(m).set(v.name, { status: result.found ? 'completed' : 'failed', result }))
      } catch (err) {
        if (runRef.current !== runId) return
        setCells((m) => new Map(m).set(v.name, {
          status: 'failed',
          result: { found: false, title: '', price_usd: null, url: '', rating: null, reviews_summary: '', match_confidence: 0,
            note: `agent error (${err instanceof Error ? err.message : err}) — check backend/API credits` },
        }))
      }
    }))
    if (runRef.current === runId) setScanning(false)
  }

  const best = useMemo(() => {
    let bestEntry: { vendor: string; r: ScanResult } | null = null
    let bestScore = -1
    for (const [vendor, c] of cells) {
      if (c.status !== 'completed' || !c.result?.found) continue
      const r = c.result
      // optimal = strong match, then price (cheaper better when known)
      const priceScore = r.price_usd != null ? Math.max(0, 1 - r.price_usd / 500000) : 0.2
      const score = r.match_confidence * 3 + priceScore
      if (score > bestScore) { bestScore = score; bestEntry = { vendor, r } }
    }
    return bestEntry
  }, [cells])

  const doneCount = [...cells.values()].filter((c) => c.status === 'completed' || c.status === 'failed').length

  const install = () => {
    if (!best) return
    const key = matchPartKey(`${req} ${best.r.title}`)
    const part = PART_TYPES.find((p) => p.key === key)!
    const where = onInstall(key, `${best.r.title} — $${best.r.price_usd?.toLocaleString() ?? '?'} @ ${best.vendor}`)
    setInstalled(where
      ? `✓ installed ${part.emoji} ${part.short} in ${where} — ${best.r.price_usd != null ? `$${best.r.price_usd.toLocaleString()}` : 'price TBD'} from ${best.vendor}`
      : 'no free bay — pull something out first')
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: 12, width: 360, maxHeight: 'calc(100% - 90px)', overflowY: 'auto', background: 'rgba(14,16,20,0.95)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ fontSize: 14 }}>🛒 procurement swarm</b>
        <div style={{ flex: 1 }} />
        <button className="small" onClick={onClose}>✕</button>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
        describe what you need + your requirements — agents scan {VENDORS.length} vendors for
        the optimal buy, then it gets racked.
      </div>
      <textarea
        value={req}
        onChange={(e) => setReq(e.target.value)}
        placeholder={'e.g. "~300TB of fast NVMe flash storage, best $/TB, under $100k"\nor "8x H100 GPU server, cheapest reliable option"'}
        rows={3}
        style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 12.5, resize: 'vertical' }}
      />
      <button className="primary" disabled={scanning || !req.trim()} onClick={deploy}>
        {scanning ? <><span className="spinner" /> swarm out ({doneCount}/{VENDORS.length})…</> : '🐝 deploy pricing swarm'}
      </button>

      {cells.size > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {VENDORS.map((v) => {
            const c = cells.get(v.name)
            if (!c) return null
            return (
              <div key={v.name} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, background: 'var(--panel2)', borderRadius: 8, padding: '6px 9px', border: c.status === 'completed' ? '1px solid rgba(78,205,196,0.35)' : '1px solid transparent' }}>
                <span>{v.emoji}</span>
                <b style={{ minWidth: 84 }}>{v.name}</b>
                {c.status === 'queued' && <span style={{ color: 'var(--muted)' }}>◷ queued</span>}
                {c.status === 'running' && <span style={{ color: 'var(--gold)' }}>scanning…</span>}
                {c.status === 'failed' && <span style={{ color: 'var(--muted)' }}>✕ {c.result?.note?.slice(0, 46) ?? 'no match'}</span>}
                {c.status === 'completed' && c.result && (
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <a href={c.result.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      {c.result.title.slice(0, 44)}{c.result.title.length > 44 ? '…' : ''} ↗
                    </a>{' '}
                    {c.result.price_usd != null && <b style={{ color: 'var(--accent2)' }}>${c.result.price_usd.toLocaleString()}</b>}{' '}
                    <span style={{ color: 'var(--muted)' }}>{Math.round(c.result.match_confidence * 100)}%</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {best && !scanning && (
        <div style={{ border: '1px solid var(--gold)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>★ OPTIMAL BUY</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{best.r.title}</span>
          <span style={{ fontSize: 12 }}>
            {best.r.price_usd != null && <b style={{ color: 'var(--accent2)' }}>${best.r.price_usd.toLocaleString()} </b>}
            <span style={{ color: 'var(--muted)' }}>{best.vendor} · {Math.round(best.r.match_confidence * 100)}% match</span>
          </span>
          {installed
            ? <span style={{ fontSize: 12.5, color: 'var(--accent2)' }}>{installed}</span>
            : <button className="primary" onClick={install}>⚙️ buy & rack it</button>}
        </div>
      )}
    </div>
  )
}
