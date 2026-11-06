import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { updateShare, deleteShare, getShareById, listEvents, visitorsFor, sharePassword, shareItems } from "@/lib/shares";
import { visitorId } from "@/lib/auth";
import { getAlias, coverFor, folderSize } from "@/lib/files";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const s = getShareById(id);
  if (!s) return NextResponse.json({ error: "missing" }, { status: 404 });
  const events = listEvents(id);
  return NextResponse.json({ share: { ...s, password_hash: undefined, password_enc: undefined, has_password: !!s.password_hash, password: sharePassword(s), folders: shareItems(s).map((i) => i.base), uploadUsed: s.upload_path ? folderSize(s.upload_path) : 0, aliases: Object.fromEntries(shareItems(s).map((i) => [i.base, getAlias(i.base)]).filter(([, v]) => v)), covers: Object.fromEntries(shareItems(s).map((i) => [i.base, coverFor(i.base)]).filter(([, v]) => v)) }, events, visitors: visitorsFor(events), me: await visitorId() });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  try { updateShare(id, {
    mode: b.mode,
    name: b.name,
    password: b.password === undefined ? undefined : (b.password || null),
    expiresAt: b.expiresAt === undefined ? undefined : (b.expiresAt ? Number(b.expiresAt) : null),
    visitLimit: b.visitLimit === undefined ? undefined : (b.visitLimit ? Number(b.visitLimit) : null),
    revoked: b.revoked,
    askName: b.askName,
    paths: Array.isArray(b.paths) ? b.paths.map(String) : undefined,
    uploadPath: b.uploadPath === undefined ? undefined : (b.uploadPath ? String(b.uploadPath) : null),
    uploadLimit: b.uploadLimit === undefined ? undefined : (b.uploadLimit ? Number(b.uploadLimit) : null),
  }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  deleteShare(id);
  return NextResponse.json({ ok: true });
}
