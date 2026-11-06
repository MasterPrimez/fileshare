import { NextRequest, NextResponse } from "next/server";
import { getShareByToken, shareStatus, checkPassword, logEvent, recordVisit, getVisitor, setVisitorName } from "@/lib/shares";
import { unlockShare, ensureVisitorId } from "@/lib/auth";

const attempts = new Map<string, { n: number; at: number }>();

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = getShareByToken(token);
  if (!share || shareStatus(share) !== "ok") return NextResponse.json({ error: "missing" }, { status: 404 });
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "?";
  const key = `${token}:${ip}`;
  const a = attempts.get(key);
  if (a && a.n >= 8 && Date.now() - a.at < 15 * 60 * 1000) return NextResponse.json({ error: "ratelimit" }, { status: 429 });
  const { password, name } = await req.json().catch(() => ({ password: "", name: "" }));
  if (!checkPassword(share, password || "")) {
    attempts.set(key, { n: (a?.n || 0) + 1, at: Date.now() });
    logEvent(share.id, "bad_password", null, req, await ensureVisitorId());
    return NextResponse.json({ error: "wrong" }, { status: 401 });
  }
  attempts.delete(key);
  const vid = await ensureVisitorId();
  const nm = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!getVisitor(vid)?.name) {
    if (!nm) return NextResponse.json({ error: "name" }, { status: 400 });
    setVisitorName(vid, nm);
    logEvent(share.id, "named", `"${nm}"`, req, vid);
  }
  await unlockShare(token);
  recordVisit(share.id);
  logEvent(share.id, "open", null, req, vid);
  return NextResponse.json({ ok: true });
}
