import { handler } from "@/lib/server/api";
import { buildReport, reportCampus, toCsv } from "@/lib/server/reports";
import { addDays, localDate, DEFAULT_SETTINGS } from "@sunmarke/rules";
import { now } from "@/lib/server/util";

/** GET /api/v1/reports/export?table=bookings|utilisation|load|teacher|department|curriculum&from&to&resource&department → CSV (opens in Excel). */
export const GET = handler({ roles: ["admin", "viewer"] }, async ({ db, req, actor }) => {
  const u = new URL(req.url);
  const today = localDate(now(), DEFAULT_SETTINGS);
  const from = u.searchParams.get("from") || addDays(today, -30);
  const to = u.searchParams.get("to") || today;
  const rep = await buildReport(db, { from, to, resourceId: u.searchParams.get("resource") || undefined, department: u.searchParams.get("department") || undefined, campusId: reportCampus(actor, u.searchParams.get("campus")) });
  const table = u.searchParams.get("table") ?? "bookings";
  let rows: (string | number | null)[][];
  if (table === "utilisation")
    rows = [["Resource", "Sessions", "Booked blocks", "Bookable blocks", "Utilisation %"], ...rep.utilisation.map((x) => [x.name, x.sessions, x.type === "cart_pool" ? x.unitBlocks : x.bookedBlocks, x.bookableBlocks, Math.round(x.pct * 1000) / 10])];
  else if (table === "load") rows = [["In-charge", "Sessions", "Cross-cover sessions", "Cross-cover %"], ...rep.load.map((x) => [x.name, x.sessions, x.crossCover, Math.round(x.crossPct * 1000) / 10])];
  else if (table === "curriculum")
    rows = [["Code", "Strand", "Level", "Year", "Sessions", "Classes"], ...rep.curriculum.levels.map((x) => [x.code, x.strand, x.title, x.yearGroup, x.sessions, x.classes])];
  else if (table === "teacher")
    rows = [["Teacher", "Department", "Sessions", "Attended", "No-shows", "Cancelled", "Cart sessions", "Students", "Labs used", "Average rating"], ...rep.byTeacher.map((x) => [x.name, x.department, x.sessions, x.attended, x.noShows, x.cancelled, x.cartSessions, x.students, x.labs, x.avgRating === null ? "" : Math.round(x.avgRating * 10) / 10])];
  else if (table === "department") rows = [["Department", "Sessions"], ...rep.byDepartment.map((x) => [x.label, x.n])];
  else
    rows = [
      ["Booking ID", "Date", "Block", "Time", "Resource", "Teacher", "Department", "Subject", "Year", "Section", "Students", "Carts", "Classroom", "In-charge", "Cross-cover", "Status"],
      ...rep.rows.map((b) => [b.id, b.date, b.blockLabel, b.timeLabel, b.resourceName, b.teacherName, b.department, b.subject, b.yearGroup, b.section, b.studentCount, b.cartCount, b.classroom, b.inchargeName, b.crossCover ? "yes" : "no", b.status]),
    ];
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sunmarke-labs-${table}-${from}-to-${to}.csv"` },
  });
});
