"use client";
import { useCallback, useEffect, useState } from "react";
import { Log, Ev, Vis } from "../admin/log";

type ShareRow = { id: string; token: string; name: string; path: string; mode: "view" | "edit"; has_password: boolean; password?: string | null; ask_name: number; expires_at: number | null; visit_limit: number | null; visits: number; revoked: number; created_at: number; status: string; counts: Record<string, number> };
type AF = { name: string; rel: string; kind: string; size: number; mtime: number };
type Screen = { s: "list" } | { s: "browse" } | { s: "create" } | { s: "done"; share: ShareRow } | { s: "detail"; id: string } | { s: "activity" } | { s: "roots" };

const fmtSz = (n: number) => n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;
const fmtT = (ms: number) => { const d = new Date(ms), now = new Date(); const same = d.toDateString() === now.toDateString(); return same ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(); };
const daysLeft = (ts: number | null) => ts ? Math.max(0, Math.ceil((ts - Date.now()) / 86400000)) : null;
const base = () => (typeof window !== "undefined" ? window.location.origin : "");
const dev = (ua: string | null) => !ua ? "" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
const ini = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "SH";
const tones = ["#2b2f33", "#3a2e24", "#23292e", "#2f2a2a", "#1f2a2a", "#33302a"];

export default function MobileApp() {
  const [scr, setScr] = useState<Screen>({ s: "list" });
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [visitors, setVisitors] = useState<Record<string, Vis>>({});
  const [me, setMe] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };
  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/shares"); if (r.ok) setShares((await r.json()).shares);
    const e = await fetch("/api/admin/events"); if (e.ok) { const j = await e.json(); setEvents(j.events); setVisitors(j.visitors || {}); setMe(j.me || null); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);

  // create flow state
  const [folder, setFolder] = useState<{ rel: string; name: string } | null>(null);
  const [coll, setColl] = useState<{ rel: string; name: string }[]>([]);

  async function copy(t: string) { try { await navigator.clipboard.writeText(`${base()}/s/${t}`); say("LINK COPIED"); } catch { say("COPY FAILED"); } }
  async function send(s: ShareRow) {
    const url = `${base()}/s/${s.token}`;
    if (navigator.share) { try { await navigator.share({ title: s.name, url }); } catch {} } else copy(s.token);
  }
  async function rename(id: string, name: string) { await fetch("/api/admin/visitors", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name }) }); refresh(); }
  async function patch(id: string, body: object) { await fetch(`/api/admin/shares/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); refresh(); }

  const active = shares.filter((s) => s.status === "ok").length;

  return (
    <div className="mpage">
      {scr.s === "list" && <>
        <header className="mh"><span className="mt">SHARES</span><span className="sub">{active} ACTIVE</span></header>
        <div className="mlist">
          {!shares.length && <div className="sub" style={{ padding: 24, textAlign: "center" }}>NO SHARES YET</div>}
          {shares.map((s, i) => {
            const d = daysLeft(s.expires_at);
            return (
              <button key={s.id} className="mrow" onClick={() => setScr({ s: "detail", id: s.id })}>
                <span className="mthumb" style={{ background: tones[i % tones.length] }}>{ini(s.name)}</span>
                <span className="mrow-body"><span className="mrow-n">{s.name}</span><span className="mrow-m">{s.visits} OPENS · {(s.counts.download || 0) + (s.counts.zip || 0)} DL{s.has_password ? " · 🔒" : ""}</span></span>
                <span className="mrow-r"><span className={`status ${s.status === "ok" ? "ok" : "off"}`}>{s.status === "ok" ? s.mode.toUpperCase() === "VIEW" ? "READ ONLY" : "EDIT" : s.status.toUpperCase()}</span><span className="sub">{d === null ? "NEVER" : `${d}D`}</span></span>
              </button>
            );
          })}
        </div>
        <footer className="mf">
          <button className="mbtn pri" onClick={() => { setFolder(null); setColl([]); setScr({ s: "browse" }); }}>＋ NEW SHARE</button>
          <nav className="mtabs"><span className="on">SHARES</span><button onClick={() => setScr({ s: "activity" })}>ACTIVITY</button><button onClick={() => setScr({ s: "roots" })}>ROOTS</button></nav>
        </footer>
      </>}

      {scr.s === "browse" && <Browse coll={coll} onAdd={(f) => setColl((c) => c.some((x) => x.rel === f.rel) ? c : [...c, f])} onRemove={(rel) => setColl((c) => c.filter((x) => x.rel !== rel))} onBack={() => setScr({ s: "list" })} onPick={(f) => { setFolder(f); setScr({ s: "create" }); }} />}

      {scr.s === "create" && folder && <Create folder={folder} coll={coll} onBack={() => setScr({ s: "browse" })} onDone={(share) => { refresh(); copy(share.token); setScr({ s: "done", share }); }} />}

      {scr.s === "done" && <>
        <div className="mdone">
          <span className="mcheck"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0c0c0d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg></span>
          <span className="mt" style={{ fontSize: 40 }}>LINK READY</span>
          <span className="sub">{scr.share.name.toUpperCase()} · {scr.share.mode === "edit" ? "EDIT" : "READ ONLY"}{scr.share.expires_at ? ` · ${daysLeft(scr.share.expires_at)} DAYS` : ""}{scr.share.has_password ? " · PASSWORD" : ""}</span>
          <div className="code">{base()}/s/{scr.share.token}</div>
        </div>
        <footer className="mf" style={{ borderTop: 0 }}>
          <button className="mbtn pri" onClick={() => send(scr.share)}>SEND LINK…</button>
          <div className="row2"><button className="mbtn" onClick={() => copy(scr.share.token)}>COPY</button><a className="mbtn" href={`/s/${scr.share.token}`} target="_blank" rel="noreferrer">OPEN</a></div>
          <button className="mlink" onClick={() => setScr({ s: "list" })}>DONE</button>
        </footer>
      </>}

      {scr.s === "detail" && <Detail id={scr.id} onBack={() => setScr({ s: "list" })} onCopy={copy} onSend={send} onPatch={patch} say={say} onRename={rename} />}

      {scr.s === "activity" && <>
        <header className="mh"><span className="mt">ACTIVITY</span></header>
        <div className="mlog"><Log events={events} visitors={visitors} me={me} showShare onRename={rename} /></div>
        <footer className="mf"><nav className="mtabs"><button onClick={() => setScr({ s: "list" })}>SHARES</button><span className="on">ACTIVITY</span><button onClick={() => setScr({ s: "roots" })}>ROOTS</button></nav></footer>
      </>}

      {scr.s === "roots" && <Roots onList={() => setScr({ s: "list" })} onAct={() => setScr({ s: "activity" })} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return <button className="mback" onClick={onClick} aria-label="Back"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>;
}
function Folder() { return <svg width="22" height="18" viewBox="0 0 28 22" aria-hidden="true"><path d="M1 4a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="none" stroke="var(--amber)" strokeWidth="1.6" /></svg>; }

function Browse({ onBack, onPick, coll, onAdd, onRemove }: { onBack: () => void; onPick: (f: { rel: string; name: string }) => void; coll: { rel: string; name: string }[]; onAdd: (f: { rel: string; name: string }) => void; onRemove: (rel: string) => void }) {
  const [cur, setCur] = useState("");
  const [folders, setFolders] = useState<{ name: string; rel: string; cover?: string | null }[]>([]);
  const [files, setFiles] = useState<AF[]>([]);
  const go = useCallback(async (p: string) => {
    const r = await fetch(`/api/admin/browse?p=${encodeURIComponent(p)}`);
    if (!r.ok) return; const j = await r.json();
    setCur(j.path); setFolders(j.folders); setFiles(j.files || []);
  }, []);
  useEffect(() => { go(""); }, [go]);
  const parts = cur.split("/").filter(Boolean);
  const up = parts.slice(0, -1).join("/");
  const media = files.filter((f) => ["image", "video", "raw"].includes(f.kind)).slice(0, 6);
  return <>
    <header className="mh"><Back onClick={() => (cur ? go(up) : onBack())} /><span className="mt">PICK A FOLDER</span></header>
    <div className="crumbs" style={{ padding: "0 20px 10px" }}><a href="#" onClick={(e) => { e.preventDefault(); go(""); }}>ROOTS</a>{parts.map((c, i) => <span key={i} style={{ display: "contents" }}><span>›</span>{i === parts.length - 1 ? <span className="cur">{c.toUpperCase()}</span> : <a href="#" onClick={(e) => { e.preventDefault(); go(parts.slice(0, i + 1).join("/")); }}>{c.toUpperCase()}</a>}</span>)}</div>
    <div className="mlist">
      {folders.map((f) => { const on = coll.some((c) => c.rel === f.rel); return <button key={f.rel} className="mrow" onClick={() => go(f.rel)}><span className={`pbox ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Add ${f.name}`} onClick={(e) => { e.stopPropagation(); on ? onRemove(f.rel) : onAdd({ rel: f.rel, name: f.name }); }} style={{ width: 22, height: 22 }}>{on && <svg width="12" height="12" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 6l3 3 5-7" stroke="#0c0c0d" strokeWidth="1.8" fill="none" /></svg>}</span>{f.cover ? <img className="mthumb" src={`/api/admin/thumb?p=${encodeURIComponent(f.cover)}&w=200`} alt="" style={{ objectFit: "cover" }} /> : <Folder />}<span className="mrow-body"><span className="mrow-n">{f.name}</span></span><span className="sub">›</span></button>; })}
      {!folders.length && cur && <div className="sub" style={{ padding: "12px 0" }}>NO SUBFOLDERS</div>}
      {!!media.length && <div className="mstrip">{media.map((f) => <img key={f.rel} src={`/api/admin/thumb?p=${encodeURIComponent(f.rel)}&w=200`} alt="" loading="lazy" />)}</div>}
      {cur && <span className="sub">{files.length} FILES HERE · {fmtSz(files.reduce((a, f) => a + f.size, 0))}</span>}
      {!!coll.length && <div className="coll">{coll.map((c) => <span key={c.rel} className="chip"><span className="cn">{c.name}</span><button aria-label="Remove" onClick={() => onRemove(c.rel)}>×</button></span>)}</div>}
    </div>
    <footer className="mf">
      <div className="row2">
        <button className="mbtn" disabled={!cur || coll.some((c) => c.rel === cur)} onClick={() => onAdd({ rel: cur, name: parts[parts.length - 1] || cur })}>+ ADD{coll.length ? ` (${coll.length})` : ""}</button>
        <button className="mbtn pri" disabled={!cur && !coll.length} onClick={() => onPick(coll.length ? coll[0] : { rel: cur, name: parts[parts.length - 1] || cur })}>{coll.length > 1 ? `SHARE ${coll.length} FOLDERS` : cur ? `SHARE "${(parts[parts.length - 1] || "").toUpperCase()}"` : "PICK A FOLDER"}</button>
      </div>
    </footer>
  </>;
}

function Create({ folder, coll, onBack, onDone }: { folder: { rel: string; name: string }; coll: { rel: string; name: string }[]; onBack: () => void; onDone: (s: ShareRow) => void }) {
  const [name, setName] = useState(coll.length > 1 ? `${folder.name} + ${coll.length - 1}` : folder.name);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [exp, setExp] = useState<"24H" | "7D" | "30D" | "NEVER">("7D");
  const [pwOn, setPwOn] = useState(false);
  const [pw, setPw] = useState("");
  const [askName, setAskName] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setErr("");
    const ms = exp === "24H" ? 86400000 : exp === "7D" ? 7 * 86400000 : exp === "30D" ? 30 * 86400000 : 0;
    const r = await fetch("/api/admin/shares", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, path: folder.rel, paths: coll.length > 1 ? coll.map((c) => c.rel) : undefined, mode, password: pwOn && pw ? pw : undefined, expiresAt: ms ? Date.now() + ms : null, askName: pwOn || askName }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || "FAILED"); return; }
    onDone({ ...j.share, has_password: !!(pwOn && pw), status: "ok", counts: {} });
  }
  return <>
    <header className="mh"><Back onClick={onBack} /><span className="mt">NEW SHARE</span></header>
    <div className="mlist" style={{ gap: 18 }}>
      {coll.length > 1 ? <div className="coll">{coll.map((c) => <span key={c.rel} className="chip"><span className="cn">{c.name}</span></span>)}</div> : <div className="mrow static"><Folder /><span className="mrow-body"><span className="mrow-n">{folder.name}</span><span className="mrow-m">{folder.rel.split("/").slice(0, -1).join(" › ").toUpperCase()}</span></span></div>}
      <div className="field"><label htmlFor="mn">NAME SHOWN TO VISITOR</label><input id="mn" className="in" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>MODE</label><div className="seg2"><button className={mode === "view" ? "on" : ""} onClick={() => setMode("view")}>READ ONLY</button><button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>EDIT</button></div></div>
      <div className="field"><label>EXPIRES</label><div className="row2" style={{ gap: 6 }}>{(["24H", "7D", "30D", "NEVER"] as const).map((e) => <button key={e} className={`pill ${exp === e ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setExp(e)}>{e}</button>)}</div></div>
      <div className="mrow static" style={{ justifyContent: "space-between" }}><span className="mrow-body"><span className="mrow-n">Password</span><span className="mrow-m">{pwOn ? "REQUIRED TO OPEN" : "ANYONE WITH THE LINK"}</span></span><button className={`sw ${pwOn ? "on" : ""}`} onClick={() => setPwOn(!pwOn)} aria-label="Toggle password"><span /></button></div>
      {pwOn && <input className="in pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" autoFocus aria-label="Password" />}
      <div className="mrow static" style={{ justifyContent: "space-between" }}><span className="mrow-body"><span className="mrow-n">Ask for name</span><span className="mrow-m">{pwOn ? "REQUIRED WITH PASSWORD" : askName ? "ONCE PER DEVICE" : "LOG SHOWS DEVICE ONLY"}</span></span><button className={`sw ${pwOn || askName ? "on" : ""}`} disabled={pwOn} onClick={() => setAskName(!askName)} aria-label="Ask for name"><span /></button></div>
      {err && <span className="err">{err}</span>}
    </div>
    <footer className="mf"><button className="mbtn pri" disabled={busy || !name || (pwOn && !pw)} onClick={create}>{busy ? "CREATING…" : "CREATE LINK"}</button></footer>
  </>;
}

