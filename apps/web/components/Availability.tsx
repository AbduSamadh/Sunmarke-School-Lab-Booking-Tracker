"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CellView, GridData, GridDay, GridBlock } from "@/lib/server/grid";
import { dayName, dayNum, fmtDateLong, fmtDateShort, monthName } from "@/lib/shared/format";
import { BookingSheet, type Selection } from "./BookingSheet";

type Resource = GridData["resources"][number];

export interface Lookups {
  subjects: string[];
  years: string[];
  sections: string[];
}
export interface Defaults {
  subject: string;
  yearGroup: string;
  section: string;
  studentCount: number;
  classroom: string;
  cartCount: number;
}

function addDaysLocal(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function Availability(props: {
  grid: GridData;
  date: string;
  today: string;
  resourceFilter: string | null;
  role: "teacher" | "incharge" | "admin" | "viewer";
  lookups: Lookups;
  defaults: Defaults;
  minLeadHours: number;
  maxLeadDays: number;
  people: { id: string; name: string; department: string }[];
  selfId: string;
}) {
  const { grid, date, today, resourceFilter, role } = props;
  const router = useRouter();
  const [sel, setSel] = useState<Selection | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const touch = useRef<number | null>(null);
  const readOnly = role === "viewer";

  const day = grid.days.find((d) => d.date === date) ?? grid.days[0];
  const mon = grid.days[0].date;
  const href = (d: string, r: string | null = resourceFilter) => `/?date=${d}${r ? `&r=${r}` : ""}`;
  const res = resourceFilter ? grid.resources.find((r) => r.id === resourceFilter)! : null;

  function open(resource: Resource, d: GridDay, block: GridBlock, cell: CellView, el: HTMLElement) {
    if (readOnly || cell.kind === "closed") return;
    if (cell.kind === "booked" && cell.mine) {
      router.push("/bookings");
      return;
    }
    lastFocus.current = el;
    setSel({ resource, day: d, block, cell });
  }
  function close(changed: boolean) {
    setSel(null);
    if (changed) router.refresh();
    setTimeout(() => lastFocus.current?.focus(), 0);
  }

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current === null || resourceFilter) return;
      const dx = e.changedTouches[0].clientX - touch.current;
      touch.current = null;
      if (Math.abs(dx) < 70) return;
      const idx = grid.days.findIndex((d) => d.date === day.date);
      const next = dx < 0 ? (idx < 4 ? grid.days[idx + 1].date : addDaysLocal(mon, 7)) : idx > 0 ? grid.days[idx - 1].date : addDaysLocal(mon, -3);
      router.push(href(next));
    },
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{res ? `${res.name}, week of ${fmtDateShort(mon)}` : "Book a lab or AI Carts"}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {readOnly
              ? "Read-only view of lab availability."
              : `Pick a free slot. You can book from ${props.minLeadHours} h to ${Math.round(props.maxLeadDays / 7)} weeks ahead.`}
          </p>
        </div>
        <div className="weeknav" aria-label="Week">
          <a className="btn btn-sm" href={href(addDaysLocal(mon, -7))} aria-label="Previous week">
            <ChevronLeft size={16} aria-hidden="true" /> Prev
          </a>
          <a className="btn btn-sm" href={href(today)}>This week</a>
          <a className="btn btn-sm" href={href(addDaysLocal(mon, 7))} aria-label="Next week">
            Next <ChevronRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>

      {!grid.calendarChecked && (
        <div className="notice notice-warn" role="status">
          In-charge calendars could not be read just now. Availability is based on lab bookings only and will be re-checked when you book.
        </div>
      )}

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Show">
          <a className="chip" href={href(date, null)} aria-current={!resourceFilter ? "true" : undefined}>
            All, by day
          </a>
          {grid.resources.map((r) => (
            <a key={r.id} className="chip" href={href(date, r.id)} aria-current={resourceFilter === r.id ? "true" : undefined}>
              <span className="swatch" style={{ background: `var(--r-${r.colour})` }} aria-hidden="true" />
              {r.name}
            </a>
          ))}
        </div>
      </div>

      {!resourceFilter && (
        <nav className="days" aria-label="Day">
          {grid.days.map((d) => (
            <a key={d.date} href={href(d.date)} className={`day-tab${d.date === today ? " today" : ""}`} aria-current={d.date === day.date ? "true" : undefined}>
              <span>{dayName(d.date)}</span>
              <strong>{dayNum(d.date)}</strong>
              <span className="sr-only">{monthName(d.date)}{d.date === today ? ", today" : ""}</span>
            </a>
          ))}
        </nav>
      )}

      <div {...swipe}>
        {resourceFilter && res ? (
          <WeekTable grid={grid} res={res} today={today} onOpen={open} sel={sel} />
        ) : day.blocks.length === 0 ? (
          <div className="empty">No school timetable on {fmtDateLong(day.date)}.</div>
        ) : (
          <>
            <div className="desktop-only">
              <DayTable grid={grid} day={day} onOpen={open} sel={sel} />
            </div>
            <div className="mobile-only">
              <DayList grid={grid} day={day} onOpen={open} sel={sel} />
            </div>
          </>
        )}
      </div>

      <div className="legend" aria-label="Key">
        <span>○ Free: shows who is coming</span>
        <span>● Booked</span>
        <span>× Unavailable, with the reason</span>
        {day.timetableName && day.timetableName !== "Standard" && <span>Timetable: {day.timetableName}</span>}
      </div>

      {sel && (
        <BookingSheet
          sel={sel}
          role={role}
          lookups={props.lookups}
          defaults={props.defaults}
          onClose={close}
          onPick={(s) => setSel(s)}
          grid={grid}
          people={props.people}
          selfId={props.selfId}
          maxLeadDays={props.maxLeadDays}
        />
      )}
      <style>{`.mobile-only{display:none}@media (max-width:760px){.desktop-only{display:none}.mobile-only{display:block}}`}</style>
    </div>
  );
}

