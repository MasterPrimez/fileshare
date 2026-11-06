"use client";
import Brand from "../../brand";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NameGate({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function send(n: string) {
    setBusy(true);
    await fetch(`/api/s/${token}/name`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }) });
    router.refresh();
  }
  return (
    <div className="page">
      <header className="hdr"><Brand tag="SHARE" /></header>
      <div className="gate">
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) send(name); }}>
          <h1>YOUR NAME</h1>
          <input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Chen" autoFocus aria-label="Your name" autoComplete="name" />
          <button className="btn pri" type="submit" disabled={busy || !name.trim()}>CONTINUE</button>
          <button className="mlink" type="button" onClick={() => send("")} disabled={busy}>SKIP</button>
        </form>
      </div>
      <footer className="ftr"><span>LOS ANGELES</span><span style={{ flex: 1 }} /><span>share.michaelstine.net</span></footer>
    </div>
  );
}
