import { NextResponse } from "next/server";
import { getShareByToken, shareStatus, Share } from "./shares";
import { shareUnlocked, isAdmin } from "./auth";

/** Resolve a share from a token and verify it's open + unlocked. */
export async function openShare(token: string): Promise<{ share: Share } | { error: NextResponse }> {
  const share = getShareByToken(token);
  const status = shareStatus(share);
  if (status !== "ok" || !share) return { error: NextResponse.json({ error: status }, { status: 404 }) };
  if (share.password_hash && !(await shareUnlocked(token)) && !(await isAdmin())) return { error: NextResponse.json({ error: "locked" }, { status: 401 }) };
  return { share };
}
