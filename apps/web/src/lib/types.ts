// Shared scene schema — mirrors services/api/app/scenegraph.py

export type Mode = 'consumer' | 'founder'

export interface Transform {
  position: [number, number, number]
  rotationY: number
  scale: [number, number, number]
}

export interface Dimensions {
  width: number
  height: number
  depth: number
  source: 'inferred' | 'identified' | 'user' | 'manufacturer-spec'
  confidence: number
}

export interface MaterialSpec {
  type: 'original' | 'solid' | 'pattern'
  color?: string
  secondaryColor?: string
  pattern?: 'zebra' | 'checker' | 'stripes' | 'wood' | 'dots'
  roughness?: number
  metallic?: number
}

export interface SceneObject {
  id: string
  name: string
  label: string
  category: string
  score: number
  transform: Transform
  dimensions: Dimensions
  geometry: {
    kind: 'cutout' | 'proxy-box'
    textureUri?: string
    box?: [number, number, number, number]
    source: string
  }
  appearance: {
    material: MaterialSpec
    dominantColors?: string[]
  }
  perception: {
    confidence: number
    maskUri?: string
    depthM?: number
    floorStanding?: boolean
  }
  semantic: {
    description?: string | null
    identified?: Record<string, unknown>
    productMatches?: unknown[]
  }
  technical: Record<string, unknown>
  state: { hidden: boolean; locked: boolean }
}

export interface Scene {
  id: string
  projectId: string
  name: string
  mode: Mode
  status: string
  units: string
  scaleConfidence: string
  capture: {
    imageUri: string
    cleanedUri: string
    depthUri: string
    width: number
    height: number
    depthMinM: number
    depthMaxM: number
    hfovDeg: number
  }
  environment: { floorY: number; backdrop: string }
  objects: SceneObject[]
  stats?: { reconstructionSeconds: number; objectCount: number; coveragePct: number }
}

export interface Project {
  id: string
  name: string
  mode: Mode
  createdAt: number
  sceneIds: string[]
}

export interface ReconstructionJob {
  id: string
  sceneId: string
  projectId: string
  status: 'running' | 'completed' | 'failed'
  stage: string
  detail: string
  pct: number
  error?: string | null
}

export interface SceneEditCommand {
  operation: string
  targetObjectIds: string[]
  params: {
    delta?: [number, number, number]
    position?: [number, number, number]
    degrees?: number
    factor?: number
    dimensions?: { width?: number; height?: number; depth?: number }
    material?: MaterialSpec
    query?: string
    text?: string
  }
}

export interface CommandResult {
  commands: SceneEditCommand[]
  assistantNote: string
}

export interface Listing {
  title: string
  price_usd: number
  url: string
  source: string
  rating: number | null
  width_cm: number | null
  height_cm: number | null
  depth_cm: number | null
  why: string
}

export interface ShopResult {
  listings: Listing[]
  best_pick_index: number
  notes: string
}
