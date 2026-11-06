# HANDOFF — fileshare (share.michaelstine.net)

Last updated: 2026-11-05 by Claude. Status: **live and working.**

v2 (same day): visitor gallery got view modes (grid / list / columns / gallery), thumbnail size slider, shift-click range + ⌘-click toggle select, light/dark toggle (persisted in localStorage), single-click closes lightbox. Admin New-share got a resizable picker + preview panel.

v3: Finder-style Miller columns with keyboard up/down + fit-to-page preview; sticky title/view bar; breadcrumbs under title; type filter toggles (Photos/Videos/Audio/Files, multi-select, counts); audio kind (wav/mp3/aif/m4a/flac/ogg) with inline player; video camera marker on all small thumbs. Buttons: Kinetics clip-wipe (secondaries, amber; danger wipes red) + glow halo (primary) — rules under `.btn` in globals.css.

## What it is
Custom replacement for UGOS share links. Next.js 15 app in Docker on the UGREEN NAS, published through the existing `stinenas` Cloudflare Tunnel at `https://share.michaelstine.net`. Admin at `/admin` (password only, no username).

## Where things live
| What | Where |
|---|---|
| Project on NAS | `/volume1/docker/fileshare` |
| Secrets | `/volume1/docker/fileshare/.env` (ADMIN_PASSWORD, APP_SECRET, ADMIN_EMAILS) |
| Database + thumb cache | `/volume1/docker/fileshare/data/` (`share.db` = shares + activity log; `thumbs/` safe to delete) |
| Roots (folders the app can see) | `volumes:` in `docker-compose.yml` → mounted under `/data/<name>` in the container |
| NAS home dir (real path) | `/home/Michael Stine/` (NOT `/volume1/home`) |
| Container port | 3000 inside, **3100** on the NAS |
| Cloudflare route | Networking → Tunnels → stinenas → Routes → `share.michaelstine.net` → `http://192.168.5.11:3100` |
| NAS LAN IP | 192.168.5.11 (DHCP — reserve it in the router eventually) |
| SSH | `ssh "Michael Stine"@192.168.5.11` (UGOS password; docker needs `sudo`) |

## Current roots
```
/home/Michael Stine/02 PROJECTS      → /data/02-projects
/home/Michael Stine/02 PROJET REFS   → /data/02-project-refs
/home/Michael Stine/03 PHOTOS        → /data/03-photos
```
Add a root = add a line under `volumes:` in compose, then `sudo docker compose up -d`. Append `:ro` for read-only. Remove line = root gone. Admin → Roots shows what's mounted.

## Everyday commands (SSH, then `cd /volume1/docker/fileshare`)
```
sudo docker compose up -d --build     # rebuild after code changes
sudo docker compose up -d             # restart after .env / compose change
sudo docker compose logs --tail 50 share
sudo docker compose ps
sed -i 's/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=NEW/' .env && sudo docker compose up -d   # change admin pw
```

## Deploying a code change (auto, since 2026-11-05)
Source of truth: private repo `github.com/MasterPrimez/fileshare` (branch `main`). `.env` and `data/` are gitignored — never in the repo.
- NAS has a read-only deploy key (`/root/.ssh/fileshare_deploy`, added under repo Settings → Deploy keys).
- UGOS has no git/apt; `/usr/local/bin/git` is a wrapper that runs `alpine/git` in Docker.
- Root cron every 2 min runs `/volume1/docker/fileshare/deploy.sh`: fetch → if main moved, `git reset --hard` + `docker compose build` + `up -d`. Log: `data/deploy.log`.
- Push to main = live within ~2 min. Manual: `sudo ./deploy.sh` (`sudo ./deploy.sh force` to rebuild anyway). Rollback: `git revert` + push.
- Stale-cache symptom (build says CACHED, change missing): `sudo docker compose build --no-cache && sudo docker compose up -d`.

## Code map
```
app/s/[token]/page.tsx     share entry: status check → Gate or Gallery
app/s/[token]/gate.tsx     password screen
app/s/[token]/gallery.tsx  visitor gallery (folders, tiles, lightbox, select, zip, edit-mode upload/delete)
app/admin/admin.tsx        admin UI: Shares list, New share (picker + preview), Activity, Roots, share Detail + log
app/admin/login.tsx        admin password screen
app/brand.tsx              logo (public/logo.png light wordmark for dark bg, public/logo-dark.png for light theme)
app/globals.css            all styling (dark cockpit: Bebas Neue, IBM Plex Mono, amber #e8a33d)
app/api/s/[token]/         visitor API: list, thumb, file (range streaming), zip, unlock, edit (PUT/DELETE/PATCH)
app/api/admin/             admin API: shares (CRUD), shares/[id], browse, thumb, events, login
lib/roots.ts               root discovery (DATA_DIR) + resolveSafe (path-traversal guard)
lib/files.ts               listDir, resolveInShare (share-scope guard), thumbnails (sharp + ffmpeg), walk
lib/shares.ts              SQLite CRUD, token gen, bcrypt passwords, status, event log
lib/auth.ts                HMAC cookies for share unlock + admin; Cloudflare Access header support
lib/db.ts                  better-sqlite3 schema (shares, events)
```

