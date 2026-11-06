import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { resolveSafe, isWithin } from "./roots";
import db from "./db";

/** Resolve `sub` inside a share's folder; refuses anything that escapes the share itself. */
export function resolveInShare(shareRoot: string, sub: string) {
  const r = resolveSafe(path.posix.join(shareRoot, sub));
  if (!r || !isWithin(shareRoot, r.rel)) return null;
  return r;
}

const exec = promisify(execFile);
const APP_DATA = process.env.APP_DATA || "/app/data";
const THUMB_DIR = path.join(APP_DATA, "thumbs");
fs.mkdirSync(THUMB_DIR, { recursive: true });

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic", ".avif"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".mxf", ".avi"]);
export const AUDIO_EXT = new Set([".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac", ".ogg", ".aac"]);
export const RAW_EXT = new Set([".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".braw", ".r3d"]);

export type Entry = {
  name: string;
  rel: string; // rel path within the share (posix)
  kind: "folder" | "image" | "video" | "raw" | "audio" | "file";
  size: number;
  mtime: number;
  count?: number;
  cover?: string | null; // for folders: rel (within the same listing base) of the cover image
  alias?: string | null; // folders: display name override (name already reflects it)
  hidden?: boolean; // admin only: file is hidden from every visitor
  real?: string; // admin only: root-relative path
};

export function kindOf(name: string): Entry["kind"] {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (RAW_EXT.has(ext)) return "raw";
  if (AUDIO_EXT.has(ext)) return "audio";
  return "file";
}

/** List entries of a folder inside a share. `shareRoot` is the share's rel path, `sub` is within it. */
export function listDir(shareRoot: string, sub: string, opts: { admin?: boolean } = {}): Entry[] | null {
  const r = resolveInShare(shareRoot, sub);
  if (!r || !fs.existsSync(r.abs) || !fs.statSync(r.abs).isDirectory()) return null;
  const out: Entry[] = [];
  for (const d of fs.readdirSync(r.abs, { withFileTypes: true })) {
    if (d.name.startsWith(".") || d.name === "@eaDir") continue;
    const abs = path.join(r.abs, d.name);
    let st: fs.Stats;
    try { st = fs.statSync(abs); } catch { continue; }
    const rel = path.posix.join(sub, d.name);
    if (d.isDirectory()) {
      let count = 0, cover: string | null = null;
      try {
        const names = fs.readdirSync(abs).filter((n) => !n.startsWith(".") && n !== "@eaDir");
        count = names.length;
        const set = getCover(path.posix.join(r.rel, d.name));
        const pick = set && coverExists(abs, set) ? set : names.filter((n) => kindOf(n) === "image" && !isHidden(path.posix.join(r.rel, d.name, n))).sort()[0];
        if (pick) cover = path.posix.join(rel, pick);
      } catch {}
      const alias = getAlias(path.posix.join(r.rel, d.name));
      out.push({ name: alias || d.name, rel, kind: "folder", size: 0, mtime: st.mtimeMs, count, cover, alias, real: path.posix.join(r.rel, d.name) });
    } else {
      const real = path.posix.join(r.rel, d.name);
      const hid = isHidden(real);
      if (hid && !opts.admin) continue;
      out.push({ name: d.name, rel, kind: kindOf(d.name), size: st.size, mtime: st.mtimeMs, real, hidden: hid });
    }
  }
  out.sort((a, b) => (a.kind === "folder") === (b.kind === "folder") ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1);
  return out;
}

export function statIn(shareRoot: string, sub: string) {
  const r = resolveInShare(shareRoot, sub);
  if (!r || !fs.existsSync(r.abs)) return null;
  return { abs: r.abs, st: fs.statSync(r.abs) };
}

/** Walk a folder recursively, returning files with rel paths. */
export function walk(abs: string, base = "", realBase?: string): { abs: string; rel: string; size: number }[] {
  const out: { abs: string; rel: string; size: number }[] = [];
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name.startsWith(".") || d.name === "@eaDir") continue;
    const p = path.join(abs, d.name);
    const rel = path.posix.join(base, d.name);
    const real = realBase !== undefined ? path.posix.join(realBase, d.name) : undefined;
    if (d.isDirectory()) out.push(...walk(p, rel, real));
    else { if (real !== undefined && isHidden(real)) continue; out.push({ abs: p, rel, size: fs.statSync(p).size }); }
  }
  return out;
}

/** Files hidden from every visitor (root-relative path). The file itself is never touched. */
export function isHidden(real: string) { return !!db.prepare("SELECT 1 FROM hidden WHERE path = ?").get(real); }
export function setHidden(real: string, hidden: boolean) {
  if (hidden) db.prepare("INSERT OR IGNORE INTO hidden (path, at) VALUES (?, ?)").run(real, Date.now());
  else db.prepare("DELETE FROM hidden WHERE path = ?").run(real);
}

