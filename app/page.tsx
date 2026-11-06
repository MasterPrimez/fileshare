import Brand from "./brand";
export default function Home() {
  return (
    <div className="page">
      <header className="hdr"><Brand tag="SHARE" /></header>
      <div className="gate"><div className="card"><span className="eyebrow">NOTHING HERE</span><h1>PRIVATE SHARE SERVER</h1><span className="sub">Open the link you were sent.</span></div></div>
      <footer className="ftr"><span>LOS ANGELES</span><span style={{ flex: 1 }} /><span>share.michaelstine.net</span></footer>
    </div>
  );
}
