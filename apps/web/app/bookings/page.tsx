import { addDays, localDate, DEFAULT_SETTINGS } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { listBookings } from "@/lib/server/bookings";
import { now } from "@/lib/server/util";
import { MyBookings, type Row } from "@/components/MyBookings";

export default async function BookingsPage() {
  const actor = await requireActor(["teacher", "incharge", "admin"]);
  const db = await getDb();
  const t = now();
  const all = await listBookings(db, { teacherId: actor.id, from: addDays(localDate(t, DEFAULT_SETTINGS), -60) });
  const toRow = (b: (typeof all)[number]): Row => ({
    id: b.id, resourceId: b.resourceId, resourceName: b.resourceName, colour: b.resourceColour, date: b.date, blockLabel: b.blockLabel, timeLabel: b.timeLabel,
    inchargeName: b.inchargeName, classLabel: b.classLabel, subject: b.subject, studentCount: b.studentCount, cartCount: b.cartCount, classroom: b.classroom,
    objective: b.objective, specialRequirements: b.specialRequirements, status: b.status, statusReason: b.statusReason,
    cancellable: b.status === "confirmed" && b.start.getTime() - t.getTime() >= DEFAULT_SETTINGS.cancelCutoffHours * 3_600_000,
  });
  const upcoming = all.filter((b) => b.end.getTime() > t.getTime() && b.status === "confirmed").map(toRow);
  const past = all.filter((b) => !(b.end.getTime() > t.getTime() && b.status === "confirmed")).reverse().map(toRow);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My bookings</h1>
          <p className="muted" style={{ margin: 0 }}>Cancel up to {DEFAULT_SETTINGS.cancelCutoffHours} h before the lesson. To change the time, cancel and rebook.</p>
        </div>
        <a className="btn btn-primary" href="/">Book a lab</a>
      </div>
      <MyBookings upcoming={upcoming} past={past} />
    </div>
  );
}
