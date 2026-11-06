import crypto from "node:crypto";
import { cookies, headers } from "next/headers";

async function isHttps() {
  const h = await headers();
  return (h.get("x-forwarded-proto") || "").startsWith("https");
}

const SECRET = process.env.APP_SECRET || "dev-secret-change-me";

function sign(v: string) {
  return crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
}

/** Visitor has unlocked this share (password entered). */
export async function shareUnlocked(token: string) {
  const c = await cookies();
  return c.get(`s_${token}`)?.value === sign(token);
}
export async function unlockShare(token: string) {
  const c = await cookies();
  c.set(`s_${token}`, sign(token), { httpOnly: true, sameSite: "lax", secure: await isHttps(), maxAge: 60 * 60 * 24 * 7, path: "/" });
}

/** Admin: Cloudflare Access header OR local password cookie. */
export async function isAdmin(req?: Request) {
  const cfEmail = req?.headers.get("cf-access-authenticated-user-email");
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (cfEmail && allowed.includes(cfEmail.toLowerCase())) return true;
  const c = await cookies();
  return c.get("admin")?.value === sign("admin");
}
export async function loginAdmin(password: string) {
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) return false;
  const c = await cookies();
  c.set("admin", sign("admin"), { httpOnly: true, sameSite: "lax", secure: await isHttps(), maxAge: 60 * 60 * 24 * 30, path: "/" });
  return true;
}
export async function logoutAdmin() {
  const c = await cookies();
  c.delete("admin");
}

/** Ensure a long-lived visitor id cookie exists; returns the id. */
export async function ensureVisitorId(): Promise<string> {
  const c = await cookies();
  const cur = c.get("vid")?.value;
  if (cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur)) return cur;
  // first request: middleware just issued the cookie; it's not on this request's cookie jar yet
  const h = await headers();
  const hv = h.get("x-vid");
  if (hv) return hv;
  const id = crypto.randomBytes(12).toString("base64url");
  try { c.set("vid", id, { httpOnly: true, sameSite: "lax", secure: await isHttps(), maxAge: 60 * 60 * 24 * 365 * 3, path: "/" }); } catch {}
  return id;
}
export async function visitorId(): Promise<string | null> {
  const c = await cookies();
  const cur = c.get("vid")?.value;
  return cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur) ? cur : null;
}
