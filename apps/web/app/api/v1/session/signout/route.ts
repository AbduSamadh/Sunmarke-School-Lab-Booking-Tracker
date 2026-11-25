import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth";

export async function POST(req: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/signin", req.url), 303);
}
