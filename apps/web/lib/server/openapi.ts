/**
 * The published description of /api/v1 (OpenAPI 3.1), built from the same zod
 * schemas the routes validate with, so it cannot drift from what the server accepts.
 * Served at GET /api/v1/openapi.json. test/openapi.test.ts checks every route file is listed.
 */
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as S from "@/lib/shared/schemas";

type Role = "teacher" | "incharge" | "admin" | "viewer";
interface Op {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tag: string;
  roles?: Role[];
  body?: ZodTypeAny;
  query?: [name: string, description: string, required?: boolean][];
  public?: boolean;
  produces?: "json" | "csv" | "ics";
  extra?: Record<string, string>;
}

const date = "School-local date, YYYY-MM-DD (Asia/Dubai)";
export const OPS: Op[] = [
  { method: "get", path: "/session", tag: "Session", public: true, summary: "Who is signed in ({ actor } or { actor: null })." },
  { method: "post", path: "/session", tag: "Session", public: true, body: S.SignInInput, summary: "Pilot sign-in by school email. Send client: \"app\" to get a 30-day Bearer token for the phone app. Replaced by Google / Microsoft sign-in when IT enables it." },
  { method: "post", path: "/session/signout", tag: "Session", summary: "Sign out (clears the cookie)." },
  { method: "get", path: "/campus", tag: "Session", summary: "Campuses the signed-in person can switch to." },
  { method: "post", path: "/campus", tag: "Session", body: S.CampusSwitch, summary: "Switch campus (group admins and leadership only). Form posts redirect back." },
  { method: "get", path: "/availability", tag: "Booking", query: [["from", date, true], ["to", `${date}; up to 14 days after from`]], summary: "The booking grid: blocks × labs per day, each cell free, booked, closed or unavailable with the reason. Scoped to your campus." },
  { method: "get", path: "/alternatives", tag: "Booking", query: [["resourceId", "Lab id", true], ["date", date, true], ["blockId", "Block id", true], ["units", "Carts wanted (cart pools)"]], summary: "Why a slot is blocked, and up to 4 free alternatives." },
  { method: "get", path: "/bookings", tag: "Booking", query: [["from", date], ["to", date], ["all", "1 = everyone's (admin, viewer)"], ["as", "incharge = the sessions you run"]], summary: "Your bookings." },
  { method: "post", path: "/bookings", tag: "Booking", roles: ["teacher", "incharge", "admin"], body: S.BookingInput, extra: { "201": "Booked", "409": "Blocked: { ok: false, code, reason, suggestion?, canWaitlist, alternatives }" }, summary: "Book a lab or carts. Runs the rules engine and the slot locks in one transaction." },
  { method: "get", path: "/bookings/{id}", tag: "Booking", summary: "One booking (yours, or any if you run it or are an admin)." },
  { method: "patch", path: "/bookings/{id}", tag: "Booking", body: S.BookingPatch, summary: "Change the class details. To change the time, cancel and rebook." },
  { method: "post", path: "/bookings/{id}/cancel", tag: "Booking", body: S.CancelInput, summary: "Cancel (or undo a cancel within a minute). Teachers are bound by the cut-off." },
  { method: "post", path: "/bookings/{id}/feedback", tag: "Booking", body: S.FeedbackInput, summary: "Rate a session, optionally reporting an equipment problem." },
  { method: "post", path: "/bookings/{id}/attendance", tag: "In-charge", roles: ["incharge", "admin"], body: S.AttendanceInput, summary: "Mark attended or no-show." },
  { method: "post", path: "/bookings/{id}/decline", tag: "In-charge", roles: ["incharge", "admin"], body: S.DeclineInput, summary: "Decline a booking with a reason (the teacher is emailed)." },
  { method: "post", path: "/bookings/{id}/reassign", tag: "Admin", roles: ["admin"], body: S.ReassignInput, summary: "Move a booking to another in-charge." },
  { method: "post", path: "/series", tag: "Booking", roles: ["teacher", "incharge", "admin"], body: S.SeriesInput, summary: "Book a weekly series. preview: true returns what would be booked without booking." },
  { method: "post", path: "/series/{id}/cancel", tag: "Booking", summary: "Cancel every upcoming lesson in a series that is still outside the cut-off." },
  { method: "post", path: "/waitlist", tag: "Booking", roles: ["teacher", "incharge", "admin"], body: S.WaitlistInput, summary: "Join the waitlist for a taken slot." },
  { method: "post", path: "/checkin", tag: "Booking", body: S.CheckinInput, summary: "Check in with the lab door QR code (opens 15 minutes before the start)." },
  { method: "post", path: "/assistant", tag: "Booking", body: S.AssistantInput, summary: "The booking assistant. Read-only: it answers with cards the person confirms through the normal booking routes." },
  { method: "get", path: "/issues", tag: "In-charge", roles: ["incharge", "admin", "viewer"], query: [["status", "open (default) or all"]], summary: "Equipment issues." },
  { method: "post", path: "/issues", tag: "In-charge", roles: ["teacher", "incharge", "admin"], body: S.IssueInput, summary: "Report an equipment problem; optionally take the lab out of use." },
  { method: "post", path: "/issues/{id}/resolve", tag: "In-charge", roles: ["incharge", "admin"], body: S.ResolveIssueInput, summary: "Close an issue (and reopen the lab)." },
  { method: "post", path: "/absences", tag: "In-charge", roles: ["incharge", "admin"], body: S.AbsenceInput, summary: "Record in-charge leave; affected bookings are covered or flagged." },
  { method: "delete", path: "/absences/{id}", tag: "In-charge", roles: ["incharge", "admin"], summary: "Remove a leave record." },
  { method: "post", path: "/admin/staff-import", tag: "Admin", roles: ["admin"], body: S.StaffImportInput, summary: "Import staff from CSV (name, email, department, role)." },
  { method: "get", path: "/reports/export", tag: "Reports", roles: ["admin", "viewer"], produces: "csv", query: [["table", "bookings | utilisation | load | department | curriculum"], ["from", date], ["to", date], ["resource", "Lab id"], ["department", "Department"], ["campus", "Campus id (group admins)"]], summary: "Report tables as CSV." },
  { method: "get", path: "/notifications/{id}/ics", tag: "Admin", roles: ["admin", "incharge"], produces: "ics", summary: "The calendar invite attached to a sent email." },
  { method: "post", path: "/devices", tag: "Phone app", body: S.DeviceInput, summary: "Register this phone's push token." },
  { method: "delete", path: "/devices", tag: "Phone app", body: S.DeviceRemove, summary: "Stop notifications to this phone." },
  { method: "post", path: "/cron", tag: "System", public: true, query: [["tasks", "Comma list: jobs, reminders, conflicts, offers, noshow, feedback"]], summary: "Scheduled jobs. Needs Authorization: Bearer <CRON_SECRET> (or an admin session)." },
  { method: "get", path: "/openapi.json", tag: "System", public: true, summary: "This description." },
];

