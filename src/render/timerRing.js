// timerRing.js — shrinking color-shifting timer for ⧖ mode.
//
// SVG circle drawn with stroke-dasharray; we animate the visible arc length
// over time and update its color teal → orange → red as the remaining
// fraction depletes.
//
// Usage:
//   const ring = createTimerRing({ cx, cy, radius });
//   svgEl.appendChild(ring.el);
//   ring.update(remainingMs, totalMs);     // every frame
//   ring.setRemaining(remainingMs, totalMs); // ditto
//
// The element is a plain SVGCircleElement with stroke-dasharray + an offset.

const SVG_NS = 'http://www.w3.org/2000/svg';

// 3-stop palette: 1.0 = full time left, 0.5 = halfway, 0.0 = no time left.
const STOPS = [
  { t: 1.0, c: [0x79, 0xea, 0xd9] }, // teal
  { t: 0.5, c: [0xe8, 0x8a, 0x33] }, // amber/orange
  { t: 0.0, c: [0xa8, 0x3a, 0x2b] }, // dark red
];

function lerp(a, b, u) { return a + (b - a) * u; }

function ringColor(frac) {
  // Map frac in [0, 1] through the STOPS palette.
  const f = Math.max(0, Math.min(1, frac));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i + 1];   // smaller t
    const hi = STOPS[i];       // larger t
    if (f >= lo.t && f <= hi.t) {
      const u = (f - lo.t) / Math.max(1e-6, hi.t - lo.t);
      const r = Math.round(lerp(lo.c[0], hi.c[0], u));
      const g = Math.round(lerp(lo.c[1], hi.c[1], u));
      const b = Math.round(lerp(lo.c[2], hi.c[2], u));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(168, 58, 43)';
}

export function createTimerRing({
  cx,
  cy,
  radius,
  strokeWidth = 6,
}) {
  const circumference = 2 * Math.PI * radius;
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(radius));
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', ringColor(1));
  circle.setAttribute('stroke-width', String(strokeWidth));
  circle.setAttribute('stroke-linecap', 'round');
  circle.setAttribute('stroke-dasharray', String(circumference));
  circle.setAttribute('stroke-dashoffset', '0');
  // Rotate so the depletion starts from 12 o'clock and sweeps clockwise.
  circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
  circle.style.transition = 'stroke 200ms linear';

  function update(remainingMs, totalMs) {
    const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
    // dashoffset goes from 0 (full ring visible) to circumference (none visible).
    const offset = circumference * (1 - frac);
    circle.setAttribute('stroke-dashoffset', String(offset));
    circle.setAttribute('stroke', ringColor(frac));
  }

  return {
    el: circle,
    update,
    setRemaining: update,
  };
}
