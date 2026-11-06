import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { updateShare, deleteShare, getShareById, listEvents, visitorsFor, sharePassword, shareItems } from "@/lib/shares";
import { visitorId } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const s = getShareById(id);
  if (!s) return NextResponse.json({ error: "missing" }, { status: 404 });
  const events = listEvents(id);
  return NextResponse.json({ share: { ...s, password_hash: undefined, password_enc: undefined, has_password: !!s.password_hash, password: sharePassword(s), folders: shareItems(s).map((i) => i.base) }, events, visitors: visitorsFor(events), me: await visitorId() });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  updateShare(id, {
    mode: b.mode,
    name: b.name,
    password: b.password === undefined ? undefined : (b.password || null),
    expiresAt: b.expiresAt === undefined ? undefined : (b.expiresAt ? Number(b.expiresAt) : null),
    visitLimit: b.visitLimit === undefined ? undefined : (b.visitLimit ? Number(b.visitLimit) : null),
    revoked: b.revoked,
    askName: b.askName,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  deleteShare(id);
  return NextResponse.json({ ok: true });
}
