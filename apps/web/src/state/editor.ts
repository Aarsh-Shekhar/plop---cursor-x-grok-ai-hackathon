// Editor state: scene, selection, history (undo/redo), persistence.
// Every mutation goes through applyEdit() which snapshots the previous object
// state onto the undo stack; PATCHes to the backend are debounced.
import { create } from 'zustand'
import { patchScene } from '../lib/api'
import type { Mode, Scene, SceneEditCommand, SceneObject } from '../lib/types'

type Snapshot = SceneObject[]

interface EditorState {
  scene: Scene | null
  selectedId: string | null
  mode: Mode
  toolMode: 'translate' | 'rotate' | 'scale'
  cameraPreset: string | null
  airflow: boolean
  clearance: boolean
  highlighted: string[]
  chatLog: { role: 'user' | 'plop' | 'hive'; text: string }[]
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  dragging: boolean
  hiveRun: { runId: string; hiveUrl: string } | null
  setHiveRun: (r: { runId: string; hiveUrl: string } | null) => void
  hiveScanQuery: string | null
  setHiveScanQuery: (q: string | null) => void

  loadScene: (scene: Scene) => void
  select: (id: string | null) => void
  setToolMode: (m: EditorState['toolMode']) => void
  setCameraPreset: (p: string | null) => void
  setMode: (m: Mode) => void
  setAirflow: (v: boolean) => void
  setClearance: (v: boolean) => void
  setHighlighted: (ids: string[]) => void
  setDragging: (v: boolean) => void
  pushChat: (role: 'user' | 'plop' | 'hive', text: string) => void

  applyEdit: (mutate: (objects: SceneObject[]) => SceneObject[]) => void
  updateObject: (id: string, patch: (o: SceneObject) => SceneObject) => void
  applyCommands: (cmds: SceneEditCommand[]) => void
  undo: () => void
  redo: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(scene: Scene) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    patchScene(scene.id, { objects: scene.objects }).catch(() => { /* retried on next edit */ })
  }, 800)
}

const clone = (objs: SceneObject[]): Snapshot => JSON.parse(JSON.stringify(objs))

export const useEditor = create<EditorState>((set, get) => ({
  scene: null,
  selectedId: null,
  mode: 'consumer',
  toolMode: 'translate',
  cameraPreset: null,
  airflow: false,
  clearance: false,
  highlighted: [],
  chatLog: [],
  undoStack: [],
  redoStack: [],
  dragging: false,
  hiveRun: null,
  setHiveRun: (hiveRun) => set({ hiveRun }),
  hiveScanQuery: null,
  setHiveScanQuery: (hiveScanQuery) => set({ hiveScanQuery }),

  loadScene: (scene) => set({
    scene, mode: scene.mode, selectedId: null, undoStack: [], redoStack: [],
    highlighted: [], chatLog: [], airflow: false, clearance: false,
  }),
  select: (id) => set({ selectedId: id }),
  setToolMode: (toolMode) => set({ toolMode }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setMode: (mode) => {
    const { scene } = get()
    set({ mode })
    if (scene) {
      const next = { ...scene, mode }
      set({ scene: next })
      patchScene(scene.id, { mode }).catch(() => {})
    }
  },
  setAirflow: (airflow) => set({ airflow }),
  setClearance: (clearance) => set({ clearance }),
  setHighlighted: (highlighted) => set({ highlighted }),
  setDragging: (dragging) => set({ dragging }),
  pushChat: (role, text) => set((s) => ({ chatLog: [...s.chatLog, { role, text }] })),

  applyEdit: (mutate) => {
    const { scene, undoStack } = get()
    if (!scene) return
    const before = clone(scene.objects)
    const objects = mutate(clone(scene.objects))
    const next = { ...scene, objects }
    set({ scene: next, undoStack: [...undoStack.slice(-49), before], redoStack: [] })
    persist(next)
  },

  updateObject: (id, patch) => {
    get().applyEdit((objects) => objects.map((o) => (o.id === id ? patch(o) : o)))
  },

  applyCommands: (cmds) => {
    const { applyEdit, setHighlighted, select } = get()
    const highlightIds: string[] = []
    applyEdit((objects) => {
      let next = objects
      for (const cmd of cmds) {
        const targets = new Set(cmd.targetObjectIds)
        switch (cmd.operation) {
          case 'move':
            next = next.map((o) => {
              if (!targets.has(o.id) || o.state.locked) return o
              const p = [...o.transform.position] as [number, number, number]
              if (cmd.params.position) {
                return { ...o, transform: { ...o.transform, position: cmd.params.position } }
              }
              const d = cmd.params.delta ?? [0, 0, 0]
              return { ...o, transform: { ...o.transform, position: [p[0] + d[0], p[1] + d[1], p[2] + d[2]] } }
            })
            break
          case 'rotate':
            next = next.map((o) => targets.has(o.id) && !o.state.locked
              ? { ...o, transform: { ...o.transform, rotationY: o.transform.rotationY + ((cmd.params.degrees ?? 0) * Math.PI) / 180 } }
              : o)
            break
          case 'scale':
            next = next.map((o) => {
              if (!targets.has(o.id) || o.state.locked) return o
              if (cmd.params.dimensions) {
                const dim = { ...o.dimensions, ...cmd.params.dimensions, source: 'user' as const }
                return { ...o, dimensions: dim }
              }
              const f = cmd.params.factor ?? 1
              const s = o.transform.scale
              return { ...o, transform: { ...o.transform, scale: [s[0] * f, s[1] * f, s[2] * f] } }
            })
            break
          case 'set_material':
            next = next.map((o) => targets.has(o.id)
              ? { ...o, appearance: { ...o.appearance, material: { ...o.appearance.material, ...cmd.params.material } } }
              : o)
            break
          case 'hide':
            next = next.map((o) => targets.has(o.id) ? { ...o, state: { ...o.state, hidden: true } } : o)
            break
          case 'show':
            next = next.map((o) => targets.has(o.id) ? { ...o, state: { ...o.state, hidden: false } } : o)
            break
          case 'delete':
            next = next.map((o) => targets.has(o.id) ? { ...o, state: { ...o.state, hidden: true } } : o)
            break
          case 'duplicate': {
            const copies: SceneObject[] = []
            next.forEach((o) => {
              if (targets.has(o.id)) {
                const copy: SceneObject = JSON.parse(JSON.stringify(o))
                copy.id = `obj_new_${Math.random().toString(36).slice(2, 8)}`
                copy.name = `${o.name} copy`
                copy.transform.position = [
                  o.transform.position[0] + o.dimensions.width + 0.15,
                  o.transform.position[1],
                  o.transform.position[2],
                ]
                copies.push(copy)
              }
            })
            next = [...next, ...copies]
            break
          }
          case 'reset':
            // handled by undo history; a per-object reset restores captured transform
            break
          case 'highlight':
            highlightIds.push(...cmd.targetObjectIds)
            break
        }
      }
      return next
    })
    if (highlightIds.length) {
      setHighlighted(highlightIds)
      select(highlightIds[0])
      setTimeout(() => setHighlighted([]), 6000)
    }
  },

  undo: () => {
    const { scene, undoStack, redoStack } = get()
    if (!scene || undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    const next = { ...scene, objects: prev }
    set({
      scene: next,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, clone(scene.objects)],
    })
    persist(next)
  },

  redo: () => {
    const { scene, undoStack, redoStack } = get()
    if (!scene || redoStack.length === 0) return
    const nextObjs = redoStack[redoStack.length - 1]
    const next = { ...scene, objects: nextObjs }
    set({
      scene: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, clone(scene.objects)],
    })
    persist(next)
  },
}))
