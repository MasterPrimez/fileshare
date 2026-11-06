import { NextRequest, NextResponse } from "next/server";

/** Give every visitor a long-lived device id cookie before any page runs. */
export function middleware(req: NextRequest) {
  const cur = req.cookies.get("vid")?.value;
  if (cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur)) return NextResponse.next();
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // forward the new id to this request's server components as a request header
  const reqHeaders = new Headers(req.headers); reqHeaders.set("x-vid", id);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.cookies.set("vid", id, { httpOnly: true, sameSite: "lax", secure: req.headers.get("x-forwarded-proto") === "https", maxAge: 60 * 60 * 24 * 365 * 3, path: "/" });
  return res;
}
export const config = { matcher: ["/s/:path*", "/api/s/:path*", "/admin/:path*", "/m/:path*", "/api/admin/:path*"] };
