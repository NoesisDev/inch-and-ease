#!/bin/sh
# Copy the server's keys into the Vercel project "inch-and-ease-app" (production), straight from .env.local and
# ~/.hackathon-video/fish.key: nothing is printed. The Matterport SDK key is left out on purpose (localhost-only, and a
# CoStar credential that must not reach a public page). Run once from the repo root: sh scripts/app_env.sh
set -e
cd "$(dirname "$0")/.."
[ -f .app-deploy/.vercel/project.json ] || { echo "run scripts/deploy_app.sh first"; exit 1; }
add() { vercel env rm "$1" production --yes --cwd .app-deploy >/dev/null 2>&1 || true
        printf %s "$2" | vercel env add "$1" production --cwd .app-deploy >/dev/null && echo "added $1"; }
for k in ANTHROPIC_API_KEY MATTERPORT_API_KEY MATTERPORT_API_TOKEN VEXCEL_API_KEY; do
  add "$k" "$(grep "^$k=" .env.local | cut -d= -f2- | tr -d '"' | tr -d '[:space:]')"
done
[ -f ~/.hackathon-video/fish.key ] && add FISH_API_KEY "$(tr -d '[:space:]' < ~/.hackathon-video/fish.key)"
echo "done: tell Claude, it redeploys"
