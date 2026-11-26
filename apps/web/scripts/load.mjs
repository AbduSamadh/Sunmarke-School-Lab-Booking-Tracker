#!/usr/bin/env node
/**
 * Load test: a busy Sunday evening when every teacher plans the week.
 *   BASE=http://localhost:3100 node scripts/load.mjs [clients=60] [seconds=30]
 * Each virtual teacher loops: load the week's grid, open My bookings, sometimes
 * try to book. Then many people race for one slot at the same instant, and
 * exactly one must win (the slot locks in booking_slots).
 * Pass/fail targets (pilot scale, ~150 staff): p95 under 800 ms, no 5xx, one winner.
 */
const BASE = process.env.BASE ?? "http://localhost:3100";
const CLIENTS = Number(process.argv[2] ?? 60);
const SECONDS = Number(process.argv[3] ?? 30);
const TEACHERS = ["sara.khan", "omar.haddad", "priya.nair", "lucy.evans", "james.carter", "mariam.saeed"].map((n) => `${n}@sunmarke.example`);
const WEEK = ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"];

async function session(email) {
  const r = await fetch(`${BASE}/api/v1/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, client: "app" }) });
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status}`);
  const { token } = await r.json();
  return (path, init = {}) =>
    fetch(`${BASE}/api/v1${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
}

const times = [];
const statuses = {};
async function timed(label, p) {
  const t0 = performance.now();
  const r = await p;
  times.push(performance.now() - t0);
  statuses[`${label} ${r.status}`] = (statuses[`${label} ${r.status}`] ?? 0) + 1;
  return r;
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

const sessions = await Promise.all(TEACHERS.map(session));
const end = Date.now() + SECONDS * 1000;
let booked = 0;
await Promise.all(
  Array.from({ length: CLIENTS }, async (_, i) => {
    const call = sessions[i % sessions.length];
    while (Date.now() < end) {
      const g = await timed("grid", call(`/availability?from=${WEEK[0]}&to=${WEEK[4]}`));
      const grid = await g.json().catch(() => null);
      await timed("mine", call("/bookings"));
      if (grid && Math.random() < 0.15) {
        const day = grid.days[Math.floor(Math.random() * grid.days.length)];
        for (const [rid, cells] of Object.entries(day.cells)) {
          const free = Object.entries(cells).find(([, c]) => c.kind === "free");
          if (!free) continue;
          const r = await timed("book", call("/bookings", { method: "POST", body: JSON.stringify({ resourceId: rid, date: day.date, blockIds: [free[0]], subject: "Science", yearGroup: "Y8", studentCount: 20, ...(rid === "carts" ? { cartCount: 1, classroom: "S12" } : {}) }) }));
          if (r.status === 201) booked++;
          break;
        }
      }
    }
  }),
);

// The race: everyone asks for the same free room slot at once.
const g = await (await sessions[0](`/availability?from=2026-12-14&to=2026-12-14`)).json();
const day = g.days[0];
const room = g.resources.find((r) => r.type === "room");
const block = day.blocks.find((b) => day.cells[room.id][b.id].kind === "free");
const race = await Promise.all(
  Array.from({ length: 30 }, (_, i) =>
    sessions[i % sessions.length]("/bookings", { method: "POST", body: JSON.stringify({ resourceId: room.id, date: day.date, blockIds: [block.id], subject: "Science", yearGroup: "Y9", studentCount: 20 }) }).then((r) => r.status),
  ),
);
const winners = race.filter((s) => s === 201).length;

const p50 = pct(times, 50), p95 = pct(times, 95), p99 = pct(times, 99);
const errors = Object.entries(statuses).filter(([k]) => / 5\d\d$/.test(k)).reduce((n, [, v]) => n + v, 0);
console.log(JSON.stringify({ clients: CLIENTS, seconds: SECONDS, requests: times.length, rps: Math.round(times.length / SECONDS), p50: Math.round(p50), p95: Math.round(p95), p99: Math.round(p99), statuses, booked, race: { tries: race.length, winners, others: [...new Set(race.filter((s) => s !== 201))] } }, null, 2));
const ok = p95 < 800 && errors === 0 && winners === 1;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
