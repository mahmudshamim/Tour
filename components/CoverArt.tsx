// A little landscape at the bottom of a tour's cover, picked from its
// emoji — tea gardens for Sylhet, waves for the sea, peaks for the hills.
// Pure SVG in translucent white/black, so it sits on any accent colour.

import type { ReactElement } from "react";

type Scene = "tea" | "sea" | "island" | "hills" | "forest" | "lake" | "city";

const SCENE: Record<string, Scene> = {
  "🍃": "tea",
  "🍵": "tea",
  "🌿": "tea",
  "☕": "tea",
  "🌊": "sea",
  "🏖️": "sea",
  "🌅": "sea",
  "🚢": "sea",
  "🏝️": "island",
  "🌳": "forest",
  "🐅": "forest",
  "🏕️": "forest",
  "🌸": "forest",
  "🛶": "lake",
  "🏙️": "city",
  "🏛️": "city",
  "🕌": "city",
  "✈️": "city",
};

export const sceneFor = (cover: string): Scene => SCENE[cover] ?? "hills";

const W = "rgba(255,255,255,";
const K = "rgba(0,0,0,";

function Tea() {
  return (
    <>
      <path d="M0 58 Q 50 36 100 52 T 200 44 V100 H0Z" fill={`${W}.10)`} />
      <path d="M0 72 Q 60 52 120 67 T 200 62 V100 H0Z" fill={`${K}.13)`} />
      {/* rows of tea bushes following the slope */}
      <g fill="none" stroke={`${W}.2)`} strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 79 Q 60 60 118 74 T 198 69" />
        <path d="M2 86 Q 60 68 116 81 T 198 77" />
        <path d="M2 93 Q 64 77 124 88 T 198 85" />
      </g>
      <path d="M0 90 Q 70 80 140 88 T 200 86 V100 H0Z" fill={`${K}.18)`} />
      {/* shade tree */}
      <g fill={`${K}.24)`}>
        <rect x="149" y="44" width="2.4" height="20" />
        <ellipse cx="150" cy="43" rx="13" ry="5.5" />
        <ellipse cx="146" cy="38" rx="7" ry="3.5" />
      </g>
    </>
  );
}

function Sea() {
  const wave = (y: number) =>
    `M0 ${y} Q 12.5 ${y - 6} 25 ${y} T 50 ${y} T 75 ${y} T 100 ${y} T 125 ${y} T 150 ${y} T 175 ${y} T 200 ${y} V100 H0Z`;
  return (
    <>
      <circle cx="152" cy="36" r="13" fill={`${W}.2)`} />
      <path d={wave(66)} fill={`${W}.12)`} />
      <path d={wave(78)} fill={`${K}.12)`} />
      <path d={wave(90)} fill={`${K}.18)`} />
    </>
  );
}

function Island() {
  return (
    <>
      <circle cx="46" cy="34" r="11" fill={`${W}.2)`} />
      <path d="M58 84 Q 100 58 150 84Z" fill={`${K}.2)`} />
      {/* palm */}
      <path d="M108 70 Q 112 52 106 40" stroke={`${K}.3)`} strokeWidth="2.4" fill="none" />
      <g fill={`${K}.3)`}>
        <path d="M106 40 Q 92 36 84 46 Q 96 40 106 42Z" />
        <path d="M106 40 Q 120 34 128 44 Q 116 39 106 42Z" />
        <path d="M106 40 Q 104 28 94 26 Q 104 32 105 41Z" />
      </g>
      <rect y="82" width="200" height="18" fill={`${W}.12)`} />
      <g stroke={`${W}.25)`} strokeWidth="1.2">
        <line x1="14" y1="90" x2="44" y2="90" />
        <line x1="150" y1="92" x2="186" y2="92" />
      </g>
    </>
  );
}

function Hills() {
  return (
    <>
      <path
        d="M0 100 L34 56 L58 76 L96 30 L132 78 L160 56 L200 88 V100Z"
        fill={`${K}.14)`}
      />
      <path d="M96 30 L86 43 L93 41 L98 47 L106 42Z" fill={`${W}.35)`} />
      <path d="M34 56 L28 64 L35 62 L39 66Z" fill={`${W}.3)`} />
      <path d="M0 100 L50 80 L90 98 L134 74 L176 96 L200 84 V100Z" fill={`${K}.2)`} />
    </>
  );
}

function Forest() {
  const tree = (x: number, h: number) => `M${x - h * 0.38} 100 L${x} ${100 - h} L${x + h * 0.38} 100Z`;
  return (
    <>
      <g fill={`${K}.14)`}>
        {[12, 40, 70, 104, 136, 168, 192].map((x, i) => (
          <path key={x} d={tree(x, 44 + (i % 3) * 10)} />
        ))}
      </g>
      <g fill={`${K}.22)`}>
        {[26, 56, 88, 120, 152, 182].map((x, i) => (
          <path key={x} d={tree(x, 30 + (i % 2) * 8)} />
        ))}
      </g>
    </>
  );
}

function Lake() {
  return (
    <>
      <path d="M0 68 L40 46 L70 62 L110 38 L150 60 L200 48 V76 H0Z" fill={`${K}.16)`} />
      <rect y="76" width="200" height="24" fill={`${W}.12)`} />
      <g stroke={`${W}.25)`} strokeWidth="1.2">
        <line x1="18" y1="84" x2="58" y2="84" />
        <line x1="88" y1="92" x2="138" y2="92" />
        <line x1="150" y1="83" x2="186" y2="83" />
      </g>
      <path d="M116 80 L140 80 L135 85 L121 85Z" fill={`${K}.3)`} />
      <line x1="128" y1="80" x2="132" y2="70" stroke={`${K}.3)`} strokeWidth="1.2" />
    </>
  );
}

function City() {
  const back = [
    [0, 60, 18], [20, 48, 16], [40, 66, 22], [66, 40, 14], [84, 56, 20],
    [108, 34, 16], [128, 58, 18], [150, 46, 20], [174, 62, 26],
  ];
  const front = [[8, 76, 24], [36, 70, 18], [60, 80, 30], [96, 72, 22], [124, 78, 26], [156, 70, 20], [180, 80, 20]];
  return (
    <>
      <g fill={`${K}.13)`}>
        {back.map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={100 - y} />
        ))}
      </g>
      <g fill={`${K}.2)`}>
        {front.map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={100 - y} />
        ))}
      </g>
    </>
  );
}

const DRAW: Record<Scene, () => ReactElement> = {
  tea: Tea,
  sea: Sea,
  island: Island,
  hills: Hills,
  forest: Forest,
  lake: Lake,
  city: City,
};

/** A tour's photo filling its cover. Decorative — the name is right there. */
export function CoverPhoto({ src, className = "" }: { src: string; className?: string }) {
  return (
    <img
      className={`cv-photo ${className}`}
      src={src}
      alt=""
      decoding="async"
      draggable={false}
    />
  );
}

export default function CoverArt({
  cover,
  className,
}: {
  cover: string;
  className?: string;
}) {
  const Draw = DRAW[sceneFor(cover)];
  return (
    <svg
      className={className}
      viewBox="0 0 200 100"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
    >
      <Draw />
    </svg>
  );
}
