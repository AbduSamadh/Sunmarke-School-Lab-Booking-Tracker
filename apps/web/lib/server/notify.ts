import type { Db } from "@sunmarke/db";
import { buildIcs, getEmailSender, renderEmail } from "./email";
import type { BookingDetail } from "./bookings";
import { fmtDateLong } from "../shared/format";
import { DEFAULT_SETTINGS, localDate } from "@sunmarke/rules";
import { now } from "./util";

export type EmailTemplate = "confirmed" | "changed" | "cancelled" | "declined" | "reminder" | "waitlist_offer";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const FROM = () => process.env.LABS_FROM_ADDRESS ?? "labs@sunmarke.example";

function rows(b: BookingDetail): [string, string][] {
  const r: [string, string][] = [
    ["What", b.resourceName],
    ["When", `${fmtDateLong(b.date)}, ${b.blockLabel} (${b.timeLabel})`],
    ["Class", `${b.classLabel} · ${b.subject} · ${b.studentCount} students`],
    ["Teacher", b.teacherName],
    ["Lab in-charge", b.inchargeName],
  ];
  if (b.cartCount) r.push(["Carts", `${b.cartCount} to ${b.classroom ?? "classroom"}`]);
  if (b.objective) r.push(["Objective", b.objective]);
  if (b.specialRequirements) r.push(["Special requirements", b.specialRequirements]);
  return r;
}

export async function sendBookingEmail(db: Db, template: EmailTemplate, b: BookingDetail, to: "teacher" | "incharge" | "both", extra: Record<string, string> = {}) {
  const sender = getEmailSender(db);
  const recipients =
    to === "both" ? [b.teacherEmail, b.inchargeEmail] : to === "teacher" ? [b.teacherEmail] : [extra.inchargeEmail ?? b.inchargeEmail];
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
    attendees: [b.teacherEmail, b.inchargeEmail],
  };

  switch (template) {
    case "confirmed":
      subject = `Booked: ${short}`;
      heading = `${b.resourceName} is booked`;
      paragraphs.push(`${b.inchargeName} will be with you${b.cartCount ? ` and bring ${b.cartCount} cart${b.cartCount > 1 ? "s" : ""} to ${b.classroom}` : ""}.`);
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
    case "waitlist_offer":
      subject = `Slot free: ${short}`;
      heading = "A slot you were waiting for is free";
      paragraphs.push("Book it now if you still need it. Offers go to the first teacher on the waitlist.");
      action = { label: "Book this slot", url: `${appUrl()}/?date=${b.date}` };
      break;
  }

  const { html, text } = renderEmail({ heading, rows: rows(b), paragraphs, action });
  const list = template === "waitlist_offer" && extra.to ? [extra.to] : recipients;
  for (const addr of [...new Set(list)]) {
    await sender.send({ bookingId: b.id, template, to: addr, subject, html, text, ics });
  }
}

export async function sendAdminAlert(db: Db, subject: string, rowsIn: [string, string][], extraTo: string[] = []) {
  const admins = await db.query<{ email: string }>("SELECT email FROM staff WHERE role = 'admin' AND active");
  const { html, text } = renderEmail({ heading: subject, rows: rowsIn, action: { label: "Open admin", url: `${appUrl()}/admin` } });
  const sender = getEmailSender(db);
  for (const to of [...new Set([...admins.map((a) => a.email), ...extraTo])]) {
    await sender.send({ template: "admin_alert", to, subject: `Action needed: ${subject}`, html, text });
  }
}
