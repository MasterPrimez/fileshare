import { NextRequest, NextResponse } from "next/server";
import { openShare } from "@/lib/access";
import { listDir, statIn, videoDuration, listCollection } from "@/lib/files";
import { mapSub, shareItems, isCollection } from "@/lib/shares";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const sub = req.nextUrl.searchParams.get("p") || "";
  const m = mapSub(r.share, sub);
  const entries = m ? listDir(m.base, m.rest)?.map((e) => ({ ...e, rel: isCollection(r.share) ? `${m.item.name}/${e.rel}` : e.rel, cover: e.cover ? (isCollection(r.share) ? `${m.item.name}/${e.cover}` : e.cover) : e.cover })) ?? null
    : (isCollection(r.share) && !sub ? listCollection(shareItems(r.share)) : null);
  if (!entries) return NextResponse.json({ error: "notfound" }, { status: 404 });
  // durations for videos (small folders only; cheap enough)
  const withDur = await Promise.all(entries.map(async (e) => {
    if (e.kind !== "video" && e.kind !== "audio") return e;
    const mm = mapSub(r.share, e.rel);
    const s = mm ? statIn(mm.base, mm.rest) : null;
    const d = s ? await videoDuration(s.abs) : null;
    return { ...e, duration: d };
  }));
  return NextResponse.json({ share: { name: r.share.name, mode: r.share.mode, expires_at: r.share.expires_at, collection: isCollection(r.share) }, path: sub, entries: withDur });
}
