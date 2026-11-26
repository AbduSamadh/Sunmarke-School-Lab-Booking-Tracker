/**
 * Sunmarke Lab Booking: a one-file demo. Same rules engine as the real app
 * (packages/rules), sample data in this browser only. No sign-in, no server.
 */
import { addDays } from "@sunmarke/rules";
import { LABS, PEOPLE, SECTIONS, SUBJECTS, TIMETABLE, YEARS, block, lab, person, type Booking } from "./data";
import { cancel, cancellable, cell, classLabel, endOf, fmtDay, getState, mark, reset, startOf, today, tryBook, weekOf } from "./store";

type Tab = "book" | "mine" | "sessions" | "messages" | "reports" | "about";
const ui = { who: "t-sara", tab: "book" as Tab, date: "", lastFocus: null as HTMLElement | null };
try {
  const saved = JSON.parse(localStorage.getItem("slb-demo-ui") ?? "{}");
  if (PEOPLE.some((p) => p.id === saved.who)) ui.who = saved.who;
} catch {
  /* fine */
}
ui.date = weekOf(today()).find((d) => d >= today()) ?? weekOf(today())[0];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const me = () => person(ui.who);
const ROLE: Record<string, string> = { teacher: "Teacher", incharge: "Lab in-charge", admin: "Lab admin", viewer: "Leadership" };

function tabsFor(role: string): [Tab, string][] {
  const t: [Tab, string][] = [];
  if (role !== "viewer") t.push(["book", "Book"], ["mine", "My bookings"]);
  if (role === "incharge" || role === "admin") t.push(["sessions", "Sessions"]);
  t.push(["messages", "Teams messages"]);
  if (role === "admin" || role === "viewer") t.push(["reports", "Reports"]);
  t.push(["about", "How it works"]);
  return t;
}

function render() {
  try {
    localStorage.setItem("slb-demo-ui", JSON.stringify({ who: ui.who }));
  } catch {
    /* fine */
  }
  const tabs = tabsFor(me().role);
  if (!tabs.some(([t]) => t === ui.tab)) ui.tab = tabs[0][0];
  $("#who-role").textContent = `${ROLE[me().role]}${me().role === "viewer" || me().role === "teacher" ? ` · ${me().department}` : ""}`;
  $("#tabs").innerHTML = tabs
    .map(([t, l]) => `<button type="button" class="tab" role="tab" aria-selected="${t === ui.tab}" data-tab="${t}">${l}${t === "messages" ? ` <span class="count">${myMessages().length}</span>` : ""}</button>`)
    .join("");
  const main = $("#view");
  main.innerHTML = ui.tab === "book" ? bookView() : ui.tab === "mine" ? mineView() : ui.tab === "sessions" ? sessionsView() : ui.tab === "messages" ? messagesView() : ui.tab === "reports" ? reportsView() : aboutView();
}

