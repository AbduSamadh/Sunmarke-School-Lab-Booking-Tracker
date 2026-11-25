import type { Db } from "@sunmarke/db";
import { buildIcs, getEmailSender, renderEmail } from "./email";
import type { BookingDetail } from "./bookings";
import { fmtDateLong } from "../shared/format";
import { DEFAULT_SETTINGS, localDate } from "@sunmarke/rules";
import { now } from "./util";
import { sendPush } from "./push";

export type EmailTemplate = "confirmed" | "changed" | "cancelled" | "declined" | "reminder" | "waitlist_offer" | "feedback" | "no_cover";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const FROM = () => process.env.LABS_FROM_ADDRESS ?? "labs@sunmarke.example";

function rows(b: BookingDetail): [string, string][] {
  const r: [string, string][] = [
    ["What", b.resourceName],
    ["When", `${fmtDateLong(b.date)}, ${b.blockLabel} (${b.timeLabel})`],
    ["Class", `${b.classLabel} · ${b.subject} · ${b.studentCount} students`],
    ["Teacher", b.teacherName],
    ["Lab in-charge", b.supportNames.length ? [b.inchargeName, ...b.supportNames].join(", ") : b.inchargeName],
  ];
  if (b.cartCount) r.push(["Carts", `${b.cartCount} to ${b.classroom ?? "classroom"}`]);
  if (b.objective) r.push(["Objective", b.objective]);
  if (b.specialRequirements) r.push(["Special requirements", b.specialRequirements]);
  return r;
}

export async function sendBookingEmail(db: Db, template: EmailTemplate, b: BookingDetail, to: "teacher" | "incharge" | "both", extra: Record<string, string> = {}) {
  const sender = getEmailSender(db);
  const recipients =
    to === "both" ? [b.teacherEmail, b.inchargeEmail, ...b.supportEmails] : to === "teacher" ? [b.teacherEmail] : [extra.inchargeEmail ?? b.inchargeEmail];
  const short = `${b.resourceName}, ${fmtDateLong(b.date)} ${b.blockLabel}`;
  let subject = "";
  let heading = "";
  const paragraphs: string[] = [];
  let action: { label: string; url: string } | undefined;
  let ics: string | undefined;
  const icsBase = {
    uid: b.id,
    start: b.start,
    end: b.end,
    summary: `${b.resourceName} · ${b.classLabel}`,
    description: `${b.subject} with ${b.teacherName}. Lab in-charge: ${b.inchargeName}.`,
    location: b.cartCount ? (b.classroom ?? "") : b.resourceName,
    organizer: FROM(),
    attendees: [b.teacherEmail, b.inchargeEmail, ...b.supportEmails],
  };

  switch (template) {
    case "confirmed":
      subject = `Booked: ${short}`;
      heading = `${b.resourceName} is booked`;
      paragraphs.push(
        b.cartCount
          ? `${[b.inchargeName, ...b.supportNames].join(", ").replace(/, ([^,]*)$/, " and $1")} will bring ${b.cartCount} cart${b.cartCount > 1 ? "s" : ""} to ${b.classroom}.`
          : `${b.inchargeName} will be with you.`,
      );
      action = { label: "View or cancel", url: `${appUrl()}/bookings` };
      ics = buildIcs(icsBase);
      break;
    case "changed":
      subject = `Changed: ${short}`;
      heading = "Your booking was changed";
      if (extra.what) paragraphs.push(`What changed: ${extra.what}.`);
      action = { label: "View booking", url: `${appUrl()}/bookings` };
      ics = buildIcs({ ...icsBase, sequence: 1 });
      break;
    case "cancelled":
      subject = `Cancelled: ${short}`;
      heading = "Booking cancelled";
      paragraphs.push(extra.by ? `Cancelled by ${extra.by}. The slot is free again.` : "The slot is free again.");
      ics = buildIcs({ ...icsBase, method: "CANCEL", sequence: 2 });
      break;
    case "declined":
      subject = `Declined: ${short}`;
      heading = `${b.inchargeName} declined this booking`;
      paragraphs.push(`Reason: ${extra.reason ?? "not given"}.`, "Please pick another slot.");
      action = { label: "Find another slot", url: `${appUrl()}/?date=${b.date}` };
      ics = buildIcs({ ...icsBase, method: "CANCEL", sequence: 2 });
      break;
    case "reminder": {
      const isToday = b.date === localDate(now(), DEFAULT_SETTINGS);
      subject = `${isToday ? "Today" : "Tomorrow"}: ${short}`;
      heading = `Reminder: lab session ${isToday ? "today" : "tomorrow"}`;
      paragraphs.push(
        b.cartCount
          ? "Cart checklist: clear desks, check Wi-Fi in the room, and plan 5 minutes at the end to pack away."
          : "Lab rules: arrive on time, bags at the door, and leave the room as you found it.",
      );
      action = { label: "View or cancel", url: `${appUrl()}/bookings` };
      break;
    }
    case "feedback":
      subject = `How did it go? ${short}`;
      heading = "How was your lab session?";
      paragraphs.push("One tap to rate it. Tell us about any equipment problem so the lab team can fix it.");
      action = { label: "Rate this session", url: `${appUrl()}/bookings?rate=${b.id}` };
      break;
    case "no_cover":
      subject = `Action needed: no in-charge for ${short}`;
      heading = `${b.inchargeName} is away and nobody can cover`;
      paragraphs.push(
        extra.reason ? `Reason: ${extra.reason}.` : "The lab in-charge is on leave.",
        "The booking is still in place. The lab admin will reassign it or contact you; you can also cancel and pick another slot.",
      );
      action = { label: "View booking", url: `${appUrl()}/bookings` };
      break;
    case "waitlist_offer":
      subject = `Slot free: ${short}`;
      heading = "A slot you were waiting for is free";
      paragraphs.push("Book it now if you still need it. Offers go to the first teacher on the waitlist.");
      action = { label: "Book this slot", url: `${appUrl()}/?date=${b.date}` };
      break;
  }

  if (template === "confirmed") {
    const l = await db.query<{ links: { label: string; url: string }[] }>("SELECT links FROM resources WHERE id = $1", [b.resourceId]);
    const links = l[0]?.links ?? [];
    if (links.length) paragraphs.push(`Lesson resources: ${links.map((x) => `${x.label} (${x.url})`).join("; ")}.`);
    const hub = await db.query<{ hub_url: string }>("SELECT c.hub_url FROM campuses c JOIN resources r ON r.campus_id = c.id WHERE r.id = $1", [b.resourceId]);
    if (hub[0]?.hub_url) paragraphs.push(`More lesson ideas on the Labs Hub: ${hub[0].hub_url}`);
  }
  const { html, text } = renderEmail({ heading, rows: rows(b), paragraphs, action });
  const list = template === "waitlist_offer" && extra.to ? [extra.to] : recipients;
  for (const addr of [...new Set(list)]) {
    await sender.send({ bookingId: b.id, template, to: addr, subject, html, text, ics, action });
    // Release 2: the same news as a phone notification, for anyone signed in to the app.
    // A failed push never fails (and so never repeats) the email.
    await sendPush(db, { to: addr, kind: template, title: subject, body: paragraphs[0] ?? heading, bookingId: b.id, url: template === "waitlist_offer" ? `/?date=${b.date}` : "/bookings" }).catch((e) =>
      console.error("push failed", e instanceof Error ? e.message : e),
    );
  }
}

