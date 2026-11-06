import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createShare, listShares, eventCounts, shareStatus, sharePassword, shareItems } from "@/lib/shares";
import { getCover, kindOf } from "@/lib/files";
import { resolveSafe } from "@/lib/roots";
import fs from "node:fs";
import path from "node:path";

function coverFor(folderRel: string, depth = 0): string | null {
  const r = resolveSafe(folderRel); if (!r || !fs.existsSync(r.abs)) return null;
  try {
    const names = fs.readdirSync(r.abs).filter((n) => !n.startsWith(".") && n !== "@eaDir");
    const set = getCover(r.rel);
    const pick = set && names.includes(set) ? set : names.filter((n) => kindOf(n) === "image").sort()[0];
    if (pick) return path.posix.join(r.rel, pick);
    if (depth < 2) for (const n of names.sort()) { try { if (fs.statSync(path.join(r.abs, n)).isDirectory()) { const c = coverFor(path.posix.join(r.rel, n), depth + 1); if (c) return c; } } catch {} }
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shares = listShares().map((s) => { const items = shareItems(s); return { ...s, password_hash: undefined, password_enc: undefined, has_password: !!s.password_hash, password: sharePassword(s), status: shareStatus(s), counts: eventCounts(s.id), folders: items.map((i) => i.base), cover: coverFor(items[0].base) }; });
  return NextResponse.json({ shares });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  try {
    const s = createShare({
      name: String(b.name || "").trim() || "Untitled",
      path: String(b.path || ""),
      mode: b.mode === "edit" ? "edit" : "view",
      password: b.password || undefined,
      expiresAt: b.expiresAt ? Number(b.expiresAt) : null,
      visitLimit: b.visitLimit ? Number(b.visitLimit) : null,
      askName: !!b.askName,
      paths: Array.isArray(b.paths) ? b.paths.map(String) : undefined,
    });
    return NextResponse.json({ share: { ...s, password_hash: undefined, password_enc: undefined, password: sharePassword(s) } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
