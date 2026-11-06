import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { isAdmin } from "@/lib/auth";
import { resolveSafe } from "@/lib/roots";
import { thumbnail } from "@/lib/files";

/** ?p=rootId/sub/file.jpg&w=400 — admin-only thumbnail of any file under a root. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return new NextResponse(null, { status: 401 });
  const p = req.nextUrl.searchParams.get("p") || "";
  const w = Math.min(parseInt(req.nextUrl.searchParams.get("w") || "400"), 2000);
  const r = resolveSafe(p);
  if (!r || !fs.existsSync(r.abs) || !fs.statSync(r.abs).isFile()) return new NextResponse(null, { status: 404 });
  const t = await thumbnail(r.abs, fs.statSync(r.abs).mtimeMs, w);
  if (!t) return new NextResponse(null, { status: 404 });
  return new NextResponse(fs.readFileSync(t), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
