import type { Db } from "@sunmarke/db";
import { newId } from "./util";

/**
 * Email boundary. DevOutbox stores every message in the notifications table and
 * shows it at /outbox; nothing leaves the server. A GmailApiSender or
 * GraphSendMailSender (from labs@ on the school domain) replaces it once abd
 * approves an account (D3).
 */
export interface OutgoingEmail {
  bookingId?: string | null;
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  ics?: string;
}

export interface EmailSender {
  readonly name: string;
  send(msg: OutgoingEmail): Promise<void>;
}

export class DevOutbox implements EmailSender {
  readonly name = "dev-outbox";
  constructor(private db: Db) {}
  async send(m: OutgoingEmail) {
    await this.db.query(
      "INSERT INTO notifications (id, booking_id, template, recipient, subject, body_html, body_text, ics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [newId("ntf"), m.bookingId ?? null, m.template, m.to, m.subject, m.html, m.text, m.ics ?? null],
    );
  }
}

export function getEmailSender(db: Db): EmailSender {
  return new DevOutbox(db);
}

// ---------------------------------------------------------------------------
// ICS (RFC 5545) for "Add to calendar" and the teacher's invite.
// ---------------------------------------------------------------------------

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(opts: {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  organizer: string;
  attendees: string[];
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sunmarke School//Lab Booking//EN",
    `METHOD:${opts.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}@labs.sunmarke`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(opts.end)}`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `SUMMARY:${icsEscape(opts.summary)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    `LOCATION:${icsEscape(opts.location)}`,
    `ORGANIZER:mailto:${opts.organizer}`,
    ...opts.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:${a}`),
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Templates: plain, branded HTML with a text fallback.
// ---------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderEmail(opts: { heading: string; rows: [string, string][]; paragraphs?: string[]; action?: { label: string; url: string } }) {
  const rowsHtml = opts.rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5c574f">${esc(k)}</td><td style="padding:4px 0;color:#22201c">${esc(v)}</td></tr>`)
    .join("");
  const paras = (opts.paragraphs ?? []).map((p) => `<p style="margin:12px 0">${esc(p)}</p>`).join("");
  const action = opts.action
    ? `<p style="margin:20px 0"><a href="${esc(opts.action.url)}" style="background:#4338ca;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">${esc(opts.action.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:'IBM Plex Sans',Arial,sans-serif;font-size:16px;color:#22201c">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="font-size:14px;color:#5c574f;margin-bottom:8px">Sunmarke School · Labs</div>
<div style="background:#fff;border:1px solid #dcd8d0;border-radius:6px;padding:20px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(opts.heading)}</h1>
<table style="border-collapse:collapse;font-size:16px">${rowsHtml}</table>${paras}${action}
</div>
<div style="font-size:12px;color:#6f695f;margin-top:12px">Sent by the Sunmarke Lab Booking system. Reply to reach the lab team.</div>
</div></body></html>`;
  const text = [
    opts.heading,
    "",
    ...opts.rows.map(([k, v]) => `${k}: ${v}`),
    ...(opts.paragraphs ?? []).flatMap((p) => ["", p]),
    ...(opts.action ? ["", `${opts.action.label}: ${opts.action.url}`] : []),
  ].join("\n");
  return { html, text };
}
