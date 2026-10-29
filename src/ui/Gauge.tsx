const RANGE_CENTS = 50;
const SWEEP_DEG = 70;
const RADIUS = 130;

/** Point at `deg` (0 = straight up, positive = clockwise) on a circle of radius r around the pivot. */
function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

const centsToDeg = (cents: number) => (Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents)) / RANGE_CENTS) * SWEEP_DEG;

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(toDeg, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const TICKS = Array.from({ length: 21 }, (_, i) => -RANGE_CENTS + i * 5).map((c) => {
  const length = c === 0 ? 20 : c % 10 === 0 ? 12 : 6;
  const [x1, y1] = polar(centsToDeg(c), RADIUS);
  const [x2, y2] = polar(centsToDeg(c), RADIUS - length);
  return { c, x1, y1, x2, y2 };
});

export type NeedleTone = 'idle' | 'in-tune' | 'close' | 'far';

export function needleTone(cents: number | null, tolerance: number): NeedleTone {
  if (cents === null) return 'idle';
  const off = Math.abs(cents);
  if (off <= tolerance) return 'in-tune';
  return off <= 20 ? 'close' : 'far';
}

interface GaugeProps {
  /** Offset from the target; null when there is no signal. */
  cents: number | null;
  toleranceCents: number;
}

/** −50…+50 cent needle gauge. The needle eases between readings via a CSS transition. */
export function Gauge({ cents, toleranceCents }: GaugeProps) {
  const tone = needleTone(cents, toleranceCents);
  const tol = centsToDeg(toleranceCents);
  // Flat/sharp symbols sit just below the ends of the scale.
  const [endX, endY] = polar(SWEEP_DEG, RADIUS - 6);
  const symbolY = endY + 30;

  return (
    <svg class={`gauge gauge-${tone}`} viewBox="-150 -150 300 172" aria-hidden="true">
      <path class="gauge-zone" d={arcPath(-tol, tol, RADIUS + 9)} />
      {TICKS.map((t) => (
        <line key={t.c} class={t.c === 0 ? 'gauge-tick gauge-tick-zero' : 'gauge-tick'} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
      ))}
      <text class="gauge-symbol" x={-endX} y={symbolY} text-anchor="middle">
        ♭
      </text>
      <text class="gauge-symbol" x={endX} y={symbolY} text-anchor="middle">
        ♯
      </text>
      <g class="gauge-needle" style={{ transform: `rotate(${centsToDeg(cents ?? 0).toFixed(2)}deg)` }}>
        <line x1="0" y1="0" x2="0" y2={-(RADIUS - 8)} />
      </g>
      <circle class="gauge-pivot" cx="0" cy="0" r="9" />
    </svg>
  );
}
