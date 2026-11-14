// Disabled parking near each apartment, for the region map: OpenStreetMap spaces tagged parking_space=disabled (or wheelchair=designated),
// and car parks that list capacity:disabled. Writes tour/private/region/<slug>/parking.json = { unitId: [{ lat, lon, n, name, m }] }, nearest first.
// Run from the repo root: node tour/parking_fetch.mjs [slug ...]   (no slug = the default area). No key needed.
// shortcut: only what volunteers mapped in OSM; an empty list means "none mapped", not "none there". Upgrade: detect painted bays on the Vexcel photo.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname, M = 111320;
const dist = (a, b) => Math.hypot((a[0] - b[0]) * M, (a[1] - b[1]) * M * Math.cos(a[0] * Math.PI / 180));
async function overpass(q) {
  for (let k = 0; k < 3; k++) for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'inch-and-ease hackathon demo' }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(90000) });
      if (r.ok) return (await r.json()).elements;
    } catch {}
    await new Promise(r => setTimeout(r, 5000)); // busy mirrors: wait, then the next one (three rounds)
  }
  throw new Error('Overpass did not answer');
}
for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : ['']) {
  const D = ROOT + 'tour/private/region/' + (slug && slug + '/'), { units } = JSON.parse(readFileSync(D + 'units.json')), out = {};
  for (const u of units) {
    const near = `(around:250,${u.lat},${u.lon})`;
    const els = await overpass(`[out:json][timeout:40];(nwr["parking_space"="disabled"]${near};nwr["amenity"="parking_space"]["wheelchair"="designated"]${near};nwr["amenity"="parking"]["capacity:disabled"]${near};);out center tags;`);
    out[u.id] = els.map(e => {
      const lat = e.lat ?? e.center.lat, lon = e.lon ?? e.center.lon, cap = e.tags['capacity:disabled'];
      return { lat, lon, n: e.tags.amenity === 'parking' ? (/^\d+$/.test(cap) ? +cap : cap === 'yes' ? 1 : 0) : +(e.tags.capacity || 1), name: e.tags.name || '', m: Math.round(dist([u.lat, u.lon], [lat, lon])) };
    }).filter(p => p.n > 0).sort((a, b) => a.m - b.m);
    console.log(`${(slug || 'default').padEnd(16)} ${u.address.padEnd(22)} ${out[u.id].length ? out[u.id].map(p => `${p.n} at ${p.m} m`).join(', ') : 'none mapped'}`);
  }
  writeFileSync(D + 'parking.json', JSON.stringify(out));
}
