import { isAdmin } from "@/lib/auth";
import { headers } from "next/headers";
import MobileApp from "./app";
import Login from "../admin/login";

export const dynamic = "force-dynamic";

export default async function MPage() {
  const h = await headers();
  const ok = await isAdmin(new Request("http://x", { headers: h }));
  if (!ok) return <Login />;
  return <MobileApp />;
}
