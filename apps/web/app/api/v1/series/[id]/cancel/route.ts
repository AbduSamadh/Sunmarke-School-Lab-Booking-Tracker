import { handler } from "@/lib/server/api";
import { cancelSeries } from "@/lib/server/release11";

export const POST = handler({}, async ({ db, actor, params }) => cancelSeries(db, actor, params.id));
