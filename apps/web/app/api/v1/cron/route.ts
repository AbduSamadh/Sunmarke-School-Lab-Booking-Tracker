import { NextResponse } from "next/server";
import { seeOther } from "@/lib/server/util";
import { getDb } from "@/lib/server/db";
import { currentActor } from "@/lib/server/auth";
import { runCron } from "@/lib/server/scheduled";

/**
 * POST /api/v1/cron?tasks=jobs,reminders,conflicts,offers,noshow,feedback,digest,weekly
 * Called by the host scheduler with the CRON_SECRET bearer token (every 15 min,
 * plus digest at 07:00 and weekly on Sunday 18:00 Asia/Dubai), or by an admin from the Admin page.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const actor = await currentActor();
  if (!(secret && auth === `Bearer ${secret}`) && actor?.role !== "admin")
    return NextResponse.json({ error: { code: "forbidden", message: "Not allowed." } }, { status: 403 });
  const tasks = (new URL(req.url).searchParams.get("tasks") ?? "jobs,reminders,conflicts,offers,noshow,feedback").split(",");
  const result = await runCron(await getDb(), tasks);
  if ((req.headers.get("content-type") ?? "").includes("form")) return seeOther("/admin?tab=system&ran=1");
  return NextResponse.json(result);
}
