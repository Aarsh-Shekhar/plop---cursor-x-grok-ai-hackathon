// Projects: create a project, upload media, watch reconstruction progress live.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createProject, jobEventsUrl, listProjects, listScenes, uploadMedia,
} from '../lib/api'
import type { Project } from '../lib/types'

interface JobProgress { stage: string; detail: string; pct: number }

const STAGE_LABELS: Record<string, string> = {
  'uploading': 'Uploading',
  'understanding-objects': 'Understanding objects',
  'building-geometry': 'Building geometry',
  'applying-materials': 'Applying materials',
  'indexing-scene': 'Indexing scene',
  'ready': 'Ready',
  'failed': 'Failed',
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [scenes, setScenes] = useState<Awaited<ReturnType<typeof listScenes>>>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'consumer' | 'founder'>('consumer')
  const [job, setJob] = useState<(JobProgress & { sceneId?: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<Project | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const refresh = () => {
    listProjects().then(setProjects).catch((e) => setError(e.message))
    listScenes().then(setScenes).catch(() => {})
  }
  useEffect(refresh, [])

  const create = async () => {
    if (!name.trim()) return
    const p = await createProject(name.trim(), mode)
    setCreating(false)
    setName('')
    refresh()
    setUploadTarget(p)
    fileRef.current?.click()
  }

  const onFile = async (file: File | null) => {
    if (!file || !uploadTarget) return
    setError(null)
    try {
      const j = await uploadMedia(uploadTarget.id, file, file.name.replace(/\.[^.]+$/, ''))
      setJob({ stage: j.stage, detail: j.detail, pct: j.pct, sceneId: j.sceneId })
      const es = new EventSource(jobEventsUrl(j.id))
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data)
        setJob({ stage: data.stage, detail: data.detail, pct: data.pct, sceneId: j.sceneId })
        if (data.stage === 'ready') {
          es.close()
          navigate(`/editor/${j.sceneId}`)
        }
        if (data.stage === 'failed') {
          es.close()
          setError(data.detail)
          setJob(null)
        }
      }
      es.onerror = () => { es.close() }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="projects-page">
      <header className="site-header">
        <Link to="/" className="brand">PLOP</Link>
        <span className="header-sub">Projects</span>
      </header>

      <main className="projects-main">
        {error && <div className="error-note">{error}</div>}

        {job ? (
          <div className="job-card">
            <div className="job-stage">{STAGE_LABELS[job.stage] ?? job.stage}</div>
            <div className="job-detail">{job.detail}</div>
            <div className="job-bar"><div style={{ width: `${job.pct}%` }} /></div>
            <div className="job-stages">
              {Object.entries(STAGE_LABELS).slice(0, 6).map(([key, label]) => (
                <span key={key} className={key === job.stage ? 'on' : ''}>{label}</span>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="projects-toolbar">
              <h1>Your spaces</h1>
              {!creating
                ? <button className="btn primary" onClick={() => setCreating(true)}>New project</button>
                : (
                  <div className="create-row">
                    <input autoFocus placeholder="Project name" value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') create() }} />
                    <div className="mode-switch small">
                      <button className={mode === 'consumer' ? 'on' : ''} onClick={() => setMode('consumer')}>Consumer</button>
                      <button className={mode === 'founder' ? 'on' : ''} onClick={() => setMode('founder')}>Founder</button>
                    </div>
                    <button className="btn primary" onClick={create}>Create</button>
                    <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
                  </div>
                )}
            </div>

            <div className="project-grid">
              {projects.map((p) => {
                const pScenes = scenes.filter((s) => s.projectId === p.id && s.status === 'ready')
                return (
                  <div key={p.id} className="project-card" data-mode={p.mode}>
                    <div className="project-card-head">
                      <span className="project-name">{p.name}</span>
                      <span className="badge">{p.mode}</span>
                    </div>
                    {pScenes.length === 0 && (
                      <div className="empty-note">No spaces yet — upload a photo.</div>
                    )}
                    {pScenes.map((s) => (
                      <Link key={s.id} to={`/editor/${s.id}`} className="scene-link">
                        {s.name} →
                      </Link>
                    ))}
                    <button className="btn full" onClick={() => { setUploadTarget(p); fileRef.current?.click() }}>
                      Upload photo
                    </button>
                  </div>
                )
              })}
              {projects.length === 0 && (
                <div className="empty-note big">
                  Create a project, drop in a photo of a room or a hardware system,
                  and PLOP will rebuild it as an editable 3D scene.
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}
