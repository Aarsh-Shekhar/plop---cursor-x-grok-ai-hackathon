// Landing page. The product story is plain in-flow sections — no sticky, no
// fixed overlays, no scroll hijacking. Two earlier scroll-scrub approaches
// (sticky + fixed panel) both hit Chromium compositor blanking; normal
// document flow cannot. Reveal-on-scroll is a CSS-only IntersectionObserver
// fade, which degrades gracefully to "always visible".
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { artifactUrl, listScenes, getScene } from '../lib/api'
import type { Scene, SceneObject } from '../lib/types'

export default function Landing() {
  const [demo, setDemo] = useState<Scene | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    listScenes().then(async (all) => {
      const ready = all.find((s) => s.status === 'ready' && s.mode === 'consumer') ?? all.find((s) => s.status === 'ready')
      if (ready) setDemo(await getScene(ready.id))
    }).catch(() => {})
  }, [])

  // reveal-on-scroll: adds .visible once; nothing is ever hidden permanently
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) e.target.classList.add('visible')
    }, { threshold: 0.25 })
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [demo])

  const bigObjects = useMemo(() => {
    if (!demo) return []
    return [...demo.objects]
      .filter((o) => o.geometry.box && o.geometry.textureUri)
      .sort((a, b) => b.dimensions.width * b.dimensions.height - a.dimensions.width * a.dimensions.height)
      .slice(0, 5)
  }, [demo])

  const couch = bigObjects[0]
  const rug = demo?.objects.find((o) => o.label.includes('rug')) ?? bigObjects[1]

  return (
    <div className="landing" data-mode="consumer">
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
            <button className="btn primary big" onClick={() => navigate('/demo')}>
              Try the demo room
            </button>
            <button className="btn big" onClick={() => navigate('/room')}>
              Walkable room v1
            </button>
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

      {/* ---- product story: normal sections ---- */}
      <StorySection
        n="01" title="PLOP finds every object"
        caption="Open-vocabulary detection, instance masks, and metric depth — computed locally from one photo."
      >
        {demo && (
          <DemoShot demo={demo}>
            {bigObjects.map((o) => <DetectBox key={o.id} demo={demo} o={o} />)}
          </DemoShot>
        )}
      </StorySection>

      <StorySection
        n="02" title="The room becomes an editable 3D scene" flip
        caption="Objects are cut out and indexed; the backdrop is inpainted clean, so moving things never leaves ghosts."
      >
        {demo && (
          <DemoShot demo={demo} cleaned tilt>
            {bigObjects.map((o) => (
              <Cutout key={o.id} demo={demo} o={o}
                className={o.id === couch?.id ? 'selected' : ''} />
            ))}
          </DemoShot>
        )}
      </StorySection>

      <StorySection
        n="03" title="Edit with plain language"
        caption={'"Make this rug zebra print." The rug keeps its real shading and folds — only the material changes.'}
      >
        {demo && (
          <DemoShot demo={demo} cleaned>
            {bigObjects.map((o) => (
              <Cutout key={o.id} demo={demo} o={o}
                className={o.id === rug?.id ? 'zebrafied' : ''} />
            ))}
          </DemoShot>
        )}
      </StorySection>

      <StorySection
        n="04" title="Founder mode" flip founder
        caption="A graphite digital-twin workspace for hardware startups: component specs with provenance, clearance checks, approximate airflow."
      >
        {demo && (
          <DemoShot demo={demo} dim>
            {bigObjects.slice(0, 3).map((o) => (
              <div key={o.id} className="spec-callout" style={{
                left: `${boxPct(demo, o, 'x') + boxPct(demo, o, 'w') / 2}%`,
                top: `${boxPct(demo, o, 'y') + 4}%`,
              }}>
                <span className="spec-dot" />
                {o.name} · {(o.dimensions.width * 100).toFixed(0)}cm · inferred
              </div>
            ))}
          </DemoShot>
        )}
      </StorySection>

      <StorySection
        n="05" title="@hive deploys a swarm"
        caption="One request fans out into parallel workers — one per retailer or research angle — in Hive's own honeycomb UI, with approvals on anything consequential."
      >
        <div className="hive-demo static">
          <div className="hive-demo-head">⬡ Hive — swarm intelligence</div>
          <div className="honeycomb">
            {['Amazon', 'eBay', 'Wayfair', 'Target', 'Etsy', 'Walmart', 'Pricing'].map((name, i) => (
              <div key={name} className="hex" style={{ animationDelay: `${i * 0.18}s` }}>
                <span className="hex-name">{name}</span>
                <span className="hex-status">{i < 4 ? 'Working' : i < 6 ? 'Queued' : '✓ Done'}</span>
              </div>
            ))}
          </div>
          <div className="hive-demo-task">
            “@hive find 5 rugs under $400 that fit this room”
          </div>
        </div>
      </StorySection>

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

/* ---------- helpers ---------- */

function boxPct(demo: Scene, o: SceneObject, k: 'x' | 'y' | 'w' | 'h'): number {
  const [x0, y0, x1, y1] = o.geometry.box!
  const W = demo.capture.width
  const H = demo.capture.height
  switch (k) {
    case 'x': return (x0 / W) * 100
    case 'y': return (y0 / H) * 100
    case 'w': return ((x1 - x0) / W) * 100
    case 'h': return ((y1 - y0) / H) * 100
  }
}

function StorySection({ n, title, caption, flip, founder, children }: {
  n: string
  title: string
  caption: string
  flip?: boolean
  founder?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  return (
    <section ref={ref} className={`story-section reveal ${flip ? 'flip' : ''}`}
      data-mode={founder ? 'founder' : undefined}>
      <div className="story-caption">
        <div className="story-step">{n}</div>
        <h2>{title}</h2>
        <p>{caption}</p>
      </div>
      <MacFrame founder={founder}>
        <div className="demo-viewport">{children}</div>
      </MacFrame>
    </section>
  )
}

function DemoShot({ demo, cleaned, tilt, dim, children }: {
  demo: Scene
  cleaned?: boolean
  tilt?: boolean
  dim?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`demo-scene ${tilt ? 'tilted' : ''}`}>
      <img src={artifactUrl(cleaned ? demo.capture.cleanedUri : demo.capture.imageUri)}
        alt="" className="demo-base" draggable={false} loading="lazy" />
      {dim && <div className="founder-dim" />}
      {children}
    </div>
  )
}

function DetectBox({ demo, o }: { demo: Scene; o: SceneObject }) {
  return (
    <div className="detect-box visible-box" style={{
      left: `${boxPct(demo, o, 'x')}%`, top: `${boxPct(demo, o, 'y')}%`,
      width: `${boxPct(demo, o, 'w')}%`, height: `${boxPct(demo, o, 'h')}%`,
    }}>
      <span>{o.name}</span>
    </div>
  )
}

function Cutout({ demo, o, className }: { demo: Scene; o: SceneObject; className?: string }) {
  return (
    <img
      src={artifactUrl(o.geometry.textureUri!)}
      alt="" draggable={false} loading="lazy"
      className={`demo-cutout ${className ?? ''}`}
      style={{
        left: `${boxPct(demo, o, 'x')}%`, top: `${boxPct(demo, o, 'y')}%`,
        width: `${boxPct(demo, o, 'w')}%`,
      }}
    />
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
