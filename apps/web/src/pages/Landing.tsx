// Landing page: hero + scroll-scrubbed product story inside a Mac mockup.
// The demo frames use REAL artifacts from a reconstructed demo scene
// (source photo, depth map, object cutouts) — not stock renders.
//
// The story panel is position:fixed and toggled by scroll progress instead of
// position:sticky — sticky subtrees with animated transforms intermittently
// stop painting (white screen) in Chromium; fixed elements always paint.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { artifactUrl, listScenes, getScene } from '../lib/api'
import type { Scene } from '../lib/types'

interface Stage {
  key: string
  title: string
  caption: string
}

const STAGES: Stage[] = [
  { key: 'photo', title: 'Drop in a photo', caption: 'Any room, workspace, or hardware system. One photo is enough to start.' },
  { key: 'detect', title: 'PLOP finds every object', caption: 'Open-vocabulary detection, instance masks, and metric depth — locally.' },
  { key: 'lift', title: 'The room becomes 3D', caption: 'Depth is unprojected into a navigable scene. Objects become editable.' },
  { key: 'select', title: 'Everything is selectable', caption: 'Click the couch. Drag it across the room. It moves — the photo doesn\'t ghost.' },
  { key: 'edit', title: 'Edit with plain language', caption: '"Make this rug zebra print." The rug keeps its shading, changes its material.' },
  { key: 'founder', title: 'Founder mode', caption: 'A technical digital-twin workspace for hardware startups: specs, clearances, airflow.' },
  { key: 'hive', title: '@hive does the legwork', caption: 'A swarm of agents researches products, specs, and prices — with approvals.' },
]

