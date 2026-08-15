// Floating voice bubble (Wispr-flow style): tap to talk, live transcript in
// the bubble, released text lands in the command bar and auto-submits.
// Uses the browser's Web Speech API — no key, no network cost.
import { useEffect, useRef, useState } from 'react'

export default function VoiceBubble() {
  const [supported] = useState(() =>
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef<any>(null)

  useEffect(() => () => { recRef.current?.stop?.() }, [])

  if (!supported) return null

  const toggle = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      let final = ''
      let inter = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else inter += e.results[i][0].transcript
      }
      setInterim(inter || final)
      if (final.trim()) {
        window.dispatchEvent(new CustomEvent('plop-voice', { detail: final.trim() }))
      }
    }
    rec.onend = () => { setListening(false); setInterim('') }
    rec.onerror = () => { setListening(false); setInterim('') }
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <div className="voice-bubble-wrap">
      {listening && (
        <div className="voice-transcript">{interim || 'listening…'}</div>
      )}
      <button
        className={`voice-bubble ${listening ? 'listening' : ''}`}
        onClick={toggle}
        title={listening ? 'Stop listening' : 'Speak a command or goal'}
      >
        {listening ? '◉' : '🎤'}
      </button>
    </div>
  )
}
