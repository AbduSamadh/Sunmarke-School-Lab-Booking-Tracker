import type { Db } from "@sunmarke/db";
import { addDays, alternatives, evaluate, isoWeekday, localDate, timetableForDate, blockOn } from "@sunmarke/rules";
import { parseRequest, type ParseContext, type Parsed } from "../shared/assistantParse";
import { fmtDateLong, fmtDateShort } from "../shared/format";
import { campusOf, listBookings, quotaUsage, type Actor } from "./bookings";
import { getAssignments, getSettings, getStaff, getTimetables, loadWorld } from "./world";
import { now } from "./util";

/**
 * The booking assistant. It reads a typed request, then answers with the same
 * rules engine the grid uses. It never writes on its own: every booking,
 * cancellation or waitlist join is a card the person confirms, and the card
 * calls the normal API, which re-checks everything.
 */

export interface SlotCard {
  resourceId: string;
  resourceName: string;
  date: string;
  dateLabel: string;
  blockCodes: string[];
  blockLabel: string;
  time: string;
  inchargeName: string;
  unitsLeft?: number;
}

export interface Proposal {
  input: {
    resourceId: string; date: string; blockIds: string[]; subject: string; yearGroup: string; section: string; studentCount: number;
    cartCount?: number; classroom?: string; objective: string; specialRequirements: string; overrideWindow?: boolean; onBehalfOf?: string;
  };
  rows: [string, string][];
  inchargeName: string;
  reassignTo?: { id: string; name: string };
  note?: string;
}

export interface AssistantReply {
  text: string[];
  slots?: SlotCard[];
  proposal?: Proposal;
  bookings?: { id: string; title: string; sub: string; cancellable: boolean }[];
  waitlist?: { resourceId: string; date: string; blockId: string; label: string; units?: number };
  suggestions?: string[];
  link?: { label: string; href: string };
  draft?: Draft;
}

/** What the conversation has gathered so far; the browser sends it back with the next message. */
export type Draft = Omit<Parsed, "intent" | "topic" | "dateText"> & { pending?: "book" | "waitlist" };

const SUGGEST = ["What's free tomorrow?", "Book Quantum next Tuesday P3", "My bookings", "How do I book a double lesson?"];

export async function context(db: Db, campusId?: string): Promise<ParseContext & { settings: Awaited<ReturnType<typeof getSettings>> }> {
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const [staff, tts, resources, lookups] = await Promise.all([
    getStaff(db),
    getTimetables(db).then((t) => (campusId ? t.filter((x) => x.campusId === campusId) : t)),
    db.query<{ id: string; name: string; type: "room" | "cart_pool" }>(
      `SELECT id, name, type FROM resources WHERE active ${campusId ? "AND campus_id = $1" : ""} ORDER BY sort`,
      campusId ? [campusId] : [],
    ),
    db.query<{ kind: string; value: string }>("SELECT kind, value FROM lookups ORDER BY kind, sort"),
  ]);
  const std = timetableForDate(tts, today) ?? tts[0];
  return {
    settings,
    today,
    resources,
    incharges: staff.filter((s) => s.active && s.role === "incharge" && (!campusId || s.campusId === campusId)).map((s) => ({ id: s.id, name: s.name })),
    staff: staff.filter((s) => s.active && s.role !== "viewer" && (!campusId || s.campusId === campusId)).map((s) => ({ id: s.id, name: s.name })),
    subjects: lookups.filter((l) => l.kind === "subject").map((l) => l.value),
    years: lookups.filter((l) => l.kind === "year_group").map((l) => l.value),
    sections: lookups.filter((l) => l.kind === "section").map((l) => l.value),
    blockCodes: (std?.blocks ?? []).filter((b) => b.bookable).sort((a, b) => a.start.localeCompare(b.start)).map((b) => b.code),
  };
}

export type Ctx = Awaited<ReturnType<typeof context>>;
export type History = { role: "user" | "assistant"; text: string }[];

