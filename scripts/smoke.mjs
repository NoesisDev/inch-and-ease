// End-to-end check on apartments spread across neighbourhoods, no human in the loop.
//   npm run smoke -- --csv notes/costar_matterport/raw/models_index.csv [--count 12 | --sids a,b,c] [--base http://localhost:3000]
// Picks one apartment per ~10 km cell, alternating Los Angeles and Houston, then for each one:
// runs the analysis, sanity-checks the numbers, computes issues for every profile and, with --base,
// loads the page and the Vexcel images through the running site. Exit code 1 if anything failed.
import { readFileSync } from "node:fs";
import { analyze } from "../src/lib/area.ts";
import { findIssues, PROFILES, verdict } from "../src/lib/issues.ts";

process.loadEnvFile?.(".env.local");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const csv = opt("--csv"), count = Number(opt("--count", 12)), base = opt("--base"), sids = opt("--sids")?.split(",");
if (!csv) throw new Error("--csv <models_index.csv> is required");

const [head, ...lines] = readFileSync(csv, "utf8").trim().split("\n");
const cols = head.split(",");
const split = (r) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
const all = lines.map(split).map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
const rows = sids ? all.filter((r) => r.lat && r.lon) : all.filter((r) => r.lat && r.lon && (r.segment === "residential" || /\bBR\b|studio|unit/i.test(r.name)));

// One per 0.1° cell (~10 km), so the sample spreads over each city instead of one building complex.
const cells = new Map();
for (const r of rows) { const k = `${(+r.lat).toFixed(1)},${(+r.lon).toFixed(1)}`; if (!cells.has(k)) cells.set(k, r); }
const la = [...cells.values()].filter((r) => +r.lon < -110), hou = [...cells.values()].filter((r) => +r.lon > -110);
const picks = sids ? rows.filter((r) => sids.includes(r.sid)) : [];
for (let i = 0; !sids && picks.length < count && (i < la.length || i < hou.length); i++) {
  // every k-th cell, so picks spread across the whole city
  for (const list of [la, hou]) { const k = Math.max(1, Math.floor(list.length / Math.ceil(count / 2))); if (list[i * k] && picks.length < count) picks.push(list[i * k]); }
}

const fails = [];
for (const r of picks) {
  const lat = +r.lat, lon = +r.lon, t0 = Date.now(), problems = [], notes = [];
  let line = "";
  try {
    const a = await analyze(lat, lon);
    const known = a.grid.heights.filter((v) => v !== null).length / a.grid.heights.length;
    const spikes = a.segs.filter((s) => s.slope > 40).length;
    if (a.segs.length < 10) problems.push(`only ${a.segs.length} street pieces`);
    if (known < 0.95) problems.push(`terrain ${Math.round(known * 100)}% covered`);
    if (spikes > a.segs.length * 0.05) problems.push(`${spikes} pieces steeper than 40%`);
    if (a.segs.some((s) => !Number.isFinite(s.slope) || !Number.isFinite(s.za))) problems.push("NaN in street heights");
    const input = { segs: a.segs, stepFree: a.summary.stepFree, station: a.summary.station, busStops400: a.summary.busStops400, kerbs: a.summary.kerbs, loweredKerbs: a.summary.loweredKerbs };
    const counts = PROFILES.map((p) => findIssues(input, p)).map((l) => `${l.filter((i) => i.level === "barrier").length}/${l.length}`);
    const len = a.segs.reduce((t, s) => t + s.len, 0);
    const usable = a.segs.reduce((t, s) => t + (verdict(s, PROFILES[0]) === "both" ? s.len : 0), 0);
    line = `${a.segs.length} pieces · ${Math.round((usable / len) * 100)}% usable (manual) · barriers/issues manual ${counts[0]}, power ${counts[1]}, cane ${counts[2]}`;

    if (base) {
      const page = await fetch(`${base}/?q=${lat},${lon}`);
      const html = await page.text();
      if (!page.ok) problems.push(`page ${page.status}`);
      else if (html.includes("Could not check")) problems.push("page shows an error");
      else if (!/around this building/.test(html)) problems.push("page has no issues list");
      const b3 = await fetch(`${base}/api/buildings?lat=${lat}&lon=${lon}`);
      const d3 = b3.ok ? await b3.json() : null;
      if (!d3) problems.push(`3D buildings ${b3.status}`);
      else {
        const bad = d3.buildings.filter((x) => !(x.height >= 2.5 && x.height < 300) || x.pts.length < 4).length;
        if (bad) problems.push(`${bad} buildings with impossible heights or outlines`);
        line += ` · 3D ${d3.buildings.length} buildings, ${d3.trees.length} trees`;
        if (!d3.buildings.length) notes.push("no building outlines mapped here");
      }
      for (const view of ["ortho", "oblique-north"]) {
        const img = await fetch(`${base}/api/image?lat=${lat}&lon=${lon}&half=${view === "ortho" ? 250 : 40}&view=${view}`);
        const ok = img.ok && (img.headers.get("content-type") ?? "").startsWith("image/");
        if (!ok && view === "ortho") problems.push(`aerial photo ${img.status}`);
        if (!ok && view !== "ortho") notes.push(`no oblique photo (${img.status})`); // some areas only have top-down imagery
        await img.arrayBuffer().catch(() => {});
      }
    }
  } catch (e) {
    problems.push(e.message);
  }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  const status = problems.length ? "FAIL" : "ok  ";
  console.log(`${status} ${(+r.lon < -110 ? "Los Angeles" : "Houston").padEnd(11)} ${r.sid} ${r.name.slice(0, 28).padEnd(28)} ${s.padStart(3)} s  ${line}${problems.length ? `\n     ✕ ${problems.join("; ")}` : ""}${notes.length ? `\n     · ${notes.join("; ")}` : ""}`);
  if (problems.length) fails.push(r.sid);
}
console.log(`\n${picks.length - fails.length} of ${picks.length} passed${fails.length ? `; failed: ${fails.join(", ")}` : ""}`);
process.exit(fails.length ? 1 : 0);
