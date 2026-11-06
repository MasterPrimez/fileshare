import fs from "node:fs";
import path from "node:path";

// Roots are whatever is mounted under DATA_DIR. Each subfolder = one root.
// Adding a root = adding a Docker volume mount under /data. The app never
// sees anything that is not mounted there.
const DATA_DIR = process.env.DATA_DIR || "/data";

export type Root = { id: string; label: string; abs: string };

export function listRoots(): Root[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => ({ id: d.name, label: d.name.replace(/[-_]/g, " ").toUpperCase(), abs: path.join(DATA_DIR, d.name) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Resolve "rootId/sub/path" to an absolute path, refusing anything that escapes the root. */
export function resolveSafe(rel: string): { root: Root; abs: string; rel: string } | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const [rootId, ...rest] = clean.split("/");
  const root = listRoots().find((r) => r.id === rootId);
  if (!root) return null;
  const sub = path.posix.normalize(rest.join("/"));
  if (sub.startsWith("..") || path.isAbsolute(sub)) return null;
  const abs = path.resolve(root.abs, sub === "." ? "" : sub);
  if (abs !== root.abs && !abs.startsWith(root.abs + path.sep)) return null;
  return { root, abs, rel: sub === "." ? rootId : `${rootId}/${sub}` };
}

/** Is `child` inside (or equal to) `parent`, both as rel paths? */
export function isWithin(parentRel: string, childRel: string) {
  const p = parentRel.replace(/\/+$/, "");
  return childRel === p || childRel.startsWith(p + "/");
}