export async function ask(db: Db, actor: Actor, message: string, draftIn: Draft = {}, history: History = []): Promise<AssistantReply> {
  // Optional: Claude understands free-form requests. Off unless the school turns it on (see docs/DECISIONS.md).
  if (process.env.ASSISTANT_PROVIDER === "claude") {
    const { askClaude } = await import("./assistantClaude");
    const r = await askClaude(db, actor, message, history).catch((e) => {
      console.error("assistant: Claude unavailable, using the built-in assistant", e instanceof Error ? e.message : e);
      return null;
    });
    if (r) return r;
  }
  const ctx = await context(db, campusOf(actor));
  const p = parseRequest(message.slice(0, 500), ctx);
  const target = p.resourceId || p.date || p.blockCodes;
  const details = p.subject || p.yearGroup || p.section || p.studentCount || p.cartCount || p.classroom;
  // A message that only adds class details continues the booking in progress.
  let intent = p.intent;
  if (draftIn.pending && (intent === "unknown" || (intent === "free" && !p.blockCodes && details)) && (details || target || p.inchargeId)) intent = draftIn.pending === "book" ? "book" : "waitlist";
  // A new booking (or one naming both lab and day) keeps only the class details from before.
  if (intent === "book" && (draftIn.pending !== "book" || (p.resourceId && p.date))) draftIn = pickClass(draftIn);
  const draft: Draft = { ...draftIn };
  for (const [k, v] of Object.entries(p)) if (v !== undefined && k !== "intent" && k !== "topic" && k !== "dateText") (draft as Record<string, unknown>)[k] = v;
  if (p.blockCodes && !p.double) draft.double = false;

  switch (intent) {
    case "thanks":
      return { text: ["You're welcome. Anything else?"], suggestions: SUGGEST.slice(0, 3) };
    case "help":
      return help(actor);
    case "rules":
      return rules(p.topic, ctx.settings);
    case "mine":
      return mine(db, actor);
    case "cancel":
      return cancel(db, actor, draft);
    case "who":
      return who(db, ctx, draft);
    case "free":
      return free(db, actor, ctx, draft);
    case "waitlist":
      return waitlist(db, actor, ctx, draft);
    case "book":
      return book(db, actor, ctx, draft);
    default:
      return {
        text: ["Sorry, I didn't catch that. I can find free slots, book, cancel, join a waitlist, or explain the booking rules.", "Try something like \"Is Quantum free on Tuesday P3?\""],
        suggestions: SUGGEST,
      };
  }
}

function pickClass(d: Draft): Draft {
  return { subject: d.subject, yearGroup: d.yearGroup, section: d.section, studentCount: d.studentCount, classroom: d.classroom, cartCount: d.cartCount, forStaffId: d.forStaffId };
}

function help(actor: Actor): AssistantReply {
  const text = [
    `Hi ${actor.name.split(" ")[0]}. I can help you book a lab or AI Carts without filling in the form.`,
    "Ask me what's free (\"What's free on Thursday?\"), book (\"Book XReal tomorrow P2 for Y9 A Science, 22 students\"), see or cancel your bookings, or join a waitlist. I always show you the booking before it's made.",
  ];
  if (actor.role === "admin") text.push("As lab admin you can also book for a teacher (\"... for Omar\") and ask for a specific in-charge (\"... with Abdul\").");
  if (actor.role === "viewer") text.push("Leadership accounts can look but not book.");
  return { text, suggestions: SUGGEST };
}

export function rules(topic: Parsed["topic"], s: Awaited<ReturnType<typeof getSettings>>): AssistantReply {
  const a: Record<string, string[]> = {
    window: [`You can book from ${s.minLeadHours} hours to ${Math.round(s.maxLeadDays / 7)} weeks ahead. Repeating lessons can be planned up to ${s.recurringMaxDays} days ahead.`],
    cancel: [`Cancel from My bookings up to ${s.cancelCutoffHours} hours before the lesson. After that, contact the in-charge. To change the time, cancel and book again; you can edit the class details any time.`],
    double: ["Pick the first period, then tick \"Double lesson\" in the booking form. Or ask me: \"Book Quantum Tuesday P3-P4\". Both periods need the same in-charge free."],
    carts: [`AI Carts come to your classroom. Book 1 to ${s.maxCartsPerBooking} carts in one go and say which room, for example \"Book 4 carts Thursday P2 to Room 2.14\".`],
    waitlist: [`If a slot is taken, join its waitlist. When it frees up, the first teacher waiting gets it held for ${s.waitlistHoldHours} hours and an email.`],
    incharge: ["Every session needs a lab in-charge: Ram looks after Quantum and the AI Carts, Abdul looks after DollarX, XReal and Strike, and each covers for the other when free. The app picks who is free for you. Only the lab admin can swap them."],
    series: ["Tick \"Repeat this lesson\" in the booking form, choose how often and until when. You see every date first; dates that aren't free are skipped."],
    checkin: [`Scan the QR code on the lab door at the start of the lesson. Lab sessions with no check-in ${s.autoNoShowMinutes} minutes after the start are marked as no-shows.`],
    quota: [s.quotaPerTeacherWeek ? `Each teacher can book up to ${s.quotaPerTeacherWeek} periods a week${s.quotaPerDeptWeek ? ` and each department ${s.quotaPerDeptWeek}` : ""}.` : "There is no weekly limit at the moment."],
  };
  return {
    text: topic ? a[topic] : ["Pick a free slot on the Book page, fill in your class, and press Book. Or just tell me what you need and I'll set it up for you to confirm."],
    suggestions: ["How far ahead can I book?", "How do I cancel?", "What's free tomorrow?"],
  };
}

