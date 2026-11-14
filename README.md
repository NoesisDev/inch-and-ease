# Inch & Ease

*Measured. Checked. Bought.*

An accessibility room planner built solo at HackPrinceton Fall 2026 (Nov 13–15).

`data/` (products, checks, profiles, sources) was collected as research before the event; all code was written during the hacking window.

## Around the building (`src/`, Next.js)

Type a latitude and longitude in Houston or Los Angeles. The page draws Vexcel's aerial photo, colours every street and path within 250 m by its slope (from Vexcel's ground-elevation model: up to 5% walking route, 5–8% hard push, over 8% past a manual wheelchair's limit), and lists the nearest step-free station, bus stops, mapped kerbs and elevators from OpenStreetMap, plus Vexcel's oblique photos of the building from four sides.

```bash
npm install
npm run dev    # http://localhost:3000/?q=<lat>,<lon>  (needs VEXCEL_API_KEY in .env.local)
```

Vexcel imagery is fetched live through `/api/image` (the key stays on the server) and never committed; OpenStreetMap answers are cached in `.osm-cache/` (git-ignored).

### Credits
- [Next.js](https://nextjs.org) 16.4, React 19, Tailwind CSS 4
- [geotiff.js](https://geotiffjs.github.io) 3.0 (reads Vexcel's elevation GeoTIFFs)
- Vexcel API 2.0 (CoStar hackathon key): ortho, oblique and DTM imagery © Vexcel Imaging US, Inc.
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), via the Overpass API
- Slope limits: ADA 2010 Standards (5% walking route, 1:12 ramp); Bolten & Caspi, PLOS ONE 2021 (manual wheelchair 8% uphill)

## The 3D tour (`tour/`)

A Matterport tour of a real apartment with every wheelchair problem marked in red inside the room, a card with the measured numbers, a photo, a to-scale drawing and the cheapest fix, and Claude to answer questions by driving the tour.

Run it locally (needs the CoStar/Matterport hackathon keys and a Claude API key in `.env.local`):

```bash
uv run --with anthropic python tour/fetch_models.py    # pulls the tours' wall/door data into tour/private/ (not committed)
# put Matterport's viewer bundle in tour/private/mp: npm pack @matterport/webcomponent@0.1.47, copy built-bundle/ + dist/matterport-viewer.umd.js
uv run --with anthropic python tour/serve.py           # http://localhost:8090
node --test tour/fixes.test.mjs                        # fix planner tests
```

Tour data and imagery belong to CoStar / Matterport and are never committed (`tour/private/` is git-ignored).

### Credits
- [Matterport web component and Showcase SDK](https://matterport.github.io/developer-docs/) (`@matterport/webcomponent` 0.1.47), CoStar/Matterport hackathon data
- [three.js](https://threejs.org) 0.184 (Matterport scene objects) and 0.170 (`tour/model.html`)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python), Claude Opus 5.5
- Instrument Serif and Inter (Google Fonts)