type OpenFn = (r: Resource, d: GridDay, b: GridBlock, c: CellView, el: HTMLElement) => void;

function cellText(r: Resource, c: CellView) {
  switch (c.kind) {
    case "free":
      return {
        st: r.type === "cart_pool" ? `${c.unitsLeft} of ${c.unitsTotal} free` : "Free",
        sub: `${c.inchargeName}${c.crossCover ? " (covering)" : ""}${c.override ? " · admin override" : ""}`,
      };
    case "booked":
      return { st: c.mine ? "Your booking" : "Booked", sub: c.label };
    case "unavailable":
      return { st: c.mineId ? "Your booking" : c.reason, sub: c.suggestion ?? c.existing[0] ?? "" };
    default:
      return { st: "", sub: "" };
  }
}

function Cell({ r, d, b, c, onOpen, selected }: { r: Resource; d: GridDay; b: GridBlock; c: CellView; onOpen: OpenFn; selected: boolean }) {
  if (c.kind === "closed") return null;
  const t = cellText(r, c);
  const soft = c.kind === "unavailable" && !c.canWaitlist;
  const cls =
    c.kind === "free" ? "cell-free" : c.kind === "booked" ? (c.mine ? "cell-booked cell-mine" : "cell-booked") : `cell-un${soft ? " soft" : ""}${c.mineId ? " cell-mine" : ""}`;
  const label = `${r.name}, ${fmtDateShort(d.date)}, ${b.code} ${b.start} to ${b.end}: ${t.st}. ${t.sub}`;
  const clickable = c.kind === "free" || (c.kind === "booked" && c.mine) || (c.kind === "booked" && !c.mine) || (c.kind === "unavailable" && (c.canWaitlist || Boolean(c.mineId)));
  const inner = (
    <>
      <span className="st">{t.st}</span>
      {t.sub && <span className="sub">{t.sub}</span>}
    </>
  );
  return clickable ? (
    <button type="button" className={`cell ${cls}${selected ? " sel" : ""}`} aria-label={label} onClick={(e) => onOpen(r, d, b, c, e.currentTarget)}>
      {inner}
    </button>
  ) : (
    <div className={`cell ${cls}`} aria-label={label} role="img">
      {inner}
    </div>
  );
}

