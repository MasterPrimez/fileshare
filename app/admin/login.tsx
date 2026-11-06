"use client";
import Brand from "../brand";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) router.refresh(); else setErr("WRONG PASSWORD");
  }
  return (
    <div className="page">
      <header className="hdr"><Brand tag="SHARE · ADMIN" /></header>
      <div className="gate">
        <form className="card" onSubmit={go}>
          <div className="field" style={{ gap: 6 }}><span className="eyebrow">ADMIN</span><h1>SIGN IN</h1></div>
          <div className="field"><label htmlFor="pw">PASSWORD</label><input id="pw" className="in pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />{err && <span className="err">{err}</span>}</div>
          <button className="btn pri" type="submit" disabled={!pw}>SIGN IN</button>
        </form>
      </div>
    </div>
  );
}
