// Prefetch for the region flyover (tour/region.html): Vexcel aerial photo + ground model for the whole area, a sharp photo tile per
// apartment, and the slope of every street within 250 m of each apartment (OpenStreetMap ways sampled on Vexcel's 1 m ground model).
// Input: tour/private/region/units.json. Output: tour/private/region/ (Sponsor Data: git-ignored, delete after the event).
// Run from the repo root: node tour/region_fetch.mjs   (needs VEXCEL_API_KEY in .env.local; never prints it)
// shortcut: geotiff comes from the repo's node_modules (installed for the src/ area page); copy it under tour/ if src/ goes away.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fromArrayBuffer } from '../node_modules/geotiff/dist-module/geotiff.js';

const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'tour/private/region/';
const env = Object.fromEntries(readFileSync(ROOT + '.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const { name, units } = JSON.parse(readFileSync(OUT + 'units.json'));
const M = 111320, mlon = lat => M * Math.cos(lat * Math.PI / 180);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function vexcel(path, body, tries = 3) {
  for (let k = 0; ; k++) {
    const r = await fetch(`https://api.vexcelgroup.com/v2/${path}`, { method: 'POST', headers: { 'X-API-KEY': env.VEXCEL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ srid: 4326, layer: 'urban,urban-r,wide-area,urban-g', crop: 'bounding_box', ...body }) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (k >= tries - 1) throw new Error(`Vexcel ${path} answered ${r.status}`);
    await wait(1500 * (k + 1)); // back off on 429 / 5xx
  }
}
const wkt = b => `POLYGON((${b.w} ${b.s},${b.e} ${b.s},${b.e} ${b.n},${b.w} ${b.n},${b.w} ${b.s}))`;
const box = (lat, lon, half) => ({ s: lat - half / M, n: lat + half / M, w: lon - half / mlon(lat), e: lon + half / mlon(lat) });
async function dtm(b, wpx, hpx) {
  const img = await (await fromArrayBuffer((await vexcel('dtm/extract', { wkt: wkt(b), 'destination-dimensions': `${wpx},${hpx}` })).buffer)).getImage();
  const w = img.getWidth(), h = img.getHeight(), z = (await img.readRasters())[0];
  return { w, h, z: Array.from(z, v => (v > -9000 ? Math.round(v * 10) / 10 : null)) }; // north row first
}
// Height at (lat, lon) inside box b, 3×3 average; null outside or no data.
const sampler = (g, b) => (lat, lon) => {
  const c = Math.round((lon - b.w) / (b.e - b.w) * (g.w - 1)), r = Math.round((b.n - lat) / (b.n - b.s) * (g.h - 1));
  let s = 0, n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const v = g.z[(r + dr) * g.w + c + dc];
    if (r + dr >= 0 && r + dr < g.h && c + dc >= 0 && c + dc < g.w && v != null) { s += v; n++; }
  }
  return n ? s / n : null;
};

// 1. The whole area: every apartment plus 450 m around, ortho 2048 px, ground model at ~10 m.
const lats = units.map(u => u.lat), lons = units.map(u => u.lon), pad = 450;
const area = { s: Math.min(...lats) - pad / M, n: Math.max(...lats) + pad / M, w: Math.min(...lons) - pad / mlon(lats[0]), e: Math.max(...lons) + pad / mlon(lats[0]) };
const widthM = (area.e - area.w) * mlon((area.s + area.n) / 2), heightM = (area.n - area.s) * M;
const px = (m, step) => Math.round(m / step);
if (!existsSync(OUT + 'area.jpg')) writeFileSync(OUT + 'area.jpg', await vexcel('ortho/extract', { wkt: wkt(area), 'image-format': 'jpeg', 'destination-dimensions': `${px(widthM, widthM / 2048)},${px(heightM, widthM / 2048)}` }));
const ground = await dtm(area, px(widthM, 10), px(heightM, 10));
console.log(`area ${Math.round(widthM)} × ${Math.round(heightM)} m, ground grid ${ground.w}×${ground.h}`);

// 2. Per apartment: a sharp 300 m photo tile, the 1 m ground model, and street slopes from OpenStreetMap.
async function overpass(lat, lon) {
  const q = `[out:json][timeout:40];way["highway"]["highway"!~"motorway|motorway_link|trunk|construction|proposed"](around:250,${lat},${lon});out geom;
nwr["railway"="station"](around:1500,${lat},${lon});out center tags;node["highway"="bus_stop"](around:400,${lat},${lon});out;`;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'inch-and-ease hackathon demo' }, body: new URLSearchParams({ data: q }) });
      if (r.ok) return (await r.json()).elements;
    } catch {}
  }
  throw new Error('Overpass did not answer');
}
const dist = (a, b) => Math.hypot((a[0] - b[0]) * M, (a[1] - b[1]) * mlon(a[0]));
const out = [];
for (const u of units) {
  const tile = box(u.lat, u.lon, 150), near = box(u.lat, u.lon, 300);
  if (!existsSync(OUT + `tile_${u.id}.jpg`)) writeFileSync(OUT + `tile_${u.id}.jpg`, await vexcel('ortho/extract', { wkt: wkt(tile), 'image-format': 'jpeg', 'destination-dimensions': '1600,1600' }));
  const z = sampler(await dtm(near, 600, 600), near), osmFile = OUT + `osm_${u.id}.json`;
  const els = existsSync(osmFile) ? JSON.parse(readFileSync(osmFile)) : await overpass(u.lat, u.lon);
  writeFileSync(osmFile, JSON.stringify(els));
  // Streets: pieces of ~20 m, slope = rise / run between their ends on the ground model. Steps are marked as steps.
  const segs = [];
  for (const w of els.filter(e => e.type === 'way' && e.geometry)) {
    const pts = w.geometry.map(p => [p.lat, p.lon]); let a = pts[0], run = 0;
    for (let k = 1; k < pts.length; k++) {
      run += dist(pts[k - 1], pts[k]);
      if (run < 20 && k < pts.length - 1) continue;
      const za = z(a[0], a[1]), zb = z(pts[k][0], pts[k][1]);
      if (za != null && zb != null && run > 4) segs.push({ a, b: pts[k], len: Math.round(run), slope: Math.round(1000 * Math.abs(zb - za) / run) / 10, steps: w.tags?.highway === 'steps' || undefined, name: w.tags?.name, kind: w.tags?.highway });
      a = pts[k]; run = 0;
    }
  }
  const total = segs.reduce((s, x) => s + x.len, 0) || 1, share = f => Math.round(100 * segs.filter(f).reduce((s, x) => s + x.len, 0) / total);
  const within = r => segs.filter(x => dist([u.lat, u.lon], x.a) < r);
  const steepest = within(150).filter(x => x.kind !== 'footway' || x.steps).sort((p, q) => q.slope - p.slope)[0];
  const station = els.filter(e => e.tags?.railway === 'station').map(e => ({ name: e.tags.name, m: Math.round(dist([u.lat, u.lon], [e.lat ?? e.center.lat, e.lon ?? e.center.lon])) })).sort((p, q) => p.m - q.m)[0];
  const terrain = {
    streets_m: total, flat_pct: share(x => !x.steps && x.slope <= 5), hard_pct: share(x => !x.steps && x.slope > 5 && x.slope <= 8), steep_pct: share(x => x.steps || x.slope > 8),
    steepest_near: steepest && { slope: steepest.slope, name: steepest.name || steepest.kind, m: Math.round(dist([u.lat, u.lon], steepest.a)) },
    steps: segs.filter(x => x.steps).length, station, bus_stops: els.filter(e => e.tags?.highway === 'bus_stop').length,
  };
  out.push({ ...u, tile, segs, terrain });
  console.log(`${u.address.padEnd(22)} streets ${total} m · flat ${terrain.flat_pct}% · 5–8% ${terrain.hard_pct}% · over 8% ${terrain.steep_pct}% · steepest near ${steepest?.slope}% · station ${station ? station.m + ' m' : 'none ≤1.5 km'}`);
  await wait(400);
}
writeFileSync(OUT + 'region.json', JSON.stringify({ name, area, widthM, heightM, ground, units: out,
  credits: 'Imagery and ground model © Vexcel Imaging US, Inc. (CoStar hackathon data). Streets © OpenStreetMap contributors (ODbL).' }));
console.log('saved tour/private/region/region.json');