export async function sendAdminAlert(db: Db, subject: string, rowsIn: [string, string][], extraTo: string[] = []) {
  const admins = await db.query<{ email: string }>("SELECT email FROM staff WHERE role = 'admin' AND active");
  const { html, text } = renderEmail({ heading: subject, rows: rowsIn, action: { label: "Open admin", url: `${appUrl()}/admin` } });
  const sender = getEmailSender(db);
  for (const to of [...new Set([...admins.map((a) => a.email), ...extraTo])]) {
    await sender.send({ template: "admin_alert", to, subject: `Action needed: ${subject}`, html, text, action: { label: "Open admin", url: `${appUrl()}/admin` } });
  }
}

/** Waitlist offer: the slot is held for this teacher until `expires`. */
export async function sendWaitlistOffer(db: Db, o: { to: string; resourceId: string; date: string; blockId: string; expires: Date }) {
  const r = await db.query<{ name: string; code: string; start_time: string; end_time: string }>(
    "SELECT r.name, b.code, b.start_time, b.end_time FROM resources r, blocks b WHERE r.id = $1 AND b.id = $2",
    [o.resourceId, o.blockId],
  );
  const x = r[0];
  const until = new Date(o.expires.getTime() + DEFAULT_SETTINGS.utcOffsetMinutes * 60_000).toISOString().slice(11, 16);
  const { html, text } = renderEmail({
    heading: "A slot you were waiting for is free",
    rows: [
      ["What", x?.name ?? o.resourceId],
      ["When", `${fmtDateLong(o.date)}, ${x?.code ?? ""} (${x?.start_time}–${x?.end_time})`],
      ["Held for you until", `${until} today`],
    ],
    paragraphs: ["Book it before then. After that it goes to the next teacher on the waitlist."],
    action: { label: "Book this slot", url: `${appUrl()}/?date=${o.date}&r=${o.resourceId}` },
  });
  await getEmailSender(db).send({ template: "waitlist_offer", to: o.to, subject: `Held for you until ${until}: ${x?.name}, ${fmtDateLong(o.date)} ${x?.code}`, html, text });
}
