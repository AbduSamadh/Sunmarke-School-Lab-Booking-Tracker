import type { Db } from "@sunmarke/db";
import { addDays, cellStatus, timetableForDate } from "@sunmarke/rules";
import type { Actor } from "./bookings";
import { listBookings } from "./bookings";
import { loadWorld } from "./world";
import { now } from "./util";

export type CellView =
  | { kind: "closed"; label: string }
  | { kind: "free"; inchargeName: string; crossCover: boolean; unitsLeft: number; unitsTotal: number; existing: string[]; override?: boolean }
  | { kind: "booked"; label: string; mine: boolean; bookingId: string }
  | { kind: "unavailable"; reason: string; suggestion?: string; canWaitlist: boolean; existing: string[]; mineId?: string };

export interface GridBlock {
  id: string;
  code: string;
  start: string;
  end: string;
  bookable: boolean;
}

export interface GridDay {
  date: string;
  timetableName: string | null;
  blocks: GridBlock[];
  cells: Record<string, Record<string, CellView>>; // resourceId -> blockId -> cell
}

export interface GridData {
  days: GridDay[];
  resources: { id: string; name: string; type: "room" | "cart_pool"; units: number; colour: string; location: string; capacity: number | null }[];
  calendarChecked: boolean;
}

/** Availability for a date range; every unavailable cell carries its reason. */
export async function getGrid(db: Db, actor: Actor, from: string, to: string): Promise<GridData> {
  const world = await loadWorld(db, from, to);
  const bookings = await listBookings(db, { from, to, status: ["confirmed", "completed", "no_show"] });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const t = now();
  const days: GridDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const tt = timetableForDate(world.timetables, d);
    const blocks = tt ? [...tt.blocks].sort((a, b) => a.start.localeCompare(b.start)) : [];
    const cells: GridDay["cells"] = {};
    for (const r of world.resourceRows.filter((x) => x.active)) {
      cells[r.id] = {};
      for (const b of blocks) {
        const isAdmin = actor.role === "admin";
        let st = cellStatus(world, r, d, b, t);
        let override = false;
        if (isAdmin && st.state === "unavailable" && (st.code === "window_too_soon" || st.code === "window_too_far")) {
          st = cellStatus(world, r, d, b, t, true);
          override = st.state === "free";
        }
        const here = world.holds.filter((h) => h.resourceId === r.id && h.date === d && h.blockId === b.id).map((h) => byId.get(h.bookingId)).filter(Boolean);
        const labels = here.map((bk) => (r.type === "cart_pool" ? `${bk!.cartCount} carts · ${bk!.teacherName}` : `${bk!.teacherName} · ${bk!.classLabel}`));
        const mine = here.find((bk) => bk!.teacherId === actor.id);
        let cell: CellView;
        switch (st.state) {
          case "closed":
            cell = { kind: "closed", label: b.code };
            break;
          case "free":
            cell = { kind: "free", inchargeName: st.inchargeName, crossCover: st.crossCover, unitsLeft: st.unitsLeft, unitsTotal: st.unitsTotal, existing: labels, override };
            break;
          case "booked": {
            const bk = here[0];
            cell = { kind: "booked", label: labels[0] ?? "Booked", mine: Boolean(bk && bk.teacherId === actor.id), bookingId: bk?.id ?? st.bookingIds[0] };
            break;
          }
          default:
            cell = { kind: "unavailable", reason: st.reason, suggestion: st.suggestion, canWaitlist: st.canWaitlist && st.code !== "window_too_soon" && st.code !== "in_past", existing: labels, mineId: mine?.id };
        }
        cells[r.id][b.id] = cell;
      }
      // Next step for blocked cells: the nearest later free block that day.
      for (const [i, b] of blocks.entries()) {
        const c = cells[r.id][b.id];
        if (c.kind !== "unavailable" && c.kind !== "booked") continue;
        const next = blocks.slice(i + 1).find((x) => cells[r.id][x.id].kind === "free");
        const nc = next && cells[r.id][next.id];
        if (c.kind === "unavailable" && nc && nc.kind === "free" && c.canWaitlist) c.suggestion = `${nc.inchargeName} is free at ${next!.code}`;
      }
    }
    days.push({ date: d, timetableName: tt?.name ?? null, blocks: blocks.map((b) => ({ ...b })), cells });
  }
  return {
    days,
    resources: world.resourceRows.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, type: r.type, units: r.units, colour: r.colour, location: r.location, capacity: r.capacity })),
    calendarChecked: world.calendarChecked,
  };
}
