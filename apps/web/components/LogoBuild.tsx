"use client";
import { useState } from "react";

/**
 * The Sunmarke School logo mark, built up layer by layer. Each layer is cut
 * pixel for pixel from the supplied logo (public/brand/mark/*.png, made by
 * splitting the logo by colour), so the last frame is exactly the logo.
 * Hover or tap replays the build. Under reduced motion it shows the finished logo.
 */
const LAYERS = ["ink", "green", "orange", "cyan", "purple", "pink", "yellow", "ring"] as const;

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
      <span key={run} className="lb-stack" onAnimationEnd={(e) => e.animationName === "lb-yellow" && setBusy(false)}>
        <span className="lb-l lb-base" />
        {LAYERS.map((l) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={l} className={`lb-l lb-${l}`} src={`/brand/mark/${l}.png`} alt="" width={528} height={528} draggable={false} />
        ))}
      </span>
    </span>
  );
}