function Detail({ id, onBack, onCopy, onSend, onPatch, say, onRename }: { id: string; onBack: () => void; onCopy: (t: string) => void; onSend: (s: ShareRow) => void; onPatch: (id: string, b: object) => Promise<void>; say: (m: string) => void; onRename: (id: string, name: string) => void }) {
  const [d, setD] = useState<{ share: ShareRow; events: Ev[]; visitors: Record<string, Vis>; me: string | null } | null>(null);
  const load = useCallback(async () => { const r = await fetch(`/api/admin/shares/${id}`); if (r.ok) setD(await r.json()); }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="sub" style={{ padding: 24 }}>LOADING…</div>;
  const s = d.share; const dl = daysLeft(s.expires_at);
  const dls = d.events.filter((e) => e.kind === "download" || e.kind === "zip").length;
  return <>
    <header className="mh"><Back onClick={onBack} /><span className="mt" style={{ flex: 1 }}>{s.name.toUpperCase()}</span><span className={`status ${s.revoked ? "off" : "ok"}`}>{s.revoked ? "REVOKED" : s.mode === "edit" ? "EDIT" : "READ ONLY"}</span></header>
    <div className="mstats"><div><b>{s.visits}</b><span>OPENS</span></div><div><b>{dls}</b><span>DOWNLOADS</span></div><div><b style={{ color: "var(--amber)" }}>{dl === null ? "∞" : `${dl}D`}</b><span>LEFT</span></div></div>
    <div className="row2" style={{ padding: "0 20px 12px" }}>
      <button className="mbtn" onClick={() => onCopy(s.token)}>COPY</button>
      <button className="mbtn" onClick={() => onSend(s)}>SEND</button>
      <button className="mbtn" onClick={async () => { await onPatch(s.id, { mode: s.mode === "view" ? "edit" : "view" }); load(); say("MODE CHANGED"); }}>{s.mode === "view" ? "→ EDIT" : "→ READ"}</button>
      <button className={`mbtn ${s.revoked ? "" : "danger"}`} onClick={async () => { if (!s.revoked && !confirm("Revoke this link?")) return; await onPatch(s.id, { revoked: !s.revoked }); load(); }}>{s.revoked ? "RESTORE" : "REVOKE"}</button>
    </div>
    {s.has_password && <div className="mrow static" style={{ margin: "0 20px 12px", width: "auto", justifyContent: "space-between" }}><span className="mrow-body"><span className="mrow-m">PASSWORD</span><span className="mrow-n" style={{ letterSpacing: ".1em" }}>{s.password ?? "—"}</span></span>{s.password && <button className="btn sm" onClick={() => { navigator.clipboard.writeText(s.password!); say("PASSWORD COPIED"); }}>COPY</button>}</div>}
    <div className="sub" style={{ padding: "6px 20px 4px" }}>ACTIVITY</div>
    <div className="mlog"><Log events={d.events} visitors={d.visitors} me={d.me} onRename={(vid, name) => { onRename(vid, name); load(); }} /></div>
  </>;
}

function Roots({ onList, onAct }: { onList: () => void; onAct: () => void }) {
  const [roots, setRoots] = useState<{ name: string; rel: string }[]>([]);
  useEffect(() => { fetch("/api/admin/browse").then((r) => r.json()).then((j) => setRoots(j.folders || [])); }, []);
  return <>
    <header className="mh"><span className="mt">ROOTS</span></header>
    <div className="mlist">{roots.map((r) => <div key={r.rel} className="mrow static"><Folder /><span className="mrow-body"><span className="mrow-n">{r.name}</span><span className="mrow-m">/data/{r.rel}</span></span></div>)}<span className="sub">ADD OR REMOVE ROOTS IN docker-compose.yml ON THE NAS.</span></div>
    <footer className="mf"><nav className="mtabs"><button onClick={onList}>SHARES</button><button onClick={onAct}>ACTIVITY</button><span className="on">ROOTS</span></nav></footer>
  </>;
}
