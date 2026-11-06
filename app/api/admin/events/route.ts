import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listEvents, listShares, visitorsFor } from "@/lib/shares";
import { visitorId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const names = Object.fromEntries(listShares().map((s) => [s.id, s.name]));
  const events = listEvents(undefined, 300).map((e) => ({ ...e, share_name: names[e.share_id] || "(deleted)" }));
  return NextResponse.json({ events, visitors: visitorsFor(events), me: await visitorId() });
}
