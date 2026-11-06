import crypto from "node:crypto";
const key = crypto.createHash("sha256").update(process.env.APP_SECRET || "dev-secret-change-me").digest();
/** AES-256-GCM, base64url: iv.tag.ciphertext — reversible so admin can read share passwords. */
export function seal(text: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const [iv, tag, enc] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}
