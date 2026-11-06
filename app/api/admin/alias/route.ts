import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { setAlias } from "@/lib/files";
import { resolveSafe } from "@/lib/roots";

/** PATCH { path: "root/folder", name: "Display name" | null } — display-only rename; disk is never touched. Roots can't be renamed. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = resolveSafe(String(b.path || ""));
  if (!r || !r.rel.includes("/")) return NextResponse.json({ error: "bad" }, { status: 400 });
  const name = typeof b.name === "string" ? b.name.replace(/[\/\\]/g, " ").trim().slice(0, 120) : null;
  setAlias(r.rel, name || null);
  return NextResponse.json({ ok: true, name: name || null });
}
