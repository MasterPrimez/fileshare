import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { openShare } from "@/lib/access";
import { resolveInShare } from "@/lib/files";
import { logEvent, mapSub, isCollection } from "@/lib/shares";

function target(share: Parameters<typeof mapSub>[0], sub: string) {
  const m = mapSub(share, sub);
  if (!m) return null;
  if (isCollection(share) && !m.rest) return null; // never touch a collection item's root
  return resolveInShare(m.base, m.rest)?.abs || null;
}

/** PUT ?p=folder/name.ext — streamed upload body. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  if (r.share.mode !== "edit") return NextResponse.json({ error: "readonly" }, { status: 403 });
  const sub = req.nextUrl.searchParams.get("p") || "";
  const abs = target(r.share, sub);
  if (!abs || !req.body || path.basename(abs).startsWith(".")) return NextResponse.json({ error: "bad" }, { status: 400 });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + ".uploading";
  await pipeline(Readable.fromWeb(req.body as never), fs.createWriteStream(tmp));
  fs.renameSync(tmp, abs);
  logEvent(r.share.id, "upload", sub, req);
  return NextResponse.json({ ok: true });
}

/** DELETE { paths: string[] } */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  if (r.share.mode !== "edit") return NextResponse.json({ error: "readonly" }, { status: 403 });
  const { paths } = await req.json().catch(() => ({ paths: [] }));
  let n = 0;
  for (const p of paths as string[]) {
    if (!p) continue; // never delete the share root itself
    const abs = target(r.share, p);
    if (!abs || !fs.existsSync(abs)) continue;
    fs.rmSync(abs, { recursive: true, force: true });
    logEvent(r.share.id, "delete", p, req);
    n++;
  }
  return NextResponse.json({ ok: true, deleted: n });
}

/** PATCH { from, to } rename within share; or { mkdir: "folder/new" } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token);
  if ("error" in r) return r.error;
  if (r.share.mode !== "edit") return NextResponse.json({ error: "readonly" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.mkdir) {
    const abs = target(r.share, body.mkdir);
    if (!abs) return NextResponse.json({ error: "bad" }, { status: 400 });
    fs.mkdirSync(abs, { recursive: true });
    logEvent(r.share.id, "mkdir", body.mkdir, req);
    return NextResponse.json({ ok: true });
  }
  if (body.from && body.to) {
    const a = target(r.share, body.from), b = target(r.share, body.to);
    if (!a || !b || !fs.existsSync(a) || fs.existsSync(b)) return NextResponse.json({ error: "bad" }, { status: 400 });
    fs.renameSync(a, b);
    logEvent(r.share.id, "rename", `${body.from} → ${body.to}`, req);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad" }, { status: 400 });
}
