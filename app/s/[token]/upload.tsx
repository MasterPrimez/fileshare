"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Visitor uploads. Renders the green UPLOAD button (only when the share allows uploads) and the drop splash.
 * Files go to <share upload folder>/<album the visitor names>/, in 20 MB chunks (Cloudflare-safe), add-only.
 */
const CHUNK = 20 * 1024 * 1024;
type Q = { on: boolean; used?: number; limit?: number | null };
type Item = { file: File; done: number; state: "wait" | "up" | "ok" | "err"; msg?: string };
const fmt = (n: number) => n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

export default function Uploader({ token, onDone, say }: { token: string; onDone: (album: string) => void; say: (m: string) => void }) {
  const [q, setQ] = useState<Q | null>(null);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [album, setAlbum] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => { const r = await fetch(`/api/s/${token}/upload`); if (r.ok) setQ(await r.json()); }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { try { setAlbum(localStorage.getItem(`share:album:${token}`) || ""); } catch {} }, [token]);
  useEffect(() => { try { if (album) localStorage.setItem(`share:album:${token}`, album); } catch {} }, [album, token]);

  // drag anywhere on the page → splash
  useEffect(() => {
    if (!q?.on) return;
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); dragDepth.current++; setDrag(true); setOpen(true); };
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!has(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrag(false); };
    const drop = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); dragDepth.current = 0; setDrag(false); setOpen(true); add(collect(e.dataTransfer!)); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [q?.on]); // eslint-disable-line

  function collect(dt: DataTransfer): File[] { return [...dt.files].filter((f) => f.size > 0 && !f.name.startsWith(".")); }
  function add(files: File[]) { if (!files.length) return; setItems((it) => [...it, ...files.map((file) => ({ file, done: 0, state: "wait" as const }))]); }

  // sequential uploader
  useEffect(() => {
    if (busy || !open) return;
    const next = items.findIndex((i) => i.state === "wait");
    if (next < 0) return;
    const alb = (album || "").trim();
    if (!alb) return; // files wait until the album has a name
    setBusy(true);
    (async () => {
      const it = items[next]; const f = it.file; const id = crypto.randomUUID(); const chunks = Math.max(1, Math.ceil(f.size / CHUNK));
      const upd = (p: Partial<Item>) => setItems((arr) => arr.map((x, i) => (i === next ? { ...x, ...p } : x)));
      upd({ state: "up" });
      try {
        for (let c = 0; c < chunks; c++) {
          const blob = f.slice(c * CHUNK, Math.min(f.size, (c + 1) * CHUNK));
          const url = `/api/s/${token}/upload?album=${encodeURIComponent(alb)}&name=${encodeURIComponent(f.name)}&size=${f.size}&id=${id}&chunk=${c}&chunks=${chunks}`;
          await new Promise<void>((res, rej) => {
            const x = new XMLHttpRequest(); x.open("POST", url);
            x.upload.onprogress = (ev) => upd({ done: c * CHUNK + ev.loaded });
            x.onload = () => { if (x.status < 300) res(); else { let m = `FAILED (${x.status})`; try { const j = JSON.parse(x.responseText); if (j.error === "full") m = "ALBUM IS FULL"; } catch {} rej(new Error(m)); } };
            x.onerror = () => rej(new Error("NETWORK"));
            x.send(blob);
          });
        }
        upd({ state: "ok", done: f.size });
      } catch (e) { upd({ state: "err", msg: (e as Error).message }); }
      setBusy(false);
    })();
  }, [items, busy, open, album, token]);

  // all finished → refresh gallery
  const total = items.length, ok = items.filter((i) => i.state === "ok").length, err = items.filter((i) => i.state === "err").length;
  const finished = total > 0 && ok + err === total;
  useEffect(() => { if (finished) { refresh(); } }, [finished, refresh]);
  const sentBytes = items.reduce((a, i) => a + i.done, 0), allBytes = items.reduce((a, i) => a + i.file.size, 0);

  function close() { setOpen(false); if (ok) { say(`${ok} FILE${ok === 1 ? "" : "S"} UPLOADED`); onDone(album.trim()); } setItems([]); }

  if (!q?.on) return null;
  const pct = q.limit ? Math.min(100, (((q.used || 0) + sentBytes) / q.limit) * 100) : 0;
  return <>
    <button className="btn up" onClick={() => setOpen(true)} title="Add your photos and videos to this share"><span className="arr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 17V5m0 0l-5 5m5-5l5 5" /><path d="M4 19h16" /></svg></span>UPLOAD</button>
    {open && createPortal(
      <div className={`drop ${drag ? "drag" : ""}`} onClick={() => { if (!busy) close(); }}>
        <div className="dbox" onClick={(e) => e.stopPropagation()}>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { add([...(e.target.files || [])]); e.target.value = ""; }} />
          <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: "" } as object)} onChange={(e) => { add([...(e.target.files || [])]); e.target.value = ""; }} />
          {!items.length ? <>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0l-5 5m5-5l5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            <h2>{drag ? "DROP IT" : "ADD YOUR FILES"}</h2>
            <div className="s">PHOTOS · VIDEO · ANYTHING</div>
            <label className="alb"><span>ALBUM</span><input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Your name or a title" aria-label="Album name" maxLength={100} /></label>
            <div className="row" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn pri" disabled={!album.trim()} onClick={() => inputRef.current?.click()}>CHOOSE PHOTOS &amp; VIDEOS</button>
              <button className="btn hidephone" disabled={!album.trim()} onClick={() => dirRef.current?.click()}>WHOLE FOLDER</button>
              <button className="btn" onClick={close}>CANCEL</button>
            </div>
            <div className="s hidephone">{album.trim() ? "OR DRAG FILES ANYWHERE ON THIS PAGE" : "NAME YOUR ALBUM FIRST"}</div>
          </> : <>
            <h2 style={{ fontSize: 34 }}>{finished ? (err ? `${ok} OF ${total} UPLOADED` : "DONE") : !album.trim() ? `${total} FILE${total === 1 ? "" : "S"} READY` : `UPLOADING ${ok + 1 > total ? total : ok + 1} / ${total}`}</h2>
            {!album.trim() && <label className="alb"><span>ALBUM</span><input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Your name or a title" aria-label="Album name" maxLength={100} autoFocus /></label>}
            <div className="meter big"><i style={{ width: `${allBytes ? (sentBytes / allBytes) * 100 : 0}%` }} /></div>
            <div className="s">{fmt(sentBytes)} OF {fmt(allBytes)}{album.trim() ? ` · ALBUM: ${album.trim()}` : ""}</div>
            <ul className="ulist">{items.map((i, k) => <li key={k} className={i.state}><span className="n">{i.file.name}</span><span className="st">{i.state === "ok" ? "✓" : i.state === "err" ? i.msg : i.state === "up" ? `${Math.round((i.done / i.file.size) * 100)}%` : "…"}</span></li>)}</ul>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              {finished ? <><button className="btn pri" onClick={close}>DONE</button><button className="btn" onClick={() => { setItems([]); }}>ADD MORE</button></> : <button className="btn" onClick={() => inputRef.current?.click()}>ADD MORE</button>}
            </div>
          </>}
          {q.limit ? <div className="quota"><div className="meter"><i style={{ width: `${pct}%` }} /></div><span className="s">{fmt((q.used || 0) + sentBytes)} OF {fmt(q.limit)} USED</span></div> : null}
        </div>
      </div>, document.body)}
  </>;
}