export default function Landing() {
  const [demo, setDemo] = useState<Scene | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(-1)  // <0 or >1 = story panel hidden
  const navigate = useNavigate()

  useEffect(() => {
    listScenes().then(async (all) => {
      const ready = all.find((s) => s.status === 'ready' && s.mode === 'consumer') ?? all.find((s) => s.status === 'ready')
      if (ready) setDemo(await getScene(ready.id))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = scrollerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const total = el.offsetHeight - window.innerHeight
        setProgress(-rect.top / Math.max(total, 1))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  // ?stage=N pins the story to one stage (QA / demo screenshots)
  const forced = new URLSearchParams(window.location.search).get('stage')
  const inStory = forced != null || (progress >= 0 && progress <= 1)
  const clamped = Math.min(1, Math.max(0, progress))
  const stageIdx = forced != null
    ? Math.min(STAGES.length - 1, Math.max(0, parseInt(forced, 10) || 0))
    : Math.min(STAGES.length - 1, Math.floor(clamped * STAGES.length))
  const stage = STAGES[stageIdx]
  const local = forced != null ? 0.7 : (clamped * STAGES.length) % 1

  const bigObjects = useMemo(() => {
    if (!demo) return []
    return [...demo.objects]
      .filter((o) => o.geometry.box && o.geometry.textureUri)
      .sort((a, b) => b.dimensions.width * b.dimensions.height - a.dimensions.width * a.dimensions.height)
      .slice(0, 5)
  }, [demo])

  const couch = bigObjects[0]
  const rug = demo?.objects.find((o) => o.label.includes('rug')) ?? bigObjects[1]

  const px = (obj: typeof couch, k: 'x' | 'y' | 'w' | 'h') => {
    if (!obj?.geometry.box || !demo) return 0
    const [x0, y0, x1, y1] = obj.geometry.box
    const W = demo.capture.width
    const H = demo.capture.height
    switch (k) {
      case 'x': return (x0 / W) * 100
      case 'y': return (y0 / H) * 100
      case 'w': return ((x1 - x0) / W) * 100
      case 'h': return ((y1 - y0) / H) * 100
    }
  }

  const isFounder = stage.key === 'founder'
  const isHive = stage.key === 'hive'
  // discrete per-stage tilt (CSS-transitioned) — never scroll-tied, so the
  // compositor re-rasterizes at most once per stage change
  const tilt = stageIdx >= 2 && !isHive

  return (
    <div className="landing" data-mode={isFounder && inStory ? 'founder' : 'consumer'}>
      <header className="site-header landing-header">
        <span className="brand">PLOP</span>
        <nav>
          <Link to="/projects" className="btn">Open app</Link>
        </nav>
      </header>

      {/* ---- hero ---- */}
      <section className="hero">
        <div className="hero-copy">
          <h1>Turn your space into an editable 3D workspace.</h1>
          <p>
            PLOP rebuilds photos of real places — rooms, desks, rigs, machines —
            into digital twins where every object is selectable, movable, and
            researchable. Move anything. Try it before you change it.
          </p>
          <div className="hero-actions">
            <Link to="/projects" className="btn primary big">Upload a photo</Link>
            {demo && (
              <button className="btn big" onClick={() => navigate(`/editor/${demo.id}`)}>
                Try the demo scene
              </button>
            )}
          </div>
          <div className="hero-modes">
            <span><strong>Consumer</strong> — redesign rooms, check fits, compare products.</span>
            <span><strong>Founder</strong> — a visual workspace for hardware systems: inspect, replace, simulate, compare.</span>
          </div>
        </div>
        <div className="hero-visual">
          <MacFrame>
            {demo
              ? <img src={artifactUrl(demo.capture.imageUri)} alt="A real room reconstructed by PLOP" className="hero-still" />
              : <div className="hero-placeholder">Reconstruction demo</div>}
          </MacFrame>
        </div>
      </section>

      {/* ---- scroll track; the fixed panel renders while it's in view ---- */}
      <div className="story-scroller" ref={scrollerRef} aria-hidden={!inStory}>
        {inStory && (
          <div className="story-fixed">
            <div className="story-caption">
              <div className="story-step">{String(stageIdx + 1).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}</div>
              <h2>{stage.title}</h2>
              <p>{stage.caption}</p>
            </div>
            <MacFrame founder={isFounder}>
              {demo ? (
                <div className="demo-viewport">
                  {!isHive && (
                    <div className={`demo-scene ${tilt ? 'tilted' : ''}`}>
                      <img src={artifactUrl(stageIdx >= 3 ? demo.capture.cleanedUri : demo.capture.imageUri)}
                        alt="" className="demo-base" draggable={false} />

                      {stage.key === 'detect' && (
                        <>
                          <div className="scanline" style={{ top: `${local * 100}%` }} />
                          {bigObjects.map((o, i) => (
                            <div key={o.id} className="detect-box"
                              style={{
                                left: `${px(o, 'x')}%`, top: `${px(o, 'y')}%`,
                                width: `${px(o, 'w')}%`, height: `${px(o, 'h')}%`,
                                opacity: local * STAGES.length > i * 0.15 ? 1 : 0,
                              }}>
                              <span>{o.name}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {stageIdx >= 3 && bigObjects.map((o) => {
                        const isCouch = o.id === couch?.id
                        const isRug = o.id === rug?.id
                        return (
                          <img
                            key={o.id}
                            src={artifactUrl(o.geometry.textureUri!)}
                            alt="" draggable={false}
                            className={[
                              'demo-cutout',
                              isCouch && stageIdx === 3 ? 'selected shifted' : '',
                              isRug && stageIdx >= 4 && !isFounder ? 'zebrafied' : '',
                            ].join(' ')}
                            style={{
                              left: `${px(o, 'x')}%`, top: `${px(o, 'y')}%`,
                              width: `${px(o, 'w')}%`,
                            }}
                          />
                        )
                      })}

                      {/* founder dim as an overlay — CSS `filter` on the big
                          layer is what blanked the compositor before */}
                      {isFounder && <div className="founder-dim" />}
                      {isFounder && (
                        <div className="founder-overlay">
                          {bigObjects.slice(0, 3).map((o) => (
                            <div key={o.id} className="spec-callout" style={{
                              left: `${px(o, 'x') + px(o, 'w') / 2}%`,
                              top: `${px(o, 'y') + 4}%`,
                            }}>
                              <span className="spec-dot" />
                              {o.name} · {(o.dimensions.width * 100).toFixed(0)}cm · inferred
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isHive && (
                    <div className="hive-demo">
                      <div className="hive-demo-head">⬡ Hive — swarm intelligence</div>
                      <div className="honeycomb">
                        {[...Array(7)].map((_, i) => (
                          <div key={i} className="hex" style={{ animationDelay: `${i * 0.18}s` }}>
                            <span className="hex-status">{i < 3 ? 'Working' : i < 5 ? 'Queued' : '✓ Done'}</span>
                          </div>
                        ))}
                      </div>
                      <div className="hive-demo-task">
                        “@hive find 5 rugs under $400 that fit this room”
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hero-placeholder">Run a reconstruction to power this demo</div>
              )}
            </MacFrame>
          </div>
        )}
      </div>

      {/* ---- closing ---- */}
      <section className="closing">
        <h2>Digital twins from the photos you already have.</h2>
        <div className="closing-cols">
          <div>
            <h3>Consumer</h3>
            <p>Rearrange the couch before you move it. Preview a rug at true size.
              Ask Hive to shortlist alternatives that actually fit.</p>
          </div>
          <div>
            <h3>Founder</h3>
            <p>Built for hardware-based startups. Index components, check clearances,
              visualize approximate airflow, and research drop-in replacements —
              with provenance on every number.</p>
          </div>
        </div>
        <Link to="/projects" className="btn primary big">Start with one photo</Link>
        <footer className="site-footer">
          <span>PLOP — reconstruction runs locally; agents run in Hive.</span>
        </footer>
      </section>
    </div>
  )
}

function MacFrame({ children, founder }: { children: React.ReactNode; founder?: boolean }) {
  return (
    <div className={`mac-frame ${founder ? 'founder' : ''}`}>
      <div className="mac-topbar">
        <span className="mac-dot red" /><span className="mac-dot yellow" /><span className="mac-dot green" />
        <span className="mac-title">PLOP — Editor</span>
      </div>
      <div className="mac-screen">{children}</div>
    </div>
  )
}