export async function mine(db: Db, actor: Actor): Promise<AssistantReply> {
  const t = now();
  const s = await getSettings(db);
  const list = (await listBookings(db, { teacherId: actor.id, from: localDate(t, s), status: ["confirmed"] })).filter((b) => b.end > t);
  if (!list.length) return { text: ["You have no upcoming bookings."], suggestions: ["What's free tomorrow?", "What's free next week?"] };
  return {
    text: [`You have ${list.length} upcoming booking${list.length === 1 ? "" : "s"}${list.length > 6 ? "; here are the next 6" : ""}.`],
    bookings: list.slice(0, 6).map((b) => ({
      id: b.id,
      title: `${b.resourceName}, ${fmtDateShort(b.date)} ${b.blockLabel}`,
      sub: `${b.timeLabel} · ${b.classLabel} ${b.subject} · with ${b.inchargeName}${b.cartCount ? ` · ${b.cartCount} carts to ${b.classroom}` : ""}`,
      cancellable: b.start.getTime() - t.getTime() >= s.cancelCutoffHours * 3_600_000,
    })),
    link: { label: "Open My bookings", href: "/bookings" },
  };
}

export async function cancel(db: Db, actor: Actor, d: Draft): Promise<AssistantReply> {
  const r = await mine(db, actor);
  if (!r.bookings) return r;
  const tts = await getTimetables(db);
  const all = (await listBookings(db, { teacherId: actor.id, from: localDate(now(), await getSettings(db)), status: ["confirmed"] })).filter((b) => b.end > now());
  const match = all.filter((b) => {
    if (d.resourceId && b.resourceId !== d.resourceId) return false;
    if (d.date && b.date !== d.date) return false;
    if (d.blockCodes) {
      const codes = b.blockIds.map((id) => blockOn(tts, b.date, id)?.code);
      if (!d.blockCodes.some((c) => codes.includes(c))) return false;
    }
    return true;
  });
  const ids = new Set(match.map((b) => b.id));
  const cards = r.bookings.filter((b) => ids.has(b.id));
  if (!cards.length) return { text: ["I couldn't find a booking of yours that matches. Here are your upcoming ones."], bookings: r.bookings };
  return { text: [cards.length === 1 ? "Is this the one to cancel?" : "Which one should I cancel?"], bookings: cards };
}

export async function who(db: Db, ctx: Awaited<ReturnType<typeof context>>, d: Draft): Promise<AssistantReply> {
  const [assign, staff] = await Promise.all([getAssignments(db), getStaff(db)]);
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const lines = ctx.resources
    .filter((r) => !d.resourceId || r.id === d.resourceId)
    .map((r) => {
      const a = assign.filter((x) => x.resourceId === r.id).sort((x, y) => x.priority - y.priority);
      return `${r.name}: ${a[0] ? name(a[0].staffId) : "nobody"}${a[1] ? `, with ${name(a[1].staffId)} covering` : ""}.`;
    });
  return { text: ["Lab in-charges:", ...lines, "When you book, the app picks whoever is free and shows you before you confirm."] };
}

