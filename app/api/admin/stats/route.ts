import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { stats } from "@/lib/shares";

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const days = Math.max(0, parseInt(req.nextUrl.searchParams.get("days") || "30") || 0);
  return NextResponse.json(stats(days));
}
