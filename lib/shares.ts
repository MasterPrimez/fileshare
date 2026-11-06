import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import db, { Share, Event, Visitor } from "./db";
export type { Share, Event, Visitor };
import { resolveSafe, listRoots } from "./roots";
import { seal, open } from "./secret";

export function createShare(input: {
  name: string;
  path: string;
  mode: "view" | "edit";
  password?: string;
  expiresAt?: number | null;
  visitLimit?: number | null;
  askName?: boolean;
  paths?: string[];
  uploadPath?: string | null;
  uploadLimit?: number | null;
}): Share {
  const list = (input.paths && input.paths.length ? input.paths : [input.path]).filter(Boolean);
  for (const p of list) if (!resolveSafe(p)) throw new Error("Path is not inside a mounted root");
  const isCollection = list.length > 1;
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("base64url"); // 32 chars
  const hash = input.password ? bcrypt.hashSync(input.password, 10) : null;
  db.prepare(
    `INSERT INTO shares (id, token, name, path, mode, password_hash, password_enc, expires_at, visit_limit, created_at, ask_name, paths)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, token, input.name, list[0], input.mode, hash, input.password ? seal(input.password) : null, input.expiresAt ?? null, input.visitLimit ?? null, Date.now(), input.askName ? 1 : 0, isCollection ? JSON.stringify(list) : null);
  if (input.uploadPath !== undefined || input.uploadLimit !== undefined) updateShare(id, { uploadPath: input.uploadPath, uploadLimit: input.uploadLimit });
  return getShareById(id)!;
}

export function getShareById(id: string): Share | undefined {
  return db.prepare("SELECT * FROM shares WHERE id = ?").get(id) as Share | undefined;
}

export function getShareByToken(token: string): Share | undefined {
  if (token === LIBRARY) return undefined; // never from the DB; see libraryShare()
  return db.prepare("SELECT * FROM shares WHERE token = ?").get(token) as Share | undefined;
}

/** Admin-only virtual share spanning every mounted root. Only handed out after an isAdmin check. */
export const LIBRARY = "library";
export function libraryShare(): Share {
  const roots = listRoots().map((r) => r.id);
  return { id: LIBRARY, token: LIBRARY, name: "Library", path: roots[0] || "", mode: "view", password_hash: null, expires_at: null, visit_limit: null, visits: 0, revoked: 0, created_at: 0, ask_name: 0, password_enc: null, paths: JSON.stringify(roots), upload_path: null, upload_limit: null };
}

export function listShares(): Share[] {
  return db.prepare("SELECT * FROM shares ORDER BY created_at DESC").all() as Share[];
}

export function updateShare(id: string, patch: Partial<{ mode: "view" | "edit"; password: string | null; expiresAt: number | null; visitLimit: number | null; revoked: boolean; name: string; askName: boolean; paths: string[]; uploadPath: string | null; uploadLimit: number | null }>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.paths) {
    const list = [...new Set(patch.paths.map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean))];
    if (!list.length) throw new Error("A share needs at least one folder");
    for (const p of list) if (!resolveSafe(p)) throw new Error("Path is not inside a mounted root");
    sets.push("path = ?"); vals.push(list[0]);
    sets.push("paths = ?"); vals.push(list.length > 1 ? JSON.stringify(list) : null);
  }
  if (patch.mode) { sets.push("mode = ?"); vals.push(patch.mode); }
  if (patch.name) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.password !== undefined) { sets.push("password_hash = ?"); vals.push(patch.password ? bcrypt.hashSync(patch.password, 10) : null); sets.push("password_enc = ?"); vals.push(patch.password ? seal(patch.password) : null); }
  if (patch.expiresAt !== undefined) { sets.push("expires_at = ?"); vals.push(patch.expiresAt); }
  if (patch.visitLimit !== undefined) { sets.push("visit_limit = ?"); vals.push(patch.visitLimit); }
  if (patch.revoked !== undefined) { sets.push("revoked = ?"); vals.push(patch.revoked ? 1 : 0); }
  if (patch.askName !== undefined) { sets.push("ask_name = ?"); vals.push(patch.askName ? 1 : 0); }
  if (patch.uploadPath !== undefined) {
    if (patch.uploadPath) { const p = patch.uploadPath.replace(/^\/+|\/+$/g, ""); if (!resolveSafe(p) || !p.includes("/")) throw new Error("Upload folder must be inside a root"); sets.push("upload_path = ?"); vals.push(p); }
    else { sets.push("upload_path = ?"); vals.push(null); }
  }
  if (patch.uploadLimit !== undefined) { sets.push("upload_limit = ?"); vals.push(patch.uploadLimit && patch.uploadLimit > 0 ? Math.round(patch.uploadLimit) : null); }
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE shares SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function deleteShare(id: string) {
  db.prepare("DELETE FROM events WHERE share_id = ?").run(id);
  db.prepare("DELETE FROM shares WHERE id = ?").run(id);
}

export type ShareStatus = "ok" | "revoked" | "expired" | "limit" | "missing";

export function shareStatus(s: Share | undefined): ShareStatus {
  if (!s) return "missing";
  if (s.revoked) return "revoked";
  if (s.expires_at && Date.now() > s.expires_at) return "expired";
  if (s.visit_limit && s.visits >= s.visit_limit) return "limit";
  return "ok";
}

export function checkPassword(s: Share, pw: string) {
  if (!s.password_hash) return true;
  return bcrypt.compareSync(pw, s.password_hash);
}

export function recordVisit(id: string) {
  db.prepare("UPDATE shares SET visits = visits + 1 WHERE id = ?").run(id);
}

export function logEvent(shareId: string, kind: string, detail: string | null, req?: Request, visitorId?: string | null, bytes?: number | null) {
  if (shareId === LIBRARY) return;
  const ip = req?.headers.get("cf-connecting-ip") || req?.headers.get("x-forwarded-for") || null;
  const ua = req?.headers.get("user-agent") || null;
  const vid = visitorId ?? visitorIdFromReq(req);
  if (vid) touchVisitor(vid, ua);
  db.prepare("INSERT INTO events (share_id, kind, detail, ip, ua, at, visitor_id, bytes) VALUES (?,?,?,?,?,?,?,?)").run(shareId, kind, detail, ip, ua, Date.now(), vid, bytes ?? null);
}

export function visitorIdFromReq(req?: Request): string | null {
  const c = req?.headers.get("cookie") || "";
  const m = /(?:^|;\s*)vid=([A-Za-z0-9_-]{8,64})/.exec(c);
  return m ? m[1] : null;
}
export function touchVisitor(id: string, ua: string | null) {
  db.prepare("INSERT INTO visitors (id, name, first_seen, last_ua) VALUES (?, NULL, ?, ?) ON CONFLICT(id) DO UPDATE SET last_ua = excluded.last_ua").run(id, Date.now(), ua);
}
export function getVisitor(id: string): Visitor | undefined { return db.prepare("SELECT * FROM visitors WHERE id = ?").get(id) as Visitor | undefined; }
export function setVisitorName(id: string, name: string | null) { touchVisitor(id, null); db.prepare("UPDATE visitors SET name = ? WHERE id = ?").run(name, id); }
export function visitorsFor(events: Event[]): Record<string, Visitor> {
  const ids = [...new Set(events.map((e) => e.visitor_id).filter(Boolean))] as string[];
  const out: Record<string, Visitor> = {};
  for (const id of ids) { const v = getVisitor(id); if (v) out[id] = v; }
  return out;
}

export function listEvents(shareId?: string, limit = 200): Event[] {
  if (shareId) return db.prepare("SELECT * FROM events WHERE share_id = ? ORDER BY at DESC LIMIT ?").all(shareId, limit) as Event[];
  return db.prepare("SELECT * FROM events ORDER BY at DESC LIMIT ?").all(limit) as Event[];
}

export function eventCounts(shareId: string) {
  const rows = db.prepare("SELECT kind, COUNT(*) n FROM events WHERE share_id = ? GROUP BY kind").all(shareId) as { kind: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

export function sharePassword(s: Share): string | null { return open(s.password_enc); }

import path from "node:path";
export type CollectionItem = { name: string; base: string };
/** Collection items: display name (basename, de-duped) → root-relative folder. Single shares return one item named "". */
export function shareItems(s: Share): CollectionItem[] {
  if (!s.paths) return [{ name: "", base: s.path }];
  let list: string[] = [];
  try { list = JSON.parse(s.paths); } catch {}
  const seen: Record<string, number> = {};
  return list.map((base) => {
    let name = path.posix.basename(base) || base;
    if (seen[name]) name = `${name} (${++seen[name]})`; else seen[name] = 1;
    return { name, base };
  });
}
export function isCollection(s: Share) { return !!s.paths; }
/** Map a visitor sub-path to { base (root-relative folder), rest (inside it) }. For a collection, the first segment picks the item. null at collection top. */
export function mapSub(s: Share, sub: string): { base: string; rest: string; item: CollectionItem } | null {
  const clean = sub.replace(/^\/+|\/+$/g, "");
  if (!isCollection(s)) return { base: s.path, rest: clean, item: { name: "", base: s.path } };
  if (!clean) return null;
  const [first, ...rest] = clean.split("/");
  const item = shareItems(s).find((i) => i.name === first);
  if (!item) return null;
  return { base: item.base, rest: rest.join("/"), item };
}

export function stats(days: number) {
  const since = days > 0 ? Date.now() - days * 86400000 : 0;
  const prevSince = days > 0 ? since - days * 86400000 : 0;
  const q = <T,>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as T[];
  const one = <T,>(sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as T;
  const shares = listShares();
  const active = shares.filter((s) => shareStatus(s) === "ok");
  const weekOut = Date.now() + 7 * 86400000;
  const folders = new Set(shares.flatMap((s) => shareItems(s).map((i) => i.base)));
  const roots = new Set([...folders].map((f) => f.split("/")[0]));
  const cnt = (kind: string, from: number, to = Number.MAX_SAFE_INTEGER) => one<{ n: number }>("SELECT COUNT(*) n FROM events WHERE kind = ? AND at >= ? AND at < ?", kind, from, to).n;
  const opens = cnt("open", since), prevOpens = days > 0 ? cnt("open", prevSince, since) : 0;
  const dl = cnt("download", since), zips = cnt("zip", since);
  const bytes = one<{ b: number | null }>("SELECT SUM(bytes) b FROM events WHERE kind IN ('download','zip') AND at >= ?", since).b || 0;
  const largest = one<{ b: number | null }>("SELECT MAX(bytes) b FROM events WHERE kind IN ('download','zip') AND at >= ?", since).b || 0;
  const bad = cnt("bad_password", since);
  const badDev = one<{ n: number }>("SELECT COUNT(DISTINCT COALESCE(visitor_id, ip)) n FROM events WHERE kind = 'bad_password' AND at >= ?", since).n;
  const visitors = q<{ visitor_id: string | null; ip: string | null; ua: string | null }>("SELECT DISTINCT visitor_id, ip, ua FROM events WHERE at >= ? AND kind IN ('open','download','zip','named','skipped_name')", since);
  const vkeys = new Set(visitors.map((v) => v.visitor_id || `${v.ip}|${v.ua}`));
  const newVis = days > 0 ? one<{ n: number }>("SELECT COUNT(*) n FROM visitors WHERE first_seen >= ?", since).n : vkeys.size;
  const named = one<{ n: number }>("SELECT COUNT(*) n FROM visitors WHERE name IS NOT NULL AND id IN (SELECT DISTINCT visitor_id FROM events WHERE at >= ? AND visitor_id IS NOT NULL)", since).n;
  // daily series
  const span = days > 0 ? days : Math.max(7, Math.ceil((Date.now() - (one<{ m: number | null }>("SELECT MIN(at) m FROM events").m || Date.now())) / 86400000));
  const start = Date.now() - (span - 1) * 86400000;
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const series: Record<string, { o: number; d: number }> = {};
  for (let i = 0; i < span; i++) series[dayKey(start + i * 86400000)] = { o: 0, d: 0 };
  for (const e of q<{ kind: string; at: number }>("SELECT kind, at FROM events WHERE at >= ? AND kind IN ('open','download','zip')", start)) { const k = dayKey(e.at); if (series[k]) { if (e.kind === "open") series[k].o++; else series[k].d++; } }
  // devices
  const dev = (ua: string | null) => !ua ? "Other" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
  const devices: Record<string, number> = {};
  for (const v of visitors) devices[dev(v.ua)] = (devices[dev(v.ua)] || 0) + 1;
  // hours
  const hours = new Array(24).fill(0);
  for (const e of q<{ at: number }>("SELECT at FROM events WHERE kind = 'open' AND at >= ?", since)) hours[new Date(e.at).getHours()]++;
  // top shares
  const topShares = q<{ share_id: string; n: number }>("SELECT share_id, COUNT(*) n FROM events WHERE kind = 'open' AND at >= ? GROUP BY share_id ORDER BY n DESC LIMIT 6", since).map((r) => ({ id: r.share_id, name: shares.find((s) => s.id === r.share_id)?.name || "(deleted)", opens: r.n }));
  // top visitors
  const topVis = q<{ vid: string; opens: number; dl: number; last: number; ua: string | null }>("SELECT COALESCE(visitor_id, ip || '|' || ua) vid, SUM(kind='open') opens, SUM(kind IN ('download','zip')) dl, MAX(at) last, MAX(ua) ua FROM events WHERE at >= ? AND kind IN ('open','download','zip') GROUP BY vid ORDER BY opens DESC LIMIT 6", since)
    .map((r) => ({ vid: r.vid, name: getVisitor(r.vid)?.name || null, opens: r.opens, dl: r.dl, last: r.last, device: dev(r.ua) }));
  const expiring = active.filter((s) => s.expires_at && s.expires_at < weekOut).sort((a, b) => a.expires_at! - b.expires_at!).map((s) => ({ id: s.id, name: s.name, mode: s.mode, expires_at: s.expires_at, visits: s.visits }));
  return { days, activeShares: active.length, expiringWeek: expiring.length, folders: folders.size, roots: roots.size, visitors: vkeys.size, newVisitors: newVis, opens, prevOpens, downloads: dl + zips, zips, singles: dl, bytes, largest, bad, badDev, named, series, devices, hours, topShares, topVis, expiring };
}