/** Free slots for the filters given; without a date, the next school days with something free. */
export async function free(db: Db, actor: Actor, ctx: Awaited<ReturnType<typeof context>>, d: Draft): Promise<AssistantReply> {
  const from = d.date ?? ctx.today;
  const to = d.date ?? addDays(ctx.today, 14);
  const slots = await freeSlots(db, actor, from, to, d, d.date ? 10 : 8);
  const what = d.resourceId ? ctx.resources.find((r) => r.id === d.resourceId)?.name : "labs and carts";
  const when = d.date ? fmtDateLong(d.date) : "the next two weeks";
  const at = d.blockCodes ? ` at ${d.blockCodes.join("–")}` : "";
  if (d.date && isoWeekday(d.date) > 5) return { text: [`${fmtDateLong(d.date)} is a weekend. Try a school day.`], suggestions: ["What's free on Monday?"] };
  if (!slots.length) {
    const text = [`Nothing free for ${what} on ${when}${at}.`];
    if (d.resourceId && d.date && d.blockCodes) return { ...(await waitlistCard(db, actor, ctx, d)), text };
    return { text, suggestions: ["What's free next week?"] };
  }
  return {
    text: [`Free ${what}${at}, ${when}${slots.length >= (d.date ? 10 : 8) ? " (first few)" : ""}. Tap one to set up the booking.`],
    slots,
    draft: { ...pickClass(d), pending: "book" },
  };
}

