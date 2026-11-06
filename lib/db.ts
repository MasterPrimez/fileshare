import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const APP_DATA = process.env.APP_DATA || "/app/data";
fs.mkdirSync(APP_DATA, { recursive: true });

const db = new Database(path.join(APP_DATA, "share.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'view',
  password_hash TEXT,
  expires_at INTEGER,
  visit_limit INTEGER,
  visits INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  ua TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_share ON events(share_id, at DESC);
CREATE TABLE IF NOT EXISTS covers (
  path TEXT PRIMARY KEY,
  file TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aliases (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER NOT NULL,
  last_ua TEXT
);
`);
// migrations
const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
if (!cols("shares").includes("ask_name")) db.exec("ALTER TABLE shares ADD COLUMN ask_name INTEGER NOT NULL DEFAULT 0");
if (!cols("events").includes("visitor_id")) db.exec("ALTER TABLE events ADD COLUMN visitor_id TEXT");
if (!cols("shares").includes("password_enc")) db.exec("ALTER TABLE shares ADD COLUMN password_enc TEXT");
if (!cols("shares").includes("paths")) db.exec("ALTER TABLE shares ADD COLUMN paths TEXT");
if (!cols("events").includes("bytes")) db.exec("ALTER TABLE events ADD COLUMN bytes INTEGER");

export type Share = {
  id: string;
  token: string;
  name: string;
  path: string;
  mode: "view" | "edit";
  password_hash: string | null;
  expires_at: number | null;
  visit_limit: number | null;
  visits: number;
  revoked: number;
  created_at: number;
  ask_name: number;
  password_enc: string | null;
  paths: string | null; // JSON array for collections; null = single folder in `path`
};

export type Event = {
  id: number;
  share_id: string;
  kind: string;
  detail: string | null;
  ip: string | null;
  ua: string | null;
  at: number;
  visitor_id: string | null;
  bytes?: number | null;
};

export type Visitor = { id: string; name: string | null; first_seen: number; last_ua: string | null };

export default db;
