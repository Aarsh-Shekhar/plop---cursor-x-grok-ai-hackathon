// Hero animation: a stick figure scans a living room with their phone — a
// blue ray sweeps the furniture — then snaps their fingers, a cloud poofs,
// and the whole room reorganizes. Pure SVG + CSS keyframes on a 10s loop.
export default function ScanAnimation() {
  return (
    <div className="scan-anim">
      <svg viewBox="0 0 800 500" role="img" aria-label="A person scans a room with a phone; the furniture reorganizes itself">
        <defs>
          <linearGradient id="sa-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4d96ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#4d96ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sa-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2f3a" />
            <stop offset="1" stopColor="#20242d" />
          </linearGradient>
        </defs>

        {/* room shell */}
        <rect x="0" y="0" width="800" height="500" fill="#171b22" />
        <rect x="0" y="380" width="800" height="120" fill="url(#sa-floor)" />
        <line x1="0" y1="380" x2="800" y2="380" stroke="#3a4150" strokeWidth="2" />
        {/* window */}
        <rect x="560" y="60" width="150" height="150" rx="6" fill="#232b3a" stroke="#3a4150" strokeWidth="3" />
        <line x1="635" y1="60" x2="635" y2="210" stroke="#3a4150" strokeWidth="3" />
        <line x1="560" y1="135" x2="710" y2="135" stroke="#3a4150" strokeWidth="3" />

        {/* ---- furniture (each group animates to its new spot on the snap) ---- */}
        <g className="sa-furn sa-rug">
          <ellipse cx="470" cy="430" rx="150" ry="26" fill="#33405c" opacity="0.8" />
          <ellipse cx="470" cy="430" rx="110" ry="17" fill="none" stroke="#4a5a7a" strokeWidth="3" />
        </g>
        <g className="sa-furn sa-sofa">
          <rect x="360" y="320" width="170" height="60" rx="10" fill="#5b6c8f" />
          <rect x="352" y="300" width="186" height="34" rx="10" fill="#6c7ea3" />
          <rect x="352" y="352" width="16" height="30" fill="#46536e" />
          <rect x="522" y="352" width="16" height="30" fill="#46536e" />
          <rect x="380" y="306" width="38" height="24" rx="6" fill="#8fa3c9" />
          <rect x="424" y="306" width="38" height="24" rx="6" fill="#c9a06b" />
        </g>
        <g className="sa-furn sa-table">
          <rect x="430" y="392" width="90" height="10" rx="4" fill="#7a5c3e" />
          <rect x="438" y="402" width="8" height="26" fill="#5e462f" />
          <rect x="504" y="402" width="8" height="26" fill="#5e462f" />
        </g>
        <g className="sa-furn sa-lamp">
          <rect x="612" y="290" width="6" height="96" fill="#8a919c" />
          <polygon points="590,290 640,290 628,258 602,258" fill="#e8c96a" />
          <ellipse cx="615" cy="388" rx="22" ry="6" fill="#3a4150" />
          <circle className="sa-lamp-glow" cx="615" cy="276" r="26" fill="#e8c96a" opacity="0.15" />
        </g>
        <g className="sa-furn sa-plant">
          <rect x="700" y="352" width="34" height="32" rx="4" fill="#a5674a" />
          <path d="M717 352 C700 320 704 300 717 284 C730 300 734 320 717 352" fill="#5e7d4f" />
          <path d="M717 348 C698 330 686 322 678 306 C700 306 712 322 717 348" fill="#6c8f5c" />
          <path d="M717 348 C736 330 748 322 756 306 C734 306 722 322 717 348" fill="#527045" />
        </g>
        <g className="sa-furn sa-tv">
          <rect x="180" y="270" width="130" height="78" rx="6" fill="#10131a" stroke="#3a4150" strokeWidth="3" />
          <rect x="235" y="348" width="20" height="18" fill="#3a4150" />
          <rect x="200" y="366" width="90" height="8" rx="4" fill="#46536e" />
        </g>

        {/* scanned-object highlight pulses (during scan phase) */}
        <g className="sa-highlights" fill="none" stroke="#4d96ff" strokeWidth="2.5">
          <rect className="sa-hl sa-hl1" x="348" y="296" width="194" height="90" rx="10" />
          <rect className="sa-hl sa-hl2" x="426" y="388" width="98" height="44" rx="6" />
          <rect className="sa-hl sa-hl3" x="586" y="254" width="58" height="136" rx="6" />
          <rect className="sa-hl sa-hl4" x="176" y="266" width="138" height="112" rx="6" />
        </g>

        {/* ---- stick figure with phone ---- */}
        <g className="sa-figure" stroke="#e6e9ee" strokeWidth="5" strokeLinecap="round" fill="none">
          <circle cx="86" cy="238" r="20" fill="#171b22" />
          <line x1="86" y1="258" x2="86" y2="330" />
          <line x1="86" y1="330" x2="64" y2="392" />
          <line x1="86" y1="330" x2="108" y2="392" />
          <line x1="86" y1="276" x2="56" y2="308" />
          {/* scanning arm (swaps to snap pose via CSS) */}
          <g className="sa-arm-scan">
            <line x1="86" y1="276" x2="128" y2="266" />
            <rect x="126" y="252" width="16" height="28" rx="4" fill="#2a2f3a" stroke="#8ab4ff" strokeWidth="2.5" />
          </g>
          <g className="sa-arm-snap">
            <line x1="86" y1="276" x2="120" y2="238" />
            <path d="M120 238 l10 -8 M120 238 l13 -1 M120 238 l6 -13" strokeWidth="3.5" />
          </g>
        </g>

        {/* scan beam cone + sweep line */}
        <g className="sa-beam-group">
          <polygon className="sa-beam" points="142,262 760,120 760,420" fill="url(#sa-beam)" />
          <line className="sa-scanline" x1="180" y1="0" x2="770" y2="0" stroke="#7cb7ff" strokeWidth="3" opacity="0.9" />
        </g>

        {/* snap burst + poof cloud */}
        <g className="sa-snap-star" stroke="#ffd166" strokeWidth="4" strokeLinecap="round">
          <path d="M132 226 l0 -18 M132 226 l14 -12 M132 226 l18 0 M132 226 l14 12 M132 226 l-14 12" />
        </g>
        <g className="sa-cloud" fill="#c9d2e0">
          <circle cx="430" cy="330" r="46" />
          <circle cx="490" cy="316" r="58" />
          <circle cx="552" cy="332" r="48" />
          <circle cx="470" cy="352" r="52" />
          <circle cx="530" cy="356" r="44" />
        </g>
        <g className="sa-sparkles" fill="#8ab4ff">
          <circle cx="420" cy="300" r="4" /><circle cx="560" cy="290" r="3" />
          <circle cx="500" cy="270" r="3.5" /><circle cx="610" cy="330" r="3" />
          <circle cx="380" cy="340" r="3" />
        </g>

        {/* captions */}
        <text className="sa-cap sa-cap-scan" x="400" y="46" textAnchor="middle" fill="#8ab4ff"
          fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="2">SCANNING ROOM…</text>
        <text className="sa-cap sa-cap-done" x="400" y="46" textAnchor="middle" fill="#7ddba3"
          fontSize="19" fontFamily="ui-monospace, monospace" letterSpacing="2">ROOM REORGANIZED ✓</text>
      </svg>
    </div>
  )
}