function isSel(sel: Selection | null, r: Resource, d: GridDay, b: GridBlock) {
  return Boolean(sel && sel.resource.id === r.id && sel.day.date === d.date && sel.block.id === b.id);
}

function DayTable({ grid, day, onOpen, sel }: { grid: GridData; day: GridDay; onOpen: OpenFn; sel: Selection | null }) {
  return (
    <table className="grid">
      <caption className="sr-only">Availability on {fmtDateLong(day.date)}. Rows are blocks, columns are labs.</caption>
      <thead>
        <tr>
          <th className="rh" scope="col">Block</th>
          {grid.resources.map((r) => (
            <th key={r.id} scope="col">
              <span className="res-head">
                <span className="swatch" style={{ background: `var(--r-${r.colour})` }} aria-hidden="true" />
                {r.name}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {day.blocks.map((b) =>
          b.bookable ? (
            <tr key={b.id}>
              <th className="rh" scope="row">
                <strong>{b.code}</strong>
                <span className="time">{b.start}–{b.end}</span>
              </th>
              {grid.resources.map((r) => (
                <td key={r.id}>
                  <Cell r={r} d={day} b={b} c={day.cells[r.id][b.id]} onOpen={onOpen} selected={isSel(sel, r, day, b)} />
                </td>
              ))}
            </tr>
          ) : (
            <tr key={b.id} className="closed-row">
              <th className="rh" scope="row">
                <span className="small">{b.code}</span>
              </th>
              <td colSpan={grid.resources.length} style={{ padding: "4px 8px", fontSize: 13, color: "var(--text-3)" }}>
                <span className="time">{b.start}–{b.end}</span> · not bookable
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function DayList({ grid, day, onOpen, sel }: { grid: GridData; day: GridDay; onOpen: OpenFn; sel: Selection | null }) {
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>{fmtDateLong(day.date)}</h2>
      {day.blocks.filter((b) => b.bookable).map((b) => (
        <section key={b.id} aria-label={`${b.code} ${b.start} to ${b.end}`}>
          <h3 style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            {b.code} <span className="time muted small">{b.start}–{b.end}</span>
          </h3>
          <div className="table-wrap">
            {grid.resources.map((r) => (
              <div key={r.id} style={{ display: "flex", borderBottom: "1px solid var(--line)", alignItems: "stretch" }}>
                <div style={{ width: 112, flex: "none", padding: "8px 10px", fontSize: 14, display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)" }}>
                  <span className="swatch" style={{ background: `var(--r-${r.colour})` }} aria-hidden="true" />
                  {r.name.replace(" Lab", "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Cell r={r} d={day} b={b} c={day.cells[r.id][b.id]} onOpen={onOpen} selected={isSel(sel, r, day, b)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function WeekTable({ grid, res, today, onOpen, sel }: { grid: GridData; res: Resource; today: string; onOpen: OpenFn; sel: Selection | null }) {
  const codes: GridBlock[] = [];
  for (const d of grid.days) for (const b of d.blocks) if (!codes.some((c) => c.code === b.code)) codes.push(b);
  codes.sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="grid" style={{ minWidth: 640 }}>
        <caption className="sr-only">{res.name} availability for the week. Rows are blocks, columns are days.</caption>
        <thead>
          <tr>
            <th className="rh" scope="col">Block</th>
            {grid.days.map((d) => (
              <th key={d.date} scope="col">
                {fmtDateShort(d.date)}
                {d.date === today ? " (today)" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => (
            <tr key={code.code} className={code.bookable ? "" : "closed-row"}>
              <th className="rh" scope="row">
                {code.bookable ? <strong>{code.code}</strong> : <span className="small">{code.code}</span>}
                {code.bookable && <span className="time">{code.start}–{code.end}</span>}
              </th>
              {grid.days.map((d) => {
                const b = d.blocks.find((x) => x.code === code.code);
                if (!b) return <td key={d.date}><div className="cell cell-un soft"><span className="sub">Not on this day</span></div></td>;
                if (!b.bookable) return <td key={d.date} />;
                return (
                  <td key={d.date}>
                    <Cell r={res} d={d} b={b} c={d.cells[res.id][b.id]} onOpen={onOpen} selected={isSel(sel, res, d, b)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
