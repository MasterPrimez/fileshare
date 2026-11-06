"use client";
import { useCallback, useEffect, useState } from "react";

export type AF = { name: string; rel: string; kind: string; size: number; mtime: number };
export type AFolder = { name: string; rel: string; cover?: string | null };
export const fmtSz = (n: number) => n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

export function AThumb({ src, ext }: { src: string; ext: string }) {
  const [ok, setOk] = useState(false);
  const [fail, setFail] = useState(false);
  if (fail) return <span className="noimg">{ext.toUpperCase()}</span>;
  return <img src={src} alt="" loading="lazy" className={ok ? "ok" : ""} onLoad={() => setOk(true)} onError={() => setFail(true)} />;
}

export function Star({ on }: { on?: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>;
}

/** Pick a cover photo for a root-relative folder; can drill into subfolders. */
export function CoverPicker({ folder, onChange }: { folder: string; onChange?: (folder: string, file: string | null) => void }) {
  const [cur, setCur] = useState(folder);
  const [files, setFiles] = useState<AF[]>([]);
  const [subs, setSubs] = useState<AFolder[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  // `cover` is always the TARGET folder's cover, as a path relative to it (may point into a subfolder)
  const load = useCallback(async (p: string) => { const r = await fetch(`/api/admin/browse?p=${encodeURIComponent(p)}`); if (r.ok) { const j = await r.json(); setCur(j.path); setFiles((j.files || []).filter((f: AF) => f.kind === "image")); setSubs(j.folders || []); if (p === folder) setCover(j.cover || null); } }, [folder]);
  useEffect(() => { load(folder); }, [folder, load]);
  const relOf = (name: string) => (cur === folder ? name : `${cur.slice(folder.length + 1)}/${name}`);
  async function set(file: string | null) { await fetch("/api/admin/cover", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: folder, file }) }); setCover(file); onChange?.(folder, file); }
  const inside = cur !== folder;
  return (
    <div className="field">
      <div className="row">
        {inside && <button className="btn sm" onClick={() => load(cur.split("/").slice(0, -1).join("/"))}>↑ UP</button>}
        <span className="sub">{inside ? `${folder.split("/").pop()?.toUpperCase()} › ${cur.slice(folder.length + 1).toUpperCase()}` : cur.toUpperCase()} · {cover ? `COVER: ${cover}` : "COVER: AUTO (FIRST PHOTO)"}</span>
      </div>
      {!!subs.length && <div className="row" style={{ gap: 6 }}>{subs.map((f) => <button key={f.rel} className="pill" onClick={() => load(f.rel)}>▸ {f.name}</button>)}</div>}
      {!files.length && <span className="sub" style={{ color: "var(--faint)" }}>NO PHOTOS AT THIS LEVEL{subs.length ? " — OPEN A SUBFOLDER AND PICK ONE FROM THERE" : ""}</span>}
      <div className="ptiles" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", maxHeight: 320 }}>
        {files.map((f) => { const rel = relOf(f.name); const on = cover === rel; return (
          <button key={f.rel} className={`tile ${on ? "iscover" : ""}`} onClick={() => set(on ? null : rel)} aria-label={`Set ${f.name} as cover`} title={on ? "Click to clear" : "Set as cover"}>
            <span className={`star ${on ? "on" : ""}`}><Star on={on} /></span>
            <AThumb src={`/api/admin/thumb?p=${encodeURIComponent(f.rel)}&w=300`} ext={f.name.split(".").pop() || ""} />
          </button>
        ); })}
      </div>
    </div>
  );
}

/** Browse roots with a checkbox on every folder. `exclude` = already-chosen folders. */
export function FolderPicker({ exclude = [], onDone, onCancel, label = "ADD" }: { exclude?: string[]; onDone: (rels: string[]) => void; onCancel: () => void; label?: string }) {
  const [cur, setCur] = useState("");
  const [folders, setFolders] = useState<AFolder[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const browse = useCallback(async (p: string) => { const r = await fetch(`/api/admin/browse?p=${encodeURIComponent(p)}`); if (r.ok) { const j = await r.json(); setCur(j.path); setFolders(j.folders); } }, []);
  useEffect(() => { browse(""); }, [browse]);
  const up = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : "";
  const toggle = (rel: string) => setPicked((p) => p.includes(rel) ? p.filter((x) => x !== rel) : [...p, rel]);
  return (
    <div className="modal" onClick={onCancel}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="eyebrow">ADD FOLDERS</span><button className="btn sm" onClick={onCancel}>CLOSE</button></div>
        <div className="crumbs"><a href="#" onClick={(e) => { e.preventDefault(); browse(""); }}>ROOTS</a>{cur.split("/").filter(Boolean).map((c, i, a) => <span key={i} style={{ display: "contents" }}><span>›</span><a href="#" onClick={(e) => { e.preventDefault(); browse(a.slice(0, i + 1).join("/")); }}>{c.toUpperCase()}</a></span>)}</div>
        <div className="picker tall">
          {cur && <div className="p" onClick={() => browse(up)}>↑ ..</div>}
          {folders.map((f) => { const on = picked.includes(f.rel); const dis = exclude.includes(f.rel); return (
            <div key={f.rel} className={`p ${on ? "picked" : ""}`} style={{ opacity: dis ? .45 : 1 }} onClick={() => browse(f.rel)}>
              <span className={`pbox ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-disabled={dis} onClick={(e) => { e.stopPropagation(); if (!dis && cur) toggle(f.rel); }}>{on && <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 6l3 3 5-7" stroke="#0c0c0d" strokeWidth="1.8" fill="none" /></svg>}</span>
              {f.cover ? <img className="pcover" src={`/api/admin/thumb?p=${encodeURIComponent(f.cover)}&w=120`} alt="" /> : <span className="pcover" />}{f.name}{dis && <span className="sub" style={{ marginLeft: "auto", fontSize: 10 }}>IN SHARE</span>}
            </div>); })}
          {!folders.length && cur && <div className="p" style={{ color: "var(--dim)" }}>no subfolders</div>}
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="sub">{cur ? `${picked.length} PICKED` : "OPEN A ROOT, THEN TICK FOLDERS"}</span>
          <div className="row">{cur && !picked.length && !exclude.includes(cur) && <button className="btn sm" onClick={() => onDone([cur])}>{label} THIS FOLDER</button>}<button className="btn pri sm" disabled={!picked.length} onClick={() => onDone(picked)}>{label} {picked.length || ""}</button></div>
        </div>
      </div>
    </div>
  );
}

/** Modal wrapper around CoverPicker. */
export function CoverModal({ folder, onClose }: { folder: string; onClose: (changed: boolean) => void }) {
  const [changed, setChanged] = useState(false);
  return (
    <div className="modal" onClick={() => onClose(changed)}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="eyebrow">FOLDER COVER</span><button className="btn sm" onClick={() => onClose(changed)}>DONE</button></div>
        <CoverPicker folder={folder} onChange={() => setChanged(true)} />
      </div>
    </div>
  );
}
