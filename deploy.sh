#!/bin/bash
# Auto-deploy: pulls main from GitHub and rebuilds only when something changed.
# Run by root cron every 2 min (see HANDOFF.md). Manual: sudo ./deploy.sh
cd /volume1/docker/fileshare || exit 1
git fetch -q origin main || { echo "$(date '+%F %T') fetch failed"; exit 1; }
if [ "$1" = "force" ] || [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  echo "$(date '+%F %T') deploying $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"
  docker compose build 2>&1 | tail -1 && docker compose up -d 2>&1 | tail -1
fi
