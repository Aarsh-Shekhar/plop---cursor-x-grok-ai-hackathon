// Identify-mode fact sheet: click any object with the neon cursor and get a
// spec card — real measured dimensions, placement, material, product match,
// and an auto-run AI identification (name-based fallback works offline).
import { useEffect, useState } from 'react'
import { identifyObject } from '../../lib/api'
import { offlineIdentify } from '../../lib/offline'
import { useEditor } from '../../state/editor'

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="fs-row">
      <span className="fs-k">{k}</span>
      <span className="fs-v">{v}</span>
    </div>
  )
}

export default function FactSheet() {
  const { scene, factSheetId, setFactSheetId, updateObject } = useEditor()
  const obj = scene?.objects.find((o) => o.id === factSheetId)
  const [identifying, setIdentifying] = useState(false)

  const ident = obj?.semantic.identified as Record<string, any> | undefined
  const product = obj?.semantic.productMatches?.[0] as Record<string, any> | undefined

  // auto-run identification the first time an object's sheet opens
  useEffect(() => {
    if (!scene || !obj || ident || identifying) return
    setIdentifying(true)
    identifyObject(scene.id, obj.id)
      .then((result) => {
        updateObject(obj.id, (o) => ({ ...o, semantic: { ...o.semantic, identified: result } }))
      })
      .catch(() => {
        const local = offlineIdentify(obj)
        updateObject(obj.id, (o) => ({ ...o, semantic: { ...o.semantic, identified: local } }))
      })
      .finally(() => setIdentifying(false))
  }, [factSheetId])

  if (!obj) return null

  const d = obj.dimensions
  const p = obj.transform.position
  const cm = (m: number) => `${(m * 100).toFixed(0)} cm`
  const footprint = (d.width * d.depth).toFixed(2)

  return (
    <div className="fact-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="fs-head">
        <span className="fs-title">◉ {obj.name}</span>
        <span className="fs-cat">{obj.category}</span>
        <button className="icon-btn" onClick={() => setFactSheetId(null)}>✕</button>
      </div>

      <div className="fs-section">
        <div className="fs-section-title">Measured</div>
        <Row k="Width × Height × Depth" v={`${cm(d.width)} × ${cm(d.height)} × ${cm(d.depth)}`} />
        <Row k="Footprint" v={`${footprint} m²`} />
        <Row k="Position" v={`x ${p[0].toFixed(2)} · y ${p[1].toFixed(2)} · z ${p[2].toFixed(2)} m`} />
        <Row k="Source" v={`${d.source} · ${Math.round(d.confidence * 100)}% confidence`} />
      </div>

      {(identifying || ident) && (
        <div className="fs-section">
          <div className="fs-section-title">AI identification {identifying && <span className="goal-spin">⟳</span>}</div>
          {ident && (
            <>
              {ident.product_name && <Row k="Product" v={String(ident.product_name)} />}
              {ident.component_name && <Row k="Component" v={String(ident.component_name)} />}
              {ident.likely_manufacturer && <Row k="Manufacturer" v={`${ident.likely_manufacturer} ${ident.likely_model ?? ''}`} />}
              {ident.style && <Row k="Style" v={String(ident.style)} />}
              {(ident.materials as string[] | undefined)?.length ? <Row k="Materials" v={(ident.materials as string[]).join(', ')} /> : null}
              {ident.est_power_w != null && <Row k="Est. power" v={`~${ident.est_power_w} W`} />}
              {ident.thermal_role && <Row k="Thermal role" v={String(ident.thermal_role)} />}
              {ident.est_width_cm != null && <Row k="Typical size" v={`${ident.est_width_cm}×${ident.est_height_cm}×${ident.est_depth_cm} cm`} />}
              {ident.search_query && <Row k="Shop query" v={String(ident.search_query)} />}
            </>
          )}
        </div>
      )}

      {product && (
        <div className="fs-section">
          <div className="fs-section-title">Matched product</div>
          {product.image_url && (
            <img src={product.image_url} alt="" className="insp-product-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <div className="listing-title">
            {product.url
              ? <a href={product.url} target="_blank" rel="noreferrer">{product.title} ↗</a>
              : product.title}
          </div>
          <div className="listing-meta">
            {product.price_usd != null && <span className="price">${product.price_usd}</span>}
            {product.retailer && <span>{product.retailer}</span>}
            {product.width_cm != null && <span>{product.width_cm}×{product.height_cm ?? '?'} cm listed</span>}
          </div>
        </div>
      )}

      {obj.semantic.description && (
        <div className="fs-section">
          <div className="fs-section-title">Notes</div>
          <div className="fs-note">{obj.semantic.description}</div>
        </div>
      )}
    </div>
  )
}
