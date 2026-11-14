# Inch & Ease

*Measured. Checked. Bought.*

An accessibility room planner built solo at HackPrinceton Fall 2026 (Nov 13–15).

`data/` (products, checks, profiles, sources) was collected as research before the event; all code was written during the hacking window.

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