// ---------------------------------------------------------------------------
// Book: the week grid. Every cell is the rules engine's answer.
// ---------------------------------------------------------------------------
function bookView() {
  const week = weekOf(ui.date);
  const days = week.map((d) => `<button type="button" class="day" data-date="${d}" aria-pressed="${d === ui.date}">${fmtDay(d)}${d === today() ? ' <span class="today">Today</span>' : ""}</button>`).join("");
  const blocks = TIMETABLE.blocks;
  const admin = me().role === "admin";
  const rows = blocks
    .map((b) => {
      if (!b.bookable) return `<tr class="brk"><th scope="row">${b.code}<span class="t">${b.start}–${b.end}</span></th><td colspan="${LABS.length}" class="muted small">Not bookable</td></tr>`;
      const cells = LABS.map((l) => {
        const c = cell(l.id, ui.date, b.id, ui.who, admin);
        const label = `${l.name}, ${fmtDay(ui.date)}, ${b.code} ${b.start} to ${b.end}`;
        if (c.state === "free") {
          const st = l.type === "cart_pool" ? `${c.unitsLeft} of ${c.unitsTotal} carts free` : "Free";
          return `<td><button type="button" class="cell free" style="--lab:var(--r-${l.colour})" data-book="${l.id}|${b.id}" aria-label="${esc(`${label}: ${st}, with ${c.inchargeName}. Book`)}"><span class="st">${st}</span><span class="sub">${esc(c.inchargeName)}${c.crossCover ? " (covering)" : ""}</span></button></td>`;
        }
        if (c.state === "booked") {
          const bk = getState().bookings.find((x) => c.bookingIds.includes(x.id));
          const mine = bk?.teacherId === ui.who;
          return `<td><div class="cell booked${mine ? " mine" : ""}" style="--lab:var(--r-${l.colour})"><span class="st">${mine ? "Your booking" : "Booked"}</span><span class="sub">${bk ? esc(`${classLabel(bk)} ${bk.subject}`) : ""}</span></div></td>`;
        }
        if (c.state === "closed") return `<td></td>`;
        const carts = c.bookingIds.length && l.type === "cart_pool";
        return `<td><div class="cell un" style="--lab:var(--r-${l.colour})"><span class="st">${esc(carts ? "Carts out" : c.reason)}</span><span class="sub">${esc(c.suggestion ?? "")}</span></div></td>`;
      }).join("");
      return `<tr><th scope="row">${b.code}<span class="t">${b.start}–${b.end}</span></th>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="head">
      <div><h1>Book a lab or AI Carts</h1><p class="muted">Pick a free cell. Book 24 h to 4 weeks ahead, one period at a time. Each AI Cart comes with its own lab in-charge (up to 3).</p></div>
      <div class="weeknav"><button type="button" class="btn" data-week="-7">Previous week</button><button type="button" class="btn" data-week="0">This week</button><button type="button" class="btn" data-week="7">Next week</button></div>
    </div>
    <nav class="days" aria-label="Day">${days}</nav>
    <div class="table-wrap"><table class="grid"><caption class="sr-only">Lab availability on ${fmtDay(ui.date)}</caption>
      <thead><tr><th scope="col">Period</th>${LABS.map((l) => `<th scope="col"><span class="dot" style="background:var(--r-${l.colour})"></span>${l.name}<span class="t">${l.location}</span></th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function openSheet(resourceId: string, blockId: string, opener: HTMLElement) {
  ui.lastFocus = opener;
  const l = lab(resourceId);
  const b = block(blockId);
  const c = cell(resourceId, ui.date, blockId, ui.who, me().role === "admin");
  const isCart = l.type === "cart_pool";
  const maxCarts = c.state === "free" ? c.unitsLeft : 1;
  const teachers = PEOPLE.filter((p) => p.role === "teacher");
  const dlg = $<HTMLDialogElement>("#sheet");
  dlg.innerHTML = `
    <form method="dialog" id="book-form" novalidate>
      <h2 id="sheet-title">Book ${l.name}, ${fmtDay(ui.date)} ${b.code}</h2>
      <p class="muted small">${b.start}–${b.end}${c.state === "free" ? ` · with ${esc(c.inchargeName)}` : ""}</p>
      <div id="form-msg" role="alert"></div>
      ${me().role === "admin" ? `<div class="field"><label for="f-for">Booking for</label><select id="f-for">${teachers.map((t) => `<option value="${t.id}">${t.name} (${t.department})</option>`).join("")}</select></div>` : ""}
      <div class="row3">
        <div class="field"><label for="f-subject">Subject</label><select id="f-subject" required><option value="">Choose</option>${SUBJECTS.map((s) => `<option>${s}</option>`).join("")}</select></div>
        <div class="field"><label for="f-year">Year</label><select id="f-year" required><option value="">Choose</option>${YEARS.map((s) => `<option>${s}</option>`).join("")}</select></div>
        <div class="field"><label for="f-section">Section</label><select id="f-section"><option value="">None</option>${SECTIONS.map((s) => `<option>${s}</option>`).join("")}</select></div>
      </div>
      <div class="field" id="other-wrap" hidden><label for="f-other">Which subject?</label><input id="f-other" type="text" maxlength="80" placeholder="e.g. Robotics club"></div>
      <div class="${isCart ? "row3" : "row2"}">
        <div class="field"><label for="f-students">Students</label><input id="f-students" type="number" min="1" max="${l.capacity ?? 60}" value="24" required></div>
        ${isCart ? `<div class="field"><label for="f-carts">Carts</label><input id="f-carts" type="number" min="1" max="${maxCarts}" value="1" required aria-describedby="carts-hint"><div class="hint" id="carts-hint">Up to ${maxCarts} now. Each cart comes with its own in-charge.</div></div>
        <div class="field"><label for="f-room">Classroom</label><input id="f-room" type="text" placeholder="Room 2.14" required></div>` : ""}
      </div>
      <div class="foot"><button type="button" class="btn" id="sheet-close">Cancel</button><button type="submit" class="btn primary">Book ${l.name.replace(" Lab", "")}, ${fmtDay(ui.date).split(" ")[0]} ${b.code}</button></div>
    </form>`;
  dlg.showModal();
  ($("#f-subject") as HTMLSelectElement).focus();
  $("#f-subject").addEventListener("change", (e) => {
    const other = (e.target as HTMLSelectElement).value === "Other";
    $("#other-wrap").hidden = !other;
    if (other) ($("#f-other") as HTMLInputElement).focus();
  });
  $("#sheet-close").addEventListener("click", () => dlg.close());
  $("#book-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (sel: string) => (document.querySelector(sel) as HTMLInputElement | null)?.value.trim() ?? "";
    const subject = v("#f-subject") === "Other" ? v("#f-other") : v("#f-subject");
    const problems = [
      !subject && (v("#f-subject") === "Other" ? "Say which subject." : "Choose a subject."),
      !v("#f-year") && "Choose a year group.",
      !(Number(v("#f-students")) >= 1) && "Say how many students.",
      isCart && !(Number(v("#f-carts")) >= 1 && Number(v("#f-carts")) <= 3) && "Choose 1 to 3 carts.",
      isCart && !v("#f-room") && "Say which classroom the carts go to.",
    ].filter(Boolean) as string[];
    const msg = $("#form-msg");
    if (problems.length) {
      msg.innerHTML = `<div class="notice bad">${problems.join(" ")}</div>`;
      return;
    }
    const r = tryBook(ui.who, {
      resourceId, date: ui.date, blockId, teacherId: me().role === "admin" ? v("#f-for") : ui.who, subject, yearGroup: v("#f-year"), section: v("#f-section"),
      students: Number(v("#f-students")), carts: isCart ? Number(v("#f-carts")) : null, classroom: isCart ? v("#f-room") : null,
    });
    if (!r.ok) {
      msg.innerHTML = `<div class="notice warn">${esc(r.reason)}${r.suggestion ? ` ${esc(r.suggestion)}` : ""}${
        r.alternatives.length ? `<br><span class="small">Free nearby: ${r.alternatives.map((a) => esc(`${a.resourceName} ${fmtDay(a.date)} ${a.blockCode}`)).join(", ")}</span>` : ""
      }</div>`;
      return;
    }
    dlg.close();
    toast(`Booked. ${r.booking.inchargeIds.map((i) => person(i).name).join(", ")} ${r.booking.inchargeIds.length > 1 ? "are" : "is"} going. A Teams message is on its way.`);
    render();
  });
  dlg.addEventListener("close", () => ui.lastFocus?.focus(), { once: true });
}

// ---------------------------------------------------------------------------
function bookingItem(b: Booking, actions: string) {
  const l = lab(b.resourceId);
  const bl = block(b.blockId);
  const status: Record<string, string> = { confirmed: '<span class="tag ok">Confirmed</span>', completed: '<span class="tag ok">Attended</span>', no_show: '<span class="tag bad">No-show</span>', cancelled: '<span class="tag">Cancelled</span>' };
  return `<li style="--lab:var(--r-${l.colour})"><div class="when"><strong>${fmtDay(b.date)}</strong><span class="small muted">${bl.code} · ${bl.start}–${bl.end}</span></div>
    <div class="what"><div><strong>${l.name}</strong> ${status[b.status]}${b.carts ? ` <span class="small">${b.carts} cart${b.carts > 1 ? "s" : ""} to ${esc(b.classroom ?? "")}</span>` : ""}</div>
    <div class="small muted">${esc(classLabel(b))} · ${esc(b.subject)} · ${b.students} students · ${esc(person(b.teacherId).name)} · with ${b.inchargeIds.map((i) => person(i).name).join(", ")}</div></div>
    <div class="acts">${actions}</div></li>`;
}

function mineView() {
  const all = getState().bookings.filter((b) => b.teacherId === ui.who).sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const t = Date.now();
  const up = all.filter((b) => b.status === "confirmed" && endOf(b).getTime() > t);
  const past = all.filter((b) => !up.includes(b)).reverse().slice(0, 25);
  return `<h1>My bookings</h1><p class="muted">Cancel up to 2 h before the lesson.</p>
    <h2>Upcoming</h2>${up.length ? `<ul class="list">${up.map((b) => bookingItem(b, cancellable(b) ? `<button type="button" class="btn danger small-btn" data-cancel="${b.id}">Cancel</button>` : '<span class="small muted">Too late to cancel here</span>')).join("")}</ul>` : '<p class="empty">No upcoming bookings. Use Book to find a free slot.</p>'}
    <h2>Past and cancelled</h2>${past.length ? `<ul class="list">${past.map((b) => bookingItem(b, "")).join("")}</ul>` : '<p class="empty">Nothing yet.</p>'}`;
}

function sessionsView() {
  const ids = me().role === "admin" ? ["ram", "abdul", "nael"] : [ui.who];
  const from = today();
  const to = addDays(from, 6);
  const list = getState().bookings
    .filter((b) => b.date >= from && b.date <= to && b.status !== "cancelled" && b.inchargeIds.some((i) => ids.includes(i)))
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  return `<h1>${me().role === "admin" ? "All in-charge sessions" : "My sessions"}</h1><p class="muted">The next 7 days. Mark attendance once a session has started.</p>
    ${list.length ? `<ul class="list">${list.map((b) => bookingItem(b, b.status === "confirmed" && startOf(b).getTime() <= Date.now() ? `<button type="button" class="btn primary small-btn" data-mark="completed|${b.id}">Attended</button><button type="button" class="btn small-btn" data-mark="no_show|${b.id}">No-show</button>` : "")).join("")}</ul>` : '<p class="empty">No sessions in the next 7 days.</p>'}`;
}

const myMessages = () => getState().messages.filter((m) => me().role === "admin" || m.to === ui.who);
function messagesView() {
  const list = myMessages().slice(0, 40);
  return `<h1>Teams messages</h1><p class="muted">What ${me().role === "admin" ? "everyone gets" : "you get"} in Microsoft Teams from the Lab Booking workflow. In this demo they stay here.</p>
    ${list.length ? `<div class="cards">${list.map((m) => `<article class="teams"><div class="small muted">Lab Booking · to ${esc(person(m.to).name)} · ${new Date(m.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div><h2>${esc(m.subject)}</h2>${m.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</article>`).join("")}</div>` : '<p class="empty">No messages yet.</p>'}`;
}

function reportsView() {
  const from = addDays(today(), -28);
  const used = getState().bookings.filter((b) => b.date >= from && b.date <= today() && (b.status === "completed" || b.status === "no_show" || b.status === "confirmed"));
  const all = getState().bookings.filter((b) => b.date >= from && b.date <= today());
  const teachers = PEOPLE.filter((p) => p.role === "teacher").map((p) => {
    const mine = all.filter((b) => b.teacherId === p.id);
    const u = mine.filter((b) => used.includes(b));
    const ratings = mine.map((b) => b.rating).filter((r): r is number => r !== null);
    const labs = new Map<string, number>();
    for (const b of u) labs.set(lab(b.resourceId).name, (labs.get(lab(b.resourceId).name) ?? 0) + 1);
    return { p, sessions: u.length, attended: mine.filter((b) => b.status === "completed").length, noShow: mine.filter((b) => b.status === "no_show").length, cancelled: mine.filter((b) => b.status === "cancelled").length, carts: u.filter((b) => b.carts).length, labs: [...labs].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(", "), rating: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "-" };
  }).sort((a, b) => b.sessions - a.sessions);
  const byLab = LABS.map((l) => ({ l, n: used.filter((b) => b.resourceId === l.id).length }));
  const max = Math.max(1, ...byLab.map((x) => x.n));
  const load = ["ram", "abdul", "nael"].map((id) => ({ id, n: used.filter((b) => b.inchargeIds.includes(id)).length, carts: used.filter((b) => b.carts && b.inchargeIds.includes(id)).length }));
  return `<h1>Reports</h1><p class="muted">Last 4 weeks, sample data.</p>
    <div class="kpis"><div class="kpi"><span class="n">${used.length}</span>Sessions</div><div class="kpi"><span class="n">${new Set(used.map((b) => b.teacherId)).size}</span>Teachers</div><div class="kpi"><span class="n">${used.filter((b) => b.carts).length}</span>AI Cart sessions</div><div class="kpi"><span class="n">${all.filter((b) => b.status === "no_show").length}</span>No-shows</div></div>
    <h2>By teacher</h2><div class="table-wrap"><table class="data"><thead><tr><th>Teacher</th><th>Department</th><th class="num">Sessions</th><th class="num">Attended</th><th class="num">No-shows</th><th class="num">Cancelled</th><th class="num">Cart sessions</th><th>Labs used</th><th class="num">Rating</th></tr></thead>
    <tbody>${teachers.map((t) => `<tr><td>${t.p.name}</td><td>${t.p.department}</td><td class="num">${t.sessions}</td><td class="num">${t.attended}</td><td class="num">${t.noShow}</td><td class="num">${t.cancelled}</td><td class="num">${t.carts}</td><td class="small">${t.labs || "-"}</td><td class="num">${t.rating}</td></tr>`).join("")}</tbody></table></div>
    <div class="two"><section><h2>By lab</h2><table class="data"><tbody>${byLab.map((x) => `<tr><td>${x.l.name}</td><td style="width:50%"><div class="bar"><span style="width:${(x.n / max) * 100}%;background:var(--r-${x.l.colour})"></span></div></td><td class="num">${x.n}</td></tr>`).join("")}</tbody></table></section>
    <section><h2>In-charge load</h2><table class="data"><thead><tr><th>In-charge</th><th class="num">Sessions</th><th class="num">With carts</th></tr></thead><tbody>${load.map((x) => `<tr><td>${person(x.id).name}</td><td class="num">${x.n}</td><td class="num">${x.carts}</td></tr>`).join("")}</tbody></table></section></div>`;
}

function aboutView() {
  return `<h1>How it works</h1>
    <div class="about">
      <p>This is a working demo of the Sunmarke Lab Booking app. It runs the same booking rules as the real app, with sample people and bookings kept in this browser. Nothing is sent anywhere.</p>
      <h2>Try this</h2>
      <ol>
        <li>As <strong>Sara Khan</strong> (teacher), book Quantum Lab for next week from the Book tab. Ram is assigned; you get a Teams message.</li>
        <li>Book <strong>3 AI Carts</strong> in a period. Ram, Abdul and Nael each go with a cart, so every lab shows "No lab in-charge available" for that period.</li>
        <li>Pick <strong>Other</strong> as the subject and type your own.</li>
        <li>Switch to <strong>Ram</strong> (in-charge) to see Sessions and his Teams messages.</li>
        <li>Switch to <strong>Dr. Sreejit</strong> (SLT), the <strong>Principal</strong> or the <strong>Board of Directors</strong> for the reports, including each teacher's use.</li>
      </ol>
      <h2>The rules</h2>
      <ul>
        <li>Labs: Quantum, DollarX, XReal, Strike, and AI Carts that come to the classroom.</li>
        <li>Every booking needs a free lab and a free lab in-charge: Ram, then Nael, then Abdul for Quantum and the AI Carts; Abdul, then Ram, then Nael for DollarX, XReal and Strike.</li>
        <li>DollarX, XReal and Strike are hybrid labs with regular ICT lessons, shown as "Timetabled" in the grid. Only the other periods can be booked.</li>
        <li>Each AI Cart goes with its own in-charge, so at most 3 carts at a time; when 3 are out no lab can be booked.</li>
        <li>Book 24 hours to 4 weeks ahead, one period per booking; cancel up to 2 hours before.</li>
        <li>Messages go to Microsoft Teams.</li>
      </ul>
      <p><button type="button" class="btn" id="reset">Reset the demo data</button></p>
    </div>`;
}

function toast(text: string) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout((t as unknown as { _h: number })._h);
  (t as unknown as { _h: number })._h = window.setTimeout(() => (t.hidden = true), 5000);
}

// ---------------------------------------------------------------------------
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!el) return;
  const d = el.dataset;
  if (d.tab) { ui.tab = d.tab as Tab; render(); ($(`[data-tab="${ui.tab}"]`) as HTMLElement)?.focus(); }
  else if (d.date) { ui.date = d.date; render(); ($(`[data-date="${ui.date}"]`) as HTMLElement)?.focus(); }
  else if (d.week !== undefined) { ui.date = d.week === "0" ? (weekOf(today()).find((x) => x >= today()) ?? weekOf(today())[0]) : addDays(weekOf(ui.date)[0], Number(d.week)); render(); }
  else if (d.book) { const [r, b] = d.book.split("|"); openSheet(r, b, el); }
  else if (d.cancel) { cancel(d.cancel, ui.who); toast("Booking cancelled. Everyone going has been told in Teams."); render(); }
  else if (d.mark) { const [s, id] = d.mark.split("|"); mark(id, s as "completed" | "no_show"); render(); }
  else if (el.id === "reset") { reset(); toast("Demo data reset."); render(); }
  else if (el.id === "theme") {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    el.setAttribute("aria-pressed", String(!dark));
  }
});
$("#who").addEventListener("change", (e) => { ui.who = (e.target as HTMLSelectElement).value; render(); });
($("#who") as HTMLSelectElement).innerHTML = (["teacher", "incharge", "admin", "viewer"] as const)
  .map((r) => `<optgroup label="${ROLE[r]}">${PEOPLE.filter((p) => p.role === r).map((p) => `<option value="${p.id}">${p.name}${r === "viewer" ? ` (${p.department})` : ""}</option>`).join("")}</optgroup>`)
  .join("");
($("#who") as HTMLSelectElement).value = ui.who;
render();
