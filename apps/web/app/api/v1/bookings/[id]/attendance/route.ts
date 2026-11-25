import { handler } from "@/lib/server/api";
import { setAttendance } from "@/lib/server/bookings";
import { AttendanceInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: AttendanceInput, roles: ["incharge", "admin"] }, async ({ db, actor, body, params }) => ({
  booking: await setAttendance(db, actor, params.id, body.status),
}));
