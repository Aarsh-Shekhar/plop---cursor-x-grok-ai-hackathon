// Shared helper: turn a product listing/candidate into a dimension-accurate
// proxy SceneObject. Used by the Replace panel and the Hive results panel.
import type { Listing, SceneObject } from './types'

export interface Candidate extends Partial<Listing> {
  title: string
  why?: string
}

export function makeProxyObject(
  c: Candidate,
  anchor: SceneObject | null,
  fallbackPos: [number, number, number],
): SceneObject {
  const base = anchor?.dimensions
  const w = (c.width_cm ?? (base ? base.width * 100 : 80)) / 100
  const h = (c.height_cm ?? (base ? base.height * 100 : 80)) / 100
  const d = (c.depth_cm ?? (base ? base.depth * 100 : 40)) / 100
  const hasSpec = c.width_cm != null
  return {
    id: `obj_new_${Math.random().toString(36).slice(2, 8)}`,
    name: c.title.slice(0, 40),
    label: anchor?.label ?? 'candidate',
    category: anchor?.category ?? 'object',
    score: 1,
    transform: {
      position: anchor
        ? [anchor.transform.position[0] + 0.4, anchor.transform.position[1], anchor.transform.position[2]]
        : fallbackPos,
      rotationY: anchor?.transform.rotationY ?? 0,
      scale: [1, 1, 1],
    },
    dimensions: {
      width: w, height: h, depth: d,
      source: hasSpec ? 'manufacturer-spec' : 'inferred',
      confidence: hasSpec ? 0.95 : 0.5,
    },
    geometry: { kind: 'proxy-box', source: 'candidate-preview' },
    appearance: { material: { type: 'solid', color: '#8f9aad' }, dominantColors: [] },
    perception: { confidence: 1 },
    semantic: {
      description: [c.title, c.source, c.price_usd != null ? `$${c.price_usd}` : null]
        .filter(Boolean).join(' — '),
      productMatches: [c],
    },
    technical: {},
    state: { hidden: false, locked: false },
  }
}
