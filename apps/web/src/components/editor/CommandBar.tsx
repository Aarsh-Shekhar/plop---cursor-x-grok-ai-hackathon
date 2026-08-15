// Bottom AI command bar. Plain text -> PLOP scene commands (validated
// server-side); "@hive ..." -> creates a real Hive run with serialized scene
// context and opens the original Hive UI in its own window.
import { useRef, useState } from 'react'
import { createHiveRun, sendCommand } from '../../lib/api'
import { useEditor } from '../../state/editor'

export default function CommandBar() {
  const { scene, selectedId, applyCommands, pushChat, chatLog, setHiveRun } = useEditor()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isHive = text.trimStart().toLowerCase().startsWith('@hive')

  const submit = async () => {
    const t = text.trim()
    if (!t || !scene || busy) return
    setBusy(true)
    setText('')
    pushChat('user', t)
    try {
      if (t.toLowerCase().startsWith('@hive')) {
        const prompt = t.replace(/^@hive\s*/i, '')
        pushChat('hive', 'Deploying Hive swarm…')
        const res = await createHiveRun(prompt, scene.id, selectedId ? [selectedId] : [])
        pushChat('hive', `Swarm deployed — ${res.workerCount ?? 'several'} workers on it. Opening the Hive window.`)
        setHiveRun({ runId: res.run.id, hiveUrl: res.hiveUrl })
        window.open(res.hiveUrl, 'plop-hive', 'width=1440,height=920')
      } else {
        const res = await sendCommand(scene.id, t, selectedId)
        applyCommands(res.commands)
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

  const last = chatLog[chatLog.length - 1]

  return (
    <div className="command-bar-wrap">
      {last && (
        <div className={`chat-bubble ${last.role}`}>
          {last.role === 'hive' && <span className="hive-mark">⬡</span>}
          {last.text}
        </div>
      )}
      <div className={`command-bar ${isHive ? 'hive-active' : ''}`}>
        <span className="cb-icon">{busy ? '◌' : isHive ? '⬡' : '✦'}</span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={selectedId
            ? 'Ask PLOP to change this object… or @hive to research it online'
            : 'Ask PLOP to change this scene… or @hive for research and actions'}
          disabled={busy}
        />
        {isHive && <span className="hive-chip">Hive swarm</span>}
        <button className="btn primary" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? 'Working…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
