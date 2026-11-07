#!/bin/bash
# Auto-deploy: pulls main from GitHub and rebuilds when a NEW commit hasn't been successfully deployed yet.
# Run by root cron every 2 min. Manual: sudo ./deploy.sh   |   sudo ./deploy.sh force
# Whole script is wrapped in a block so bash parses it fully before git replaces the file underneath it.
{
export PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin
cd /volume1/docker/fileshare || exit 1
git fetch -q origin main || { echo "$(date '+%F %T') fetch failed"; exit 1; }
want=$(git rev-parse origin/main)
have=$(cat data/deployed 2>/dev/null)
if [ "$1" = "force" ] || [ "$want" != "$have" ]; then
  # docker-compose.yml (the root-folder list) is NAS-only: keep it safe across resets
  cp -p docker-compose.yml /tmp/fileshare-compose.bak 2>/dev/null
  git reset -q --hard origin/main
  [ -f docker-compose.yml ] || cp -p /tmp/fileshare-compose.bak docker-compose.yml
  echo "$(date '+%F %T') deploying ${want:0:7}: $(git log -1 --pretty=%s)"
  if docker compose build > data/build.log 2>&1 && docker compose up -d >> data/build.log 2>&1; then
    echo "$want" > data/deployed
    echo "  ok · $(grep -E 'Container share' data/build.log | tail -1 | xargs)"
  else
    echo "  BUILD FAILED — will retry next run. Last lines of data/build.log:"
    tail -6 data/build.log | sed 's/^/    /'
  fi
fi
exit 0
}
