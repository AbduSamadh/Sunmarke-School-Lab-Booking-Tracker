import { seeOther } from "@/lib/server/util";
import { clearSessionCookie } from "@/lib/server/auth";

export async function POST(req: Request) {
  await clearSessionCookie();
  return seeOther("/signin");
}
