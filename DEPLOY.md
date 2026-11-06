# share.michaelstine.net — deploy

## 1. Put the project on the NAS
Copy this folder to the NAS, e.g. `/volume1/docker/share/`. (Same place you keep Jellyfin's compose.)

## 2. Confirm the real root paths
SSH into the NAS (or use the UGOS terminal) and check:
```
ls -la "/volume1/home/Michael Stine/"
```
If the home folder lives somewhere else (e.g. `/volume1/homes/...`), fix the three
`volumes:` lines in `docker-compose.yml` to match.

## 3. Secrets
```
cp .env.example .env
```
Edit `.env`:
- `ADMIN_PASSWORD` — your admin login (fallback when Cloudflare Access is not in front)
- `APP_SECRET` — run `openssl rand -hex 32` and paste it
- `ADMIN_EMAILS` — your Google email (used by Cloudflare Access)

## 4. Cloudflare Tunnel
The existing `stinenas` tunnel is reused. Cloudflare → Networking → Tunnels → stinenas → Public Hostname → Add:
- subdomain `share`, domain `michaelstine.net`, type `HTTP`, URL `<NAS-LAN-IP>:3100`
That creates the DNS record automatically.

## 5. Lock /admin behind Cloudflare Access
Zero Trust → Access → Applications → **Add** → Self-hosted
- Name: `Share admin`, domain `share.michaelstine.net`, path `admin`
- Policy: Allow → Emails → your email
- Also add a second application for path `api/admin` with the same policy.

Visitors to share links never see this; only `/admin` prompts for the Google/email-code login.

## 6. Start
```
cd /volume1/docker/share
docker compose up -d --build
```
First build takes a few minutes (compiles sharp/sqlite, installs ffmpeg).
Test on the LAN first: `http://<NAS-LAN-IP>:3100/admin`

Open `https://share.michaelstine.net/admin` → New share → pick folder → Create & copy link.

## Roots
Admin → Roots shows what's mounted. To add one: add a line under `volumes:` in
`docker-compose.yml`, then `docker compose up -d`. Append `:ro` for read-only roots.

## Updates
```
docker compose up -d --build
```
Optional: add Watchtower for cloudflared auto-updates.

## Data
- `./data/share.db` — shares + activity log (back this up)
- `./data/thumbs/` — thumbnail cache (safe to delete)
