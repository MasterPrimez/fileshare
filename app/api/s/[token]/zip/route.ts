import { NextRequest, NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
import path from "node:path";
import archiver from "archiver";
import { openShare } from "@/lib/access";
import { statIn, walk, isHidden } from "@/lib/files";
import { logEvent, mapSub, shareItems, isCollection } from "@/lib/shares";
import { resolveSafe } from "@/lib/roots";

/** POST { paths: string[] } — zip selected files/folders (rel to share). Empty = whole share. Streams, no temp file. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  const body = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body.paths) && body.paths.length ? body.paths : [""];

  const files: { abs: string; rel: string; size: number }[] = [];
  const addDir = (abs: string, base: string, real: string) => { for (const f of walk(abs, "", real)) files.push({ abs: f.abs, rel: path.posix.join(base, f.rel), size: f.size }); };
  for (const p of paths) {
    if (p === "" && isCollection(r.share)) {
      for (const it of shareItems(r.share)) { const rr = resolveSafe(it.base); if (rr) addDir(rr.abs, it.name, rr.rel); }
      continue;
    }
    const m = mapSub(r.share, p);
    if (!m) continue;
    const s = statIn(m.base, m.rest);
    if (!s) continue;
    const real = m.rest ? `${m.base}/${m.rest}` : m.base;
    if (s.st.isDirectory()) addDir(s.abs, p ? path.posix.basename(p) : "", real);
    else if (!isHidden(real)) files.push({ abs: s.abs, rel: path.posix.basename(p), size: s.st.size });
  }
  if (!files.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  logEvent(r.share.id, "zip", paths[0] === "" ? "ALL" : `${files.length} files`, req, undefined, files.reduce((a, f) => a + f.size, 0));

  const pass = new PassThrough();
  const zip = archiver("zip", { store: true }); // store: media is already compressed
  zip.pipe(pass);
  for (const f of files) zip.file(f.abs, { name: f.rel });
  zip.finalize();

  const zipName = `${r.share.name.replace(/[^\w\- ]+/g, "")}${paths[0] === "" ? "" : "-selected"}.zip`;
  return new NextResponse(Readable.toWeb(pass) as ReadableStream, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}` },
  });
}
