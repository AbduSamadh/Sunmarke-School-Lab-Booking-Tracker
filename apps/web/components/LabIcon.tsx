import { Atom, ChartCandlestick, FlaskConical, Glasses, Laptop, Zap, type LucideIcon } from "lucide-react";

/** One icon per lab, keyed by the resource colour key (quantum, carts, dollarx, xreal, strike). */
const ICONS: Record<string, LucideIcon> = { quantum: Atom, carts: Laptop, dollarx: ChartCandlestick, xreal: Glasses, strike: Zap };

export function LabIcon({ colour, size = "sm" }: { colour: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const Icon = ICONS[colour] ?? FlaskConical;
  const px = { xs: 12, sm: 14, md: 18, lg: 24 }[size];
  return (
    <span className={`lab-icon lab-icon-${size}`} style={{ "--lab": `var(--r-${colour})` } as React.CSSProperties} aria-hidden="true">
      <Icon size={px} strokeWidth={2.2} />
    </span>
  );
}

/** The Sunmarke sun mark: a disc with rays. Decorative. */
export function SunMark({ size = 30 }: { size?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg className="sun-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="sun-mark-bg" />
      <g className="sun-mark-rays">
        {rays.map((a) => (
          <line key={a} x1="16" y1="5.5" x2="16" y2="8.5" transform={`rotate(${a} 16 16)`} />
        ))}
      </g>
      <circle cx="16" cy="16" r="5" className="sun-mark-disc" />
    </svg>
  );
}

const AVATAR = ["quantum", "dollarx", "xreal", "strike", "carts"];
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ width: size, height: size, "--lab": `var(--r-${AVATAR[h % AVATAR.length]})` } as React.CSSProperties} aria-hidden="true">
      {initials}
    </span>
  );
}
