"use client";
import { useMemo, useState } from "react";

export type Ev = { id: number; share_id: string; share_name?: string; kind: string; detail: string | null; ip: string | null; ua: string | null; at: number; visitor_id: string | null };
export type Vis = { id: string; name: string | null; first_seen: number; last_ua: string | null };

const PALETTE = ["#e8a33d", "#5b8def", "#4cd08a", "#d97aa6", "#8fd1e8", "#c9a0ff", "#f0875b", "#b8c96a"];
export const dev = (ua: string | null) => !ua ? "" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Visitor key: cookie id if present, else network half of IP + device (IPv6 privacy addresses rotate the tail). */
export function visitorKey(e: Ev) {
  if (e.visitor_id) return e.visitor_id;
  const ip = e.ip || "?";
  const net = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  return `${net}|${dev(e.ua)}`;
}
function shortIp(ip: string | null) {
  if (!ip) return "";
  if (ip.includes(":")) { const p = ip.split(":").filter(Boolean); return `${p.slice(0, 2).join(":")}:…:${p[p.length - 1]}`; }
  return ip;
}

/** Assign colors in order of first appearance (oldest event first) so colors are stable as the log grows. */
export function colorMap(events: Ev[]) {
  const m: Record<string, string> = {};
  let i = 0;
  for (const e of [...events].sort((a, b) => a.at - b.at)) { const k = visitorKey(e); if (!(k in m)) m[k] = PALETTE[i++ % PALETTE.length]; }
  return m;
}

export function Log({ events, visitors, me, showShare, onRename }: { events: Ev[]; visitors: Record<string, Vis>; me: string | null; showShare?: boolean; onRename?: (id: string, name: string) => void }) {
  const colors = useMemo(() => colorMap(events), [events]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const label = (e: Ev) => {
    const v = e.visitor_id ? visitors[e.visitor_id] : null;
    const isMe = me && e.visitor_id === me;
    if (isMe) return { name: v?.name ? `${v.name} (you)` : "you", anon: false };
    if (v?.name) return { name: v.name, anon: false };
    return { name: "anonymous", anon: true };
  };

  // legend: one chip per visitor key
  const legend = useMemo(() => {
    const by: Record<string, { key: string; vid: string | null; n: number; ua: string | null; last: number }> = {};
    for (const e of events) { const k = visitorKey(e); const cur = by[k] || { key: k, vid: e.visitor_id, n: 0, ua: e.ua, last: 0 }; cur.n++; if (e.at > cur.last) { cur.last = e.at; cur.ua = e.ua; } by[k] = cur; }
    return Object.values(by).sort((a, b) => b.last - a.last);
  }, [events]);

  return <>
    {!!legend.length && <div className="legend">
      {legend.map((l) => {
        const sample = events.find((e) => visitorKey(e) === l.key)!;
        const { name, anon } = label(sample);
        const canEdit = !!onRename && !!l.vid && l.vid !== me;
        return (
          <span key={l.key} className="vis" style={{ ["--c" as string]: colors[l.key] }} title={canEdit ? "Click to rename" : undefined} onClick={() => { if (canEdit) { setEditing(l.vid!); setDraft(visitors[l.vid!]?.name || ""); } }} role={canEdit ? "button" : undefined}>
            <i />
            {editing === l.vid
              ? <input className="in" style={{ padding: "2px 6px", fontSize: 10, width: 120 }} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onRename!(l.vid!, draft); setEditing(null); } if (e.key === "Escape") setEditing(null); }} onBlur={() => { onRename!(l.vid!, draft); setEditing(null); }} onClick={(e) => e.stopPropagation()} />
              : <span className={anon ? "anon" : ""}>{name.toUpperCase()}</span>}
            <span className="dev">· {dev(l.ua).toUpperCase() || "?"}</span><b>{l.n}</b>
          </span>
        );
      })}
    </div>}
    <div className="log">
      {events.map((e) => {
        const k = visitorKey(e); const { name, anon } = label(e);
        return (
          <div className="e" key={e.id} style={{ ["--c" as string]: colors[k] }}>
            <span className="t">{fmt(e.at)}</span>
            <span className="k">{e.kind.replace("_", " ")}</span>
            <span className="d">{showShare && <span style={{ color: "var(--muted)" }}>{e.share_name} </span>}{e.detail || ""}</span>
            <span className="who"><i /><span className={anon ? "anon" : "nm"}>{name}</span><span className="dev">· {dev(e.ua) || "?"}{e.ip ? ` · ${shortIp(e.ip)}` : ""}</span></span>
          </div>
        );
      })}
      {!events.length && <span className="sub">NO ACTIVITY YET</span>}
    </div>
  </>;
}