const err = { $ref: "#/components/schemas/Error" };
const errResp = (d: string) => ({ description: d, content: { "application/json": { schema: err } } });

export function openApiSpec(serverUrl = "/api/v1") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of OPS) {
    const params = [
      ...(o.path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : []),
      ...(o.query ?? []).map(([name, description, required]) => ({ name, in: "query", required: !!required, description, schema: { type: "string" } })),
    ];
    const ok =
      o.produces === "csv" ? { description: "CSV file", content: { "text/csv": { schema: { type: "string" } } } }
      : o.produces === "ics" ? { description: "iCalendar file", content: { "text/calendar": { schema: { type: "string" } } } }
      : { description: "OK", content: { "application/json": { schema: { type: "object" } } } };
    const responses: Record<string, unknown> = { "200": ok, "422": errResp("Invalid input"), "500": errResp("Server error") };
    if (!o.public) responses["401"] = errResp("Not signed in");
    if (o.roles || o.path.includes("{id}")) responses["403"] = errResp(`Not allowed${o.roles ? ` (roles: ${o.roles.join(", ")})` : ""}`);
    if (o.path.includes("{id}")) responses["404"] = errResp("Not found");
    for (const [code, d] of Object.entries(o.extra ?? {})) responses[code] = { description: d, content: { "application/json": { schema: { type: "object" } } } };
    if (o.extra?.["201"]) delete responses["200"];
    (paths[o.path] ??= {})[o.method] = {
      tags: [o.tag],
      summary: o.summary,
      ...(o.roles ? { "x-roles": o.roles } : {}),
      ...(o.public ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(o.body ? { requestBody: { required: true, content: { "application/json": { schema: zodToJsonSchema(o.body, { target: "openApi3", $refStrategy: "none" }) } } } } : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Sunmarke Lab Booking API",
      version: "2.0.0",
      description:
        "The API behind the website and the phone app. Times are stored in UTC and shown in Asia/Dubai. Errors are { error: { code, message } }. All availability decisions come from the rules engine (packages/rules).",
    },
    servers: [{ url: serverUrl }],
    security: [{ cookie: [] }, { bearer: [] }],
    components: {
      securitySchemes: {
        cookie: { type: "apiKey", in: "cookie", name: "slb_session", description: "Website session cookie" },
        bearer: { type: "http", scheme: "bearer", description: "Phone app token from POST /session with client: \"app\"" },
      },
      schemas: {
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } },
      },
    },
    paths,
  };
}
