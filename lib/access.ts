import { NextResponse } from "next/server";
import { getShareByToken, shareStatus, Share, LIBRARY, libraryShare } from "./shares";
import { shareUnlocked, isAdmin } from "./auth";

/** Resolve a share from a token and verify it's open + unlocked. */
export async function openShare(token: string): Promise<{ share: Share } | { error: NextResponse }> {
  if (token === LIBRARY) return (await isAdmin()) ? { share: libraryShare() } : { error: NextResponse.json({ error: "missing" }, { status: 404 }) };
  const share = getShareByToken(token);
  const status = shareStatus(share);
  if (status !== "ok" || !share) return { error: NextResponse.json({ error: status }, { status: 404 }) };
  if (share.password_hash && !(await shareUnlocked(token)) && !(await isAdmin())) return { error: NextResponse.json({ error: "locked" }, { status: 401 }) };
  return { share };
}
