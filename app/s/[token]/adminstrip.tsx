"use client";
import { useCallback, useEffect, useState } from "react";
import { FolderPicker } from "../../admin/pickers";

export type AdminShare = { id: string; token: string; name: string; mode: "view" | "edit"; has_password: boolean; password: string | null; expires_at: number | null; revoked: number; folders: string[]; status?: string; ask_name: number };
const DAY = 86400000;

/**
 * Blue admin layer shown above a share when the admin is logged in.
 * Library: shares pointing at the current folder + "share this folder".
 * Share: mode / expiry / password / add folder / copy / save.
 */
export default function AdminStrip({ token, shareId, real, onChanged }: { token: string; shareId: string; real: string | null; onChanged: () => void }) {
  const isLib = token === "library";
  const [all, setAll] = useState<AdminShare[]>([]);
  const [s, setS] = useState<AdminShare | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [exp, setExp] = useState<number | null>(null);
  const [pw, setPw] = useState("");
  const [pwOn, setPwOn] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState(false);
  const [msg, setMsg] = useState("");
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 1800); };

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/shares"); if (r.ok) setAll((await r.json()).shares);
    if (!isLib) { const d = await fetch(`/api/admin/shares/${shareId}`); if (d.ok) { const j = await d.json(); setS(j.share); setMode(j.share.mode); setExp(j.share.expires_at); setPwOn(j.share.has_password); setPw(j.share.password || ""); setDirty(false); } }
  }, [isLib, shareId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!s) return;
    const body: Record<string, unknown> = { mode, expiresAt: exp };
    if (!pwOn && s.has_password) body.password = null;
    else if (pwOn && pw && pw !== s.password) body.password = pw;
    if (pwOn) body.askName = true;
    const r = await fetch(`/api/admin/shares/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    say(r.ok ? "SAVED" : "FAILED"); load(); onChanged();
  }
  async function addFolders(rels: string[]) {
    setPick(false);
    if (!s || !rels.length) return;
    const r = await fetch(`/api/admin/shares/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: [...s.folders, ...rels] }) });
    say(r.ok ? `${rels.length} ADDED` : "FAILED"); load(); onChanged();
  }
  function copy() { navigator.clipboard.writeText(`${location.origin}/s/${token}`); say("LINK COPIED"); }

  const expLabel = exp === null ? "NEVER" : exp < Date.now() ? "EXPIRED" : `${Math.max(1, Math.ceil((exp - Date.now()) / DAY))}D`;
  const setDays = (d: number | null) => { setExp(d === null ? null : Date.now() + d * DAY); setDirty(true); };
  const chip = (x: AdminShare) => <a key={x.id} className={`achip ${x.status === "ok" ? "" : "off"}`} href={`/admin#share/${x.id}`} title={x.folders.join("\n")}><i />{x.name.toUpperCase()} · {x.mode === "edit" ? "EDIT" : "READ ONLY"}{x.expires_at ? ` · ${Math.max(0, Math.ceil((x.expires_at - Date.now()) / DAY))}D` : ""}</a>;

  if (isLib) {
    const here = real ? all.filter((x) => x.folders.includes(real)) : [];
    const under = real ? all.filter((x) => !x.folders.includes(real) && x.folders.some((f) => f.startsWith(real + "/"))) : [];
    return (
      <div className="astrip">
        <span className="alabel"><i />ADMIN</span>
        <a className="abtn ghost" href="/admin">← ADMIN</a>
        <span className="aname">LIBRARY</span>
        <span className="asp" />
        {real && <>
          {here.length ? <><span className="adim">SHARED AS</span>{here.map(chip)}</> : <span className="adim">NOT SHARED</span>}
          {!!under.length && <span className="adim" title={under.map((u) => u.name).join(", ")}>· {under.length} INSIDE</span>}
          <a className="abtn pri" href={`/admin#new?p=${encodeURIComponent(real)}`}>+ SHARE THIS FOLDER</a>
        </>}
        {!real && <span className="adim">OPEN A FOLDER TO SHARE IT · HOVER A FOLDER FOR COVER / RENAME</span>}
        {msg && <span className="amsg">{msg}</span>}
      </div>
    );
  }

  return (
    <div className="astrip">
      <span className="alabel"><i />ADMIN</span>
      <a className="abtn ghost" href="/admin#shares">← SHARES</a>
      {s && <a className="aname" href={`/admin#share/${s.id}`} title="Details + log">{s.name.toUpperCase()}</a>}
      <span className="asp" />
      {s && <>
        <span className={`apill ${mode === "view" ? "on" : ""}`} onClick={() => { setMode("view"); setDirty(true); }}>READ ONLY</span>
        <span className={`apill ${mode === "edit" ? "on" : ""}`} onClick={() => { setMode("edit"); setDirty(true); }}>EDIT</span>
        <span className="adim">EXPIRES</span>
        {([["24H", 1], ["7D", 7], ["30D", 30], ["NEVER", null]] as [string, number | null][]).map(([l, d]) => <span key={l} className={`apill ${(d === null ? exp === null : false) ? "on" : ""}`} onClick={() => setDays(d)}>{l}</span>)}
        {exp !== null && <span className="apill on" style={{ cursor: "default" }}>{expLabel}</span>}
        <span className="adim">PW</span>
        <span className={`apill ${pwOn ? "on" : ""}`} onClick={() => { setPwOn(!pwOn); setDirty(true); }}>{pwOn ? "ON" : "OFF"}</span>
        {pwOn && <input className="ain" value={pw} onChange={(e) => { setPw(e.target.value); setDirty(true); }} placeholder="password" aria-label="Share password" />}
        <button className="abtn" onClick={() => setPick(true)}>+ FOLDER</button>
        <button className="abtn" onClick={copy}>COPY LINK</button>
        <button className={`abtn ${dirty ? "pri" : ""}`} disabled={!dirty || (pwOn && !pw)} onClick={save}>SAVE</button>
      </>}
      {msg && <span className="amsg">{msg}</span>}
      {pick && s && <FolderPicker exclude={s.folders} onDone={addFolders} onCancel={() => setPick(false)} />}
    </div>
  );
}
