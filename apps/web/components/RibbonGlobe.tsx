/**
 * Decorative ribbon globe for the landing page, drawn in the colours of the
 * Sunmarke School logo. Purely visual: aria-hidden by the caller, and the
 * slow drift stops under prefers-reduced-motion (see sunlit.css).
 */
const RIBBONS: { d: string; c: string; w: number }[] = [
  { d: "M96 30 C60 160 70 290 150 400", c: "var(--brand-green)", w: 40 },
  { d: "M232 10 C168 140 140 280 128 410", c: "var(--brand-orange)", w: 34 },
  { d: "M300 20 C360 150 370 290 300 400", c: "var(--brand-cyan)", w: 40 },
  { d: "M-10 300 C120 350 290 330 410 250", c: "var(--brand-pink)", w: 42 },
  { d: "M20 360 C140 290 280 300 400 360", c: "var(--brand-purple)", w: 30 },
  { d: "M10 160 C140 100 270 100 390 160", c: "var(--brand-yellow)", w: 52 },
];

export function RibbonGlobe() {
  return (
    <svg className="ribbon-globe" viewBox="0 0 400 400" role="presentation">
      <defs>
        <clipPath id="rg-clip">
          <circle cx="200" cy="200" r="178" />
        </clipPath>
      </defs>
      <circle cx="200" cy="200" r="178" style={{ fill: "var(--brand-ink)" }} />
      <g clipPath="url(#rg-clip)">
        <g className="rg-spin">
          {RIBBONS.map((r, i) => (
            <path key={i} className={`rg-ribbon rg-r${i}`} d={r.d} style={{ stroke: r.c }} strokeWidth={r.w} fill="none" strokeLinecap="round" />
          ))}
        </g>
      </g>
      <circle cx="200" cy="200" r="186" fill="none" style={{ stroke: "var(--brand-navy)" }} strokeWidth="16" />
    </svg>
  );
}
