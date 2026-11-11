"use client";
import Brand from "../../brand";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminStrip from "./adminstrip";
import Tour from "./tour";
import Uploader from "./upload";
import { CoverModal } from "../../admin/pickers";

type Entry = { name: string; rel: string; kind: "folder" | "image" | "video" | "raw" | "audio" | "file"; size: number; mtime: number; count?: number; duration?: number | null; cover?: string | null; alias?: string | null; real?: string; hidden?: boolean };
type Crumb = { rel: string; name: string };
const readUrl = () => { const u = new URL(location.href); return { p: u.searchParams.get("p") || "", f: u.searchParams.get("f") }; };
type View = "grid" | "list" | "columns" | "gallery";
type Filter = "photo" | "video" | "audio" | "other";
const filterOf = (k: Entry["kind"]): Filter | null => k === "image" || k === "raw" ? "photo" : k === "video" ? "video" : k === "audio" ? "audio" : k === "file" ? "other" : null;

function fmtSize(n: number) {
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
function fmtDur(s: number) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`; }
function daysLeft(ts: number | null) { return ts ? Math.max(0, Math.ceil((ts - Date.now()) / 86400000)) : null; }
function fmtDate(ms: number) { return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase(); }
function fmtDT(ms: number) { return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };

export default function Gallery({ token, name, mode, expiresAt, admin, shareId }: { token: string; name: string; mode: "view" | "edit"; expiresAt: number | null; admin?: boolean; shareId?: string }) {
  const [path, setPath] = useState("");
  const [crumbInfo, setCrumbInfo] = useState<Crumb[]>([]);
  const [real, setReal] = useState<string | null>(null);
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [coverFor, setCoverFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const mounted = useRef(false);
  const crumbsRef = useRef<HTMLElement>(null);
  // breadcrumb sheen: each chip shows the same trail-wide reflection, clipped to itself
  useEffect(() => {
    const c = crumbsRef.current; if (!c) return;
    const place = () => { const cr = c.getBoundingClientRect(); c.querySelectorAll<HTMLElement>("a, .cur").forEach((el) => { const r = el.getBoundingClientRect(); el.style.setProperty("--cw", `${cr.width}px`); el.style.setProperty("--cx", `${r.left - cr.left}px`); }); };
    place(); window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [path, crumbInfo]);
  const isLib = token === "library";
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [isColl, setIsColl] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<View>("grid");
  const [cols, setCols] = useState(6);
  const [showHid, setShowHid] = useState(true); // admin: show hidden-from-visitors files (dimmed) // tiles across: 1 = full width … 8 = smallest (phone 1–3)
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [galIdx, setGalIdx] = useState(0);
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    const f = () => setCondensed(window.scrollY > 72);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  const [levels, setLevels] = useState<Record<string, Entry[]>>({});
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const canEdit = mode === "edit";

  // restore prefs
  useEffect(() => {
    const v = ls.get("share:view") as View | null; if (v) setView(v);
    const h = ls.get("share:showhid"); if (h !== null) setShowHid(h !== "0");
    const s = ls.get("share:cols"); if (s) setCols(Math.min(8, Math.max(1, Number(s))));
    const t = ls.get("share:theme") as "dark" | "light" | null;
    if (t) setTheme(t); else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) setTheme("light");
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; ls.set("share:theme", theme); }, [theme]);
  useEffect(() => { ls.set("share:view", view); }, [view]);
  useEffect(() => { ls.set("share:cols", String(cols)); }, [cols]);
  useEffect(() => { ls.set("share:showhid", showHid ? "1" : "0"); }, [showHid]);

  const load = useCallback(async (p: string, quiet = false) => {
    if (!quiet) setEntries(null);
    const r = await fetch(`/api/s/${token}/list?p=${encodeURIComponent(p)}`);
    if (!r.ok) { if (r.status === 401) location.reload(); return; }
    const j = await r.json();
    setEntries(j.entries); setIsColl(!!j.share?.collection); setCrumbInfo(j.crumbs || []); setReal(j.real ?? null); setUploadPath(j.uploadPath ?? null);
    if (!quiet) { setSel(new Set()); setAnchor(null); setGalIdx(0); }
  }, [token]);
  useEffect(() => { if (mounted.current) load(path); }, [path, load]);
  const reload = useCallback(() => load(path, true), [load, path]);

  /** Navigate to a folder: URL + state, so browser back/forward work. */
  const nav = useCallback((p: string) => {
    const u = new URL(location.href);
    if (p) u.searchParams.set("p", p); else u.searchParams.delete("p");
    u.searchParams.delete("f");
    history.pushState({ ...history.state, p, f: undefined }, "", u);
    setOpen(null); setPath(p);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    mounted.current = true;
    try { history.scrollRestoration = "manual"; } catch {}
    const { p, f } = readUrl();
    history.replaceState({ ...history.state, p, f }, "", location.href);
    if (f) setPendingOpen(f);
    if (p) setPath(p); else load("");
    const pop = () => { const { p, f } = readUrl(); setPath((cur) => { if (cur !== p) return p; return cur; }); if (f) setPendingOpen(f); else setOpen(null); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [load]);

  // columns view: fetch every ancestor level (cached)
  useEffect(() => {
    if (view !== "columns") return;
    const parts = path ? path.split("/") : [];
    const want = [""].concat(parts.map((_, i) => parts.slice(0, i + 1).join("/")));
    want.forEach(async (p) => {
      if (levels[p] !== undefined) return;
      const r = await fetch(`/api/s/${token}/list?p=${encodeURIComponent(p)}`);
      if (r.ok) { const j = await r.json(); setLevels((l) => ({ ...l, [p]: j.entries })); }
    });
  }, [view, path, token, levels]);
  // keep current level in sync after loads/edits
  useEffect(() => { if (entries) setLevels((l) => ({ ...l, [path]: entries })); }, [entries, path]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const raw = entries || [];
  const counts = useMemo(() => { const c: Record<Filter, number> = { photo: 0, video: 0, audio: 0, other: 0 }; raw.forEach((e) => { const f = filterOf(e.kind); if (f) c[f]++; }); return c; }, [raw]);
  const all = useMemo(() => { const base = showHid ? raw : raw.filter((e) => !e.hidden); return filters.size ? base.filter((e) => e.kind === "folder" || filters.has(filterOf(e.kind)!)) : base; }, [raw, filters, showHid]);
  const toggleFilter = (f: Filter) => setFilters((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const files = useMemo(() => all.filter((e) => e.kind !== "folder"), [all]);
  const folders = useMemo(() => all.filter((e) => e.kind === "folder"), [all]);
  const media = useMemo(() => files.filter((e) => e.kind === "image" || e.kind === "video" || e.kind === "audio"), [files]);
  const totalSize = files.reduce((a, e) => a + e.size, 0);
  const nImg = files.filter((e) => e.kind === "image" || e.kind === "raw").length;
  const nVid = files.filter((e) => e.kind === "video").length;
  const nAud = files.filter((e) => e.kind === "audio").length;
  const newest = files.reduce((a, e) => Math.max(a, e.mtime), 0);

  // deep link / history: open the lightbox on a file once its folder is loaded
  useEffect(() => {
    if (!pendingOpen || !entries) return;
    const i = media.findIndex((m) => m.rel === pendingOpen);
    setPendingOpen(null);
    if (i >= 0) setOpen(i);
  }, [entries, pendingOpen, media]);
  const openLb = useCallback((i: number) => {
    const m = media[i]; if (!m) return;
    const u = new URL(location.href); u.searchParams.set("f", m.rel);
    history.pushState({ ...history.state, p: path, f: m.rel }, "", u);
    setOpen(i);
  }, [media, path]);
  const closeLb = useCallback(() => { if (history.state?.f) history.back(); else setOpen(null); }, []);
  // when the lightbox closes, bring the page to the photo you were on (instead of the browser's old scroll spot)
  const lastOpen = useRef<string | null>(null);
  useEffect(() => { if (open !== null && media[open]) lastOpen.current = media[open].rel; }, [open, media]);
  useEffect(() => {
    try { history.scrollRestoration = "manual"; } catch {}
    if (open !== null || !lastOpen.current) return;
    const rel = lastOpen.current; lastOpen.current = null;
    const i = media.findIndex((m) => m.rel === rel); if (i >= 0) setGalIdx(i);
    // after the browser has finished any history scroll restore
    setTimeout(() => {
      const el = [...document.querySelectorAll<HTMLElement>(".tile, .flist tr, .mi, .strip .st")].find((n) => n.getAttribute("aria-label") === media[i]?.name || n.getAttribute("title") === media[i]?.name || n.querySelector(".nm, .mn")?.textContent === media[i]?.name);
      el?.scrollIntoView({ block: "center" });
    }, 40);
  }, [open, media]);
  const stepLb = useCallback((i: number) => { const m = media[i]; if (!m) return; const u = new URL(location.href); u.searchParams.set("f", m.rel); history.replaceState({ ...history.state, p: path, f: m.rel }, "", u); setOpen(i); }, [media, path]);

  // preview a file clicked in an ancestor column once its folder is loaded
  useEffect(() => {
    if (!pendingPreview || !entries) return;
    const i = media.findIndex((m) => m.rel === pendingPreview);
    if (i >= 0) setGalIdx(i);
    setPendingPreview(null);
  }, [entries, pendingPreview, media]);

  /** Click-to-select with shift (range from anchor) and cmd/ctrl (toggle). */
  function select(rel: string, ev?: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    const order = all.map((e) => e.rel);
    setSel((s) => {
      const n = new Set(s);
      if (ev?.shiftKey && anchor) {
        const a = order.indexOf(anchor), b = order.indexOf(rel);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) n.add(order[i]);
        return n;
      }
      n.has(rel) ? n.delete(rel) : n.add(rel);
      return n;
    });
    if (!ev?.shiftKey) setAnchor(rel);
  }
  function toggleAll() { setSel((s) => s.size === all.length ? new Set() : new Set(all.map((e) => e.rel))); }

  async function zip(paths: string[]) {
    setBusy("zip");
    const r = await fetch(`/api/s/${token}/zip`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) });
    if (!r.ok) { setBusy(""); say("ZIP FAILED"); return; }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const cd = r.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*=UTF-8''(.+)$/);
    a.download = m ? decodeURIComponent(m[1]) : `${name}.zip`;
    a.click();
    setBusy("");
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    let n = 0;
    for (const f of Array.from(list)) {
      setBusy(`UPLOADING ${++n}/${list.length}`);
      const p = path ? `${path}/${f.name}` : f.name;
      await fetch(`/api/s/${token}/edit?p=${encodeURIComponent(p)}`, { method: "PUT", body: f });
    }
    setBusy(""); say(`${list.length} UPLOADED`); load(path);
  }
  async function del() {
    if (!sel.size || !confirm(`Delete ${sel.size} item(s)? This cannot be undone.`)) return;
    setBusy("deleting");
    await fetch(`/api/s/${token}/edit`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: [...sel] }) });
    setBusy(""); say("DELETED"); load(path);
  }

  const crumbs = path ? path.split("/") : [];
  const d = daysLeft(expiresAt);

  // keyboard: lightbox nav, gallery nav, select-all
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && open === null) { e.preventDefault(); setSel(new Set(all.map((x) => x.rel))); return; }
      if (open !== null) {
        if (e.key === "Escape") closeLb();
        if (e.key === "ArrowRight") stepLb(Math.min(media.length - 1, open + 1));
        if (e.key === "ArrowLeft") stepLb(Math.max(0, open - 1));
      } else if (view === "gallery") {
        if (e.key === "ArrowRight") setGalIdx((i) => Math.min(media.length - 1, i + 1));
        if (e.key === "ArrowLeft") setGalIdx((i) => Math.max(0, i - 1));
      } else if (view === "columns") {
        if (e.key === "ArrowDown") { e.preventDefault(); setGalIdx((i) => Math.min(media.length - 1, i + 1)); }
        if (e.key === "ArrowUp") { e.preventDefault(); setGalIdx((i) => Math.max(0, i - 1)); }
        if (e.key === "Enter" && media.length) openLb(galIdx);
        if (e.key === " " && media.length) { e.preventDefault(); if (open === null) openLb(galIdx); else closeLb(); }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, media.length, view, all, galIdx, openLb, closeLb, stepLb]);

  const cur = open !== null ? media[open] : null;
  useEffect(() => { if (view === "columns") document.querySelector(".mi.cur")?.scrollIntoView({ block: "nearest" }); }, [galIdx, view]);
  const thumbUrl = (rel: string, w = 600) => `/api/s/${token}/thumb?p=${encodeURIComponent(rel)}&w=${w}`;
  const fileUrl = (rel: string, dl = false) => `/api/s/${token}/file?p=${encodeURIComponent(rel)}${dl ? "&dl=1" : ""}`;

  function openEntry(e: Entry, ev: React.MouseEvent) {
    if (e.kind === "folder") { nav(e.rel); return; }
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) { select(e.rel, ev); return; }
    const mi = media.findIndex((m) => m.rel === e.rel);
    if (mi >= 0) { if (view === "gallery") setGalIdx(mi); else openLb(mi); } else select(e.rel, ev);
  }

  const gal = media[galIdx];

  // ---- admin-only actions (blue layer) ----
  async function renameFolder(e: Entry, newName: string) {
    setRenaming(null);
    if (!e.real || newName === e.name) return;
    const r = await fetch("/api/admin/alias", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: e.real, name: newName === (e.real.split("/").pop() || "") ? null : newName }) });
    say(r.ok ? "RENAMED" : "RENAME FAILED"); setLevels({}); reload();
  }
  async function removeFolder(e: Entry) {
    if (!shareId || !e.real || !confirm(`Remove "${e.name}" from this share? The folder stays on the NAS.`)) return;
    const d = await fetch(`/api/admin/shares/${shareId}`); if (!d.ok) return;
    const folders: string[] = (await d.json()).share.folders;
    const r = await fetch(`/api/admin/shares/${shareId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: folders.filter((f) => f !== e.real) }) });
    say(r.ok ? "REMOVED" : "FAILED"); setLevels({}); reload();
  }
  async function hide(list: Entry[], hidden: boolean) {
    const paths = list.map((e) => e.real).filter(Boolean);
    if (!paths.length) return;
    const r = await fetch("/api/admin/hide", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths, hidden }) });
    say(r.ok ? (hidden ? `${paths.length} HIDDEN FROM VISITORS` : `${paths.length} VISIBLE AGAIN`) : "FAILED"); setSel(new Set()); setLevels({}); reload();
  }
  const selEntries = all.filter((e) => sel.has(e.rel) && e.kind !== "folder");
  const inUploads = (e: Entry) => !!uploadPath && !!e.real && e.real.startsWith(uploadPath + "/");
  const selUploads = all.filter((e) => sel.has(e.rel) && inUploads(e));
  async function trash(list: Entry[]) {
    const paths = list.map((e) => e.real).filter(Boolean);
    if (!paths.length || !shareId) return;
    if (!confirm(`Remove ${paths.length === 1 ? `"${list[0].name}"` : `${paths.length} items`} from this share?\nMoved to a hidden .trash folder inside the uploads folder — recoverable in UGOS Files.`)) return;
    const r = await fetch("/api/admin/trash", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ shareId, paths }) });
    say(r.ok ? `${paths.length} REMOVED` : "FAILED"); setSel(new Set()); setLevels({}); reload();
  }
  const nHidden = raw.filter((e) => e.hidden).length;
  const canRemove = !!admin && !isLib && isColl && !path && folders.length > 1;
  const canRename = (e: Entry) => !!admin && e.kind === "folder" && !!e.real && e.real.includes("/");
  const adminTile = admin ? { renaming, onCover: (e: Entry) => e.real && setCoverFor(e.real), onRenameStart: (e: Entry) => canRename(e) && setRenaming(e.rel), onRename: renameFolder, onRemove: canRemove ? removeFolder : undefined, canRename, onHide: (e: Entry) => hide([e], !e.hidden), onTrash: (e: Entry) => trash([e]), canTrash: inUploads } : undefined;

  return (
    <div className="page">
      {admin && shareId && <AdminStrip token={token} shareId={shareId} real={real} onChanged={() => { setLevels({}); reload(); }} />}
      <header className="hdr">
        <span onClick={(e) => { if (!admin) { e.preventDefault(); nav(""); } }} style={{ display: "contents" }}><Brand tag="SHARE" href={admin ? "/admin" : `/s/${token}`} /></span>
        <div style={{ flex: "1 1 200px" }} />
        <span className={`pill ${canEdit ? "" : "on"}`} style={{ cursor: "default" }}>{canEdit ? "EDIT ACCESS" : "READ ONLY"}</span>
        <div className="meta">
          {d !== null && <span>EXPIRES <b>{d} DAY{d === 1 ? "" : "S"}</b></span>}
          <span>{fmtSize(totalSize)}</span>
        </div>
        <button className="ico" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle light/dark" title="Light / dark">
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
      </header>

      <div className={`stickyhd ${condensed ? "condensed" : ""}`}>
      <div className="bar">
        <div className="titleblock">
          <div className="titlerow">
            <h1 className="title">{(crumbs.length ? (crumbInfo[crumbs.length - 1]?.name || crumbs[crumbs.length - 1]) : name).toUpperCase()}</h1>
            {entries && <span className="sub">{isColl && !path ? `${folders.length} FOLDERS` : `${files.length} FILES`}{nImg ? ` · ${nImg} PHOTOS` : ""}{nVid ? ` · ${nVid} VIDEOS` : ""}{nAud ? ` · ${nAud} AUDIO` : ""}{newest ? ` · ${fmtDate(newest)}` : ""}</span>}
          </div>
          <nav className="crumbs chips" ref={crumbsRef} key={path}>
            <a href="#" onClick={(e) => { e.preventDefault(); nav(""); }} style={{ ["--w" as string]: crumbs.length ? 0.3 : 1 }}>{name.toUpperCase()}</a>
            {crumbs.map((c, i) => {
              const to = crumbs.slice(0, i + 1).join("/");
              const last = i === crumbs.length - 1;
              const label = (crumbInfo[i]?.name || c).toUpperCase();
              const w = 0.3 + 0.7 * ((i + 1) / crumbs.length); // reflection brightens toward the current folder
              return <span key={to} style={{ display: "contents" }}><span>›</span>{last ? <span className="cur" style={{ ["--w" as string]: w }}>{label}</span> : <a href="#" onClick={(e) => { e.preventDefault(); nav(to); }} style={{ ["--w" as string]: w }}>{label}</a>}</span>;
            })}
          </nav>
        </div>
        <div className="actions">
          {!isLib && <Uploader token={token} say={say} onDone={() => { setLevels({}); reload(); }} />}
          <button className="btn" onClick={toggleAll} disabled={!all.length}>{sel.size && sel.size === all.length ? "CLEAR" : "SELECT ALL"}</button>
          {sel.size > 0 && <button className="btn" onClick={() => zip([...sel])} disabled={!!busy}>DOWNLOAD SELECTED ({sel.size})</button>}
          {admin && selUploads.length > 0 && <button className="btn blue danger" onClick={() => trash(selUploads)} title="Remove visitor uploads (moved to .trash)">REMOVE ({selUploads.length})</button>}
          {admin && selEntries.length > 0 && <button className="btn blue" onClick={() => hide(selEntries, !selEntries.every((e) => e.hidden))} title="Hide from every visitor — files stay on the NAS">{selEntries.every((e) => e.hidden) ? `SHOW (${selEntries.length})` : `HIDE (${selEntries.length})`}</button>}
          {canEdit && !(isColl && !path) && <>
            <input ref={fileIn} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            <button className="btn" onClick={() => fileIn.current?.click()} disabled={!!busy}>UPLOAD</button>
            {sel.size > 0 && <button className="btn danger" onClick={del} disabled={!!busy}>DELETE</button>}
          </>}
          <button className="btn pri" onClick={() => zip(path ? [path] : [])} disabled={!!busy}>{busy === "zip" ? "ZIPPING…" : "DOWNLOAD ALL · ZIP"}</button>
        </div>
      </div>

      <div className="viewbar">
        <div className="vgroup">
        <div className="seg" role="tablist" aria-label="View">
          {(["grid", "list", "columns", "gallery"] as View[]).map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)} aria-label={v} title={v[0].toUpperCase() + v.slice(1)}>
              {v === "grid" ? <IGrid /> : v === "list" ? <IList /> : v === "columns" ? <ICols /> : <IGal />}
            </button>
          ))}
        </div>
        <div className="seg filt" role="group" aria-label="Filter by type">
          {([["photo", "PHOTOS"], ["video", "VIDEOS"], ["audio", "AUDIO"], ["other", "FILES"]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} className={filters.has(f) ? "on" : ""} onClick={() => toggleFilter(f)} disabled={!counts[f]} aria-pressed={filters.has(f)} title={label}>
              {f === "photo" ? <IPhoto /> : f === "video" ? <IVideo /> : f === "audio" ? <IAudio /> : <IFile />}<span className="cnt">{counts[f]}</span>
            </button>
          ))}
        </div>
        </div>
        {(view === "grid" || view === "gallery") && (<>
          {admin && nHidden > 0 && <label className={`hidtog ${showHid ? "on" : "off"}`} title="Hidden photos are invisible to visitors. Tick to see them here (dimmed)."><input type="checkbox" checked={showHid} onChange={(e) => setShowHid(e.target.checked)} /><span className="bx">{showHid && <svg width="10" height="10" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 6l3 3 5-7" stroke="#0c0c0d" strokeWidth="1.8" fill="none" /></svg>}</span>SHOW HIDDEN · {nHidden}</label>}
          <label className="slider" title={`${cols} across`}><IGrid small /><input type="range" min={1} max={8} step={1} value={9 - cols} onChange={(e) => setCols(9 - Number(e.target.value))} aria-label="Tiles across" /><IGrid /></label></>
        )}
        <span className="sub" style={{ marginLeft: "auto" }}>{sel.size ? `${sel.size} SELECTED` : filters.size ? `SHOWING ${[...filters].map((f) => f.toUpperCase()).join(" + ")} · ${files.length}` : "CLICK TO OPEN · ⇧ SHIFT-CLICK RANGE · ⌘-CLICK TOGGLE"}</span>
      </div>
      </div>

      <main className="grid">
        {!entries && <div className="sub">LOADING…</div>}
        {entries && !entries.length && <div className="sub">EMPTY FOLDER</div>}

        {view === "grid" && (
          <div className="tiles" style={{ ["--cols" as string]: cols }}>
            {all.map((e) => <Tile key={e.rel} e={e} isSel={sel.has(e.rel)} thumb={thumbUrl(e.rel)} video={e.kind === "video" ? fileUrl(e.rel) : undefined} onOpen={openEntry} onSelect={select} adm={adminTile} />)}
          </div>
        )}

        {view === "list" && !!all.length && (
          <table className="flist">
            <thead><tr><th style={{ width: 28 }}></th><th style={{ width: 56 }}></th><th>NAME</th><th>KIND</th><th>SIZE</th><th>MODIFIED</th></tr></thead>
            <tbody>
              {all.map((e) => {
                const isSel = sel.has(e.rel);
                return (
                  <tr key={e.rel} className={`${isSel ? "sel" : ""} ${e.hidden ? "hid" : ""}`} onClick={(ev) => openEntry(e, ev)} onContextMenu={(ev) => { ev.preventDefault(); select(e.rel, ev); }}>
                    <td><span className="box" onClick={(ev) => { ev.stopPropagation(); select(e.rel, ev); }}>{isSel && <Check />}</span></td>
                    <td>{e.kind === "folder" ? <span className="mini folder"><svg width="18" height="14" viewBox="0 0 28 22" aria-hidden="true"><path d="M1 4a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="none" stroke="var(--amber)" strokeWidth="1.5" /></svg></span>
                      : (e.kind === "image" || e.kind === "video" || e.kind === "raw") ? <span className="miniwrap"><img className="mini" src={thumbUrl(e.rel, 120)} alt="" loading="lazy" />{e.kind === "video" && <span className="cam"><Play /></span>}</span> : <span className="mini">{(e.name.split(".").pop() || "").toUpperCase()}</span>}</td>
                    <td className="nm">{adminTile && renaming === e.rel ? <RenameBox name={e.name} onDone={(n) => renameFolder(e, n)} /> : <>{e.name}{adminTile && canRename(e) && <span className="apencil" title="Rename (display only)" onClick={(ev) => { ev.stopPropagation(); setRenaming(e.rel); }}>✎</span>}</>}</td>
                    <td className="dim">{e.kind === "folder" ? `FOLDER · ${e.count}` : (e.kind === "video" || e.kind === "audio") && e.duration ? `${e.kind.toUpperCase()} · ${fmtDur(e.duration)}` : e.kind.toUpperCase()}{adminTile && e.kind !== "folder" && <span className="apencil" title={e.hidden ? "Show to visitors" : "Hide from visitors"} onClick={(ev) => { ev.stopPropagation(); hide([e], !e.hidden); }}>{e.hidden ? <IEye /> : <IEyeOff />}</span>}</td>
                    <td className="dim">{e.kind === "folder" ? "—" : fmtSize(e.size)}</td>
                    <td className="dim">{fmtDT(e.mtime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {view === "columns" && (() => {
          const parts = path ? path.split("/") : [];
          const keys = [""].concat(parts.map((_, i) => parts.slice(0, i + 1).join("/")));
          return (
            <div className="miller">
              {keys.map((k, li) => {
                const ents = levels[k];
                const nextKey = keys[li + 1];
                return (
                  <div className="mcol" key={k || "__root"}>
                    {!ents && <div className="sub" style={{ padding: 12 }}>…</div>}
                    {ents && ents.map((e) => {
                      const isPath = e.kind === "folder" && e.rel === nextKey;
                      const isCur = k === path && e.kind !== "folder" && gal?.rel === e.rel;
                      const isSel = sel.has(e.rel);
                      return (
                        <div key={e.rel} className={`mi ${isPath ? "path" : ""} ${isCur ? "cur" : ""} ${isSel ? "sel" : ""}`}
                          onClick={(ev) => {
                            if (e.kind === "folder") { nav(e.rel); return; }
                            if (ev.shiftKey || ev.metaKey || ev.ctrlKey) { if (k === path) select(e.rel, ev); return; }
                            if (k === path) { const mi = media.findIndex((m) => m.rel === e.rel); if (mi >= 0) setGalIdx(mi); else select(e.rel, ev); }
                            else { setPendingPreview(e.rel); nav(k); }
                          }}
                          onContextMenu={(ev) => { ev.preventDefault(); if (k === path) select(e.rel, ev); }}
                          onDoubleClick={() => { if (k === path && e.kind !== "folder") { const mi = media.findIndex((m) => m.rel === e.rel); if (mi >= 0) openLb(mi); } }}>
                          {e.kind === "folder"
                            ? (e.cover ? <img className="fic" src={thumbUrl(e.cover, 120)} alt="" loading="lazy" /> : <svg className="fic" width="16" height="13" viewBox="0 0 28 22" aria-hidden="true"><path d="M1 4a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="currentColor" /></svg>)
                            : (e.kind === "image" || e.kind === "video" || e.kind === "raw") ? <span className="ficwrap"><img className="fic" src={thumbUrl(e.rel, 120)} alt="" loading="lazy" />{e.kind === "video" && <span className="cam xs"><Play /></span>}</span> : <span className="fic doc" />}
                          <span className="mn">{e.name}</span>
                          {e.kind === "folder" ? <span className="chev">›</span> : isSel ? <span className="chk"><Check /></span> : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <div className="mprev">
                {gal ? <>
                  {gal.kind === "video" ? <video key={gal.rel} src={fileUrl(gal.rel)} controls playsInline /> : gal.kind === "audio" ? <AudioCard e={gal} src={fileUrl(gal.rel)} /> : <img key={gal.rel} src={thumbUrl(gal.rel, 800)} alt={gal.name} onClick={() => openLb(galIdx)} style={{ cursor: "zoom-in" }} />}
                  <div className="minfo">
                    <b>{gal.name}</b>
                    <span>{gal.kind.toUpperCase()}{gal.kind === "video" && gal.duration ? ` · ${fmtDur(gal.duration)}` : ""}</span>
                    <span>{fmtSize(gal.size)}</span>
                    <span>{fmtDT(gal.mtime)}</span>
                    <a className="btn sm" href={fileUrl(gal.rel, true)}>DOWNLOAD</a>
                  </div>
                </> : <div className="sub" style={{ padding: 24, textAlign: "center" }}>{files.length ? "SELECT A FILE" : "OPEN A FOLDER"}</div>}
              </div>
            </div>
          );
        })()}

        {view === "gallery" && (
          <div className="galview">
            <div className="stage" onClick={() => gal && openLb(galIdx)}>
              {gal ? (gal.kind === "video" ? <video key={gal.rel} src={fileUrl(gal.rel)} controls playsInline onClick={(e) => e.stopPropagation()} /> : gal.kind === "audio" ? <span onClick={(e) => e.stopPropagation()}><AudioCard e={gal} src={fileUrl(gal.rel)} /></span> : <img key={gal.rel} src={thumbUrl(gal.rel, 1600)} alt={gal.name} />) : <div className="sub">{folders.length ? "OPEN A FOLDER BELOW" : "NO MEDIA HERE"}</div>}
              {galIdx > 0 && <button className="nav l" onClick={(e) => { e.stopPropagation(); setGalIdx(galIdx - 1); }} aria-label="Previous">‹</button>}
              {galIdx < media.length - 1 && <button className="nav r" onClick={(e) => { e.stopPropagation(); setGalIdx(galIdx + 1); }} aria-label="Next">›</button>}
            </div>
            {gal && <div className="info"><b>{gal.name}</b><span>{galIdx + 1} / {media.length} · {fmtSize(gal.size)}</span><a className="btn sm" href={fileUrl(gal.rel, true)}>DOWNLOAD</a></div>}
            <div className="strip" style={{ height: Math.max(72, Math.round((9 - cols) * 26)) }}>
              {folders.map((f) => <button key={f.rel} className="st folder" onClick={() => nav(f.rel)} title={f.name}>{f.cover && <img src={thumbUrl(f.cover, 240)} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: .45 }} />}<svg width="22" height="18" viewBox="0 0 28 22" aria-hidden="true"><path d="M1 4a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="none" stroke="var(--amber)" strokeWidth="1.5" /></svg><span>{f.name}</span></button>)}
              {media.map((m, i) => <button key={m.rel} className={`st ${i === galIdx ? "cur" : ""} ${sel.has(m.rel) ? "sel" : ""}`} onClick={(ev) => { if (ev.shiftKey || ev.metaKey || ev.ctrlKey) select(m.rel, ev); else setGalIdx(i); }} onContextMenu={(ev) => { ev.preventDefault(); select(m.rel, ev); }} title={m.name}>{m.kind === "audio" ? <span className="noimg" style={{ fontSize: 14 }}><IAudio /></span> : <img src={thumbUrl(m.rel, 240)} alt="" loading="lazy" />}{m.kind === "video" && <span className="cam st-cam"><Play /></span>}{sel.has(m.rel) && <span className="box"><Check /></span>}</button>)}
            </div>
          </div>
        )}
      </main>

      <footer className="ftr">
        <span>SHARED BY MICHAEL STINE</span><span>·</span><span>{canEdit ? "EDIT ACCESS — UPLOAD, DELETE" : "READ ONLY — VIEW AND DOWNLOAD"}</span><span style={{ flex: 1 }} /><span>share.michaelstine.net</span>
      </footer>

      {cur && (
        <div className="lb" onClick={closeLb}>
          <div className="top" onClick={(e) => e.stopPropagation()}>
            <span>{open! + 1} / {media.length} — {cur.name}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <a className="btn sm" href={fileUrl(cur.rel, true)}>DOWNLOAD</a>
              <button className="btn sm" onClick={closeLb}>CLOSE</button>
            </span>
          </div>
          <div className="stage">
            {cur.kind === "video"
              ? <video key={cur.rel} src={fileUrl(cur.rel)} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
              : cur.kind === "audio" ? <AudioCard e={cur} src={fileUrl(cur.rel)} autoPlay />
              : <img key={cur.rel} src={thumbUrl(cur.rel, 2000)} alt={cur.name} />}
          </div>
          {open! > 0 && <button className="nav l" onClick={(e) => { e.stopPropagation(); stepLb(open! - 1); }} aria-label="Previous">‹</button>}
          {open! < media.length - 1 && <button className="nav r" onClick={(e) => { e.stopPropagation(); stepLb(open! + 1); }} aria-label="Next">›</button>}
        </div>
      )}

      {(toast || (busy && busy !== "zip")) && <div className="toast">{toast || busy.toUpperCase()}</div>}
      {!admin && entries && <Tour />}
      {coverFor && <CoverModal folder={coverFor} onClose={(changed) => { setCoverFor(null); if (changed) { setLevels({}); reload(); } }} />}
    </div>
  );
}

type AdmTile = { renaming: string | null; onCover: (e: Entry) => void; onRenameStart: (e: Entry) => void; onRename: (e: Entry, name: string) => void; onRemove?: (e: Entry) => void; canRename: (e: Entry) => boolean; onHide: (e: Entry) => void; onTrash: (e: Entry) => void; canTrash: (e: Entry) => boolean };

function RenameBox({ name, onDone }: { name: string; onDone: (n: string) => void }) {
  const [v, setV] = useState(name);
  return <input className="arename" value={v} autoFocus onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter") onDone(v.trim() || name); if (e.key === "Escape") onDone(name); }} onBlur={() => onDone(v.trim() || name)} aria-label="Display name" />;
}

function Tile({ e, isSel, thumb, video, onOpen, onSelect, adm }: { e: Entry; isSel: boolean; thumb: string; video?: string; onOpen: (e: Entry, ev: React.MouseEvent) => void; onSelect: (rel: string, ev: React.MouseEvent) => void; adm?: AdmTile }) {
  const thumbable = e.kind === "image" || e.kind === "video" || e.kind === "raw";
  if (e.kind === "folder") {
    const renaming = adm?.renaming === e.rel;
    return (
    <button className={`tile folder ${isSel ? "sel" : ""} ${e.cover ? "hascover" : ""} ${adm ? "adm" : ""}`} onClick={(ev) => { if (!renaming) onOpen(e, ev); }} onContextMenu={(ev) => { ev.preventDefault(); onSelect(e.rel, ev); }} aria-label={e.name}>
      {e.cover && <img className="coverimg" src={thumb.replace(encodeURIComponent(e.rel), encodeURIComponent(e.cover))} alt="" loading="lazy" />}
      <svg width="28" height="22" viewBox="0 0 28 22" aria-hidden="true"><path d="M1 4a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="none" stroke="var(--amber)" strokeWidth="1.5" /></svg>
      {adm ? <span className="ahover" onClick={(ev) => ev.stopPropagation()}>
        {e.real && <span className={e.cover ? "on" : ""} title="Folder cover" onClick={() => adm.onCover(e)}><svg width="12" height="12" viewBox="0 0 24 24" fill={e.alias === undefined ? "none" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg></span>}
        {adm.canRename(e) && <span title="Rename (display only — disk unchanged)" onClick={() => adm.onRenameStart(e)}>✎</span>}
        {adm.onRemove && <span className="rm" title="Remove from this share" onClick={() => adm.onRemove!(e)}>✕</span>}
        {adm.canTrash(e) && <span className="rm" title="Delete this uploaded album (moved to .trash)" onClick={() => adm.onTrash(e)}><ITrash /></span>}
      </span> : <span className="box" onClick={(ev) => { ev.stopPropagation(); onSelect(e.rel, ev); }}>{isSel && <Check />}</span>}
      <span className="cap">{renaming ? <RenameBox name={e.name} onDone={(n) => adm!.onRename(e, n)} /> : <span className="n" title={e.alias ? `Folder on disk: ${e.real?.split("/").pop()}` : undefined}>{e.name.toUpperCase()}{e.alias && adm && <i className="aliasdot" title="Renamed for visitors" />}</span>}<span className="s">{e.count} ITEMS</span></span>
    </button>
  ); }
  return (
    <button className={`tile ${isSel ? "sel" : ""} ${e.hidden ? "hid" : ""} ${adm ? "adm" : ""}`} onClick={(ev) => onOpen(e, ev)} onContextMenu={(ev) => { ev.preventDefault(); onSelect(e.rel, ev); }} aria-label={e.name}>
      {thumbable ? <Thumb src={thumb} ext={e.name.split(".").pop() || ""} /> : <span className="noimg">{(e.name.split(".").pop() || "FILE").toUpperCase()}</span>}
      {e.kind === "video" && video && <Scrub src={video} />}
      {adm && <span className="ahover file" onClick={(ev) => ev.stopPropagation()}><span className={e.hidden ? "on" : ""} title={e.hidden ? "Show to visitors" : "Hide from visitors (stays on the NAS)"} onClick={() => adm.onHide(e)}>{e.hidden ? <IEye /> : <IEyeOff />}</span>{adm.canTrash(e) && <span className="rm" title="Delete this upload (moved to .trash)" onClick={() => adm.onTrash(e)}><ITrash /></span>}</span>}
      {e.kind === "video" && <span className="badge"><Play />{e.duration ? fmtDur(e.duration) : "VIDEO"}</span>}
      {e.kind === "raw" && <span className="badge">RAW</span>}
      {e.kind === "audio" && <span className="badge"><IAudio />{e.duration ? fmtDur(e.duration) : "AUDIO"}</span>}
      {e.hidden && <span className="badge hidbadge">HIDDEN</span>}
      <span className="box" onClick={(ev) => { ev.stopPropagation(); onSelect(e.rel, ev); }}>{isSel && <Check />}</span>
      <span className="cap"><span className="n">{e.name}</span><span className="s">{fmtSize(e.size)}</span></span>
    </button>
  );
}

/** Hover-scrub for video tiles: mouse X = position in the clip; red bar tracks the playhead. Video only loads on first hover. */
function Scrub({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);
  const seek = (ev: React.MouseEvent) => {
    const v = ref.current; if (!v || !v.duration) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    v.currentTime = f * v.duration; setPct(f * 100);
  };
  return (
    <span className={`scrub ${on ? "on" : ""} ${ready ? "ready" : ""}`} onMouseEnter={() => setOn(true)} onMouseLeave={() => { setOn(false); setPct(0); }} onMouseMove={seek}>
      {on && <video ref={ref} src={src + "#t=0.001"} muted playsInline preload="metadata" onLoadedData={() => setReady(true)} />}
      <i className="phead" style={{ width: `${pct}%` }} />
    </span>
  );
}

function AudioCard({ e, src, autoPlay }: { e: Entry; src: string; autoPlay?: boolean }) {
  return (
    <div className="audiocard">
      <IAudio big />
      <b>{e.name}</b>
      <audio key={e.rel} src={src} controls autoPlay={autoPlay} style={{ width: "100%" }} />
    </div>
  );
}

function ITrash() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>; }
function IEye() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>; }
function IEyeOff() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.3A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.8 8.4 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>; }
function Check() { return <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 6l3 3 5-7" stroke="#0c0c0d" strokeWidth="1.8" fill="none" /></svg>; }
function Play() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="M15 10l7-3v10l-7-3z" /></svg>; }
function Sun() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>; }
function Moon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>; }
function IGrid({ small }: { small?: boolean }) { const s = small ? 10 : 14; return <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>; }
function IPhoto() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>; }
function IVideo() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="M15 10l7-3v10l-7-3z" /></svg>; }
function IAudio({ big }: { big?: boolean }) { const s = big ? 40 : 14; return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 12h2l2-5 3 10 3-14 3 14 2-5h3" /></svg>; }
function IFile() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M14 2v5h5" /></svg>; }
function IList() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" /><rect x="1" y="12" width="14" height="2" rx="1" /></svg>; }
function ICols() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="1.5" /><path d="M6 2v12M11 2v12" /></svg>; }
function IGal() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="1" y="1.5" width="14" height="9" rx="1.5" /><path d="M2 13.5h3M6.5 13.5h3M11 13.5h3" /></svg>; }

function Thumb({ src, ext }: { src: string; ext: string }) {
  const [ok, setOk] = useState(false);
  const [fail, setFail] = useState(false);
  if (fail) return <span className="noimg">{ext.toUpperCase()}</span>;
  return <img src={src} alt="" loading="lazy" className={ok ? "ok" : ""} onLoad={() => setOk(true)} onError={() => setFail(true)} />;
}
