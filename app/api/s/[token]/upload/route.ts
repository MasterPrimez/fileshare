import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { openShare } from "@/lib/access";
import { resolveSafe } from "@/lib/roots";
import { folderSize, safeName } from "@/lib/files";
import { logEvent } from "@/lib/shares";
import { visitorId } from "@/lib/auth";

/**
 * Visitor uploads (chunked, so big videos pass Cloudflare's per-request limit).
 *   GET                       → { on, album?, used, limit }   quota + whether uploads are enabled
 *   POST ?album=&name=&size=&id=&chunk=&chunks=   body = one chunk (≤ 20 MB)
 *        → { ok, done, rel }   when the last chunk lands the file is moved into <upload_path>/<album>/<name>
 * Add-only: visitors never overwrite (duplicates get " 2", " 3" …) and never delete.
 */
/** Chunks are staged INSIDE the destination folder (same filesystem → atomic rename at the end). Dot-folder, so it never shows in listings. */
const TMP = (destAbs: string) => { const d = path.join(destAbs, ".uploading"); fs.mkdirSync(d, { recursive: true }); return d; };
const CHUNK_MAX = 25 * 1024 * 1024;

function dest(share: { upload_path: string | null }) { return share.upload_path ? resolveSafe(share.upload_path) : null; }

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const d = dest(r.share);
  if (!d) return NextResponse.json({ on: false });
  return NextResponse.json({ on: true, used: folderSize(d.rel), limit: r.share.upload_limit, name: r.share.name });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const d = dest(r.share);
  if (!d) return NextResponse.json({ error: "uploads are off" }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const album = safeName(q.get("album") || "", "Uploads");
  const name = safeName(q.get("name") || "", "file");
  const size = Number(q.get("size") || 0), chunk = Number(q.get("chunk") || 0), chunks = Math.max(1, Number(q.get("chunks") || 1));
  const id = (q.get("id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
  if (!id || !req.body || !Number.isFinite(size) || size < 0 || chunk < 0 || chunk >= chunks) return NextResponse.json({ error: "bad" }, { status: 400 });
  // quota check on the first chunk (whole file counted up front)
  if (chunk === 0 && r.share.upload_limit) {
    const used = folderSize(d.rel);
    if (used + size > r.share.upload_limit) return NextResponse.json({ error: "full", used, limit: r.share.upload_limit }, { status: 413 });
  }
  const vid = (await visitorId()) || "anon";
  let tmp: string;
  try { tmp = path.join(TMP(d.abs), `${vid.replace(/[^a-z0-9]/gi, "").slice(0, 32)}-${id}.part`); } catch (e) { console.error("upload: cannot create staging folder", d.abs, e); return NextResponse.json({ error: "destination not writable" }, { status: 500 }); }
  if (chunk === 0 && fs.existsSync(tmp)) fs.unlinkSync(tmp);
  // append this chunk (bounded)
  let got = 0;
  const ws = fs.createWriteStream(tmp, { flags: "a" });
  const limiter = new Transform({ transform(c, _e, cb) { got += c.length; if (got > CHUNK_MAX) return cb(new Error("chunk too big")); cb(null, c); } });
  try { await pipeline(Readable.fromWeb(req.body as never), limiter, ws); } catch { try { fs.unlinkSync(tmp); } catch {} return NextResponse.json({ error: "chunk" }, { status: 400 }); }
  if (chunk < chunks - 1) return NextResponse.json({ ok: true, done: false });
  // last chunk: validate size, move into place without overwriting
  const st = fs.statSync(tmp);
  if (size && st.size !== size) { fs.unlinkSync(tmp); return NextResponse.json({ error: "size mismatch" }, { status: 400 }); }
  const albumAbs = path.join(d.abs, album);
  try { fs.mkdirSync(albumAbs, { recursive: true }); } catch (e) { console.error("upload: cannot create album", albumAbs, e); fs.unlinkSync(tmp); return NextResponse.json({ error: "destination not writable" }, { status: 500 }); }
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let final = path.join(albumAbs, name), n = 2;
  while (fs.existsSync(final)) final = path.join(albumAbs, `${stem} ${n++}${ext}`);
  try { fs.renameSync(tmp, final); } catch { fs.copyFileSync(tmp, final); fs.unlinkSync(tmp); }
  // match the owner of the landing folder (the NAS user), so uploads aren't root-owned in UGOS Files
  try { const o = fs.statSync(d.abs); fs.chownSync(final, o.uid, o.gid); fs.chownSync(albumAbs, o.uid, o.gid); } catch {}
  logEvent(r.share.id, "upload", `${album}/${path.basename(final)}`, req, vid === "anon" ? null : vid, st.size);
  return NextResponse.json({ ok: true, done: true, rel: `${album}/${path.basename(final)}` });
}