async function freeSlots(db: Db, actor: Actor, from: string, to: string, d: Draft, limit: number): Promise<SlotCard[]> {
  const world = await loadWorld(db, from, to, { campusId: campusOf(actor) });
  const t = now();
  const teacherId = d.forStaffId && actor.role === "admin" ? d.forStaffId : actor.id;
  const out: SlotCard[] = [];
  for (let date = from; date <= to && out.length < limit; date = addDays(date, 1)) {
    const tt = timetableForDate(world.timetables, date);
    if (!tt) continue;
    const blocks = tt.blocks.filter((b) => b.bookable).sort((a, b) => a.start.localeCompare(b.start));
    for (const b of blocks) {
      if (d.blockCodes && b.code !== d.blockCodes[0]) continue;
      const ids = d.blockCodes && d.blockCodes.length > 1 ? d.blockCodes.map((c) => blocks.find((x) => x.code === c)?.id).filter(Boolean) as string[] : [b.id];
      if (ids.length !== (d.blockCodes?.length ?? 1)) continue;
      for (const r of world.resourceRows.filter((x) => x.active && (!d.resourceId || x.id === d.resourceId))) {
        const units = r.type === "cart_pool" ? (d.cartCount ?? 1) : 1;
        const ev = evaluate(world, { resourceId: r.id, date, blockIds: ids, units, now: t, teacherId });
        if (!ev.ok) continue;
        const last = blocks.find((x) => x.id === ids[ids.length - 1])!;
        out.push({
          resourceId: r.id, resourceName: r.name, date, dateLabel: fmtDateShort(date), blockCodes: ids.map((id) => blocks.find((x) => x.id === id)!.code),
          blockLabel: ids.length > 1 ? `${b.code}–${last.code}` : b.code, time: `${b.start}–${last.end}`, inchargeName: ev.inchargeName,
          unitsLeft: r.type === "cart_pool" ? ev.unitsLeftAfter + units : undefined,
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

async function lastClass(db: Db, teacherId: string) {
  const r = await db.query<{ subject: string; year_group: string; section: string; student_count: number }>(
    "SELECT subject, year_group, section, student_count FROM bookings WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 1",
    [teacherId],
  );
  const c = await db.query<{ classroom: string | null; cart_count: number | null }>(
    "SELECT classroom, cart_count FROM bookings WHERE teacher_id = $1 AND cart_count IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [teacherId],
  );
  return { ...r[0], classroom: c[0]?.classroom ?? undefined, cartCount: c[0]?.cart_count ?? undefined };
}

export async function book(db: Db, actor: Actor, ctx: Awaited<ReturnType<typeof context>>, d: Draft): Promise<AssistantReply> {
  if (actor.role === "viewer") return { text: ["Leadership accounts can look at availability but can't book."] };
  const keep: Draft = { ...d, pending: "book" };
  const res = ctx.resources.find((r) => r.id === d.resourceId);
  // Missing where or when: show what's free so they can pick.
  if (!d.resourceId || !d.date || !d.blockCodes) {
    const missing = [!d.resourceId && "which lab (or AI Carts)", !d.date && "which day", !d.blockCodes && "which period"].filter(Boolean) as string[];
    const r = d.date || d.resourceId ? await free(db, actor, ctx, d) : null;
    return {
      text: [`Sure. Tell me ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}${r?.slots?.length ? ", or pick one of these" : ""}.`],
      slots: r?.slots,
      draft: keep,
      suggestions: r?.slots?.length ? undefined : ["Book Quantum tomorrow P2", "What's free this week?"],
    };
  }
  if (isoWeekday(d.date) > 5) return { text: [`${fmtDateLong(d.date)} is a weekend. Which school day?`], draft: { ...keep, date: undefined } };

  const forId = actor.role === "admin" && d.forStaffId && d.forStaffId !== actor.id ? d.forStaffId : undefined;
  const teacherId = forId ?? actor.id;
  const forName = forId ? ctx.staff.find((s) => s.id === forId)?.name : undefined;
  const last = await lastClass(db, teacherId);
  const subject = d.subject ?? last.subject;
  const yearGroup = d.yearGroup ?? last.year_group;
  const section = d.section ?? (d.yearGroup ? "" : (last.section ?? ""));
  const studentCount = d.studentCount ?? last.student_count ?? 24;
  const isCart = res!.type === "cart_pool";
  const cartCount = isCart ? (d.cartCount ?? last.cartCount ?? 4) : undefined;
  const classroom = isCart ? (d.classroom ?? last.classroom) : undefined;
  const ask: string[] = [];
  if (!subject) ask.push("the subject");
  if (!yearGroup) ask.push("the year group");
  if (isCart && !classroom) ask.push("which classroom the carts go to");
  if (ask.length)
    return { text: [`Nearly there. What's ${ask.join(" and ")}? For example "Science Y8 B, 24 students${isCart ? ", Room 2.14" : ""}".`], draft: keep };

  // Ask the rules engine, exactly as the booking form would.
  const world = await loadWorld(db, d.date, d.date, { campusId: campusOf(actor) });
  const tt = timetableForDate(world.timetables, d.date);
  const blocks = (tt?.blocks ?? []).filter((b) => b.bookable).sort((a, b) => a.start.localeCompare(b.start));
  const ids = d.blockCodes.map((c) => blocks.find((b) => b.code.toLowerCase() === c.toLowerCase())?.id);
  if (!tt || ids.some((x) => !x)) return { text: [`${d.blockCodes.join("–")} isn't a bookable period on ${fmtDateLong(d.date)}.`], draft: { ...keep, blockCodes: undefined } };
  const blockIds = ids as string[];
  const units = cartCount ?? 1;
  const usage = await quotaUsage(db, teacherId, d.date);
  const reqBase = { resourceId: res!.id, date: d.date, blockIds, units, now: now(), teacherId, usage };
  let ev = evaluate(world, reqBase);
  let override = false;
  if (!ev.ok && actor.role === "admin" && (ev.code === "window_too_soon" || ev.code === "window_too_far" || ev.code === "quota_reached")) {
    ev = evaluate(world, { ...reqBase, overrideWindow: true, usage: undefined });
    override = ev.ok;
  }
  const first = blocks.find((b) => b.id === blockIds[0])!;
  const lastB = blocks.find((b) => b.id === blockIds[blockIds.length - 1])!;
  const label = `${res!.name}, ${fmtDateLong(d.date)} ${blockIds.length > 1 ? `${first.code}–${lastB.code}` : first.code}`;

  if (!ev.ok) {
    const alts = alternatives(world, { ...reqBase, blockIds: [blockIds[0]] }, 4);
    const slots: SlotCard[] = alts.map((a) => {
      const b = blocks.find((x) => x.id === a.blockId);
      return { resourceId: a.resourceId, resourceName: a.resourceName, date: a.date, dateLabel: fmtDateShort(a.date), blockCodes: [a.blockCode], blockLabel: a.blockCode, time: b ? `${b.start}–${b.end}` : "", inchargeName: a.inchargeName };
    });
    return {
      text: [`${label} isn't available: ${ev.reason.replace(/\.$/, "")}.`, ...(ev.suggestion ? [ev.suggestion] : []), ...(slots.length ? ["These are free instead:"] : [])],
      slots,
      waitlist: ev.canWaitlist && blockIds.length === 1 ? { resourceId: res!.id, date: d.date, blockId: blockIds[0], label, units: isCart ? units : undefined } : undefined,
      draft: { ...keep, resourceId: undefined, date: undefined, blockCodes: undefined },
    };
  }

  // A named in-charge: the engine picks who is free, so only the admin can swap.
  let note: string | undefined;
  let reassignTo: Proposal["reassignTo"];
  if (d.inchargeId && d.inchargeId !== ev.inchargeId) {
    const want = ctx.incharges.find((i) => i.id === d.inchargeId)!;
    if (actor.role === "admin") {
      reassignTo = { id: want.id, name: want.name };
      note = `${ev.inchargeName} is the usual in-charge here. I'll book it, then move it to ${want.name} if they're free.`;
    } else note = `${ev.inchargeName} will be with you: the app gives each lab its usual in-charge when they're free. Ask the lab admin if you need ${want.name} instead.`;
  }
  if (override) note = [note, "This is outside the normal booking rules; you're booking as lab admin and it will be logged."].filter(Boolean).join(" ");

  const rows: [string, string][] = [
    ["What", isCart ? `${cartCount} AI cart${cartCount === 1 ? "" : "s"} to ${classroom}` : res!.name],
    ["When", `${fmtDateLong(d.date)}, ${blockIds.length > 1 ? `${first.code}–${lastB.code}` : first.code} (${first.start}–${lastB.end})`],
    ["Class", `${yearGroup}${section ? ` ${section}` : ""} · ${subject} · ${studentCount} students`],
    ["In-charge", `${ev.inchargeName}${ev.crossCover ? " (covering)" : ""}`],
  ];
  if (forName) rows.unshift(["For", forName]);
  return {
    text: [`${label} is free. Here's the booking; check it and confirm.`],
    proposal: {
      input: {
        resourceId: res!.id, date: d.date, blockIds, subject: subject!, yearGroup: yearGroup!, section, studentCount, objective: "", specialRequirements: "",
        ...(isCart ? { cartCount, classroom } : {}), ...(override ? { overrideWindow: true } : {}), ...(forId ? { onBehalfOf: forId } : {}),
      },
      rows,
      inchargeName: ev.inchargeName,
      reassignTo,
      note,
    },
    draft: { ...d, pending: "book" }, // follow-ups like "make it 20 students" update this booking
  };
}

export async function waitlistCard(db: Db, actor: Actor, ctx: Awaited<ReturnType<typeof context>>, d: Draft): Promise<AssistantReply> {
  if (!d.resourceId || !d.date || !d.blockCodes) return { text: ["Which slot? Tell me the lab, day and period, like \"Waitlist Quantum Tuesday P3\"."], draft: { ...d, pending: "waitlist" } };
  const world = await loadWorld(db, d.date, d.date, { campusId: campusOf(actor) });
  const tt = timetableForDate(world.timetables, d.date);
  const block = tt?.blocks.find((b) => b.code === d.blockCodes![0] && b.bookable);
  const res = ctx.resources.find((r) => r.id === d.resourceId)!;
  if (!block) return { text: [`${d.blockCodes[0]} isn't a bookable period that day.`] };
  const units = res.type === "cart_pool" ? (d.cartCount ?? 1) : 1;
  const ev = evaluate(world, { resourceId: res.id, date: d.date, blockIds: [block.id], units, now: now(), teacherId: actor.id });
  const label = `${res.name}, ${fmtDateLong(d.date)} ${block.code}`;
  if (ev.ok) return { text: [`Good news: ${label} is free now, so no need to wait.`], slots: [{ resourceId: res.id, resourceName: res.name, date: d.date, dateLabel: fmtDateShort(d.date), blockCodes: [block.code], blockLabel: block.code, time: `${block.start}–${block.end}`, inchargeName: ev.inchargeName }], draft: { ...pickClass(d), pending: "book" } };
  if (!ev.canWaitlist) return { text: [`${label} can't be waitlisted: ${ev.reason}`] };
  return { text: [`${label} is taken (${ev.reason.replace(/\.$/, "")}). Join the waitlist and I'll make sure you're emailed if it frees up.`], waitlist: { resourceId: res.id, date: d.date, blockId: block.id, label, units: res.type === "cart_pool" ? units : undefined } };
}

async function waitlist(db: Db, actor: Actor, ctx: Awaited<ReturnType<typeof context>>, d: Draft) {
  if (actor.role === "viewer") return { text: ["Leadership accounts can't join waitlists."] };
  return waitlistCard(db, actor, ctx, d);
}
