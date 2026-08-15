// Right panel: selected-object inspector. Consumer shows product info;
// Founder shows technical metadata with provenance (measured vs inferred
// vs spec) and never presents an uncertain identification as confirmed.
import { useState } from 'react'
import { identifyObject } from '../../lib/api'
import { useEditor } from '../../state/editor'
import type { MaterialSpec, SceneObject } from '../../lib/types'

const SWATCHES = ['#1f3a5f', '#7a1f1f', '#3d5a3d', '#8a6d3b', '#2b2b2b', '#e8e2d5', '#5b4a7a']
const PATTERNS: MaterialSpec['pattern'][] = ['zebra', 'checker', 'stripes', 'wood', 'dots']

function Field({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div className="insp-field">
      <span className="insp-label">{label}</span>
      <span className="insp-value">{value}{tag && <em className="insp-tag">{tag}</em>}</span>
    </div>
  )
}

export default function Inspector({ onReplace }: { onReplace: (obj: SceneObject) => void }) {
  const { scene, selectedId, mode, updateObject, applyEdit, select, pushChat } = useEditor()
  const [identifying, setIdentifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const obj = scene?.objects.find((o) => o.id === selectedId)

  if (!scene || !obj) {
    return (
      <div className="panel inspector">
        <div className="panel-header"><span>Inspector</span></div>
        <div className="panel-body empty-note">
          Click an object in the scene to inspect and edit it.
        </div>
      </div>
    )
  }

  const d = obj.dimensions
  const p = obj.transform.position
  const ident = obj.semantic.identified as Record<string, any> | undefined
  const fmt = (m: number) => scene.units === 'm' ? `${(m * 100).toFixed(0)} cm` : `${m.toFixed(2)} m`

  const runIdentify = async () => {
    setIdentifying(true)
    setError(null)
    try {
      const result = await identifyObject(scene.id, obj.id)
      updateObject(obj.id, (o) => ({ ...o, semantic: { ...o.semantic, identified: result } }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIdentifying(false)
    }
  }

  const setMaterial = (material: MaterialSpec) =>
    updateObject(obj.id, (o) => ({ ...o, appearance: { ...o.appearance, material } }))

  const nudge = (dx: number, dy: number, dz: number) =>
    updateObject(obj.id, (o) => ({
      ...o,
      transform: {
        ...o.transform,
        position: [o.transform.position[0] + dx, o.transform.position[1] + dy, o.transform.position[2] + dz],
      },
    }))

  return (
    <div className="panel inspector">
      <div className="panel-header">
        <span>{obj.name}</span>
        <span className="badge">{obj.category}</span>
      </div>
      <div className="panel-body">

        {mode === 'founder' && ident?.identification_confidence != null && (
          <div className={`ident-banner ${ident.identification_confidence >= 0.8 ? 'good' : 'warn'}`}>
            {ident.likely_manufacturer || ''} {ident.likely_model || ident.component_name}
            {' — '}{Math.round(ident.identification_confidence * 100)}%
            {ident.identification_confidence < 0.8 && ' · unconfirmed'}
          </div>
        )}

        <div className="insp-section">
          <div className="insp-section-title">Dimensions <em className="insp-tag">{d.source}</em></div>
          <Field label="Width" value={fmt(d.width)} />
          <Field label="Height" value={fmt(d.height)} />
          <Field label="Depth" value={fmt(d.depth)} tag={obj.geometry.source === 'observed-front' ? 'inferred' : undefined} />
          <Field label="Confidence" value={`${Math.round(d.confidence * 100)}%`} />
        </div>

        <div className="insp-section">
          <div className="insp-section-title">Transform</div>
          <Field label="Position" value={`${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)} m`} />
          <Field label="Rotation" value={`${((obj.transform.rotationY * 180) / Math.PI).toFixed(0)}°`} />
          <div className="nudge-grid">
            <button onClick={() => nudge(0, 0.1, 0)} title="Up">↑</button>
            <button onClick={() => nudge(0, -0.1, 0)} title="Down">↓</button>
            <button onClick={() => nudge(-0.1, 0, 0)} title="Left">←</button>
            <button onClick={() => nudge(0.1, 0, 0)} title="Right">→</button>
            <button onClick={() => nudge(0, 0, -0.1)} title="Away">⤒</button>
            <button onClick={() => nudge(0, 0, 0.1)} title="Closer">⤓</button>
          </div>
        </div>

        {mode === 'consumer' && ident && (
          <div className="insp-section">
            <div className="insp-section-title">Identified</div>
            <Field label="Product" value={String(ident.product_name ?? '—')} />
            <Field label="Style" value={String(ident.style ?? '—')} />
            <Field label="Materials" value={(ident.materials as string[] ?? []).join(', ') || '—'} />
            <Field label="Est. size" value={`${ident.est_width_cm}×${ident.est_height_cm}×${ident.est_depth_cm} cm`} tag="estimate" />
          </div>
        )}

        {mode === 'founder' && ident && (
          <div className="insp-section">
            <div className="insp-section-title">Technical</div>
            <Field label="Type" value={String(ident.component_type ?? obj.category)} />
            <Field label="Power" value={ident.est_power_w != null ? `~${ident.est_power_w} W` : 'unknown'} tag="estimate" />
            <Field label="Thermal role" value={String(ident.thermal_role ?? 'unknown')} />
            <Field label="Connectors" value={(ident.connectors as string[] ?? []).join(', ') || '—'} />
            {(ident.readable_text as string[] ?? []).length > 0 && (
              <Field label="Visible text" value={(ident.readable_text as string[]).join(' · ')} />
            )}
          </div>
        )}

        {(obj.semantic.productMatches?.length ?? 0) > 0 && (() => {
          const p = obj.semantic.productMatches![0] as Record<string, any>
          return (
            <div className="insp-section">
              <div className="insp-section-title">Matched product</div>
              {p.image_url && (
                <img src={p.image_url} alt="" className="insp-product-img"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
              <div className="listing-title">
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title} ↗</a> : p.title}
              </div>
              <div className="listing-meta">
                {p.price_usd != null && <span className="price">${p.price_usd}</span>}
                {p.width_cm != null && <span>{p.width_cm}×{p.height_cm ?? '?'} cm</span>}
              </div>
            </div>
          )
        })()}
        {!ident && (
          <button className="btn primary full" onClick={runIdentify} disabled={identifying}>
            {identifying ? 'Identifying…' : mode === 'founder' ? 'Identify component' : 'Identify product'}
          </button>
        )}
        {error && <div className="error-note">{error}</div>}

        <div className="insp-section">
          <div className="insp-section-title">Material</div>
          <div className="swatch-row">
            <button className="swatch original" title="Original captured material"
              onClick={() => setMaterial({ type: 'original' })}>⟲</button>
            {SWATCHES.map((c) => (
              <button key={c} className="swatch" style={{ background: c }}
                title={`Solid ${c}`}
                onClick={() => setMaterial({ type: 'solid', color: c })} />
            ))}
          </div>
          <div className="pattern-row">
            {PATTERNS.map((pat) => (
              <button key={pat} className="chip"
                onClick={() => setMaterial({ type: 'pattern', pattern: pat, color: pat === 'zebra' ? '#101010' : '#6b4f2f' })}>
                {pat}
              </button>
            ))}
          </div>
        </div>

        <div className="insp-actions">
          <button className="btn" onClick={() => onReplace(obj)}>Replace / Compare</button>
          <button className="btn" onClick={() => {
            applyEdit((objects) => {
              const copy: SceneObject = JSON.parse(JSON.stringify(obj))
              copy.id = `obj_new_${Math.random().toString(36).slice(2, 8)}`
              copy.name = `${obj.name} copy`
              copy.transform.position = [p[0] + d.width + 0.15, p[1], p[2]]
              return [...objects, copy]
            })
          }}>Duplicate</button>
          <button className="btn" onClick={() =>
            updateObject(obj.id, (o) => ({ ...o, state: { ...o.state, locked: !o.state.locked } }))}>
            {obj.state.locked ? 'Unlock' : 'Lock'}
          </button>
          <button className="btn danger" onClick={() => {
            updateObject(obj.id, (o) => ({ ...o, state: { ...o.state, hidden: true } }))
            select(null)
            pushChat('plop', `${obj.name} hidden. Undo with ⌘Z.`)
          }}>Remove</button>
        </div>
      </div>
    </div>
  )
}
