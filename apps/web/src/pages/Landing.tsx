// Landing page: animated hero (scan → snap → reorganize), a real explanation
// of what PLOP is, feature grid, demo links, hive section. Plain in-flow
// sections only — nothing here can white-screen.
import { Link, useNavigate } from 'react-router-dom'
import ScanAnimation from '../components/landing/ScanAnimation'
import ThemeToggle from '../components/ThemeToggle'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="landing" data-mode="consumer">
      <header className="site-header landing-header">
        <span className="brand">PLOP</span>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ThemeToggle />
          <Link to="/projects" className="btn">Open app</Link>
        </nav>
      </header>

      {/* ---- hero ---- */}
      <section className="hero">
        <div className="hero-copy">
          <h1>Turn your space into an editable 3D workspace.</h1>
          <p>
            Scan a room or a machine with the photos you already have. PLOP
            rebuilds it as a digital twin where every object is selectable,
            movable, and researchable — then a swarm of agents finds the real
            products to make your changes happen.
          </p>
          <div className="hero-actions">
            <button className="btn primary big" onClick={() => navigate('/demo')}>
              Try the demo room
            </button>
            <button className="btn big" onClick={() => navigate('/pc')}>
              Open the PC rig
            </button>
          </div>
          <div className="hero-modes">
            <span><strong>Consumer</strong> — redesign rooms, check fits, compare products before buying.</span>
            <span><strong>Founder</strong> — a component-level workspace for hardware: inspect, replace, simulate, compare.</span>
          </div>
        </div>
        <div className="hero-visual">
          <ScanAnimation />
        </div>
      </section>

      {/* ---- what it actually does ---- */}
      <section className="info-section alt">
        <h2 className="section-title">What PLOP actually is</h2>
        <p className="section-sub">
          Figma for the physical world: capture reality, edit it like a design
          file, then let agents act on the result. Four stages, all real:
        </p>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-num">01 · CAPTURE</div>
            <h3>Photos in</h3>
            <p>Upload a photo of a room, desk, or hardware system. Open-vocabulary
              detection, instance masks, and metric depth run locally — every
              meaningful object gets found and indexed.</p>
          </div>
          <div className="step-card">
            <div className="step-num">02 · RECONSTRUCT</div>
            <h3>An editable 3D twin</h3>
            <p>The scene becomes navigable 3D. Objects carry real dimensions with
              provenance — the UI always tells you what's measured spec versus
              inferred, and never fakes certainty.</p>
          </div>
          <div className="step-card">
            <div className="step-num">03 · EDIT</div>
            <h3>Change anything</h3>
            <p>Drag the couch across the room. Type "make this rug zebra print."
              Pull the GPU out of the case. Every edit is undoable, and removed
              objects never leave ghosts behind.</p>
          </div>
          <div className="step-card">
            <div className="step-num">04 · ACT</div>
            <h3>The hive does the legwork</h3>
            <p>@hive deploys a swarm — one worker bee per store — that returns
              real products with prices, ratings, and links. One click places a
              find in your scene at its listed size.</p>
          </div>
        </div>
      </section>

      {/* ---- feature grid ---- */}
      <section className="info-section">
        <h2 className="section-title">Built to be believed</h2>
        <p className="section-sub">
          No fake buttons, no pretend physics. Everything below works in the
          demos on this page.
        </p>
        <div className="features-grid">
          <div className="feature-row"><span className="fi">📐</span><div>
            <b>True dimensions</b>
            <span>Objects carry real-world sizes — ATX specs in the PC rig, model
              geometry in the rooms — and preview candidates land at their listed
              manufacturer dimensions.</span>
          </div></div>
          <div className="feature-row"><span className="fi">💬</span><div>
            <b>Natural-language edits</b>
            <span>The command bar turns plain English into validated scene
              operations. The model can only emit known, safe edit commands —
              never arbitrary changes.</span>
          </div></div>
          <div className="feature-row"><span className="fi">🐝</span><div>
            <b>A real agent swarm</b>
            <span>Nine parallel workers scan nine stores with live, domain-locked
              web search. When a bee comes back weak, it asks you a question and
              re-flies with your answer.</span>
          </div></div>
          <div className="feature-row"><span className="fi">🖥</span><div>
            <b>Founder mode for hardware</b>
            <span>For teams building PCs, robots, drones, semiconductors and
              PCBs: component trees, power/thermal roles, connectors, exploded
              views, and an honestly-labeled approximate airflow model.</span>
          </div></div>
          <div className="feature-row"><span className="fi">↩️</span><div>
            <b>Undo everything</b>
            <span>Every move, removal, material change, and placement is one ⌘Z
              away. Scenes persist across refreshes.</span>
          </div></div>
          <div className="feature-row"><span className="fi">🚶</span><div>
            <b>Walk your spaces</b>
            <span>WASD through photoreal rooms, orbit hardware on the bench,
              measure real distances, and place new items exactly where they'd
              go.</span>
          </div></div>
        </div>
      </section>

      {/* ---- demo links ---- */}
      <section className="info-section alt">
        <h2 className="section-title">Three live demos</h2>
        <p className="section-sub">All hardcoded, all editable, all connected to the hive.</p>
        <div className="demo-cards">
          <Link to="/demo" className="demo-card">
            <b>🛋 SHOWROOM — guided demo</b>
            <span>The 2-minute pitch: photoreal room, street-view arrows, themed
              furniture catalog, measuring tape. Start here.</span>
            <span className="go">Open →</span>
          </Link>
          <Link to="/pc" className="demo-card">
            <b>🖥 Reference PC build</b>
            <span>A full ATX rig at true spec dimensions — GPU, AIO, RAM, PSU,
              fans. Exploded view, spinning fans, approximate airflow, part
              shopping via the swarm.</span>
            <span className="go">Open →</span>
          </Link>
          <Link to="/datacenter" className="demo-card">
            <b>🏢 DATACENTER — facility twin</b>
            <span>Walk rack aisles, swap GPUs/storage/switches, watch live DCIM
              telemetry react, procure via a vendor swarm — then zoom into one
              server down to its components.</span>
            <span className="go">Open →</span>
          </Link>
          <Link to="/room" className="demo-card">
            <b>🚶 WALKTHROUGH — deep-dive twin</b>
            <span>The full editor on a free-roam room: WASD walking, inspector,
              Goal Mode agent, measurement, technical scene graph.</span>
            <span className="go">Open →</span>
          </Link>
          <Link to="/office" className="demo-card">
            <b>💼 OFFICE — workspace twin</b>
            <span>A walkable office: desks, meeting zone, lounge corner. Same
              full editor — rearrange the layout, set goals, research real
              furniture via the swarm.</span>
            <span className="go">Open →</span>
          </Link>
        </div>
      </section>

      {/* ---- hive section ---- */}
      <section className="info-section">
        <h2 className="section-title">@hive — swarm intelligence</h2>
        <p className="section-sub">
          Ask for anything purchasable and the hive fans out: one hexagon per
          store, buzzing while it searches, green when it lands a find. Weak
          matches come back as questions you answer in chat — that bee then
          re-flies with your guidance.
        </p>
        <div className="hive-demo static" style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', maxWidth: 880, margin: '0 auto', padding: '40px 20px' }}>
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
      </section>

      {/* ---- closing ---- */}
      <section className="closing">
        <h2>Digital twins from the photos you already have.</h2>
        <div className="closing-cols">
          <div>
            <h3>Consumer</h3>
            <p>Rearrange the couch before you move it. Preview a rug at true size.
              Ask the hive to shortlist alternatives that actually fit.</p>
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
          <span>PLOP — reconstruction runs locally; agents run in the hive.</span>
        </footer>
      </section>
    </div>
  )
}
