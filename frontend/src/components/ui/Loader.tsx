import React,{ useEffect } from 'react';
import { BRAND } from '../../constants';

// ── Inject keyframes once into <head> ────────────────────────────────────────
const STYLE_ID = 'geekey-loader-keyframes';

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes gear-cw  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
    @keyframes gear-ccw { from { transform: rotate(0deg);   } to { transform: rotate(-360deg); } }
  `;
  document.head.appendChild(style);
}

// ── Gear SVG path (12-tooth gear, centred at 0,0) ────────────────────────────
// Generated mathematically: outer radius R, inner radius r, 12 teeth
function gearPath(R: number, r: number, teeth: number, holeR: number): string {
  const step = (Math.PI * 2) / teeth;
  const toothWidth = step * 0.35; // half-angle of tooth top
  const pts: [number, number][] = [];

  for (let i = 0; i < teeth; i++) {
    const base = i * step;
    // valley → root circle
    pts.push([r * Math.cos(base - toothWidth * 1.4), r * Math.sin(base - toothWidth * 1.4)]);
    // rise to tip
    pts.push([R * Math.cos(base - toothWidth), R * Math.sin(base - toothWidth)]);
    // tip flat
    pts.push([R * Math.cos(base + toothWidth), R * Math.sin(base + toothWidth)]);
    // drop back to root
    pts.push([r * Math.cos(base + toothWidth * 1.4), r * Math.sin(base + toothWidth * 1.4)]);
  }

  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`).join(' ') + ' Z';
  // Centre hole (counter-clockwise to cut out)
  const holeSteps = 32;
  const hole = Array.from({ length: holeSteps }, (_, i) => {
    const a = (i / holeSteps) * Math.PI * 2;
    return `${i === 0 ? 'M' : 'L'} ${(holeR * Math.cos(a)).toFixed(3)} ${(holeR * Math.sin(a)).toFixed(3)}`;
  }).join(' ') + ' Z';
  return `${d} ${hole}`;
}

// ── Sizes ─────────────────────────────────────────────────────────────────────
const SIZE_MAP = {
  sm: { canvas: 36, bigR: 11, bigr: 8,  bigTeeth: 10, bigHole: 3, smallR: 7,  smallr: 5,  smallTeeth: 7, smallHole: 2, gap: 18 },
  md: { canvas: 56, bigR: 17, bigr: 12, bigTeeth: 12, bigHole: 4, smallR: 10, smallr: 7.5, smallTeeth: 9, smallHole: 2.5, gap: 27 },
  lg: { canvas: 80, bigR: 24, bigr: 17, bigTeeth: 14, bigHole: 6, smallR: 14, smallr: 10, smallTeeth: 10, smallHole: 3.5, gap: 38 },
};

// ── Duration constants ────────────────────────────────────────────────────────
const BIG_DUR   = '1.8s';
const SMALL_DUR = '1.2s'; // slightly faster to feel interlocked

// ── Component ─────────────────────────────────────────────────────────────────
interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  /** Optional accessible label */
  label?: string;
}

export const Loader: React.FC<LoaderProps> = ({ size = 'md', label = 'Loading…' }) => {
  useEffect(() => { injectKeyframes(); }, []);

  const s = SIZE_MAP[size];
  const cx = s.canvas / 2;
  const cy = s.canvas / 2;

  // Big gear centre: left-of-centre
  const bigCx = cx - s.gap * 0.28;
  const bigCy = cy + s.gap * 0.12;

  // Small gear centre: meshed to top-right of big gear
  // Mesh distance = bigr + smallr (pitch circles touch)
  const meshDist = s.bigr + s.smallr + 0.5;
  const angle    = -Math.PI * 0.38; // ~top-right
  const smallCx  = bigCx + meshDist * Math.cos(angle);
  const smallCy  = bigCy + meshDist * Math.sin(angle);

  const bigPath   = gearPath(s.bigR,   s.bigr,   s.bigTeeth,   s.bigHole);
  const smallPath = gearPath(s.smallR, s.smallr, s.smallTeeth, s.smallHole);

  return (
    <svg
      width={s.canvas}
      height={s.canvas}
      viewBox={`0 0 ${s.canvas} ${s.canvas}`}
      aria-label={label}
      role="img"
      style={{ display: 'inline-block', overflow: 'visible' }}
    >
      {/* Big gear — clockwise */}
      <g
        transform={`translate(${bigCx}, ${bigCy})`}
        style={{
          transformOrigin: `${bigCx}px ${bigCy}px`,
          animation: `gear-cw ${BIG_DUR} linear infinite`,
        }}
      >
        <path d={bigPath} fill={BRAND.RED} fillRule="evenodd" />
        {/* Axle dot */}
        <circle r={s.bigHole * 0.55} fill={BRAND.WHITE} />
      </g>

      {/* Small gear — counter-clockwise */}
      <g
        transform={`translate(${smallCx}, ${smallCy})`}
        style={{
          transformOrigin: `${smallCx}px ${smallCy}px`,
          animation: `gear-ccw ${SMALL_DUR} linear infinite`,
        }}
      >
        <path d={smallPath} fill={BRAND.RED} fillRule="evenodd" opacity={0.75} />
        <circle r={s.smallHole * 0.55} fill={BRAND.WHITE} />
      </g>
    </svg>
  );
};
