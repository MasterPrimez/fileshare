"use client";
import { useEffect, useState } from "react";

/** First-visit walkthrough: four coach marks over the real UI. Shown once per browser (localStorage). Admin never sees it. */
const STEPS = [
  { sel: ".seg[aria-label=View]", t: "VIEWS", b: "grid · list · columns · gallery" },
  { sel: ".seg.filt", t: "FILTERS", b: "photos · video · audio · files" },
  { sel: ".tiles .tile:has(img.ok), .tiles .tile:not(.folder), .flist tr, .mi:not(.path), .strip .st", t: "OPEN", b: "click. ⌘-click to select." },
  { sel: ".actions .btn.pri", t: "DOWNLOAD", b: "all, or selected." },
];
const KEY = "share:tour:v1";

export default function Tour() {
  const [i, setI] = useState(-1);
  const [box, setBox] = useState<DOMRect | null | undefined>(undefined);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setTimeout(() => setI(0), 700); } catch {} }, []);
  const done = () => { try { localStorage.setItem(KEY, "1"); } catch {} setI(-1); };
  // follow the target
  useEffect(() => {
    if (i < 0) return;
    const find = () => { const el = document.querySelector(STEPS[i].sel) as HTMLElement | null; if (!el) { setBox(null); return; } setBox(el.getBoundingClientRect()); };
    setBox(undefined);
    (document.querySelector(STEPS[i].sel) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
    find();
    window.addEventListener("resize", find); window.addEventListener("scroll", find, { passive: true });
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") done(); if (e.key === "Enter" || e.key === "ArrowRight") next(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("resize", find); window.removeEventListener("scroll", find); window.removeEventListener("keydown", k); };
  }, [i]); // eslint-disable-line
  const next = () => { if (i >= STEPS.length - 1) done(); else setI(i + 1); };
  if (i < 0) return null;
  const s = STEPS[i];
  if (box === undefined) return null; // measuring
  if (!box) { // target not on screen (e.g. empty folder): skip ahead
    if (i < STEPS.length - 1) { setTimeout(() => setI(i + 1), 0); return null; }
    done(); return null;
  }
  const pad = 6, W = 260;
  const phone = typeof window !== "undefined" && window.innerWidth < 640;
  const left = phone ? 16 : Math.max(16, Math.min(box.left - pad, window.innerWidth - W - 16));
  const flip = !phone && box.left - pad > window.innerWidth - W - 16;
  return (
    <div className="tour" onClick={done}>
      <div className="tour-ring" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      <div className={`tour-bub ${flip ? "flip" : ""} ${phone ? "phone" : ""}`} style={phone ? { left: 16, right: 16 } : { left, top: box.bottom + pad + 14, width: W }} onClick={(e) => e.stopPropagation()}>
        <span className="tn">{i + 1}</span><span className="tt">{s.t}</span>
        <div className="tb">{s.b}</div>
        <div className="tf">{STEPS.map((_, k) => <span key={k} className={`td ${k === i ? "on" : ""}`} />)}<span className="tsp" /><button className="skip" onClick={done}>SKIP</button><button className="next" onClick={next}>{i === STEPS.length - 1 ? "GOT IT" : "NEXT →"}</button></div>
      </div>
    </div>
  );
}
