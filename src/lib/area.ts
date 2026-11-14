// Area check around one point: Vexcel terrain (slope) + OpenStreetMap (streets, transit, kerbs).
import { fromArrayBuffer } from "geotiff";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const VEXCEL = "https://api.vexcelgroup.com/v2";
const LAYERS = "urban,urban-r,wide-area,urban-g";
const R = 6378137; // Web Mercator radius; Vexcel rasters come back in EPSG:3857

export type Pt = [number, number]; // [lat, lon]
export type Seg = { a: Pt; b: Pt; za: number; zb: number; slope: number; name?: string; kind?: string; steps?: boolean };
export type Poi = { kind: "station" | "bus" | "kerb" | "elevator"; at: Pt; name?: string; wheelchair?: string; kerb?: string; dist: number };

export const merc = ([lat, lon]: Pt): Pt => [R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)), (R * lon * Math.PI) / 180];
export const dist = (p: Pt, q: Pt) =>
  Math.hypot((p[0] - q[0]) * 111320, (p[1] - q[1]) * 111320 * Math.cos((p[0] * Math.PI) / 180));

export function bbox(lat: number, lon: number, half: number) {
  const dlat = half / 111320, dlon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return { s: lat - dlat, n: lat + dlat, w: lon - dlon, e: lon + dlon };
}
export const wkt = (b: ReturnType<typeof bbox>) =>
  `POLYGON((${b.w} ${b.s},${b.e} ${b.s},${b.e} ${b.n},${b.w} ${b.n},${b.w} ${b.s}))`;

export async function vexcel(path: string, body: object) {
  const key = process.env.VEXCEL_API_KEY;
  if (!key) throw new Error("VEXCEL_API_KEY missing in .env.local");
  const r = await fetch(`${VEXCEL}/${path}`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ srid: 4326, layer: LAYERS, crop: "bounding_box", ...body }),
    signal: AbortSignal.timeout(25_000),
  }).catch((e: Error) => { throw new Error(e.name === "TimeoutError" ? "Vexcel did not answer within 25 seconds, try again" : `Vexcel could not be reached (${e.message})`); });
  if (r.status === 403) throw new Error("Vexcel covers Houston and Los Angeles only");
  if (!r.ok) throw new Error(`Vexcel ${path} answered ${r.status}`);
  return r;
}

// A point -> map units 0..1000 across the box (x east, y south), in Web Mercator like the photo and rasters.
export function mapXY(b: ReturnType<typeof bbox>) {
  const [y1, x0] = merc([b.n, b.w]), [y0, x1] = merc([b.s, b.e]);
  return (p: Pt): Pt => { const [y, x] = merc(p); return [((x - x0) / (x1 - x0)) * 1000, ((y1 - y) / (y1 - y0)) * 1000]; };
}

// A Vexcel elevation raster over the box: dtm = bare ground, dsm = top surface (roofs, trees). North row first, NaN = no data.
// Not img.getBoundingBox(): geotiff.js ignores Vexcel's centre tiepoint and shifts the box by half.
// With crop "bounding_box" the raster spans exactly the box we asked for (checked against rasterio, <1 m).
export async function raster(kind: "dtm" | "dsm", b: ReturnType<typeof bbox>, px: number) {
  const buf = await (await vexcel(`${kind}/extract`, { wkt: wkt(b), "destination-dimensions": `${px},${px}` })).arrayBuffer();
  const img = await (await fromArrayBuffer(buf)).getImage();
  const z = Float32Array.from((await img.readRasters())[0] as unknown as ArrayLike<number>, (v) => (v > -9000 ? v : NaN));
  return { w: img.getWidth(), h: img.getHeight(), z };
}

// Ground elevation sampler from Vexcel's DTM (~1 m pixels over the box), averaged over 3x3 pixels.
async function terrain(b: ReturnType<typeof bbox>, px: number) {
  const [y1, x0] = merc([b.n, b.w]), [y0, x1] = merc([b.s, b.e]);
  const { w, h, z } = await raster("dtm", b, px);
  // Coarse copy for the 3D view: every 4th pixel (~4 m), north row first; no-data stays null.
  const step = 4, gw = Math.ceil(w / step), gh = Math.ceil(h / step), heights: (number | null)[] = [];
  for (let r = 0; r < h; r += step) for (let c = 0; c < w; c += step) heights.push(Number.isNaN(z[r * w + c]) ? null : Math.round(z[r * w + c] * 10) / 10);
  const sample = (p: Pt) => {
    const [my, mx] = merc(p);
    const c = Math.round(((mx - x0) / (x1 - x0)) * (w - 1)), r = Math.round(((y1 - my) / (y1 - y0)) * (h - 1));
    let sum = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const v = z[(r + dr) * w + c + dc];
        if (r + dr >= 0 && r + dr < h && c + dc >= 0 && c + dc < w && !Number.isNaN(v)) { sum += v; n++; }
      }
    return n ? sum / n : NaN;
  };
  return { z: sample, grid: { w: gw, h: gh, heights } };
}

export type OsmEl = { type: string; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number }; geometry?: { lat: number; lon: number }[] };

