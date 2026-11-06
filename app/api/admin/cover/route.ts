import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { setCover } from "@/lib/files";
import { resolveSafe } from "@/lib/roots";

/** PATCH { path: "root/folder", file: "IMG_0001.jpg" | null } */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = resolveSafe(String(b.path || ""));
  if (!r) return NextResponse.json({ error: "bad" }, { status: 400 });
  const file = typeof b.file === "string" && b.file && !b.file.includes("/") ? b.file : null;
  setCover(r.rel, file);
  return NextResponse.json({ ok: true });
}
