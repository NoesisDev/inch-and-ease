// 3D objects for the area view: building outlines from OpenStreetMap with heights from Vexcel's surface model,
// and trees wherever Vexcel's surface stands well above the bare ground outside buildings.
import { bbox, mapXY, overpass, raster, type Pt } from "./area";

export type Building = { pts: Pt[]; ground: number; height: number }; // pts in map units (0..1000)
export type Tree = [x: number, y: number, ground: number, height: number];

const PX = 500; // ~1 m pixels over the 500 m box

function inside([x, y]: Pt, poly: Pt[]) { // ray casting
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export async function scene3d(lat: number, lon: number, half = 250) {
  const b = bbox(lat, lon, half);
  const xy = mapXY(b);
  const box = `${b.s},${b.w},${b.n},${b.e}`;
  const [dsm, dtm, els] = await Promise.all([
    raster("dsm", b, PX), raster("dtm", b, PX),
    overpass(`[out:json][timeout:25];(way["building"](${box});way["bridge"](${box}););out geom;`, `b2-${lat.toFixed(5)},${lon.toFixed(5)}`),
  ]);
  const { w, h } = dsm;
  const px = ([x, y]: Pt) => [Math.round((y / 1000) * (h - 1)), Math.round((x / 1000) * (w - 1))];
  const taken = new Uint8Array(w * h); // pixels covered by a building (plus a 2 px margin for eaves)

  // Elevated roads and bridges stand above the bare ground too; without this they came out as rows of "trees".
  const bridgeWidth = 8; // pixels (~8 m) either side of the centre line
  for (const el of els.filter((e) => !e.tags?.building)) {
    const pts = (el.geometry ?? []).map((g) => px(xy([g.lat, g.lon])));
    for (let i = 1; i < pts.length; i++) {
      const [r0, c0] = pts[i - 1], [r1, c1] = pts[i], n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0), 1);
      for (let k = 0; k <= n; k++) {
        const r = Math.round(r0 + ((r1 - r0) * k) / n), c = Math.round(c0 + ((c1 - c0) * k) / n);
        for (let dr = -bridgeWidth; dr <= bridgeWidth; dr++) for (let dc = -bridgeWidth; dc <= bridgeWidth; dc++)
          if (r + dr >= 0 && r + dr < h && c + dc >= 0 && c + dc < w) taken[(r + dr) * w + c + dc] = 1;
      }
    }
  }

  const buildings: Building[] = [];
  for (const el of els.filter((e) => e.tags?.building)) {
    const pts = (el.geometry ?? []).map((g) => xy([g.lat, g.lon]));
    if (pts.length < 4) continue;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [r0, c0] = px([Math.min(...xs), Math.min(...ys)]), [r1, c1] = px([Math.max(...xs), Math.max(...ys)]);
    const roof: number[] = [], ground: number[] = [];
    for (let r = Math.max(0, r0 - 2); r <= Math.min(h - 1, r1 + 2); r++)
      for (let c = Math.max(0, c0 - 2); c <= Math.min(w - 1, c1 + 2); c++) {
        const p: Pt = [(c / (w - 1)) * 1000, (r / (h - 1)) * 1000];
        if (r >= r0 && r <= r1 && c >= c0 && c <= c1 && inside(p, pts)) {
          if (!Number.isNaN(dsm.z[r * w + c])) roof.push(dsm.z[r * w + c]);
          if (!Number.isNaN(dtm.z[r * w + c])) ground.push(dtm.z[r * w + c]);
        }
        taken[r * w + c] = 1;
      }
    if (roof.length < 3 || ground.length < 3) continue; // outline partly outside the box or too small to measure
    const g = Math.min(...ground);
    // 80th percentile of the surface: the roof, not a chimney or a tree hanging over the edge.
    buildings.push({ pts, ground: Math.round(g * 10) / 10, height: Math.round(Math.max(2.5, pct(roof, 0.8) - g) * 10) / 10 });
  }

  // Roofs are planes (flat or pitched), canopy is bumpy: the median curvature around a point tells them apart.
  // Without this, roofs of houses missing from OpenStreetMap were drawn as trees.
  const z = dsm.z;
  const bumpy = (r: number, c: number) => {
    const v: number[] = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 1 || cc < 1 || rr >= h - 1 || cc >= w - 1) continue;
      const k = rr * w + cc;
      v.push(Math.abs(z[k - 1] + z[k + 1] + z[k - w] + z[k + w] - 4 * z[k]));
    }
    return v.length > 0 && pct(v, 0.5) > 0.5; // metres
  };
  const trees: Tree[] = [];
  for (let r = 0; r < h; r += 4) for (let c = 0; c < w; c += 4) {
    const i = r * w + c, top = dsm.z[i] - dtm.z[i];
    if (!taken[i] && top > 3 && top < 40 && bumpy(r, c))
      trees.push([Math.round((c / (w - 1)) * 10000) / 10, Math.round((r / (h - 1)) * 10000) / 10, Math.round(dtm.z[i] * 10) / 10, Math.round(top * 10) / 10]);
  }
  return { buildings, trees };
}
