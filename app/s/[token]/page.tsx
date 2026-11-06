import Brand from "../../brand";
import { getShareByToken, shareStatus, recordVisit, logEvent, getVisitor, touchVisitor } from "@/lib/shares";
import { shareUnlocked, ensureVisitorId, isAdmin } from "@/lib/auth";
import NameGate from "./namegate";
import { headers } from "next/headers";
import Gate from "./gate";
import Gallery from "./gallery";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = { missing: "This link doesn't exist.", revoked: "This link has been turned off.", expired: "This link has expired.", limit: "This link has reached its visit limit." };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = getShareByToken(token);
  const status = shareStatus(share);

  if (status !== "ok" || !share) {
    return (
      <div className="page">
        <header className="hdr"><Brand tag="SHARE" /></header>
        <div className="gate"><div className="card"><span className="eyebrow">LINK UNAVAILABLE</span><h1>{status.toUpperCase()}</h1><span className="sub">{MSG[status]}</span></div></div>
        <footer className="ftr"><span>LOS ANGELES</span><span style={{ flex: 1 }} /><span>share.michaelstine.net</span></footer>
      </div>
    );
  }

  const vid = await ensureVisitorId();
  touchVisitor(vid, (await headers()).get("user-agent"));
  const v = getVisitor(vid);
  const admin = await isAdmin(new Request("http://x", { headers: await headers() }));

  if (admin) return <Gallery token={token} name={share.name} mode={share.mode} expiresAt={share.expires_at} />;

  if (share.password_hash && !(await shareUnlocked(token))) {
    // password implies a name: required, on the same screen, unless this device already gave one
    return <Gate token={token} name={share.name} expiresAt={share.expires_at} askName={!v?.name} />;
  }

  // no password: optional name once per device, if this share wants it
  if (share.ask_name && !share.password_hash) {
    const answered = v && (v.name !== null || hasSkipped(vid));
    if (!answered) return <NameGate token={token} />;
  }

  if (!share.password_hash) {
    // open share: count the visit on page load (once per device per hour)
    const h = await headers();
    const fake = new Request("http://x", { headers: h });
    if (!recentOpen(share.id, vid)) { recordVisit(share.id); logEvent(share.id, "open", null, fake, vid); }
  }

  return <Gallery token={token} name={share.name} mode={share.mode} expiresAt={share.expires_at} />;
}

import db from "@/lib/db";
function hasSkipped(vid: string) {
  return !!db.prepare("SELECT 1 FROM events WHERE visitor_id = ? AND kind IN ('named','skipped_name') LIMIT 1").get(vid);
}
function recentOpen(shareId: string, vid: string) {
  return !!db.prepare("SELECT 1 FROM events WHERE share_id = ? AND visitor_id = ? AND kind = 'open' AND at > ? LIMIT 1").get(shareId, vid, Date.now() - 3600000);
}
