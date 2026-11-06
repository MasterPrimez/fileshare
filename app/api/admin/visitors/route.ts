import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { setVisitorName } from "@/lib/shares";

/** PATCH { id, name } — rename a visitor from admin. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "bad" }, { status: 400 });
  setVisitorName(String(b.id), typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 60) : null);
  return NextResponse.json({ ok: true });
}
