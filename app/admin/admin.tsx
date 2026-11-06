"use client";
import Brand from "../brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { Log, Ev, Vis } from "./log";
import Dashboard from "./dashboard";

type ShareRow = { id: string; token: string; name: string; path: string; paths?: string | null; folders?: string[]; cover?: string | null; mode: "view" | "edit"; has_password: boolean; password?: string | null; ask_name: number; expires_at: number | null; visit_limit: number | null; visits: number; revoked: number; created_at: number; status: string; counts: Record<string, number> };

const fmt = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const base = () => (typeof window !== "undefined" ? window.location.origin : "");

export default function Admin() {
  const [tab, setTab] = useState<"dash" | "shares" | "new" | "log" | "roots">("dash");
  const [grid, setGrid] = useState(true);
  const [viewing, setViewing] = useState<ShareRow | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [visitors, setVisitors] = useState<Record<string, Vis>>({});
  const [me, setMe] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ share: ShareRow; events: Ev[]; visitors: Record<string, Vis>; me: string | null } | null>(null);
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/shares"); if (r.ok) setShares((await r.json()).shares);
    const e = await fetch("/api/admin/events"); if (e.ok) { const j = await e.json(); setEvents(j.events); setVisitors(j.visitors || {}); setMe(j.me || null); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function patch(id: string, body: object) { await fetch(`/api/admin/shares/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); refresh(); }
  async function remove(id: string) { if (!confirm("Delete this share and its log?")) return; await fetch(`/api/admin/shares/${id}`, { method: "DELETE" }); setDetail(null); refresh(); }
  async function openDetail(id: string) { const r = await fetch(`/api/admin/shares/${id}`); if (r.ok) setDetail(await r.json()); }
  async function rename(id: string, name: string) { await fetch("/api/admin/visitors", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name }) }); refresh(); if (detail) openDetail(detail.share.id); }
  function copy(t: string) { navigator.clipboard.writeText(`${base()}/s/${t}`); say("LINK COPIED"); }

  return (
    <div className="admin">
      <aside className="side">
        <Brand tag="ADMIN" size={34} />
        <a href="#" className={tab === "dash" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("dash"); setDetail(null); setViewing(null); }}>Dashboard</a>
        <a href="#" className={tab === "shares" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("shares"); setDetail(null); setViewing(null); }}>Shares</a>
        <a href="#" className={tab === "new" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("new"); setDetail(null); }}>+ New share</a>
        <a href="#" className={tab === "log" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("log"); setDetail(null); }}>Activity</a>
        <a href="#" className={tab === "roots" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("roots"); setDetail(null); }}>Roots</a>
        <div style={{ flex: 1 }} />
        <a href="#" onClick={async (e) => { e.preventDefault(); await fetch("/api/admin/login", { method: "DELETE" }); location.reload(); }}>Sign out</a>
      </aside>

      <section className="content">
        {viewing ? <>
          <div className="row" style={{ justifyContent: "space-between" }}><div className="row"><button className="btn sm" onClick={() => setViewing(null)}>← BACK TO SHARES</button><h2 className="h" style={{ fontSize: 24 }}>{viewing.name.toUpperCase()}</h2></div><div className="row"><button className="btn sm" onClick={() => { const v = viewing; setViewing(null); openDetail(v.id); }}>EDIT</button><a className="btn sm" href={`/s/${viewing.token}`} target="_blank" rel="noreferrer">NEW TAB</a></div></div>
          <iframe className="viewer" src={`/s/${viewing.token}`} title={viewing.name} />
        </> : detail ? <Detail d={detail} onBack={() => setDetail(null)} onPatch={(b) => patch(detail.share.id, b).then(() => openDetail(detail.share.id))} onDelete={() => remove(detail.share.id)} onCopy={() => copy(detail.share.token)} onRename={rename} onView={() => { setViewing(detail.share); setDetail(null); }} /> :
        tab === "dash" ? <Dashboard onOpenShare={(id) => openDetail(id)} onExtend={async (id, d) => { const sh = shares.find((x) => x.id === id); const basis = Math.max(Date.now(), sh?.expires_at || 0); await patch(id, { expiresAt: basis + d * 86400000 }); }} /> :
        tab === "shares" ? <>
          <div className="row" style={{ justifyContent: "space-between" }}><h2 className="h">SHARES</h2><div className="seg"><button className={grid ? "on" : ""} onClick={() => setGrid(true)} aria-label="Grid"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg></button><button className={!grid ? "on" : ""} onClick={() => setGrid(false)} aria-label="List"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" /><rect x="1" y="12" width="14" height="2" rx="1" /></svg></button></div></div>
          {!shares.length && <span className="sub">NO SHARES YET</span>}
          {!!shares.length && grid && <div className="sgrid">
            {shares.map((s) => {
              const d = s.expires_at ? Math.max(0, Math.ceil((s.expires_at - Date.now()) / 86400000)) : null;
              return (
                <button key={s.id} className={`scard ${s.status !== "ok" ? "off" : ""}`} onClick={() => openDetail(s.id)}>
                  {s.cover ? <img src={`/api/admin/thumb?p=${encodeURIComponent(s.cover)}&w=600`} alt="" loading="lazy" /> : <span className="noimg">{s.folders && s.folders.length > 1 ? "COLLECTION" : "EMPTY"}</span>}
                  <span className="sc-top"><span className={`status ${s.status === "ok" ? "ok" : "off"}`}>{s.status === "ok" ? (s.mode === "edit" ? "EDIT" : "READ ONLY") : s.status.toUpperCase()}</span>{s.has_password && <span className="status">🔒</span>}{s.folders && s.folders.length > 1 && <span className="status">{s.folders.length} FOLDERS</span>}</span>
                  <span className="sc-cap"><span className="sc-n">{s.name}</span><span className="sc-m">{s.visits} OPENS · {(s.counts.download || 0) + (s.counts.zip || 0)} DL · {d === null ? "NO EXPIRY" : `${d}D LEFT`}</span></span>
                  <span className="sc-act" onClick={(e) => e.stopPropagation()}><button className="btn sm" onClick={() => setViewing(s)}>VIEW</button><button className="btn sm" onClick={() => openDetail(s.id)}>EDIT</button><button className="btn sm" onClick={() => copy(s.token)}>COPY</button></span>
                </button>
              );
            })}
          </div>}
          {!!shares.length && !grid && <table className="table"><thead><tr><th>NAME</th><th>FOLDER</th><th>MODE</th><th>STATUS</th><th>OPENS</th><th>DL</th><th>EXPIRES</th><th></th></tr></thead><tbody>
            {shares.map((s) => <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => openDetail(s.id)}>
              <td style={{ color: "var(--bright)" }}>{s.name}{s.has_password && <span title="password" style={{ color: "var(--dim)", marginLeft: 8 }}>🔒</span>}</td>
              <td style={{ color: "var(--muted)" }}>{s.paths ? `${JSON.parse(s.paths).length} FOLDERS` : s.path}</td>
              <td>{s.mode.toUpperCase()}</td>
              <td><span className={`status ${s.status === "ok" ? "ok" : "off"}`}>{s.status.toUpperCase()}</span></td>
              <td>{s.visits}</td>
              <td>{(s.counts.download || 0) + (s.counts.zip || 0)}</td>
              <td style={{ color: "var(--muted)" }}>{s.expires_at ? fmt(s.expires_at) : "NEVER"}</td>
              <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <button className="btn sm" onClick={() => copy(s.token)}>COPY</button>{" "}
                <button className={`btn sm ${s.revoked ? "" : "danger"}`} onClick={() => patch(s.id, { revoked: !s.revoked })}>{s.revoked ? "RESTORE" : "REVOKE"}</button>
              </td>
            </tr>)}
          </tbody></table>}
        </> :
        tab === "new" ? <NewShare onDone={(t) => { refresh(); setTab("shares"); copy(t); }} /> :
        tab === "log" ? <>
          <h2 className="h">ACTIVITY</h2>
          <Log events={events} visitors={visitors} me={me} showShare onRename={rename} />
        </> : <Roots />}
      </section>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Detail({ d, onBack, onPatch, onDelete, onCopy, onRename, onView }: { d: { share: ShareRow; events: Ev[]; visitors: Record<string, Vis>; me: string | null }; onBack: () => void; onPatch: (b: object) => void; onDelete: () => void; onCopy: () => void; onRename: (id: string, name: string) => void; onView: () => void }) {
  const s = d.share;
  const [pw, setPw] = useState("");
  const [exp, setExp] = useState(s.expires_at ? new Date(s.expires_at).toISOString().slice(0, 10) : "");
  return <>
    <div className="row"><button className="btn sm" onClick={onBack}>← BACK</button></div>
    <h2 className="h">{s.name.toUpperCase()}</h2>
    <div className="row"><div className="code" onClick={onCopy} style={{ cursor: "pointer", flex: 1 }}>{base()}/s/{s.token}</div><button className="btn pri" onClick={() => onView()}>VIEW</button></div>
    <div className="row" style={{ alignItems: "flex-start" }}>
      <span className="sub">{s.paths ? "FOLDERS" : "FOLDER"}</span>
      {s.paths ? <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{(JSON.parse(s.paths) as string[]).map((p) => <span key={p}>{p}</span>)}</span> : <span>{s.path}</span>}
    </div>
    <div className="row">
      <button className={`pill ${s.mode === "view" ? "on" : ""}`} onClick={() => onPatch({ mode: "view" })}>READ ONLY</button>
      <button className={`pill ${s.mode === "edit" ? "on" : ""}`} onClick={() => onPatch({ mode: "edit" })}>EDIT</button>
      {s.has_password ? <span className="pill on" style={{ cursor: "default" }} title="Required with password">NAME REQUIRED</span> : <button className={`pill ${s.ask_name ? "on" : ""}`} onClick={() => onPatch({ askName: !s.ask_name })} title="Ask visitors for their name once per device">ASK FOR NAME</button>}
      <span style={{ flex: 1 }} />
      <button className={`btn sm ${s.revoked ? "" : "danger"}`} onClick={() => onPatch({ revoked: !s.revoked })}>{s.revoked ? "RESTORE LINK" : "REVOKE LINK"}</button>
      <button className="btn sm danger" onClick={onDelete}>DELETE</button>
    </div>
    <div className="form" style={{ maxWidth: 720 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}><label>EXPIRES</label><div className="row"><input className="in" type="date" value={exp} onChange={(e) => setExp(e.target.value)} style={{ width: 180 }} />{(exp || s.expires_at) && <button className="btn sm" onClick={() => setExp("")}>NEVER</button>}</div></div>
        <div className="field" style={{ flex: 1 }}><label>PASSWORD {s.has_password ? "(SET)" : "(NONE)"}</label>
          {s.has_password && <div className="code" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span style={{ fontSize: 13, letterSpacing: ".08em" }}>{s.password ?? "set before this update — enter a new one to see it"}</span>{s.password && <button className="btn sm" onClick={() => navigator.clipboard.writeText(s.password!)}>COPY</button>}</div>}
          <div className="row"><input className="in" type="text" placeholder={s.has_password ? "change password" : "add password"} value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: 180 }} />{s.has_password && <button className="btn sm" onClick={() => onPatch({ password: null })}>REMOVE</button>}</div>
        </div>
      </div>
      <div className="row">
        <button className="btn pri" onClick={() => { onPatch({ expiresAt: exp ? new Date(exp + "T23:59:59").getTime() : null, ...(pw ? { password: pw } : {}) }); setPw(""); }}>UPDATE</button>
        <span className="sub">OPENED {s.visits}× {s.visit_limit ? `OF ${s.visit_limit}` : ""} · CREATED {fmt(s.created_at)}</span>
      </div>
    </div>
    <h2 className="h" style={{ fontSize: 24 }}>COVER</h2>
    {(s.folders || [s.path]).map((f) => <CoverPicker key={f} folder={f} />)}
    <h2 className="h" style={{ fontSize: 24 }}>LOG</h2>
    <Log events={d.events} visitors={d.visitors} me={d.me} onRename={onRename} />
  </>;
}

function short(ua: string) {
  if (/iPhone/.test(ua)) return "iPhone"; if (/iPad/.test(ua)) return "iPad"; if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac"; if (/Windows/.test(ua)) return "Windows"; return "Other";
}

type AF = { name: string; rel: string; kind: string; size: number; mtime: number };
const fmtSz = (n: number) => n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

function NewShare({ onDone }: { onDone: (token: string) => void }) {
  const [cur, setCur] = useState("");
  const [folders, setFolders] = useState<{ name: string; rel: string; cover?: string | null }[]>([]);
  const [files, setFiles] = useState<AF[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [coll, setColl] = useState<{ rel: string; name: string }[]>([]);
  const collRef = useRef(coll); collRef.current = coll;
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [pwOn, setPwOn] = useState(false);
  const [pw, setPw] = useState("");
  const [exp, setExp] = useState<"24H" | "7D" | "30D" | "NEVER">("7D");
  const [askName, setAskName] = useState(false);
  const [err, setErr] = useState("");
  const [big, setBig] = useState<AF | null>(null);

  const browse = useCallback(async (p: string) => {
    const r = await fetch(`/api/admin/browse?p=${encodeURIComponent(p)}`);
    if (!r.ok) return;
    const j = await r.json();
    setCur(j.path); setFolders(j.folders); setFiles(j.files || []); setCover(j.cover || null);
    if (p && !collRef.current.length) setName(p.split("/").pop() || "");
  }, []);
  useEffect(() => { browse(""); }, []); // eslint-disable-line

  const up = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : "";
  const media = files.filter((f) => f.kind === "image" || f.kind === "video" || f.kind === "raw");
  const total = files.reduce((a, f) => a + f.size, 0);

  async function create() {
    setErr("");
    const r = await fetch("/api/admin/shares", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, path: coll.length ? coll[0].rel : cur, paths: coll.length ? coll.map((c) => c.rel) : undefined, mode, password: pwOn && pw ? pw : undefined, expiresAt: exp === "NEVER" ? null : Date.now() + ({ "24H": 1, "7D": 7, "30D": 30 }[exp]) * 86400000, askName: pwOn || askName }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "FAILED"); return; }
    onDone(j.share.token);
  }

  return <>
    <h2 className="h">NEW SHARE</h2>
    <div className="newshare">
      <div className="form" style={{ maxWidth: "none" }}>
        <div className="field"><label>FOLDER</label>
          <div className="crumbs"><a href="#" onClick={(e) => { e.preventDefault(); browse(""); }}>ROOTS</a>{cur.split("/").filter(Boolean).map((c, i, a) => <span key={i} style={{ display: "contents" }}><span>›</span><a href="#" onClick={(e) => { e.preventDefault(); browse(a.slice(0, i + 1).join("/")); }}>{c.toUpperCase()}</a></span>)}</div>
          <div className="picker tall">
            {cur && <div className="p" onClick={() => browse(up)}>↑ ..</div>}
            {folders.map((f) => { const on = coll.some((c) => c.rel === f.rel); return (
              <div key={f.rel} className={`p ${on ? "picked" : ""}`} onClick={() => browse(f.rel)}>
                <span className={`pbox ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Add ${f.name} to collection`} onClick={(e) => { e.stopPropagation(); const next = on ? coll.filter((c) => c.rel !== f.rel) : [...coll, { rel: f.rel, name: f.name }]; setColl(next); if (next.length) setName(next.length > 1 ? `${next[0].name} + ${next.length - 1}` : next[0].name); }}>{on && <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 6l3 3 5-7" stroke="#0c0c0d" strokeWidth="1.8" fill="none" /></svg>}</span>
                {f.cover ? <img className="pcover" src={`/api/admin/thumb?p=${encodeURIComponent(f.cover)}&w=120`} alt="" /> : <span className="pcover" />}{f.name}
              </div>); })}
            {!folders.length && cur && <div className="p" style={{ color: "var(--dim)" }}>no subfolders</div>}
          </div>
          <span className="sub">{cur ? `SELECTED: ${cur} · ${files.length} FILES · ${fmtSz(total)}` : "PICK A ROOT"}</span>
          <div className="row">
            <button className="btn sm" disabled={!cur || coll.some((c) => c.rel === cur)} onClick={() => { const next = [...coll, { rel: cur, name: cur.split("/").pop() || cur }]; setColl(next); setName(next.length > 1 ? `${next[0].name} + ${next.length - 1}` : next[0].name); }}>+ ADD TO COLLECTION</button>
            {!!coll.length && <span className="sub">{coll.length} FOLDER{coll.length === 1 ? "" : "S"} · ONE LINK</span>}
          </div>
          {!!coll.length && <div className="coll">
            {coll.map((c) => <span key={c.rel} className="chip" title={c.rel}><span className="cn">{c.name}</span><span className="cp">{c.rel.split("/").slice(0, -1).join(" › ")}</span><button aria-label="Remove" onClick={() => setColl(coll.filter((x) => x.rel !== c.rel))}>×</button></span>)}
          </div>}
        </div>
        <div className="field"><label>NAME (SHOWN TO VISITOR)</label><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>MODE</label><div className="row"><button className={`pill ${mode === "view" ? "on" : ""}`} onClick={() => setMode("view")}>READ ONLY</button><button className={`pill ${mode === "edit" ? "on" : ""}`} onClick={() => setMode("edit")}>EDIT</button></div></div>
        <div className="field"><label>EXPIRES</label><div className="row" style={{ gap: 6 }}>{(["24H", "7D", "30D", "NEVER"] as const).map((e) => <button key={e} className={`pill ${exp === e ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setExp(e)}>{e}</button>)}</div></div>
        <div className="opt"><span><div className="n">Password</div><div className="hint">{pwOn ? "REQUIRED TO OPEN" : "ANYONE WITH THE LINK"}</div></span><button className={`sw ${pwOn ? "on" : ""}`} onClick={() => setPwOn(!pwOn)} aria-label="Password"><span /></button></div>
        {pwOn && <input className="in" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" aria-label="Password" autoFocus />}
        {pwOn ? <div className="opt"><span><div className="n">Ask for name</div><div className="hint">REQUIRED WITH PASSWORD</div></span><button className="sw on" disabled aria-label="Ask for name (required with password)"><span /></button></div>
        : <div className="opt"><span><div className="n">Ask for name</div><div className="hint">{askName ? "ONCE PER DEVICE · SHOWS IN LOG" : "LOG SHOWS DEVICE ONLY"}</div></span><button className={`sw ${askName ? "on" : ""}`} onClick={() => setAskName(!askName)} aria-label="Ask for name"><span /></button></div>}
        {err && <span className="err">{err}</span>}
        <button className="btn pri" onClick={create} disabled={(!cur && !coll.length) || !name || (pwOn && !pw)}>{coll.length > 1 ? `CREATE COLLECTION (${coll.length}) & COPY LINK` : "CREATE & COPY LINK"}</button>
      </div>

      <div className="preview">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="sub">PREVIEW {cur ? `· ${cur.split("/").pop()?.toUpperCase()}` : ""}{cover ? ` · COVER: ${cover}` : cur ? " · COVER: AUTO (FIRST PHOTO)" : ""}</span>
          <span className="sub">{media.length} MEDIA · {files.length - media.length} OTHER</span>
        </div>
        {!cur && <div className="sub" style={{ padding: 24, textAlign: "center", color: "var(--faint)" }}>PICK A FOLDER TO PREVIEW ITS CONTENTS</div>}
        {cur && !files.length && <div className="sub" style={{ padding: 24, textAlign: "center", color: "var(--faint)" }}>NO FILES AT THIS LEVEL — {folders.length} SUBFOLDER{folders.length === 1 ? "" : "S"}</div>}
        <div className="ptiles">
          {files.map((f) => {
            const thumbable = f.kind === "image" || f.kind === "video" || f.kind === "raw";
            return (
              <button key={f.rel} className={`tile ${cover === f.name ? "iscover" : ""}`} onClick={() => thumbable && setBig(f)} aria-label={f.name} style={{ cursor: thumbable ? "zoom-in" : "default" }}>
                {f.kind === "image" && <span className={`star ${cover === f.name ? "on" : ""}`} title={cover === f.name ? "Folder cover — click to clear" : "Set as folder cover"} onClick={async (e) => { e.stopPropagation(); const next = cover === f.name ? null : f.name; await fetch("/api/admin/cover", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: cur, file: next }) }); setCover(next); }}><svg width="14" height="14" viewBox="0 0 24 24" fill={cover === f.name ? "var(--amber)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg></span>}
                {thumbable ? <AThumb src={`/api/admin/thumb?p=${encodeURIComponent(f.rel)}&w=400`} ext={f.name.split(".").pop() || ""} /> : <span className="noimg">{(f.name.split(".").pop() || "FILE").toUpperCase()}</span>}
                {f.kind === "video" && <span className="badge"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="var(--amber)" /></svg>VIDEO</span>}
                {f.kind === "raw" && <span className="badge">RAW</span>}
                <span className="cap"><span className="n">{f.name}</span><span className="s">{fmtSz(f.size)}</span></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
    {big && <div className="lb" onClick={() => setBig(null)}>
      <div className="top" onClick={(e) => e.stopPropagation()}><span>{big.name}</span><button className="btn sm" onClick={() => setBig(null)}>CLOSE</button></div>
      <div className="stage"><img src={`/api/admin/thumb?p=${encodeURIComponent(big.rel)}&w=2000`} alt={big.name} /></div>
    </div>}
  </>;
}

function CoverPicker({ folder }: { folder: string }) {
  const [cur, setCur] = useState(folder);
  const [files, setFiles] = useState<AF[]>([]);
  const [subs, setSubs] = useState<{ name: string; rel: string; cover?: string | null }[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const load = useCallback(async (p: string) => { const r = await fetch(`/api/admin/browse?p=${encodeURIComponent(p)}`); if (r.ok) { const j = await r.json(); setCur(j.path); setFiles((j.files || []).filter((f: AF) => f.kind === "image")); setSubs(j.folders || []); setCover(j.cover || null); } }, []);
  useEffect(() => { load(folder); }, [folder, load]);
  async function set(file: string | null) { await fetch("/api/admin/cover", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: cur, file }) }); setCover(file); }
  const inside = cur !== folder;
  return (
    <div className="field">
      <div className="row">
        {inside && <button className="btn sm" onClick={() => load(cur.split("/").slice(0, -1).join("/"))}>↑ UP</button>}
        <span className="sub">{cur.toUpperCase()} · {cover ? `COVER: ${cover}` : "COVER: AUTO (FIRST PHOTO)"}</span>
      </div>
      {!!subs.length && <div className="row" style={{ gap: 6 }}>{subs.map((f) => <button key={f.rel} className="pill" onClick={() => load(f.rel)}>▸ {f.name}</button>)}</div>}
      {!files.length && <span className="sub" style={{ color: "var(--faint)" }}>NO PHOTOS AT THIS LEVEL{subs.length ? " — OPEN A SUBFOLDER TO SET ITS COVER" : ""}</span>}
      <div className="ptiles" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", maxHeight: 260 }}>
        {files.map((f) => (
          <button key={f.rel} className={`tile ${cover === f.name ? "iscover" : ""}`} onClick={() => set(cover === f.name ? null : f.name)} aria-label={`Set ${f.name} as cover`} title={cover === f.name ? "Click to clear" : "Set as cover"}>
            <span className={`star ${cover === f.name ? "on" : ""}`}><svg width="14" height="14" viewBox="0 0 24 24" fill={cover === f.name ? "var(--amber)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg></span>
            <AThumb src={`/api/admin/thumb?p=${encodeURIComponent(f.rel)}&w=300`} ext={f.name.split(".").pop() || ""} />
          </button>
        ))}
      </div>
    </div>
  );
}

function AThumb({ src, ext }: { src: string; ext: string }) {
  const [ok, setOk] = useState(false);
  const [fail, setFail] = useState(false);
  if (fail) return <span className="noimg">{ext.toUpperCase()}</span>;
  return <img src={src} alt="" loading="lazy" className={ok ? "ok" : ""} onLoad={() => setOk(true)} onError={() => setFail(true)} />;
}

function Roots() {
  const [roots, setRoots] = useState<{ name: string; rel: string }[]>([]);
  useEffect(() => { fetch("/api/admin/browse").then((r) => r.json()).then((j) => setRoots(j.folders || [])); }, []);
  return <>
    <h2 className="h">ROOTS</h2>
    <span className="sub">FOLDERS THE APP CAN SEE. EVERYTHING ELSE ON THE NAS IS INVISIBLE TO IT.</span>
    <table className="table"><thead><tr><th>ROOT</th><th>CONTAINER PATH</th></tr></thead><tbody>{roots.map((r) => <tr key={r.rel}><td style={{ color: "var(--bright)" }}>{r.name}</td><td style={{ color: "var(--muted)" }}>/data/{r.rel}</td></tr>)}</tbody></table>
    <div className="form">
      <span className="sub">TO ADD A ROOT, ADD ONE LINE UNDER <b style={{ color: "var(--amber)", fontWeight: 400 }}>volumes:</b> IN docker-compose.yml, THEN RESTART:</span>
      <div className="code">- "/volume1/home/Michael Stine/NEW FOLDER:/data/new-folder:ro"</div>
      <span className="sub">USE :ro FOR READ-ONLY ROOTS (EDIT SHARES WON&apos;T WORK THERE). DROP :ro TO ALLOW EDIT SHARES. REMOVE THE LINE TO REMOVE THE ROOT.</span>
    </div>
  </>;
}
