// Bottom AI command bar. Plain text -> PLOP scene commands (validated
// server-side); "@hive ..." -> creates a real Hive run with serialized scene
// context and opens the original Hive UI in its own window.
import { useRef, useState } from 'react'
import { sendCommand } from '../../lib/api'
import { useEditor } from '../../state/editor'

export default function CommandBar() {
  const { scene, selectedId, applyCommands, pushChat, chatLog, setHiveScanQuery } = useEditor()
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
        // deploy the per-retailer scan swarm, enriched with scene context
        let q = t.replace(/^@hive\s*/i, '')
        const sel = scene.objects.find((o) => o.id === selectedId)
        if (sel) {
          const d = sel.dimensions
          const ident = sel.semantic.identified as Record<string, any> | undefined
          const name = (ident?.product_name as string) ?? sel.name
          q += ` — similar to my ${name}, about ${(d.width * 100).toFixed(0)}×${(d.height * 100).toFixed(0)} cm`
        }
        pushChat('hive', 'Deploying the swarm — nine workers, nine stores.')
        setHiveScanQuery(q)
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
