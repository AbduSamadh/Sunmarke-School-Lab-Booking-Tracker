/**
 * Turns a typed request ("book Quantum next Tue P3-P4 for Y8 B Science, 24
 * students") into structured fields. Pure and dependency-free so it can be
 * unit tested; it never decides availability (that is packages/rules' job).
 */

export type Intent = "help" | "free" | "book" | "cancel" | "mine" | "waitlist" | "rules" | "who" | "thanks" | "unknown";

export interface ParseContext {
  today: string; // YYYY-MM-DD, Asia/Dubai
  resources: { id: string; name: string; type: "room" | "cart_pool" }[];
  incharges: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  subjects: string[];
  years: string[];
  sections: string[];
  blockCodes: string[]; // e.g. P1..P7
}

export interface Parsed {
  intent: Intent;
  resourceId?: string;
  date?: string;
  dateText?: string;
  blockCodes?: string[];
  double?: boolean;
  inchargeId?: string;
  forStaffId?: string;
  subject?: string;
  yearGroup?: string;
  section?: string;
  studentCount?: number;
  cartCount?: number;
  classroom?: string;
  topic?: "window" | "cancel" | "double" | "carts" | "waitlist" | "incharge" | "series" | "checkin" | "quota";
}

const WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WD3 = WD.map((d) => d.slice(0, 3));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function addDaysIso(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 6 : w - 1; // Mon=0
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseDate(text: string, today: string): { date: string; text: string } | undefined {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, text: m[0] };
  if ((m = t.match(/\bday after tomorrow\b/))) return { date: addDaysIso(today, 2), text: m[0] };
  if ((m = t.match(/\btoday\b/))) return { date: today, text: m[0] };
  if ((m = t.match(/\b(tomorrow|tmrw|tmr)\b/))) return { date: addDaysIso(today, 1), text: m[0] };
  const year = Number(today.slice(0, 4));
  const pick = (mo: number, d: number) => {
    let iso = `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (iso < addDaysIso(today, -7)) iso = `${year + 1}${iso.slice(4)}`;
    return iso;
  };
  // "8 dec", "8th of december", "dec 8", "december 8th"
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join("|")})[a-z]*\\b`)))) return { date: pick(MONTHS.indexOf(m[2]), Number(m[1])), text: m[0] };
  if ((m = t.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) return { date: pick(MONTHS.indexOf(m[1]), Number(m[2])), text: m[0] };
  // "8/12" (day/month, UAE style)
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/)) && Number(m[2]) <= 12) return { date: pick(Number(m[2]) - 1, Number(m[1])), text: m[0] };
  // weekday names, optionally "next" / "this"
  if ((m = t.match(new RegExp(`\\b(next|this|coming)?\\s*(${WD3.join("|")})(?:day|nesday|sday|rsday|urday)?\\b`)))) {
    const target = WD3.indexOf(m[2]);
    let diff = (target - weekday(today) + 7) % 7;
    if (m[1] === "next") {
      // "next Tuesday" means the one in the following week.
      const daysToNextMonday = 7 - weekday(today);
      if (diff < daysToNextMonday) diff += 7;
    }
    return { date: addDaysIso(today, diff), text: m[0].trim() };
  }
  if ((m = t.match(/\bnext week\b/))) return { date: addDaysIso(today, 7 - weekday(today)), text: m[0] };
  return undefined;
}

export function parseBlocks(text: string, codes: string[]): { codes: string[]; double: boolean } | undefined {
  const t = text.toLowerCase();
  const norm = (n: string) => codes.find((c) => c.toLowerCase() === `p${n}`) ?? `P${n}`;
  let m: RegExpMatchArray | null;
  // "P3-P4", "p3 to p4", "periods 3 and 4", "blocks 3-4"
  if ((m = t.match(/\b(?:p|period|periods|block|blocks|lesson)\s*(\d)\s*(?:-|–|to|and|&|\+)\s*(?:p|period|block)?\s*(\d)\b/)))
    {
      const a = Number(m[1]), b = Number(m[2]);
      if (b === a + 1) return { codes: [norm(m[1]), norm(m[2])], double: true };
      if (b > a + 1 && b - a <= 2) return { codes: [norm(m[1]), norm(String(a + 1)), norm(m[2])], double: true };
    }
  if ((m = t.match(/\b(?:p|period|block|lesson)\s*(\d)\b/))) {
    const dbl = /\bdouble\b/.test(t);
    const first = norm(m[1]);
    return { codes: dbl ? [first, norm(String(Number(m[1]) + 1))] : [first], double: dbl };
  }
  if ((m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|last)\s+(?:period|block|lesson)\b/))) {
    const n = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"].indexOf(m[1]);
    const code = m[1] === "last" ? codes[codes.length - 1] : codes[n];
    return code ? { codes: [code], double: false } : undefined;
  }
  return undefined;
}

