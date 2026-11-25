/**
 * Ribbon globe for the landing page: the Sunmarke School logo mark drawn as
 * bold strokes. Ribbon paths, widths and colours are traced from the supplied
 * logo and painted in the logo's own layering order (purple, pink, orange,
 * cyan, green, then yellow on top). The globe spins in and comes to rest in
 * the logo's exact position. Purely visual: aria-hidden by the caller; motion
 * stops under prefers-reduced-motion (see sunlit.css).
 */
const RIBBONS: { d: string; c: string; w: number }[] = [
  { d: "M32.2 103.7 C36.1 115.4 46.0 152.5 55.4 174.1 C64.8 195.7 75.9 215.2 88.7 233.0 C101.5 250.8 116.0 266.7 132.2 280.7 C148.4 294.7 166.2 306.7 185.8 316.9 C205.4 327.1 226.6 335.3 249.5 341.7 C272.4 348.1 310.9 352.9 323.2 355.2", c: "var(--brand-purple)", w: 30.5 },
  { d: "M397.4 156.4 C387.8 165.1 359.7 193.5 340.1 208.7 C320.5 223.8 300.4 236.7 279.7 247.3 C259.0 257.9 237.8 266.3 216.1 272.4 C194.4 278.5 172.2 282.3 149.4 283.8 C126.7 285.3 103.4 284.6 79.6 281.6 C55.8 278.6 18.8 268.5 6.7 265.9", c: "var(--brand-pink)", w: 52.2 },
  { d: "M258.6 26.4 C250.9 34.0 225.8 56.1 212.3 72.0 C198.8 87.9 187.2 104.5 177.6 121.8 C168.0 139.1 160.3 157.1 154.5 175.8 C148.7 194.5 144.9 213.8 143.0 233.9 C141.1 254.0 141.1 274.7 143.1 296.2 C145.1 317.7 152.9 351.6 154.8 362.7", c: "var(--brand-orange)", w: 37.4 },
  { d: "M163.9 7.7 C174.7 14.0 209.7 31.8 228.8 45.7 C247.9 59.6 264.6 74.8 278.7 91.1 C292.8 107.4 304.5 125.0 313.7 143.8 C322.9 162.6 329.5 182.6 333.6 203.8 C337.7 225.0 339.4 247.4 338.5 271.1 C337.6 294.8 330.1 333.4 328.4 345.8", c: "var(--brand-cyan)", w: 42.3 },
  { d: "M134.0 11.0 C129.2 22.4 112.6 57.0 105.5 79.6 C98.4 102.2 93.8 124.6 91.5 146.7 C89.2 168.8 89.4 190.6 91.9 212.1 C94.5 233.6 99.4 254.8 106.8 275.8 C114.2 296.8 124.0 317.5 136.2 337.9 C148.4 358.3 172.7 388.2 180.0 398.3", c: "var(--brand-green)", w: 44.3 },
  { d: "M4.1 114.0 C14.9 117.7 47.3 130.2 69.0 136.1 C90.7 142.0 112.3 146.4 134.0 149.4 C155.7 152.4 177.3 153.8 198.9 153.8 C220.5 153.8 242.2 152.4 263.8 149.4 C285.4 146.4 307.2 142.0 328.8 136.1 C350.4 130.2 382.9 117.6 393.7 113.9", c: "var(--brand-yellow)", w: 50.6 },
];

export function RibbonGlobe() {
  return (
    <svg className="ribbon-globe" viewBox="0 0 400 400" role="presentation">
      <defs>
        <clipPath id="rg-clip">
          <circle cx="200" cy="200" r="167.2" />
        </clipPath>
      </defs>
      <circle cx="200" cy="200" r="167.2" style={{ fill: "var(--brand-ink)" }} />
      <g clipPath="url(#rg-clip)">
        <g className="rg-spin">
          {RIBBONS.map((r, i) => (
            <path key={i} className={`rg-ribbon rg-r${i}`} d={r.d} pathLength={1} style={{ stroke: r.c }} strokeWidth={r.w} fill="none" strokeLinecap="butt" />
          ))}
        </g>
      </g>
      <circle cx="200" cy="200" r="180.1" fill="none" style={{ stroke: "var(--brand-navy)" }} strokeWidth="27.8" />
    </svg>
  );
}