/** Return a cached thumbnail path (JPEG, 600px wide) for an image or video. */
export async function thumbnail(abs: string, mtime: number, width = 600): Promise<string | null> {
  const key = crypto.createHash("sha1").update(`${abs}:${mtime}:${width}`).digest("hex");
  const out = path.join(THUMB_DIR, `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  const kind = kindOf(abs);
  try {
    if (kind === "image") {
      await sharp(abs, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(out);
      return out;
    }
    if (kind === "video") {
      const tmp = out + ".png";
      await exec("ffmpeg", ["-y", "-ss", "1", "-i", abs, "-frames:v", "1", "-vf", `scale=${width}:-1`, tmp], { timeout: 20000 });
      await sharp(tmp).jpeg({ quality: 80 }).toFile(out);
      fs.unlinkSync(tmp);
      return out;
    }
    if (kind === "raw") {
      // Try embedded preview via sharp (works for DNG/TIFF-based); otherwise no thumb.
      await sharp(abs, { failOn: "none" }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(out);
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

export async function videoDuration(abs: string): Promise<number | null> {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", abs], { timeout: 10000 });
    const n = parseFloat(stdout.trim());
    return isNaN(n) ? null : n;
  } catch { return null; }
}

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function fmtDur(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Folder covers, keyed by root-relative folder path ("02-projects/MotoCross"). Value = path inside that folder ("IMG.jpg" or "Sub/IMG.jpg"). */
function coverExists(folderAbs: string, rel: string) {
  try { const abs = path.resolve(folderAbs, rel); return abs.startsWith(folderAbs + path.sep) && fs.statSync(abs).isFile(); } catch { return false; }
}
export function getCover(folderRel: string): string | null {
  const r = db.prepare("SELECT file FROM covers WHERE path = ?").get(folderRel) as { file: string } | undefined;
  return r?.file ?? null;
}
export function setCover(folderRel: string, file: string | null) {
  if (file) db.prepare("INSERT INTO covers (path, file) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET file = excluded.file").run(folderRel, file);
  else db.prepare("DELETE FROM covers WHERE path = ?").run(folderRel);
}

/** Synthetic top-level listing for a collection share. */
export function listCollection(items: { name: string; base: string }[]): Entry[] {
  const out: Entry[] = [];
  for (const it of items) {
    const r = resolveSafe(it.base);
    if (!r || !fs.existsSync(r.abs)) continue;
    let count = 0, cover: string | null = null, mtime = 0;
    try {
      const st = fs.statSync(r.abs); mtime = st.mtimeMs;
      const names = fs.readdirSync(r.abs).filter((n) => !n.startsWith(".") && n !== "@eaDir");
      count = names.length;
      const set = getCover(r.rel);
      const pick = set && coverExists(r.abs, set) ? set : names.filter((n) => kindOf(n) === "image").sort()[0];
      if (pick) cover = path.posix.join(it.name, pick);
    } catch {}
    const alias = getAlias(r.rel);
    out.push({ name: alias || (it.base.includes("/") ? it.name : r.root.label), rel: it.name, kind: "folder", size: 0, mtime, count, cover, alias, real: r.rel });
  }
  return out;
}

/** Display-name overrides for folders, keyed by root-relative path. Never touches disk. */
export function getAlias(folderRel: string): string | null {
  const r = db.prepare("SELECT name FROM aliases WHERE path = ?").get(folderRel) as { name: string } | undefined;
  return r?.name ?? null;
}
export function setAlias(folderRel: string, name: string | null) {
  const n = (name || "").trim();
  if (n) db.prepare("INSERT INTO aliases (path, name) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET name = excluded.name").run(folderRel, n);
  else db.prepare("DELETE FROM aliases WHERE path = ?").run(folderRel);
}
/** Strip admin-only fields before sending to a visitor. */
export function publicEntries<T extends { real?: string; alias?: string | null; hidden?: boolean }>(list: T[]): T[] {
  return list.filter((e) => !e.hidden).map((e) => { const { real: _r, alias: _a, hidden: _h, ...rest } = e; return rest as T; });
}

/** First usable cover for a folder: set cover, else first photo, else first photo in a subfolder (2 deep). */
export function coverFor(folderRel: string, depth = 0): string | null {
  const r = resolveSafe(folderRel); if (!r || !fs.existsSync(r.abs)) return null;
  try {
    const names = fs.readdirSync(r.abs).filter((n) => !n.startsWith(".") && n !== "@eaDir");
    const set = getCover(r.rel);
    const pick = set && coverExists(r.abs, set) ? set : names.filter((n) => kindOf(n) === "image").sort()[0];
    if (pick) return path.posix.join(r.rel, pick);
    if (depth < 2) for (const n of names.sort()) { try { if (fs.statSync(path.join(r.abs, n)).isDirectory()) { const c = coverFor(path.posix.join(r.rel, n), depth + 1); if (c) return c; } } catch {} }
  } catch {}
  return null;
}

/** Total bytes under a root-relative folder (0 if missing). Used for upload quotas. */
export function folderSize(folderRel: string): number {
  const r = resolveSafe(folderRel); if (!r || !fs.existsSync(r.abs)) return 0;
  try { return walk(r.abs).reduce((a, f) => a + f.size, 0); } catch { return 0; }
}
/** Safe folder/file name for visitor-created albums + uploads. */
export function safeName(n: string, fallback = "untitled") {
  const s = n.normalize("NFC").replace(/[\/\\:*?"<>|\x00-\x1f]/g, " ").split(/\s+/).filter((t) => t && !/^\.+$/.test(t)).join(" ").trim().replace(/^\.+/, "").slice(0, 100);
  return s || fallback;
}
