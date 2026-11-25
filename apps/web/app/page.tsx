import { addDays, isoWeekday, localDate, mondayOf } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getGrid } from "@/lib/server/grid";
import { getSettings } from "@/lib/server/world";
import { now } from "@/lib/server/util";
import { Availability } from "@/components/Availability";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; r?: string }> }) {
  const actor = await requireActor();
  const db = await getDb();
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const sp = await searchParams;
  let date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  if (isoWeekday(date) > 5) date = addDays(mondayOf(date), 7);
  const mon = mondayOf(date);
  const grid = await getGrid(db, actor, mon, addDays(mon, 4));
  const resourceFilter = grid.resources.some((r) => r.id === sp.r) ? sp.r! : null;

  const lookups = await db.query<{ kind: string; value: string }>("SELECT kind, value FROM lookups ORDER BY kind, sort");
  const last = await db.query<{ subject: string; year_group: string; section: string; student_count: number; classroom: string | null }>(
    "SELECT subject, year_group, section, student_count, classroom FROM bookings WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 1",
    [actor.id],
  );
  const lastCart = await db.query<{ classroom: string | null; cart_count: number | null }>(
    "SELECT classroom, cart_count FROM bookings WHERE teacher_id = $1 AND cart_count IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [actor.id],
  );

  return (
    <Availability
      grid={grid}
      date={date}
      today={today}
      resourceFilter={resourceFilter}
      role={actor.role}
      lookups={{
        subjects: lookups.filter((l) => l.kind === "subject").map((l) => l.value),
        years: lookups.filter((l) => l.kind === "year_group").map((l) => l.value),
        sections: lookups.filter((l) => l.kind === "section").map((l) => l.value),
      }}
      defaults={{
        subject: last[0]?.subject ?? "",
        yearGroup: last[0]?.year_group ?? "",
        section: last[0]?.section ?? "",
        studentCount: last[0]?.student_count ?? 24,
        classroom: lastCart[0]?.classroom ?? "",
        cartCount: lastCart[0]?.cart_count ?? 4,
      }}
      minLeadHours={settings.minLeadHours}
      maxLeadDays={settings.maxLeadDays}
    />
  );
}
