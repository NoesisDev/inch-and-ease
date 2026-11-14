# Inch & Ease

*Measured. Checked. Bought.*

An accessibility room planner built solo at HackPrinceton Fall 2026 (Nov 13–15).

`data/` (products, checks, profiles, sources) was collected as research before the event; all code was written during the hacking window.

## Around the building (`src/`, Next.js)

Type a latitude and longitude in Houston or Los Angeles. The page draws Vexcel's aerial photo, colours every street and path within 250 m by what you can manage (slope from Vexcel's ground-elevation model; pick manual wheelchair, power wheelchair or cane, or set your own uphill/downhill limit: blue both ways, amber one way only, red too steep or steps), and lists the nearest step-free station, bus stops, mapped kerbs and elevators from OpenStreetMap, plus Vexcel's oblique photos of the building from four sides.

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
- Profile presets and the colour idea: [AccessMap](https://www.accessmap.app) (University of Washington Taskar Center); Bolten & Caspi, PLOS ONE 2021

## The 3D tour (`tour/`)

A Matterport tour of a real apartment, checked for a manual wheelchair user against 21 checks: door widths, door steps, turning space, hallway width and essential rooms on the entry floor come from the scan; the bathroom, entry, bed, kitchen and controls are completed in the tour with a question or a two-click measurement. Every problem is a numbered pin and a tinted room in the 3D view, critical ones first (on the route from the entry to the bathroom, bedroom or kitchen). Each card shows measured vs needed, a photo from the tour, a to-scale drawing and every rung of the fix ladder ($0 options, catalogue products by tier, the contractor range), each re-checked against the limit. The Plan tab keeps a budget, the chosen fixes and what stays open, and prints to one page. Claude answers questions by driving the tour (fly to a problem, choose a fix, set a budget).

**Compare a neighbourhood** (`tour/region.html`): a drone view over five real apartments in one area: the aerial photo draped on the ground model, every street within 250 m coloured by slope. Ask by voice or text ("which one is best for my father, he uses a wheelchair?"): Claude writes the narration from the measured numbers only (`/api/region`, structured output), the camera flies to each apartment from hardest to best while the line is spoken, and ends by diving into the winner's 3D tour on its critical problem. Ranking rule, shown on screen: critical problems left after the cheapest fixes, then steep streets, then cost. Area data is prefetched with `node tour/region_fetch.mjs` into `tour/private/region/` (not committed).

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
- Vexcel API (CoStar hackathon key): aerial photo and ground model for the neighbourhood view, © Vexcel Imaging US, Inc. (not included); streets © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors via Overpass
- Work Sans (Google Fonts); start-screen photo from [Unsplash](https://unsplash.com/photos/woman-in-wheelchair-at-doorway-mjJwgKMktLg)
- Limits: 2010 ADA Standards and US Access Board research; Housing Enabler item codes (codes only) and HOME FAST item numbers as anchors; fix evidence cited per product in `data/products.json`
