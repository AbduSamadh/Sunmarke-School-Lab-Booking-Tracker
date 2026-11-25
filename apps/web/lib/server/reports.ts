import type { Db } from "@sunmarke/db";
import { addDays, blackoutFor, isoWeekday, timetableForDate } from "@sunmarke/rules";
import { listBookings } from "./bookings";
import { getBlackouts, getResources, getTimetables, getStaff } from "./world";

/**
 * Report metrics, defined as in the build plan. Utilisation counts only bookable
 * blocks and excludes blackouts. Every number comes from listBookings() or the
 * booking_attempts table, so each can be traced to its rows.
 */
export interface ReportFilters {
  from: string;
  to: string;
  resourceId?: string;
  department?: string;
}

const USED = ["confirmed", "completed", "no_show"] as const;

export async function buildReport(db: Db, f: ReportFilters) {
  const [timetables, resources, blackouts, staff] = await Promise.all([getTimetables(db), getResources(db), getBlackouts(db, f.from, f.to), getStaff(db)]);
  let all = await listBookings(db, { from: f.from, to: f.to });
  if (f.resourceId) all = all.filter((b) => b.resourceId === f.resourceId);
  if (f.department) all = all.filter((b) => b.department === f.department);
  const used = all.filter((b) => (USED as readonly string[]).includes(b.status));

  // Bookable capacity per resource
  const capacity: Record<string, number> = {};
  const blockCodes: string[] = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
    const tt = timetableForDate(timetables, d);
    if (!tt) continue;
    for (const b of tt.blocks.filter((x) => x.bookable)) {
      if (!blockCodes.includes(b.code)) blockCodes.push(b.code);
      for (const r of resources) {
        if (blackoutFor(blackouts, r.id, d, b.code)) continue;
        capacity[r.id] = (capacity[r.id] ?? 0) + 1;
      }
    }
  }

  const utilisation = resources
    .filter((r) => !f.resourceId || r.id === f.resourceId)
    .map((r) => {
      const mine = used.filter((b) => b.resourceId === r.id);
      const blocks = mine.reduce((n, b) => n + b.blockIds.length, 0);
      const unitBlocks = mine.reduce((n, b) => n + b.blockIds.length * (b.cartCount ?? 1), 0);
      const cap = capacity[r.id] ?? 0;
      const pct = r.type === "cart_pool" ? (cap ? unitBlocks / (r.units * cap) : 0) : cap ? blocks / cap : 0;
      return { id: r.id, name: r.name, type: r.type, colour: r.colour, sessions: mine.length, bookedBlocks: blocks, unitBlocks, bookableBlocks: cap, pct };
    });

  const incharges = staff.filter((s) => used.some((b) => b.inchargeId === s.id));
  const load = incharges.map((s) => {
    const mine = used.filter((b) => b.inchargeId === s.id);
    const cross = mine.filter((b) => b.crossCover).length;
    return { id: s.id, name: s.name, sessions: mine.length, crossCover: cross, crossPct: mine.length ? cross / mine.length : 0 };
  });

  // Demand turned away
  const attempts = await db.query<{ code: string; n: number }>(
    `SELECT code, count(*)::int AS n FROM booking_attempts WHERE date BETWEEN $1 AND $2 ${f.resourceId ? "AND resource_id = $3" : ""} GROUP BY code`,
    f.resourceId ? [f.from, f.to, f.resourceId] : [f.from, f.to],
  );
  const codeN = (c: string) => attempts.find((a) => a.code === c)?.n ?? 0;
  const turnedAway = {
    noIncharge: codeN("no_incharge"),
    full: codeN("resource_booked") + codeN("not_enough_carts") + codeN("just_taken"),
    waitlistJoins: codeN("waitlist_join"),
  };

  // Heatmap weekday × block
  const heat: Record<string, Record<string, number>> = {};
  const blockCode = (id: string) => timetables.flatMap((t) => t.blocks).find((b) => b.id === id)?.code ?? "?";
  for (const b of used) {
    const wd = String(isoWeekday(b.date));
    heat[wd] ??= {};
    for (const id of b.blockIds) heat[wd][blockCode(id)] = (heat[wd][blockCode(id)] ?? 0) + 1;
  }

  const countBy = (key: (b: (typeof used)[number]) => string) => {
    const m = new Map<string, number>();
    for (const b of used) m.set(key(b), (m.get(key(b)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));
  };

  const past = all.filter((b) => b.status !== "confirmed");
  const cancelled = all.filter((b) => b.status === "cancelled").length;
  const noShow = all.filter((b) => b.status === "no_show").length;
  const leadDays = used.map((b) => (b.start.getTime() - b.createdAt.getTime()) / 86_400_000).filter((x) => x >= 0).sort((a, b) => a - b);
  const median = leadDays.length ? leadDays[Math.floor(leadDays.length / 2)] : 0;

  return {
    filters: f,
    kpis: {
      sessions: used.length,
      teachers: new Set(used.map((b) => b.teacherId)).size,
      roomUtilisation: (() => {
        const rooms = utilisation.filter((u) => u.type === "room");
        const cap = rooms.reduce((n, u) => n + u.bookableBlocks, 0);
        return cap ? rooms.reduce((n, u) => n + u.bookedBlocks, 0) / cap : 0;
      })(),
      cartUtilisation: utilisation.find((u) => u.type === "cart_pool")?.pct ?? 0,
      turnedAway: turnedAway.noIncharge + turnedAway.full,
      cancelRate: all.length ? cancelled / all.length : 0,
      noShowRate: past.length ? noShow / past.length : 0,
      medianLeadDays: median,
    },
    utilisation,
    load,
    turnedAway,
    heat,
    blockCodes,
    bySubject: countBy((b) => b.subject),
    byYear: countBy((b) => b.yearGroup),
    byDepartment: countBy((b) => b.department || "Unknown"),
    rows: all,
    departments: [...new Set(staff.map((s) => s.department).filter(Boolean))].sort(),
    resources: resources.map((r) => ({ id: r.id, name: r.name })),
  };
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formulas (CSV injection) and quote when needed.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
