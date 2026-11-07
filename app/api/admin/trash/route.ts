import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { resolveSafe } from "@/lib/roots";
import { getShareById } from "@/lib/shares";

/**
 * PATCH { shareId, paths: ["root/.../file"] } — admin removes visitor uploads.
 * Only paths INSIDE that share's upload landing folder are accepted; they are moved to <landing>/.trash/<timestamp>/…
 * (hidden from every listing, recoverable in UGOS Files). Never touches anything else.
 */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const share = getShareById(String(b.shareId || ""));
  if (!share?.upload_path) return NextResponse.json({ error: "no upload folder" }, { status: 400 });
  const land = resolveSafe(share.upload_path);
  if (!land) return NextResponse.json({ error: "bad" }, { status: 400 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trash = path.join(land.abs, ".trash", stamp);
  let n = 0;
  for (const p of (Array.isArray(b.paths) ? b.paths.map(String) : [])) {
    const r = resolveSafe(p);
    if (!r || !r.rel.startsWith(land.rel + "/") || r.rel.split("/").some((s) => s.startsWith("."))) continue;
    const dest = path.join(trash, r.rel.slice(land.rel.length + 1));
    try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(r.abs, dest); n++; } catch (e) { console.error("trash failed", r.abs, e); }
  }
  return NextResponse.json({ ok: true, n });
}
