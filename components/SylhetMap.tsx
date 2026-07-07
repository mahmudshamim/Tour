// Offline vector map of the Dhaka → Sylhet route.
// Pure inline SVG — no tiles, no network. Renders identically offline.

export default function SylhetMap({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 393 340"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c3326" />
          <stop offset="1" stopColor="#12241a" />
        </linearGradient>
        <radialGradient id="hill" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#2f5a3d" />
          <stop offset="1" stopColor="#1c3326" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="river" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      {/* land base */}
      <rect x="0" y="0" width="393" height="340" fill="url(#land)" />

      {/* soft hill shading near Sylhet (top-right) + Ratargul (bottom) */}
      <ellipse cx="300" cy="90" rx="150" ry="110" fill="url(#hill)" />
      <ellipse cx="300" cy="285" rx="90" ry="70" fill="url(#hill)" opacity="0.7" />

      {/* graticule — faint map grid */}
      <g stroke="#4ade80" strokeWidth="0.5" opacity="0.08">
        <line x1="0" y1="68" x2="393" y2="68" />
        <line x1="0" y1="136" x2="393" y2="136" />
        <line x1="0" y1="204" x2="393" y2="204" />
        <line x1="0" y1="272" x2="393" y2="272" />
        <line x1="78" y1="0" x2="78" y2="340" />
        <line x1="157" y1="0" x2="157" y2="340" />
        <line x1="236" y1="0" x2="236" y2="340" />
        <line x1="315" y1="0" x2="315" y2="340" />
      </g>

      {/* contour lines — terrain feel around the hills */}
      <g fill="none" stroke="#4ade80" strokeWidth="1" opacity="0.12">
        <path d="M210 40 Q 300 20 380 70 Q 320 120 250 100 Q 200 80 210 40 Z" />
        <path d="M235 55 Q 300 45 350 80 Q 310 110 265 95 Q 230 80 235 55 Z" />
        <path d="M250 250 Q 300 235 345 265 Q 315 300 275 300 Q 245 285 250 250 Z" />
      </g>

      {/* forest patch near Ratargul */}
      <g fill="#22c55e" opacity="0.16">
        <circle cx="285" cy="270" r="9" />
        <circle cx="300" cy="278" r="11" />
        <circle cx="315" cy="268" r="8" />
        <circle cx="298" cy="260" r="7" />
      </g>

      {/* Surma river winding across */}
      <path
        d="M-10 200 C 80 175, 120 235, 200 215 S 330 250, 410 235"
        fill="none"
        stroke="url(#river)"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* small tributary */}
      <path
        d="M200 215 C 230 190, 250 150, 300 120"
        fill="none"
        stroke="url(#river)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* haor water body near Sylhet */}
      <ellipse cx="120" cy="230" rx="26" ry="12" fill="#2563eb" opacity="0.55" />

      {/* highway casing under the animated route (overlay draws the bright line) */}
      <path
        d="M60 40 C 120 70, 90 140, 170 160 S 300 200, 300 280"
        fill="none"
        stroke="#0a140d"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* city markers + labels */}
      <g fontFamily="inherit" fontWeight="700">
        {/* Dhaka — start */}
        <text x="70" y="34" fontSize="12" fill="#eafff2">ঢাকা</text>
        {/* Sylhet — end */}
        <text x="286" y="304" fontSize="12" fill="#eafff2" textAnchor="end">
          সিলেট
        </text>
        {/* river label */}
        <text
          x="150"
          y="210"
          fontSize="8.5"
          fill="#bcdcff"
          opacity="0.85"
          fontWeight="600"
        >
          সুরমা নদী
        </text>
      </g>

      {/* compass */}
      <g transform="translate(28,300)" opacity="0.6">
        <circle r="12" fill="none" stroke="#4ade80" strokeWidth="1" />
        <path d="M0 -9 L3 2 L0 -1 L-3 2 Z" fill="#4ade80" />
        <text x="0" y="-13" fontSize="7" fill="#4ade80" textAnchor="middle">
          N
        </text>
      </g>
    </svg>
  );
}