async function osm(lat: number, lon: number, b: ReturnType<typeof bbox>) {
  const box = `${b.s},${b.w},${b.n},${b.e}`;
  const q = `[out:json][timeout:25];
way["highway"]["highway"!~"motorway|motorway_link|trunk|construction|proposed"](${box})->.w; .w out geom;
(node["highway"="bus_stop"](around:400,${lat},${lon});
 nwr["railway"="station"](around:2000,${lat},${lon});
 node["kerb"](${box});
 nwr["highway"="elevator"](around:1000,${lat},${lon}););
out center tags;`;
  return overpass(q, `${lat.toFixed(5)},${lon.toFixed(5)}`);
}

// Overpass servers are slow at night (12–40 s); cache answers on disk and race two servers.
export async function overpass(q: string, cacheKey: string) {
  const file = path.join(process.cwd(), ".osm-cache", `${cacheKey}.json`);
  const hit = await readFile(file, "utf8").catch(() => null);
  if (hit) return JSON.parse(hit) as OsmEl[];
  const ask = async (url: string) => {
    const r = await fetch(url, { method: "POST", headers: { "User-Agent": "inch-and-ease hackathon demo" }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(45_000) });
    if (!r.ok) throw new Error(`OpenStreetMap (Overpass) answered ${r.status}`);
    return ((await r.json()).elements ?? []) as OsmEl[];
  };
  const race = () => Promise.any([ask("https://overpass-api.de/api/interpreter"), ask("https://maps.mail.ru/osm/tools/overpass/api/interpreter")]);
  // Both servers answer 502/504 now and then at night; one retry after a pause clears most of those.
  const els = await race()
    .catch(() => new Promise((ok) => setTimeout(ok, 4000)).then(race))
    .catch((e: AggregateError) => { throw new Error(`${e.errors[0].message}; both OpenStreetMap servers are busy, try again in a minute`); });
  // Vercel's disk is read-only: the cache is shipped with the deploy, new answers just aren't saved.
  await mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, JSON.stringify(els))).catch(() => {});
  return els;
}

// Split a street into pieces of at least 10 m and measure each piece's slope.
function streetSegs(el: OsmEl, z: (p: Pt) => number): Seg[] {
  const g = (el.geometry ?? []).map((p): Pt => [p.lat, p.lon]);
  const out: Seg[] = [];
  let start = g[0], len = 0;
  for (let i = 1; i < g.length; i++) {
    len += dist(g[i - 1], g[i]);
    if (len >= 10 || i === g.length - 1) {
      const za = z(start), zb = z(g[i]), dz = zb - za;
      if (len >= 3 && Number.isFinite(dz))
        out.push({ a: start, b: g[i], za, zb, slope: (Math.abs(dz) / len) * 100, name: el.tags?.name, kind: el.tags?.service ?? el.tags?.highway, steps: el.tags?.highway === "steps" });
      start = g[i]; len = 0;
    }
  }
  return out;
}

export async function analyze(lat: number, lon: number, half = 250) {
  const b = bbox(lat, lon, half);
  const home: Pt = [lat, lon];
  const [{ z, grid }, els] = await Promise.all([terrain(b, Math.round(half * 2)), osm(lat, lon, b)]);
  // Bridges and tunnels are skipped: the terrain model is bare ground, not the deck.
  const segs = els.filter((e) => e.type === "way" && e.geometry && !e.tags?.bridge && !e.tags?.tunnel)
    .flatMap((e) => streetSegs(e, z))
    .map((s) => ({ ...s, len: dist(s.a, s.b), near: Math.min(dist(home, s.a), dist(home, s.b)) }));
  const at = (e: OsmEl): Pt => [e.lat ?? e.center!.lat, e.lon ?? e.center!.lon];
  const pois: Poi[] = els
    .filter((e) => !e.geometry)
    .map((e): Poi => {
      const t = e.tags ?? {};
      const kind = t.railway === "station" ? "station" : t.highway === "bus_stop" ? "bus" : t.highway === "elevator" ? "elevator" : "kerb";
      return { kind, at: at(e), name: t.name, wheelchair: t.wheelchair, kerb: t.kerb, dist: Math.round(dist(home, at(e))) };
    })
    .sort((p, q) => p.dist - q.dist);

  const near = segs.filter((s) => Math.min(dist(home, s.a), dist(home, s.b)) <= 100);
  const steepestNear = near.reduce<Seg | null>((m, s) => (!m || s.slope > m.slope ? s : m), null);
  const stepFree = pois.find((p) => p.kind === "station" && (p.wheelchair === "yes" || p.wheelchair === "limited")) ?? null;

  return {
    lat, lon, half, b, segs, pois, grid,
    summary: {
      steepestNear: steepestNear && { slope: steepestNear.slope, name: steepestNear.name ?? "unnamed path", steps: !!steepestNear.steps },
      stepFree,
      station: pois.find((p) => p.kind === "station") ?? null,
      busStops400: pois.filter((p) => p.kind === "bus").length,
      kerbs: pois.filter((p) => p.kind === "kerb" && p.dist <= 150).length,
      loweredKerbs: pois.filter((p) => p.kind === "kerb" && p.dist <= 150 && (p.kerb === "lowered" || p.kerb === "flush")).length,
      elevators: pois.filter((p) => p.kind === "elevator"),
    },
  };
}
export type Area = Awaited<ReturnType<typeof analyze>>;
