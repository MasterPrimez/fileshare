import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { setHidden } from "@/lib/files";
import { resolveSafe } from "@/lib/roots";

/** PATCH { paths: ["root/folder/file.jpg", ...], hidden: true|false } - hide files from every visitor. Never touches disk. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const list: string[] = Array.isArray(b.paths) ? b.paths.map(String) : [];
  let n = 0;
  for (const p of list) { const r = resolveSafe(p); if (r && r.rel.includes("/")) { setHidden(r.rel, !!b.hidden); n++; } }
  return NextResponse.json({ ok: true, n });
}
