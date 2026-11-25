"use client";
import { useEffect, useRef, useState } from "react";

type Mode = "light" | "dark";

/**
 * Animated light/dark switch. The choice is kept in a cookie so the server
 * renders the right theme on the next visit (no flash). With no choice yet,
 * it follows the device setting.
 */
export function ThemeToggle({ initial }: { initial: Mode | null }) {
  const [mode, setMode] = useState<Mode | null>(initial);
  const btn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (initial) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setMode(mq.matches ? "dark" : "light");
    const on = (e: MediaQueryListEvent) => setMode(e.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [initial]);

  function apply(next: Mode) {
    document.documentElement.dataset.theme = next;
    document.cookie = `slb_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setMode(next);
  }

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (reduce || !doc.startViewTransition || !btn.current) return apply(next);
    // Reveal the new theme as a circle growing out of the switch.
    const r = btn.current.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = doc.startViewTransition(() => apply(next));
    t.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => undefined);
  }

  const dark = mode === "dark";
  return (
    <button
      ref={btn}
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`theme-toggle${dark ? " is-dark" : ""}${mode ? "" : " is-pending"}`}
      onClick={toggle}
    >
      <span className="tt-track" aria-hidden="true">
        <span className="tt-star s1" />
        <span className="tt-star s2" />
        <span className="tt-star s3" />
        <span className="tt-cloud" />
      </span>
      <span className="tt-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <g className="tt-rays">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
          <circle className="tt-sun" cx="12" cy="12" r="4.5" />
          <circle className="tt-bite" cx="16.5" cy="8.5" r="4.6" />
        </svg>
      </span>
    </button>
  );
}
