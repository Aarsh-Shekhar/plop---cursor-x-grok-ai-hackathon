// Light / dark / pastel theme toggle. Persists to localStorage and stamps
// data-theme on <html> so every page (landing, projects, panels) follows.
import { useEffect, useState } from 'react'

const THEMES = [
  { key: 'light', icon: '☀️', label: 'Light' },
  { key: 'dark', icon: '🌙', label: 'Dark' },
  { key: 'pastel', icon: '🌸', label: 'Pastel' },
] as const

export function applyStoredTheme() {
  const t = localStorage.getItem('plop-theme') ?? 'light'
  document.documentElement.setAttribute('data-theme', t)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem('plop-theme') ?? 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('plop-theme', theme)
  }, [theme])

  return (
    <div className="theme-toggle" role="tablist" aria-label="Color theme">
      {THEMES.map((t) => (
        <button key={t.key} role="tab" aria-selected={theme === t.key}
          className={theme === t.key ? 'on' : ''}
          title={t.label}
          onClick={() => setTheme(t.key)}>
          {t.icon}
        </button>
      ))}
    </div>
  )
}
