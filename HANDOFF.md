# HANDOFF — fileshare (share.michaelstine.net)

Last updated: 2026-11-06 by Claude. Status: **live and working.**

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

## v5 (2026-11-06): Library, blue admin layer, rename, history
- **Library** = `/s/library`: admin-only virtual share over every root (`libraryShare()` in lib/shares.ts; `openShare` + page.tsx check `isAdmin` first; visitors get MISSING). Never logs events.
- **Admin layer** (blue, `--blue`): when admin is logged in, any `/s/<token>` renders `app/s/[token]/adminstrip.tsx` above the header (mode / expiry / password / + folder / copy / save; Library: shares on this folder + SHARE THIS FOLDER → `/admin#new?p=`). Folder tiles get hover controls ★ cover (CoverModal), ✎ rename, ✕ remove-from-collection. The old iframe viewer is gone.
- **Display names**: `aliases` table (root-relative folder path → name), `getAlias/setAlias` in lib/files.ts, `PATCH /api/admin/alias`. `Entry.name` already reflects the alias; `Entry.alias/real` are admin-only (`publicEntries()` strips them for visitors). Roots can't be renamed. Disk is never touched.
- **Share folders**: `PATCH /api/admin/shares/:id { paths: [...] }` adds/removes folders (updateShare validates each). Detail page lists folders with rename / cover / remove + FolderPicker (`app/admin/pickers.tsx`, shared with the strip).
- **History**: gallery folder = `?p=`, lightbox = `?f=`; `nav()` pushes state, popstate restores, so back/forward and deep links work. Admin tabs live in the hash (`#shares`, `#share/<id>`, `#new?p=`).
- **Logo** is a link: visitor → share root, admin → /admin. `.brand .tag` has the Kinetics gradient-shimmer sweep.
- **First-visit tour** (`app/s/[token]/tour.tsx`): 4 coach marks (views, filters, open, download), once per browser (`localStorage share:tour:v1`), visitors only. Bump the key to show it again after big UI changes.
- **Breadcrumb chips** (`.crumbs.chips`): on every folder change a trail-wide sheen crosses the chips (per-chip `--cw/--cx` set in gallery.tsx), current folder fills amber. Michael may want to revisit this animation.
- **Roots** page is read-only by design (locked badge). Changing roots = edit docker-compose.yml over SSH (see Share-Root-Folders.pdf). deploy.sh backs up compose across resets.

## Admin gallery + admin bypass
Shares page has grid (cover cards, hover → Open/Edit/Copy) and list views. Logged-in admin opens any share link with no password/name gate (`isAdmin` short-circuits in `app/s/[token]/page.tsx` and `lib/access.ts`).

## Collections (multi-folder shares)
`shares.paths` = JSON array of root-relative folders (null = single-folder share using `path`). Visitor sees each as a top-level folder named by basename (`shareItems()` de-dupes). `mapSub(share, sub)` in lib/shares.ts resolves a visitor path's first segment to the right base; all visitor routes go through it. At the collection top: no upload/delete; Download All zips every folder. Admin: browse → "+ Add to collection" per folder; phone: "+ ADD" on the picker.

## Visitor uploads (per share)
`shares.upload_path` (root-relative folder, null = off) + `shares.upload_limit` (bytes, null = unlimited). Set in New Share / share detail / blue strip (`UploadSettings` in app/admin/pickers.tsx); default landing folder `<share folder>/Uploads`. Visitor side `app/s/[token]/upload.tsx`: green UPLOAD button (only when on), drag-anywhere splash, album name required (remembered per device), native multi-select on phones. Files go up in 20 MB chunks to `POST /api/s/[token]/upload` (stages chunks in `<upload_path>/.uploading/*.part` — same filesystem, so the final rename is atomic — then moves into `<upload_path>/<album>/` on the last chunk) so Cloudflare's 100 MB request cap never bites. Add-only: duplicates become `name 2.ext`; visitors can't delete. Quota checked on the first chunk (`folderSize`). Every file logs an `upload` event with bytes + visitor. HEIC from iPhones is stored as-is (no thumbnail; sharp has no libheif in the image).

## Hidden files (admin)
`hidden` table: root-relative file path. Admin hides a photo from the ★/👁 hover control or by selecting + HIDE (blue). Hidden files vanish for every visitor in every share: list, thumb, file, zip (`isHidden` checks in lib/files.ts + the visitor routes). Admin sees them dimmed with a HIDDEN badge; the eye restores. Disk is never touched. API: `PATCH /api/admin/hide {paths, hidden}`.

## Folder covers
`covers` table: root-relative folder path → path inside it (`IMG.jpg` or `Sub/IMG.jpg`, so a parent can use a photo from a subfolder). Set from the ★ cover picker (Library / share detail / New Share preview); drill into subfolders and ★ there — it still sets the folder you opened the picker for. No cover set = first photo, else first photo found in a subfolder. Shown on visitor folder tiles / filmstrip / columns, and in the admin + phone pickers. API: `PATCH /api/admin/cover {path, file|null}`.

## iPhone app (PWA) — `/m`
`https://share.michaelstine.net/m` is a phone-first admin. Safari → Share → **Add to Home Screen** installs it as "Share" with its own icon, full-screen, no browser chrome. Same login/cookie as /admin. Flow: Shares list → Pick folder → New share → Link ready (iOS share sheet via `navigator.share`) → Detail with stats + log. Files: `app/m/{layout,page,app}.tsx`, `public/manifest.webmanifest`, `public/sw.js`, icons `public/icon-*.png` + `apple-touch-icon.png` (made from logo.png; sources in Claude scratch — regenerate from `public/logo.png` if needed).

## Not done / ideas
- Push notifications to the phone when a share is opened/downloaded (needs VAPID keys + a subscriptions table; the PWA is ready for it).
- Notifications on open/download (Telegram or ntfy) — hooks are easy: add a call in `lib/shares.ts logEvent()`.
- Cloudflare Access in front of /admin.
- DHCP reservation for the NAS IP.
- RAW thumbnails only work for formats sharp can read (DNG/TIFF-based); ARW/CR3 show a RAW badge with no preview.
- Watchtower / auto-updates not configured.
