import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { listRoots, resolveSafe } from "@/lib/roots";
import { kindOf, getCover } from "@/lib/files";

/** ?p=rootId/sub — list subfolders + files (admin folder picker). No p = list roots. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams.get("p") || "";
  if (!p) return NextResponse.json({ path: "", folders: listRoots().map((r) => ({ name: r.label, rel: r.id })), files: [] });
  const r = resolveSafe(p);
  if (!r || !fs.existsSync(r.abs)) return NextResponse.json({ error: "notfound" }, { status: 404 });
  const ents = fs.readdirSync(r.abs, { withFileTypes: true }).filter((d) => !d.name.startsWith(".") && d.name !== "@eaDir");
  const folders = ents.filter((d) => d.isDirectory()).map((d) => {
    const rel = path.posix.join(r.rel, d.name);
    let cover: string | null = null;
    try { const names = fs.readdirSync(path.join(r.abs, d.name)).filter((n) => !n.startsWith(".")); const set = getCover(rel); const pick = set && names.includes(set) ? set : names.filter((n) => kindOf(n) === "image").sort()[0]; if (pick) cover = path.posix.join(rel, pick); } catch {}
    return { name: d.name, rel, cover };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const files = ents.filter((d) => d.isFile()).map((d) => {
    const abs = path.join(r.abs, d.name);
    let size = 0, mtime = 0;
    try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs; } catch {}
    return { name: d.name, rel: path.posix.join(r.rel, d.name), kind: kindOf(d.name), size, mtime };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ path: r.rel, folders, files, cover: getCover(r.rel) });
}
