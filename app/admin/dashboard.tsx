"use client";
import { useEffect, useState } from "react";

type Stats = {
  days: number; activeShares: number; expiringWeek: number; folders: number; roots: number; visitors: number; newVisitors: number;
  opens: number; prevOpens: number; downloads: number; zips: number; singles: number; bytes: number; largest: number; bad: number; badDev: number; named: number;
  series: Record<string, { o: number; d: number }>; devices: Record<string, number>; hours: number[];
  topShares: { id: string; name: string; opens: number }[];
  topVis: { vid: string; name: string | null; opens: number; dl: number; last: number; device: string }[];
  expiring: { id: string; name: string; mode: string; expires_at: number; visits: number }[];
};
const PAL = ["#e8a33d", "#5b8def", "#8fd1e8", "#4cd08a", "#c9a0ff", "#6f6c66"];
const fmtB = (n: number) => n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;
const ago = (ms: number) => { const h = (Date.now() - ms) / 3600000; return h < 1 ? "JUST NOW" : h < 24 ? `${Math.floor(h)}H AGO` : h < 48 ? "YESTERDAY" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(); };
const until = (ms: number) => { const d = Math.ceil((ms - Date.now()) / 86400000); return d <= 0 ? "TODAY" : d === 1 ? "TOMORROW" : `${d} DAYS`; };
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export default function Dashboard({ onOpenShare, onExtend }: { onOpenShare: (id: string) => void; onExtend: (id: string, days: number) => Promise<void> }) {
  const [days, setDays] = useState(30);
  const [st, setSt] = useState<Stats | null>(null);
  const load = async (d: number) => { const r = await fetch(`/api/admin/stats?days=${d}`); if (r.ok) setSt(await r.json()); };
  useEffect(() => { load(days); }, [days]);
  if (!st) return <div className="sub">LOADING…</div>;

  const keys = Object.keys(st.series);
  const maxO = Math.max(1, ...keys.map((k) => st.series[k].o));
  const delta = st.prevOpens ? Math.round(((st.opens - st.prevOpens) / st.prevOpens) * 100) : null;
  const devTotal = Object.values(st.devices).reduce((a, b) => a + b, 0) || 1;
  const devs = Object.entries(st.devices).sort((a, b) => b[1] - a[1]);
  const peak = st.hours.indexOf(Math.max(...st.hours));
  const topMax = Math.max(1, ...st.topShares.map((t) => t.opens));
  const label = days === 0 ? "ALL TIME" : `LAST ${days} DAYS`;
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`;

  // donut arcs
  let acc = 0;
  const arcs = devs.map(([name, n], i) => { const pct = (n / devTotal) * 100; const a = { name, pct, off: -acc, color: PAL[i % PAL.length] }; acc += pct; return a; });

  return <>
    <div className="row" style={{ justifyContent: "space-between" }}>
      <h2 className="h">DASHBOARD</h2>
      <div className="row">{[[7, "7D"], [30, "30D"], [90, "90D"], [0, "ALL"]].map(([d, l]) => <button key={d} className={`pill ${days === d ? "on" : ""}`} onClick={() => setDays(d as number)}>{l}</button>)}</div>
    </div>

    <div className="tiles">
      <Tile l="ACTIVE SHARES" v={st.activeShares} d={st.expiringWeek ? `${st.expiringWeek} EXPIRING THIS WEEK` : "NONE EXPIRING SOON"} />
      <Tile l="FOLDERS SHARED" v={st.folders} d={`ACROSS ${st.roots} ROOT${st.roots === 1 ? "" : "S"}`} />
      <Tile l="VISITORS" v={st.visitors} d={days ? `+${st.newVisitors} NEW` : "ALL TIME"} up={days > 0 && st.newVisitors > 0} />
      <Tile l="OPENS" v={st.opens} d={delta === null ? label : `${delta >= 0 ? "+" : ""}${delta}% VS PRIOR ${days}D`} up={delta !== null && delta > 0} dn={delta !== null && delta < 0} />
      <Tile l="DOWNLOADS" v={st.downloads} d={`${st.zips} ZIPS · ${st.singles} FILES`} />
      <Tile l="DATA SERVED" v={fmtB(st.bytes)} d={st.largest ? `LARGEST: ${fmtB(st.largest)}` : "—"} small />
      <Tile l="BAD PASSWORDS" v={st.bad} d={st.bad ? `${st.badDev} DEVICE${st.badDev === 1 ? "" : "S"}` : "NONE"} red={st.bad > 0} />
      <Tile l="NAMED VISITORS" v={`${st.named}/${st.visitors}`} d={st.visitors ? `${Math.round((st.named / st.visitors) * 100)}% GAVE A NAME` : "—"} small />
    </div>

    <div className="grid2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h3>OPENS &amp; DOWNLOADS · {label}</h3><span className="legend"><span><i style={{ background: "var(--amber)" }} />OPENS</span><span><i style={{ background: "#5b8def" }} />DOWNLOADS</span></span></div>
        <div className="chart">{keys.map((k) => <span key={k} className="cg" title={`${k}: ${st.series[k].o} opens · ${st.series[k].d} downloads`}><i className="o" style={{ height: `${(st.series[k].o / maxO) * 100}%` }} /><i className="d" style={{ height: `${(st.series[k].d / maxO) * 100}%` }} /></span>)}</div>
        <div className="axis"><span>{keys[0]?.slice(5).replace("-", "/")}</span><span>{keys[Math.floor(keys.length / 2)]?.slice(5).replace("-", "/")}</span><span>{keys[keys.length - 1]?.slice(5).replace("-", "/")}</span></div>
      </div>
      <div className="card">
        <h3>DEVICES</h3>
        <div className="donut">
          <svg width="120" height="120" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line)" strokeWidth="6" />
            {arcs.map((a) => <circle key={a.name} cx="21" cy="21" r="15.9" fill="none" stroke={a.color} strokeWidth="6" strokeDasharray={`${a.pct} ${100 - a.pct}`} strokeDashoffset={25 + a.off} />)}</svg>
          <div className="dl">{arcs.map((a) => <span key={a.name}><span className="dot" style={{ background: a.color }} /><b>{Math.round(a.pct)}%</b> {a.name.toUpperCase()}</span>)}{!arcs.length && <span className="sub">NO VISITS YET</span>}</div>
        </div>
        <span className="sub">{st.opens ? `PEAK HOUR: ${h12(peak)}–${h12(peak + 1)}` : ""}</span>
      </div>
    </div>

    <div className="grid2">
      <div className="card">
        <h3>TOP SHARES · BY OPENS</h3>
        <div className="bars">{st.topShares.map((t) => <button key={t.id} className="sbar" onClick={() => onOpenShare(t.id)}><span className="n">{t.name}</span><span className="b"><i style={{ width: `${(t.opens / topMax) * 100}%` }} /></span><span className="v">{t.opens}</span></button>)}{!st.topShares.length && <span className="sub">NO OPENS YET</span>}</div>
      </div>
      <div className="card">
        <h3>MOST ACTIVE VISITORS</h3>
        <table className="table"><thead><tr><th>WHO</th><th>OPENS</th><th>DL</th><th>LAST</th></tr></thead><tbody>
          {st.topVis.map((v) => <tr key={v.vid}><td><span className="dot" style={{ background: PAL[hash(v.vid) % PAL.length] }} />{v.name ? v.name : <i>anonymous</i>} · {v.device}</td><td>{v.opens}</td><td>{v.dl}</td><td>{ago(v.last)}</td></tr>)}
          {!st.topVis.length && <tr><td colSpan={4} className="sub">NO VISITORS YET</td></tr>}
        </tbody></table>
      </div>
    </div>

    <div className="card">
      <h3>EXPIRING SOON</h3>
      <table className="table"><thead><tr><th>SHARE</th><th>MODE</th><th>EXPIRES</th><th>OPENS</th><th></th></tr></thead><tbody>
        {st.expiring.map((s) => { const d = (s.expires_at - Date.now()) / 86400000; return <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => onOpenShare(s.id)}><td>{s.name}</td><td>{s.mode === "edit" ? "EDIT" : "READ ONLY"}</td><td style={{ color: d < 2 ? "var(--red)" : d < 4 ? "var(--amber)" : undefined }}>{until(s.expires_at)}</td><td>{s.visits}</td><td onClick={(e) => e.stopPropagation()}><button className="pill" onClick={async () => { await onExtend(s.id, 7); load(days); }}>EXTEND 7D</button></td></tr>; })}
        {!st.expiring.length && <tr><td colSpan={5} className="sub">NOTHING EXPIRING IN THE NEXT 7 DAYS</td></tr>}
      </tbody></table>
    </div>
  </>;
}

function Tile({ l, v, d, up, dn, red, small }: { l: string; v: number | string; d: string; up?: boolean; dn?: boolean; red?: boolean; small?: boolean }) {
  return <div className="t"><span className="l">{l}</span><b style={{ color: red ? "var(--red)" : undefined, fontSize: small ? 30 : undefined }}>{v}</b><span className={`d ${up ? "up" : ""} ${dn ? "dn" : ""}`}>{d}</span></div>;
}
