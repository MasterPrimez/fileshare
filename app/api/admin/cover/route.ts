import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { setCover } from "@/lib/files";
import { resolveSafe } from "@/lib/roots";

/** PATCH { path: "root/folder", file: "IMG_0001.jpg" | "Sub/IMG_0001.jpg" | null } — file is relative to the folder and may live in a subfolder. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = resolveSafe(String(b.path || ""));
  if (!r) return NextResponse.json({ error: "bad" }, { status: 400 });
  let file: string | null = null;
  if (typeof b.file === "string" && b.file) {
    const clean = b.file.replace(/^\/+/, "");
    const target = resolveSafe(`${r.rel}/${clean}`);
    if (!target || !target.rel.startsWith(r.rel + "/")) return NextResponse.json({ error: "bad" }, { status: 400 });
    file = target.rel.slice(r.rel.length + 1);
  }
  setCover(r.rel, file);
  return NextResponse.json({ ok: true });
}
