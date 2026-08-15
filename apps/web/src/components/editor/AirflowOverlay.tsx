// Approximate airflow visualization for Founder mode.
// Heat sources emit rising warm particles; cooling components emit directed
// cool streams. This is an approximate vector-field visualization, NOT CFD —
// the UI labels it "Approximate airflow" and the architecture leaves room for
// a real solver adapter (e.g. OpenFOAM) behind the same overlay interface.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditor } from '../../state/editor'

const WARM = new THREE.Color('#ff9f45')
const COOL = new THREE.Color('#4ecdc4')

interface Emitter {
  origin: THREE.Vector3
  dir: THREE.Vector3
  color: THREE.Color
  spread: number
}

const COUNT_PER_EMITTER = 60

export default function AirflowOverlay() {
  const { scene, airflow } = useEditor()
  const pointsRef = useRef<THREE.Points>(null)

  const { emitters, positions, colors, seeds } = useMemo(() => {
    const emitters: Emitter[] = []
    if (scene) {
      for (const o of scene.objects) {
        if (o.state.hidden) continue
        const p = new THREE.Vector3(...o.transform.position)
        const role = (o.semantic.identified as any)?.thermal_role
        const isCooling = o.category === 'cooling' || role === 'cooling'
        const isHeat = role === 'heat-source' || o.category === 'compute' || o.category === 'power'
        if (isCooling) {
          emitters.push({ origin: p, dir: new THREE.Vector3(0.6, 0.1, 0.8).normalize(), color: COOL, spread: o.dimensions.width })
        } else if (isHeat) {
          emitters.push({ origin: p, dir: new THREE.Vector3(0, 1, 0), color: WARM, spread: o.dimensions.width * 0.7 })
        }
      }
    }
    const n = emitters.length * COUNT_PER_EMITTER
    const positions = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)
    const seeds = new Float32Array(n)
    emitters.forEach((em, ei) => {
      for (let i = 0; i < COUNT_PER_EMITTER; i++) {
        const idx = ei * COUNT_PER_EMITTER + i
        seeds[idx] = Math.random()
        colors[idx * 3] = em.color.r
        colors[idx * 3 + 1] = em.color.g
        colors[idx * 3 + 2] = em.color.b
      }
    })
    return { emitters, positions, colors, seeds }
  }, [scene?.objects, scene?.id])

  useFrame(({ clock }) => {
    if (!airflow || !pointsRef.current || emitters.length === 0) return
    const t = clock.elapsedTime
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    emitters.forEach((em, ei) => {
      for (let i = 0; i < COUNT_PER_EMITTER; i++) {
        const idx = ei * COUNT_PER_EMITTER + i
        const life = (t * 0.35 + seeds[idx]) % 1
        const jitterX = Math.sin(seeds[idx] * 40 + t) * 0.05
        const jitterZ = Math.cos(seeds[idx] * 30 + t * 0.7) * 0.05
        const spreadX = (seeds[idx] - 0.5) * em.spread
        pos.setXYZ(
          idx,
          em.origin.x + spreadX + em.dir.x * life * 1.2 + jitterX,
          em.origin.y + em.dir.y * life * 1.2,
          em.origin.z + (seeds[idx] % 0.3 - 0.15) + em.dir.z * life * 1.2 + jitterZ,
        )
      }
    })
    pos.needsUpdate = true
    const mat = pointsRef.current.material as THREE.PointsMaterial
    mat.opacity = 0.75
  })

  if (!airflow || emitters.length === 0) return null
  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} vertexColors transparent opacity={0.75} depthWrite={false} />
    </points>
  )
}