## Security model
- App sees only mounted roots. Nothing else on the NAS exists to it.
- Share links are 32-char random tokens; passwords bcrypt-hashed; 8 bad tries → 15 min lockout per IP.
- Every path is resolved then checked twice: inside a root (`resolveSafe`) AND inside the share folder (`resolveInShare`). `../` escapes tested and blocked.
- Edit mode can only write/delete inside the share folder; can never delete the share root itself.
- Cookies: HMAC-signed with APP_SECRET; `secure` only on HTTPS so LAN login also works.
- Optional second lock: Cloudflare Access on `/admin` + `/api/admin` (email one-time code). Not set up yet; `ADMIN_EMAILS` in .env is already wired for it.

## Visitor names + colored log (v4)
- Each browser gets a `vid` cookie (3 yrs) from `middleware.ts`. `visitors` table stores name per vid; `events.visitor_id` links them.
- Share option **Ask for name** (`shares.ask_name`): first visit on a device shows `app/s/[token]/namegate.tsx` (Continue / Skip) → `POST /api/s/[token]/name`. Never asked again on that device, across all shares.
- Log (`app/admin/log.tsx`, used by desktop + phone): one of 8 hues per visitor (by vid, else IPv6 /64 + device), legend chips with counts, click a chip to rename. Your own logged-in device shows "(you)". Opens from the same device within an hour count once.
- Rules: no password → name optional (only if Ask-for-name is on, skippable). Password → name REQUIRED on the same gate screen, no skip (`unlock` returns `{error:"name"}` without one); Ask-for-name switch is forced on + disabled when Password is on.
- Passwords are stored bcrypt-hashed (for checking) AND AES-GCM encrypted with APP_SECRET (`lib/secret.ts`, column `password_enc`) so admin can display them. Changing APP_SECRET makes old passwords unreadable (still work for visitors). Shares from before this update show a placeholder until a new password is set.
- Share detail: one UPDATE button saves expiry + password together.
- Desktop New Share now uses 24H/7D/30D/Never chips + Password/Ask-for-name switches, like the phone.

## Dashboard (admin first tab)
`app/admin/dashboard.tsx` ← `GET /api/admin/stats?days=7|30|90|0` (`stats()` in lib/shares.ts). Tiles, daily opens/downloads bars, device donut, top shares, top visitors, expiring-soon with Extend 7D. `events.bytes` records download/zip sizes from now on (older events count 0 toward "data served").

## Admin gallery + admin bypass
Shares page has grid (cover cards, hover → Open/Copy) and list views. Logged-in admin opens any share link with no password/name gate (`isAdmin` short-circuits in `app/s/[token]/page.tsx` and `lib/access.ts`). Share detail has OPEN, and a COVER picker per folder.

## Collections (multi-folder shares)
`shares.paths` = JSON array of root-relative folders (null = single-folder share using `path`). Visitor sees each as a top-level folder named by basename (`shareItems()` de-dupes). `mapSub(share, sub)` in lib/shares.ts resolves a visitor path's first segment to the right base; all visitor routes go through it. At the collection top: no upload/delete; Download All zips every folder. Admin: browse → "+ Add to collection" per folder; phone: "+ ADD" on the picker.

## Folder covers
`covers` table: root-relative folder path → filename. Set from admin New Share preview (hover a photo → ★). No cover set = first photo alphabetically. Shown on visitor folder tiles / filmstrip / columns, and in the admin + phone pickers. API: `PATCH /api/admin/cover {path, file|null}`.

## iPhone app (PWA) — `/m`
`https://share.michaelstine.net/m` is a phone-first admin. Safari → Share → **Add to Home Screen** installs it as "Share" with its own icon, full-screen, no browser chrome. Same login/cookie as /admin. Flow: Shares list → Pick folder → New share → Link ready (iOS share sheet via `navigator.share`) → Detail with stats + log. Files: `app/m/{layout,page,app}.tsx`, `public/manifest.webmanifest`, `public/sw.js`, icons `public/icon-*.png` + `apple-touch-icon.png` (made from logo.png; sources in Claude scratch — regenerate from `public/logo.png` if needed).

## Not done / ideas
- Push notifications to the phone when a share is opened/downloaded (needs VAPID keys + a subscriptions table; the PWA is ready for it).
- Notifications on open/download (Telegram or ntfy) — hooks are easy: add a call in `lib/shares.ts logEvent()`.
- Cloudflare Access in front of /admin.
- DHCP reservation for the NAS IP.
- RAW thumbnails only work for formats sharp can read (DNG/TIFF-based); ARW/CR3 show a RAW badge with no preview.
- Watchtower / auto-updates not configured.
