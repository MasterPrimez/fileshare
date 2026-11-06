import { isAdmin } from "@/lib/auth";
import { headers } from "next/headers";
import Admin from "./admin";
import Login from "./login";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const h = await headers();
  const ok = await isAdmin(new Request("http://x", { headers: h }));
  if (!ok) return <Login />;
  return <Admin />;
}
