// Team demo room (/demo): the upstream repo's photoreal Shapespark room —
// street-view nav arrows, furniture catalog, ruler tool — wrapped with a PLOP
// header and the @hive scan swarm.
import { useState } from 'react'
import DemoRoom3D from '../components/demo/DemoRoom3D'
import HiveScan from '../components/hive/HiveScan'

const DEMO_CAM = {
  pos: [-3.7, 1.12, -0.5] as [number, number, number],
  target: [0.4, 0.25, -4.8] as [number, number, number],
}

export default function Demo() {
  const [hiveQuery, setHiveQuery] = useState<string | null>(null)

  return (
    <div className="editor" data-mode="consumer">
      <header className="editor-header">
        <a href="/" className="brand">PLOP</a>
        <span className="scene-name">SHOWROOM · Living Room — guided catalog demo</span>
        <div className="header-tools">
          <div className="tool-group">
            <button
              title="Deploy the hive swarm: 9 stores scanned in parallel"
              onClick={() => setHiveQuery('')}
            >🐝 hive scan</button>
          </div>
          <div className="tool-group">
            <a className="btn" href="/room" style={{ border: 'none' }}>walkthrough →</a>
          </div>
        </div>
        <div className="header-status">
          <span className="status-pill">real model geometry</span>
          <span className="status-pill subtle">CC0 scene</span>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <DemoRoom3D glbUrl="/demo/room.glb" camera={DEMO_CAM} />
      </div>
      {hiveQuery != null && (
        <HiveScan initialQuery={hiveQuery} onClose={() => setHiveQuery(null)} />
      )}
    </div>
  )
}
