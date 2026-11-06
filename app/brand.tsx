export default function Brand({ tag = "SHARE", size = 26 }: { tag?: string; size?: number }) {
  return (
    <div className="brand">
      <img src="/logo.png" alt="Michael Stine" className="logo-light-bg" style={{ height: size, width: "auto", display: "block" }} />
      <img src="/logo-dark.png" alt="" aria-hidden="true" className="logo-dark-bg" style={{ height: size, width: "auto", display: "none" }} />
      <span className="tag">{tag}</span>
    </div>
  );
}
