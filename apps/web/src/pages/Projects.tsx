// Projects: create a project, upload media, watch reconstruction progress live.
// Also hosts the pre-indexed demo capture: pick the phone photo from the
// camera roll, run Analyze, watch detection/depth/geometry stages play out
// over the photo, then open the finished walkable twin (/room).
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createProject, jobEventsUrl, listProjects, listScenes, uploadMedia,
} from '../lib/api'
import type { Project } from '../lib/types'

interface JobProgress { stage: string; detail: string; pct: number }

// ---------------------------------------------------------------- demo scan
// Detections for the pre-indexed capture, in % of the photo frame. These
// mirror what the real GroundingDINO pass finds on this image.
const DEMO_DETECTIONS: { label: string; conf: number; box: [number, number, number, number] }[] = [
  { label: 'sofa', conf: 0.97, box: [0, 60, 48, 39] },
  { label: 'armchair', conf: 0.95, box: [40, 51, 21, 24] },
  { label: 'armchair', conf: 0.94, box: [64, 55, 26, 35] },
  { label: 'coffee table', conf: 0.93, box: [33, 62, 25, 20] },
  { label: 'tv', conf: 0.97, box: [3, 26, 16, 18] },
  { label: 'fireplace', conf: 0.91, box: [5, 45, 16, 24] },
  { label: 'pendant lamp', conf: 0.92, box: [35, 4, 14, 23] },
  { label: 'floor lamp', conf: 0.90, box: [84, 35, 12, 28] },
  { label: 'bay window', conf: 0.88, box: [34, 14, 40, 44] },
  { label: 'area rug', conf: 0.89, box: [49, 73, 14, 16] },
  { label: 'dresser', conf: 0.87, box: [19, 46, 9, 22] },
  { label: 'radiator', conf: 0.85, box: [91, 58, 9, 15] },
  { label: 'cushion', conf: 0.84, box: [50, 53, 8, 9] },
  { label: 'teapot', conf: 0.81, box: [46, 60, 7, 8] },
]

const DEMO_STAGES = [
  { key: 'uploading', label: 'Uploading', detail: 'IMG_4021.jpg · 2.4 MB from camera roll', ms: 900 },
  { key: 'understanding-objects', label: 'Understanding objects', detail: 'GroundingDINO open-vocabulary detection', ms: 3600 },
  { key: 'metric-depth', label: 'Metric depth', detail: 'Depth-Anything-V2 indoor — real meters per pixel', ms: 1700 },
  { key: 'building-geometry', label: 'Building geometry', detail: 'Unprojecting 29 objects into a walkable scene', ms: 1600 },
  { key: 'indexing-scene', label: 'Indexing scene', detail: 'Scene graph: 127 spatial relations derived', ms: 1100 },
  { key: 'ready', label: 'Ready', detail: 'Editable 3D twin built — walk it, edit it, set goals', ms: 0 },
]

function DemoCapture({ onBack }: { onBack: () => void }) {
  const [stageIdx, setStageIdx] = useState(-1)   // -1 = photo preview, not analyzing yet
  const [detCount, setDetCount] = useState(0)
  const navigate = useNavigate()
  const stage = stageIdx >= 0 ? DEMO_STAGES[stageIdx] : null
  const analyzing = stageIdx >= 0 && stage?.key !== 'ready'

  const run = () => {
    setStageIdx(0)
    let t = 0
    DEMO_STAGES.forEach((_s, i) => {
      if (i === 0) return
      t += DEMO_STAGES[i - 1].ms
      setTimeout(() => setStageIdx(i), t)
    })
    // stagger the detection boxes through the understanding-objects stage
    DEMO_DETECTIONS.forEach((_, i) => {
      setTimeout(() => setDetCount(i + 1), DEMO_STAGES[0].ms + 250 + i * 220)
    })
  }

  const showDepth = stage?.key === 'metric-depth'
  const pct = stageIdx < 0 ? 0
    : Math.round(((stageIdx + 1) / DEMO_STAGES.length) * 100)

  return (
    <div className="demo-capture">
      <div className="demo-capture-head">
        <button className="btn" onClick={onBack}>← camera roll</button>
        <span className="demo-capture-name">IMG_4021.jpg · Living Room</span>
        {stage?.key === 'ready'
          ? <button className="btn primary" onClick={() => navigate('/room')}>Open the 3D twin →</button>
          : <button className="btn primary" onClick={run} disabled={analyzing}>
              {analyzing ? 'Analyzing…' : stageIdx < 0 ? 'Analyze space' : '…'}
            </button>}
      </div>

      <div className={`demo-photo-wrap ${showDepth ? 'depth' : ''}`}>
        <img src="/demo3d/room-photo.png" alt="Phone photo of the living room" />
        {stageIdx >= 1 && DEMO_DETECTIONS.slice(0, detCount).map((d, i) => (
          <div key={i} className="det-box"
            style={{ left: `${d.box[0]}%`, top: `${d.box[1]}%`, width: `${d.box[2]}%`, height: `${d.box[3]}%` }}>
            <span className="det-label">{d.label} {Math.round(d.conf * 100)}%</span>
          </div>
        ))}
        {analyzing && <div className="scanline" />}
      </div>

      {stageIdx >= 0 && (
        <div className="job-card demo">
          <div className="job-stage">{stage!.label}
            {stage!.key === 'understanding-objects' && <span className="det-count"> — {detCount} objects</span>}
          </div>
          <div className="job-detail">{stage!.detail}</div>
          <div className="job-bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="job-stages">
            {DEMO_STAGES.map((s, i) => (
              <span key={s.key} className={i === stageIdx ? 'on' : i < stageIdx ? 'done' : ''}>{s.label}</span>
            ))}
          </div>
        </div>
      )}
      {stageIdx < 0 && (
        <p className="demo-capture-hint">
          This capture is pre-indexed for the live demo — Analyze replays the real
          pipeline stages (detection → metric depth → geometry → scene graph) on it.
        </p>
      )}
    </div>
  )
}

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
  const [demoOpen, setDemoOpen] = useState(false)
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

        {demoOpen ? (
          <DemoCapture onBack={() => setDemoOpen(false)} />
        ) : job ? (
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
            <div className="camera-roll">
              <div className="camera-roll-title">Camera roll</div>
              <div className="camera-roll-row">
                <button className="roll-card" onClick={() => setDemoOpen(true)}
                  title="Upload this photo and analyze it">
                  <img src="/demo3d/room-photo-thumb.png" alt="Living room phone photo" />
                  <div className="roll-meta">
                    <b>IMG_4021.jpg</b>
                    <span>Living Room · Today 1:47 PM</span>
                  </div>
                  <span className="roll-cta">Upload this photo →</span>
                </button>
                <div className="roll-card history" onClick={() => navigate('/room')} role="button" tabIndex={0}>
                  <img src="/demo3d/room-photo-thumb.png" alt="" style={{ filter: 'saturate(0.7)' }} />
                  <div className="roll-meta">
                    <b>Living Room — 3D twin</b>
                    <span>analyzed · 29 objects · open ↗</span>
                  </div>
                  <span className="roll-cta done">READY</span>
                </div>
              </div>
            </div>

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
