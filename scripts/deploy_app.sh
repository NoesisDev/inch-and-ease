#!/bin/sh
# Deploy the full app (tour/serve.py + pages + data) to the Vercel project "inch-and-ease-app" as a container.
# CoStar okayed a temporarily public judging app (Discord #costar-group, Nov 14) if raw data is not re-published:
# only what the pages load goes up; models_index.csv is read by the server, never served. Delete the project after the event.
# Run from the repo root: sh scripts/deploy_app.sh   (needs the Vercel CLI, logged in; sandbox off)
set -e
cd "$(dirname "$0")/.."
OUT=.app-deploy
rm -rf "$OUT" && mkdir -p "$OUT/src/lib" "$OUT/notes/costar_matterport/raw" "$OUT/.vercel"
rsync -a --exclude 'private/demo/public' --exclude 'private/demo/logs' --exclude 'private/demo/walk_old.*' \
  --exclude 'private/demo/walk_prev.*' --exclude '*.test.mjs' --exclude 'private/key.js' \
  --exclude 'private/candidates' --exclude 'private/expected.json' --exclude 'private/region/PLAN.md' tour data .osm-cache "$OUT/"
cp src/lib/area.ts src/lib/buildings.ts "$OUT/src/lib/"
cp notes/costar_matterport/raw/models_index.csv "$OUT/notes/costar_matterport/raw/"
cat > "$OUT/package.json" <<'EOF'
{ "private": true, "dependencies": { "three": "0.184.0", "geotiff": "3.0.5" } }
EOF
cat > "$OUT/Dockerfile" <<'EOF'
FROM node:26-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/* && pip3 install --break-system-packages --no-cache-dir anthropic
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV HOST=0.0.0.0 PYTHONUNBUFFERED=1
CMD ["python3", "tour/serve.py"]
EOF
[ -f .vercel-app/project.json ] && cp .vercel-app/project.json "$OUT/.vercel/"
cd "$OUT"
[ -f .vercel/project.json ] || { vercel link --yes --project inch-and-ease-app --scope team_kacRSinZ30xwjmqVHwBAnvae && mkdir -p ../.vercel-app && cp .vercel/project.json ../.vercel-app/; }
vercel deploy --prod --yes --archive=tgz --scope team_kacRSinZ30xwjmqVHwBAnvae
