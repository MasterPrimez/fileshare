import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { openShare } from "@/lib/access";
import { mapSub } from "@/lib/shares";
import { statIn, thumbnail, isHidden } from "@/lib/files";
import { isAdmin } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const sub = req.nextUrl.searchParams.get("p") || "";
  const w = Math.min(parseInt(req.nextUrl.searchParams.get("w") || "600"), 2000);
  const m = mapSub(r.share, sub);
  const s = m ? statIn(m.base, m.rest) : null;
  if (!s || !s.st.isFile()) return new NextResponse(null, { status: 404 });
  if (m && isHidden(m.rest ? `${m.base}/${m.rest}` : m.base) && !(await isAdmin(req))) return new NextResponse(null, { status: 404 });
  const t = await thumbnail(s.abs, s.st.mtimeMs, w);
  if (!t) return new NextResponse(null, { status: 404 });
  return new NextResponse(fs.readFileSync(t), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
