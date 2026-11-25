"use client";
import { useState } from "react";

/**
 * Landing-page logo animation. The ribbons are drawn as strokes along paths
 * traced from the supplied Sunmarke logo (same colours, directions, widths and
 * order), then the exact logo image settles on top, so the final frame is the
 * logo itself. Hover or tap replays it. Reduced motion shows the logo only.
 */
const RIBBONS: { id: string; d: string; w: number }[] = [
  { id: "green", d: "M174.1 6.4 C167.6 22.0 144.9 69.2 135.2 100.0 C125.5 130.8 119.2 161.3 116.1 191.4 C113.0 221.5 113.2 251.2 116.7 280.5 C120.2 309.8 127.0 338.7 137.0 367.3 C147.1 395.9 160.4 424.1 177.0 451.9 C193.6 479.7 226.8 520.5 236.7 534.2", w: 60.4 },
  { id: "orange", d: "M343.9 27.4 C333.4 37.8 299.2 67.9 280.8 89.6 C262.4 111.3 246.6 133.9 233.5 157.5 C220.4 181.1 209.9 205.6 202.0 231.0 C194.1 256.4 188.9 282.8 186.3 310.2 C183.7 337.6 183.8 365.9 186.5 395.1 C189.2 424.4 199.8 470.6 202.4 485.7", w: 51.0 },
  { id: "cyan", d: "M214.8 2.0 C229.6 10.6 277.2 34.9 303.3 53.8 C329.4 72.7 352.0 93.3 371.3 115.6 C390.6 137.9 406.4 161.8 418.9 187.4 C431.3 213.0 440.4 240.3 446.0 269.2 C451.6 298.1 453.9 328.6 452.7 360.9 C451.5 393.1 441.2 445.7 438.9 462.7", w: 57.6 },
  { id: "purple", d: "M35.3 132.8 C40.6 148.8 54.1 199.3 67.0 228.7 C79.8 258.1 95.0 284.8 112.4 309.0 C129.8 333.2 149.6 354.8 171.6 373.9 C193.6 392.9 218.0 409.4 244.6 423.3 C271.2 437.2 300.2 448.4 331.4 457.1 C362.6 465.8 415.1 472.4 431.9 475.5", w: 41.6 },
  { id: "pink", d: "M533.0 204.6 C520.0 216.5 481.6 255.2 454.9 275.8 C428.2 296.4 400.8 314.0 372.6 328.5 C344.5 343.0 315.6 354.3 286.0 362.6 C256.4 370.9 226.1 376.1 195.1 378.2 C164.1 380.3 132.4 379.3 100.0 375.2 C67.6 371.1 17.2 357.4 0.6 353.8", w: 71.1 },
  { id: "yellow", d: "M-3.0 146.8 C11.8 151.8 56.0 168.9 85.5 176.9 C115.0 184.9 144.5 191.0 174.0 195.0 C203.5 199.0 233.0 201.0 262.5 201.0 C292.0 201.0 321.5 199.0 351.0 195.0 C380.5 191.0 410.0 185.0 439.5 176.9 C469.0 168.8 513.2 151.7 528.0 146.7", w: 69.0 },
];

export function LogoBuild() {
  const [run, setRun] = useState(0);
  const [busy, setBusy] = useState(true);
  const replay = () => {
    if (busy) return;
    setBusy(true);
    setRun((n) => n + 1);
  };
  return (
    <span className="lb" onMouseEnter={replay} onClick={replay}>
      <span key={run} className="lb-stack" onAnimationEnd={(e) => e.animationName === "lb-logo" && setBusy(false)}>
        <svg className="lb-svg" viewBox="0 0 528 528" aria-hidden="true">
          <defs>
            <clipPath id="lb-clip">
              <circle cx="264" cy="264" r="232" />
            </clipPath>
          </defs>
          <circle className="lb-disc" cx="264" cy="264" r="232" style={{ fill: "var(--brand-ink)" }} />
          <g clipPath="url(#lb-clip)">
            <g className="lb-spin">
              {RIBBONS.map((r, i) => (
                <path key={r.id} className={`lb-rib lb-rib-${i}`} d={r.d} pathLength={1} strokeWidth={r.w} strokeLinecap="butt" fill="none" style={{ stroke: `var(--brand-${r.id})` }} />
              ))}
            </g>
          </g>
          <circle className="lb-ringline" cx="264" cy="264" r="248" pathLength={1} strokeWidth="32" fill="none" style={{ stroke: "var(--brand-navy)" }} />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lb-logo" src="/brand/sunmarke-mark.png" alt="" width={264} height={264} draggable={false} />
      </span>
    </span>
  );
}
