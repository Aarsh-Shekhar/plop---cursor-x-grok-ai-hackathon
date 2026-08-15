// Bottom AI command bar with two explicit modes:
//   EDIT — direct manipulation (validated scene ops), "add <thing>" inserts a
//          real mesh from the object library, "@hive …" deploys the swarm.
//   GOAL — outcome-oriented agent: runs the planning pipeline (objective →
//          constraints → candidates → validation → research → scoring).
// Voice input (from the floating bubble) lands here and auto-submits.
import { useEffect, useRef, useState } from 'react'
import { API_BASE, sendCommand } from '../../lib/api'
import { matchLibrary } from '../../lib/objectLibrary'
import { useEditor } from '../../state/editor'
import type { SceneObject } from '../../lib/types'

export default function CommandBar() {
  const {
    scene, selectedId, applyCommands, pushChat, chatLog, setHiveScanQuery,
    commandMode, setCommandMode, setGoalJobId, applyEdit, select,
  } = useEditor()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isHive = text.trimStart().toLowerCase().startsWith('@hive')

  const insertLibraryItem = (raw: string): boolean => {
    if (!scene) return false
    const lib = matchLibrary(raw)
    if (!lib) return false
    const floor = scene.environment.floorY
    const anchor = scene.objects.find((o) => o.id === selectedId)
    const base: [number, number, number] = anchor
      ? [anchor.transform.position[0] + anchor.dimensions.width / 2 + lib.dims[0] / 2 + 0.2,
         floor + lib.dims[1] / 2, anchor.transform.position[2]]
      : [0, floor + lib.dims[1] / 2, -(scene.capture.depthMinM + scene.capture.depthMaxM) / 2]
    const obj: SceneObject = {
      id: `obj_new_${Math.random().toString(36).slice(2, 8)}`,
      name: lib.label,
      label: lib.key,
      category: lib.category,
      score: 1,
      transform: { position: base, rotationY: 0, scale: [1, 1, 1] },
      dimensions: {
        width: lib.dims[0], height: lib.dims[1], depth: lib.dims[2],
        source: 'user', confidence: 1,
      },
      geometry: { kind: 'library' as any, source: 'object-library', libraryKey: lib.key } as any,
      appearance: { material: { type: 'original' }, dominantColors: [] },
      perception: { confidence: 1, floorStanding: true },
      semantic: { description: `Added from library: ${lib.label}`, productMatches: [] },
      technical: {},
      state: { hidden: false, locked: false },
    }
    applyEdit((objects) => [...objects, obj])
    select(obj.id)
    pushChat('plop', `Added a ${lib.label} (${(lib.dims[0] * 100).toFixed(0)}×${(lib.dims[1] * 100).toFixed(0)} cm) — drag it into place, or Replace/Compare for the real product.`)
    return true
  }

  const submit = async (raw?: string) => {
    const t = (raw ?? text).trim()
    if (!t || !scene || busy) return
    setBusy(true)
    setText('')
    pushChat('user', t)
    try {
      if (t.toLowerCase().startsWith('@hive')) {
        let q = t.replace(/^@hive\s*/i, '')
        const sel = scene.objects.find((o) => o.id === selectedId)
        if (sel) {
          const d = sel.dimensions
          q += ` — similar to my ${sel.name}, about ${(d.width * 100).toFixed(0)}×${(d.height * 100).toFixed(0)} cm`
        }
        pushChat('hive', 'Deploying the swarm — nine workers, nine stores.')
        setHiveScanQuery(q)
      } else if (commandMode === 'goal') {
        const r = await fetch(`${API_BASE}/api/scenes/${scene.id}/goal`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ goal: t }),
        })
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
        const job = await r.json()
        setGoalJobId(job.id)
        pushChat('plop', 'Goal agent running — watch the pipeline in the panel.')
      } else if (/^(add|place|insert|put)\b/i.test(t) && insertLibraryItem(t)) {
        // handled locally by the object library
      } else {
        const res = await sendCommand(scene.id, t, selectedId)
        // NL "add" ops from the backend also route through the library
        const rest = res.commands.filter((c) => c.operation !== 'answer')
        applyCommands(rest)
        const answer = res.commands.find((c) => c.operation === 'answer')?.params.text
        pushChat('plop', answer ?? res.assistantNote)
      }
    } catch (e) {
      pushChat('plop', `That didn't work: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  // voice input lands here and auto-submits
  useEffect(() => {
    const onVoice = (e: Event) => {
      const transcript = (e as CustomEvent<string>).detail
      if (transcript) submit(transcript)
    }
    window.addEventListener('plop-voice', onVoice)
    return () => window.removeEventListener('plop-voice', onVoice)
  })

  const last = chatLog[chatLog.length - 1]

  return (
    <div className="command-bar-wrap">
      {last && (
        <div className={`chat-bubble ${last.role}`}>
          {last.role === 'hive' && <span className="hive-mark">⬡</span>}
          {last.text}
        </div>
      )}
      <div className={`command-bar ${isHive ? 'hive-active' : ''} ${commandMode === 'goal' ? 'goal-active' : ''}`}>
        <div className="cmd-mode" role="tablist">
          <button role="tab" aria-selected={commandMode === 'edit'}
            className={commandMode === 'edit' ? 'on' : ''}
            onClick={() => setCommandMode('edit')}
            title="Direct edits: move, recolor, add, replace">EDIT</button>
          <button role="tab" aria-selected={commandMode === 'goal'}
            className={commandMode === 'goal' ? 'on' : ''}
            onClick={() => setCommandMode('goal')}
            title="Outcome goals: the agent plans, validates, researches, and ranks options">GOAL</button>
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={commandMode === 'goal'
            ? 'Give the agent a goal… e.g. "rearrange for entertaining, keep 30in walkways, don\'t block the window"'
            : selectedId
              ? 'Edit this object… "make it navy" · "add a plant" · @hive to research it'
              : 'Edit the scene… "add a sofa" · "move the rug left" · @hive for research'}
          disabled={busy}
        />
        {isHive && <span className="hive-chip">Hive swarm</span>}
        <button className="btn primary" onClick={() => submit()} disabled={busy || !text.trim()}>
          {busy ? 'Working…' : commandMode === 'goal' ? 'Plan' : 'Send'}
        </button>
      </div>
    </div>
  )
}
