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

A Matterport tour of a real apartment, checked for a manual wheelchair user against 21 checks: door widths, door steps, turning space, hallway width and essential rooms on the entry floor come from the scan; the bathroom, entry, bed, kitchen and controls are completed in the tour with a question or a two-click measurement. Every problem is a numbered pin and a tinted room in the 3D view, critical ones first (on the route from the entry to the bathroom, bedroom or kitchen). Each card shows measured vs needed, a photo from the tour, a to-scale drawing and every rung of the fix ladder ($0 options, catalogue products by tier, the contractor range), each re-checked against the limit. The Plan tab keeps a budget, the chosen fixes and what stays open, and prints to one page. Claude answers questions by driving the tour (fly to a problem, choose a fix, set a budget).

Statuses are pass, check with a tape, fail, or not measured yet; nothing is guessed. Results are measured from the scan or by the person, against ADA 2010 reference numbers; confirm with a tape before you sign.

Run it locally (needs the CoStar/Matterport hackathon keys and a Claude API key in `.env.local`):

```bash
uv run --with anthropic python tour/fetch_models.py    # pulls the tours listed in tour/private/tours/index.json (not committed)
# put Matterport's viewer bundle in tour/private/mp: npm pack @matterport/webcomponent@0.1.47, copy built-bundle/ + dist/matterport-viewer.umd.js
uv run --with anthropic python tour/serve.py           # http://localhost:8090
node --test tour/*.test.mjs                            # checks, severity, fix options, re-check, budget
```

Tour data and imagery belong to CoStar / Matterport and are never committed (`tour/private/` is git-ignored; the regression test on the real tours skips without it).

### Credits
- [Matterport web component and Showcase SDK](https://matterport.github.io/developer-docs/) (`@matterport/webcomponent` 0.1.47); CoStar / Matterport hackathon data (not included)
- [three.js](https://threejs.org) 0.184 (Matterport scene objects, loaded from the viewer bundle) and 0.170 (`tour/model.html`)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python), Claude Opus 5.5
- Work Sans (Google Fonts); start-screen photo from [Unsplash](https://unsplash.com/photos/woman-in-wheelchair-at-doorway-mjJwgKMktLg)
- Limits: 2010 ADA Standards and US Access Board research; Housing Enabler item codes (codes only) and HOME FAST item numbers as anchors; fix evidence cited per product in `data/products.json`
