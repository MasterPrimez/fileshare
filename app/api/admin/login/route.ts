import { NextRequest, NextResponse } from "next/server";
import { loginAdmin, logoutAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (await loginAdmin(password || "")) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "wrong" }, { status: 401 });
}
export async function DELETE() {
  await logoutAdmin();
  return NextResponse.json({ ok: true });
}
