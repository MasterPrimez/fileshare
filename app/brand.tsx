export default function Brand({ tag = "SHARE", size = 26, href }: { tag?: string; size?: number; href?: string }) {
  const Tag = (href ? "a" : "div") as "a";
  return (
    <Tag className="brand" href={href} aria-label="Home">
      <img src="/logo.png" alt="Michael Stine" className="logo-light-bg" style={{ height: size, width: "auto", display: "block" }} />
      <img src="/logo-dark.png" alt="" aria-hidden="true" className="logo-dark-bg" style={{ height: size, width: "auto", display: "none" }} />
      <span className="tag">{tag}</span>
    </Tag>
  );
}
