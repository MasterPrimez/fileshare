import { NextRequest, NextResponse } from "next/server";
import { getShareByToken, shareStatus, setVisitorName, logEvent } from "@/lib/shares";
import { ensureVisitorId } from "@/lib/auth";

/** POST { name } — set this device's name (or null to skip). Once per device. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = getShareByToken(token);
  if (!share || shareStatus(share) !== "ok") return NextResponse.json({ error: "missing" }, { status: 404 });
  const vid = await ensureVisitorId();
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  setVisitorName(vid, name || null);
  logEvent(share.id, name ? "named" : "skipped_name", name ? `"${name}"` : null, req, vid);
  return NextResponse.json({ ok: true });
}