export function parseRequest(text: string, ctx: ParseContext): Parsed {
  const raw = text.trim();
  const t = ` ${raw.toLowerCase().replace(/[’']/g, "'")} `;
  const out: Parsed = { intent: "unknown" };

  // Resource
  const aliases: [RegExp, string][] = [];
  for (const r of ctx.resources) {
    // "DollarX Lab" also matches "dollarx", "dollar x" and "dollar-x lab".
    const words = r.name.replace(/\s+Lab$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/);
    aliases.push([new RegExp(`\\b${words.map(esc).join("[\\s-]*")}(?:\\s*lab)?\\b`), r.id]);
    aliases.push([new RegExp(`\\b${esc(r.id)}\\b`), r.id]);
    if (r.type === "cart_pool") aliases.push([/\b(ai\s*)?carts?\b|\blaptops?\b|\bchromebooks?\b/, r.id]);
  }
  for (const [re, id] of aliases) if (re.test(t)) { out.resourceId = id; break; }

  const d = parseDate(t, ctx.today);
  if (d) { out.date = d.date; out.dateText = d.text; }
  const b = parseBlocks(t, ctx.blockCodes);
  if (b) { out.blockCodes = b.codes; out.double = b.double; }

  // "with Ram", "Abdul as in-charge"
  for (const s of ctx.incharges) {
    const first = s.name.toLowerCase().split(" ")[0];
    if (new RegExp(`\\b(with|by|from)\\s+${esc(first)}\\b|\\b${esc(first)}\\s+(as|for)\\s+(the\\s+)?in-?charge\\b|\\bin-?charge\\s+(is\\s+)?${esc(first)}\\b`).test(t)) out.inchargeId = s.id;
  }
  // Admin: "for Omar", "on behalf of Sara Khan"
  for (const s of ctx.staff) {
    const full = s.name.toLowerCase();
    const first = full.split(" ")[0];
    if (new RegExp(`\\b(on behalf of|for)\\s+(${esc(full)}|${esc(first)})\\b`).test(t) && !ctx.incharges.some((i) => i.id === s.id && out.inchargeId === i.id)) out.forStaffId = s.id;
  }

  // Class details
  for (const s of [...ctx.subjects].sort((a, z) => z.length - a.length)) {
    if (new RegExp(`\\b${esc(s.toLowerCase())}\\b`).test(t)) { out.subject = s; break; }
  }
  if (!out.subject && /\b(dt|d&t|design tech)\b/.test(t)) out.subject = ctx.subjects.find((s) => /design/i.test(s));
  if (!out.subject && /\bcs\b|\bict\b/.test(t)) out.subject = ctx.subjects.find((s) => /comput/i.test(s));
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(?:y|yr|year|grade|g)\s*(\d{1,2})\s*([a-f])?\b/)) || (m = t.match(/\b(\d{1,2})([a-f])\b(?!\s*(?:am|pm))/))) {
    const y = `Y${Number(m[1])}`;
    if (ctx.years.includes(y)) out.yearGroup = y;
    if (m[2] && ctx.sections.map((x) => x.toLowerCase()).includes(m[2])) out.section = m[2].toUpperCase();
  }
  if ((m = t.match(/\bfs\s*([12])\b/))) out.yearGroup = `FS${m[1]}`;
  if (!out.section && (m = t.match(/\b(?:section|class|group)\s+([a-f])\b/))) out.section = m[1].toUpperCase();
  if ((m = t.match(/\b(\d{1,2})\s*(?:students|kids|pupils|children|learners)\b/))) out.studentCount = Number(m[1]);
  if ((m = t.match(/\b(\d{1,2})\s*(?:ai\s*)?(?:carts?|laptops?)\b/))) out.cartCount = Number(m[1]);
  if ((m = raw.match(/\b(?:room|classroom|rm)\s*([A-Za-z]?\d+(?:\.\d+)?[A-Za-z]?)\b/i))) out.classroom = `Room ${m[1]}`;

  // Intent
  const has = (re: RegExp) => re.test(t);
  if (has(/^\s*(thanks|thank you|thx|cheers|great|perfect|ok|okay)\b/)) out.intent = "thanks";
  else if (has(/\b(cancel|delete|remove|drop)\b/)) out.intent = "cancel";
  else if (has(/\bwait\s*-?list\b|\bqueue\b|\bnotify me\b|\blet me know if\b/) && !has(/\bhow\b|\bwhat\b/)) out.intent = "waitlist";
  else if (has(/\b(my|i have|i've|have i)\b.*\b(bookings?|sessions?|booked|reservations?)\b|\bwhat did i book\b|\bmy schedule\b/)) out.intent = "mine";
  else if (has(/\bhow (do|can|to|does|far|long|many|much)\b|\bwhat (is|are) the rules?\b|\bcan i (cancel|change|book (more|a double|several|two))\b|\bwhat happens\b|\bwhy\b|\bhelp\b|\bwhat can you do\b|\bhow it works\b/)) {
    out.intent = has(/\b(book|cancel|waitlist|double|carts?|in-?charge|repeat|series|weekly|check.?in|qr|limit|quota|ahead|advance|cut-?off|change|edit)\b/) ? "rules" : "help";
  } else if (has(/\b(book|reserve|grab|hold|get me|i need|i want|i'd like|can i (get|have)|schedule|put me)\b/)) out.intent = "book";
  else if (has(/\b(free|available|availability|open|slots?|vacant|empty|when can)\b/)) out.intent = "free";
  else if (has(/\bwho('s| is)\b.*\b(in-?charge|coming|running|with me)\b|\bin-?charge\b/)) out.intent = "who";
  else if (has(/^\s*(hi|hello|hey|salam|good (morning|afternoon))\b/)) out.intent = "help";
  else if (out.resourceId || out.date || out.blockCodes) out.intent = "free";

  if (out.intent === "rules") {
    if (has(/\bcancel|change|edit\b/)) out.topic = "cancel";
    else if (has(/\bahead|advance|far|early|late|window\b/)) out.topic = "window";
    else if (has(/\bdouble|two (periods|blocks)\b/)) out.topic = "double";
    else if (has(/\bcarts?|laptops?\b/)) out.topic = "carts";
    else if (has(/\bwait\s*-?list\b/)) out.topic = "waitlist";
    else if (has(/\bin-?charge|ram|abdul\b/)) out.topic = "incharge";
    else if (has(/\brepeat|series|weekly|every week\b/)) out.topic = "series";
    else if (has(/\bcheck.?in|qr|attendance\b/)) out.topic = "checkin";
    else if (has(/\blimit|quota|how many\b/)) out.topic = "quota";
  }
  return out;
}
