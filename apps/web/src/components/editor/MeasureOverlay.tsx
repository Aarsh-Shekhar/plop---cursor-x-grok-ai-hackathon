// Two-click measurement inside any viewport. Renders the segment, endpoint
// markers, and a distance label with a MEASURED / CALIBRATED / INFERRED tag
// derived from the scene's scale provenance. Units cycle cm → in → m.
import { Line, Html } from '@react-three/drei'
import { useEditor } from '../../state/editor'

export function formatDistance(m: number, unit: 'cm' | 'in' | 'm'): string {
  if (unit === 'cm') return `${(m * 100).toFixed(1)} cm`
  if (unit === 'in') {
    const inches = m * 39.3701
    return inches >= 24 ? `${(inches / 12).toFixed(2)} ft` : `${inches.toFixed(1)}"`
  }
  return `${m.toFixed(3)} m`
}

export function scaleTag(scaleConfidence?: string): string {
  if (scaleConfidence === 'model') return 'MEASURED'
  if (scaleConfidence === 'calibrated') return 'CALIBRATED'
  return 'INFERRED'
}

export default function MeasureOverlay() {
  const { scene, measureMode, measurePoints, measureUnit } = useEditor()
  if (!measureMode || measurePoints.length === 0) return null

  const [a, b] = measurePoints
  const dist = b ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : null
  const mid: [number, number, number] = b
    ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, (a[2] + b[2]) / 2]
    : [a[0], a[1] + 0.08, a[2]]

  return (
    <group>
      {measurePoints.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.02, 12, 12]} />
          <meshBasicMaterial color="#ffd166" depthTest={false} />
        </mesh>
      ))}
      {b && (
        <Line points={[a, b]} color="#ffd166" lineWidth={2.5} depthTest={false} />
      )}
      <Html position={mid} center distanceFactor={4} zIndexRange={[20, 0]}>
        <div className="measure-label">
          {dist != null ? formatDistance(dist, measureUnit) : 'pick 2nd point'}
          {dist != null && <em>{scaleTag(scene?.scaleConfidence)}</em>}
        </div>
      </Html>
    </group>
  )
}
