import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createShare, listShares, eventCounts, shareStatus, sharePassword, shareItems } from "@/lib/shares";
import { coverFor } from "@/lib/files";

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
