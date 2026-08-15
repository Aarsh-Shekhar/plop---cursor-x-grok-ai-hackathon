import type {
  CommandResult, Project, ReconstructionJob, Scene, ShopResult,
} from './types'

// On a hosted origin (judges' link) there is no local API — and browsers gate
// https→localhost requests behind a local-network permission prompt that can
// leave fetches pending forever. Point at an instantly-failing host instead so
// every client-side fallback fires immediately.
const isLocalHost = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
export const API_BASE = import.meta.env.VITE_API_BASE ??
  (isLocalHost ? 'http://localhost:8100' : 'https://api.plop.invalid')

export const artifactUrl = (uri: string) =>
  uri.startsWith('http') ? uri : `${API_BASE}${uri}`

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* keep statusText */ }
    throw new Error(detail)
  }
  return res.json()
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const listProjects = () => req<Project[]>('/api/projects')
export const createProject = (name: string, mode: string) =>
  req<Project>('/api/projects', json({ name, mode }))
export const getProject = (id: string) => req<Project>(`/api/projects/${id}`)

export async function uploadMedia(
  projectId: string, file: File, name: string, mode?: string,
): Promise<ReconstructionJob> {
  const fd = new FormData()
  fd.append('image', file)
  fd.append('name', name)
  if (mode) fd.append('mode', mode)
  return req(`/api/projects/${projectId}/media`, { method: 'POST', body: fd })
}

export const getJob = (id: string) => req<ReconstructionJob>(`/api/reconstruction-jobs/${id}`)
export const jobEventsUrl = (id: string) => `${API_BASE}/api/reconstruction-jobs/${id}/events`

export const getScene = (id: string) => req<Scene>(`/api/scenes/${id}`)
export const listScenes = () =>
  req<Pick<Scene, 'id' | 'projectId' | 'name' | 'mode' | 'status'>[]>('/api/scenes')

export const patchScene = (id: string, patch: Partial<Scene>) =>
  req(`/api/scenes/${id}`, { ...json(patch), method: 'PATCH' })

export const sendCommand = (sceneId: string, text: string, selectedObjectId: string | null) =>
  req<CommandResult>(`/api/scenes/${sceneId}/commands`, json({ text, selectedObjectId }))

export const identifyObject = (sceneId: string, objectId: string) =>
  req<Record<string, unknown>>(`/api/scenes/${sceneId}/objects/${objectId}/identify`, { method: 'POST' })

export const shopSearch = (query: string, context: string) =>
  req<ShopResult>('/api/shop', json({ query, context }))

export const createHiveRun = (prompt: string, sceneId: string | null, selectedObjectIds: string[]) =>
  req<{ run: { id: string }; hiveUrl: string; workerCount?: number }>(
    '/api/hive/runs', json({ prompt, sceneId, selectedObjectIds }))

export const hiveHealth = () => req<{ ok: boolean; ui: string }>('/api/hive/health')
