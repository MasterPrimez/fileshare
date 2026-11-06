"use client";
import Brand from "../../brand";
import { useState } from "react";
import { useRouter } from "next/navigation";

function daysLeft(ts: number | null) {
  if (!ts) return null;
  return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
}

export default function Gate({ token, name, expiresAt, askName }: { token: string; name: string; expiresAt: number | null; askName?: boolean }) {
  const [pw, setPw] = useState("");
  const [who, setWho] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const d = daysLeft(expiresAt);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/s/${token}/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw, name: askName ? who.trim() : undefined }) });
    setBusy(false);
    if (r.ok) router.refresh();
    else setErr(r.status === 429 ? "TOO MANY ATTEMPTS — TRY AGAIN IN 15 MIN" : "WRONG PASSWORD");
  }

  return (
    <div className="page">
      <header className="hdr"><Brand tag="SHARE" /></header>
      <div className="gate">
        <form className="card" onSubmit={go}>
          <div className="field" style={{ gap: 6 }}>
            <span className="eyebrow">PROTECTED SHARE</span>
            <h1>{name.toUpperCase()}</h1>
            {d !== null && <span className="sub">EXPIRES IN {d} DAY{d === 1 ? "" : "S"}</span>}
          </div>
          {askName && <div className="field">
            <label htmlFor="who">YOUR NAME</label>
            <input id="who" className="in" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. Sarah Chen" autoFocus autoComplete="name" />
          </div>}
          <div className="field">
            <label htmlFor="pw">PASSWORD</label>
            <input id="pw" className="in pw" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!askName} />
            {err && <span className="err">{err}</span>}
          </div>
          <button className="btn pri" type="submit" disabled={busy || !pw || (askName && !who.trim())}>OPEN SHARE</button>
          <span className="eyebrow" style={{ textAlign: "center", color: "var(--faint)" }}>LINK FROM MICHAEL STINE · DP</span>
        </form>
      </div>
      <footer className="ftr"><span>LOS ANGELES</span><span style={{ flex: 1 }} /><span>share.michaelstine.net</span></footer>
    </div>
  );
}
