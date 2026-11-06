import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { openShare } from "@/lib/access";
import { mapSub } from "@/lib/shares";
import { statIn, isHidden } from "@/lib/files";
import { isAdmin } from "@/lib/auth";
import { logEvent } from "@/lib/shares";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aif": "audio/aiff", ".aiff": "audio/aiff", ".flac": "audio/flac", ".ogg": "audio/ogg" };

/** Stream a single file. ?dl=1 forces download; otherwise inline (for video playback / image preview). Supports Range. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const sub = req.nextUrl.searchParams.get("p") || "";
  const dl = req.nextUrl.searchParams.get("dl") === "1";
  const m = mapSub(r.share, sub);
  const s = m ? statIn(m.base, m.rest) : null;
  if (!s || !s.st.isFile()) return new NextResponse(null, { status: 404 });
  if (m && isHidden(m.rest ? `${m.base}/${m.rest}` : m.base) && !(await isAdmin(req))) return new NextResponse(null, { status: 404 });

  const name = path.basename(s.abs);
  const type = MIME[path.extname(name).toLowerCase()] || "application/octet-stream";
  const size = s.st.size;
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  };
  if (dl) logEvent(r.share.id, "download", sub, req, undefined, size);

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1]) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2]), size - 1) : size - 1;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
    headers["content-length"] = String(end - start + 1);
    const stream = Readable.toWeb(fs.createReadStream(s.abs, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers });
  }
  headers["content-length"] = String(size);
  const stream = Readable.toWeb(fs.createReadStream(s.abs)) as ReadableStream;
  return new NextResponse(stream, { headers });
}
