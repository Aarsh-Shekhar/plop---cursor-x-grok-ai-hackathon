// Replace / compare-online panel. Search runs through the provider's
// web-grounded search; "Preview in scene" inserts a dimension-accurate proxy
// (clearly marked approximate) or swaps it for the selected object.
import { useEffect, useState } from 'react'
import { shopSearch } from '../../lib/api'
import { makeProxyObject } from '../../lib/candidates'
import { useEditor } from '../../state/editor'
import type { Listing, SceneObject } from '../../lib/types'

export default function ShopPanel({ target, onClose }: {
  target: SceneObject
  onClose: () => void
}) {
  const { scene, applyEdit, select, pushChat } = useEditor()
  const ident = target.semantic.identified as Record<string, any> | undefined
  const [query, setQuery] = useState<string>(
    (ident?.search_query as string) ?? `${target.name} similar product`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [bestIdx, setBestIdx] = useState(0)
  const [notes, setNotes] = useState('')

  const run = async (q: string) => {
    setBusy(true)
    setError(null)
    try {
      const d = target.dimensions
      const ctx = `The current item is about ${(d.width * 100).toFixed(0)}cm wide x ` +
        `${(d.height * 100).toFixed(0)}cm tall; alternatives should fit a similar footprint.`
      const res = await shopSearch(q, ctx)
      setListings(res.listings)
      setBestIdx(res.best_pick_index)
      setNotes(res.notes)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { run(query) }, [])

  const preview = (l: Listing, replace: boolean) => {
    if (!scene) return
    const proxy = makeProxyObject(l, target, [...target.transform.position], scene.environment.floorY)
    if (replace) {
      proxy.transform.position[0] = target.transform.position[0]
      proxy.transform.position[2] = target.transform.position[2]
    }
    applyEdit((objects) => {
      let next = objects
      if (replace) {
        next = next.map((o) => o.id === target.id ? { ...o, state: { ...o.state, hidden: true } } : o)
      }
      return [...next, proxy]
    })
    select(proxy.id)
    pushChat('plop', `Previewing "${l.title.slice(0, 50)}" at ${replace ? 'the original position' : 'the side'} — ` +
      `${l.width_cm != null ? 'true listed dimensions' : 'approximate dimensions'}. Undo with ⌘Z.`)
  }

  return (
    <div className="shop-panel">
      <div className="panel-header">
        <span>Replace · {target.name}</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="shop-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(query) }} />
        <button className="btn" onClick={() => run(query)} disabled={busy}>Search</button>
      </div>
      <div className="shop-body">
        {busy && <div className="empty-note">Searching live listings…</div>}
        {error && <div className="error-note">{error} <button className="btn" onClick={() => run(query)}>Retry</button></div>}
        {listings && listings.length === 0 && !busy && (
          <div className="empty-note">No listings found. Try a broader query.</div>
        )}
        {listings?.map((l, i) => (
          <div key={i} className={`listing ${i === bestIdx ? 'best' : ''}`}>
            {i === bestIdx && <div className="best-tag">Best match</div>}
            <div className="listing-title">
              <a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
            </div>
            <div className="listing-meta">
              <span className="price">${l.price_usd.toFixed(0)}</span>
              <span>{l.source}</span>
              {l.rating != null && <span>★ {l.rating.toFixed(1)}</span>}
              {l.width_cm != null && <span>{l.width_cm}×{l.height_cm ?? '?'} cm</span>}
            </div>
            <div className="listing-why">{l.why}</div>
            <div className="listing-actions">
              <button className="btn" onClick={() => preview(l, false)}>Preview beside</button>
              <button className="btn primary" onClick={() => preview(l, true)}>Preview as replacement</button>
            </div>
          </div>
        ))}
        {notes && <div className="shop-notes">{notes}</div>}
      </div>
    </div>
  )
}
