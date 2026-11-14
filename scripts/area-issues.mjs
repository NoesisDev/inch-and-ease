// List area issues for one or more places, for every profile or one.
//   npm run area:issues -- 34.0951060,-118.2122130 [29.75,-95.37 ...]
//   npm run area:issues -- --csv path/to/models_index.csv [--limit 10] [--profile manual] [--json]
// The CSV needs lat and lon columns (name, sid optional). Needs VEXCEL_API_KEY in .env.local.
import { readFileSync } from "node:fs";
import { analyze } from "../src/lib/area.ts";
import { findIssues, PROFILES } from "../src/lib/issues.ts";

process.loadEnvFile?.(".env.local");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (k) => { const i = args.indexOf(k); return i >= 0 && args.splice(i, 1).length > 0; };
const json = flag("--json"), csv = opt("--csv"), limit = Number(opt("--limit") ?? 10), only = opt("--profile");
const profiles = only ? PROFILES.filter((p) => p.id === only) : PROFILES;
if (!profiles.length) throw new Error(`--profile must be one of ${PROFILES.map((p) => p.id).join(", ")}`);

// shortcut: naive CSV split, fine for models_index.csv's lat/lon columns; quoted commas only shift later columns.
function readCsv(path) {
  const [head, ...rows] = readFileSync(path, "utf8").trim().split("\n");
  const cols = head.split(",");
  const split = (r) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
  return rows.map(split).map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}
const places = csv
  ? readCsv(csv).filter((r) => r.lat && r.lon).slice(0, limit).map((r) => ({ lat: +r.lat, lon: +r.lon, label: [r.sid, r.name].filter(Boolean).join(" ") }))
  : args.map((a) => { const [lat, lon] = a.split(",").map(Number); return { lat, lon, label: a }; });
if (!places.length || places.some((p) => !(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)))
  throw new Error("give lat,lon pairs or --csv <file>");

const ICON = { barrier: "✕", warning: "!", unknown: "?" };
for (const place of places) {
  let result;
  try {
    const a = await analyze(place.lat, place.lon);
    const input = { segs: a.segs, stepFree: a.summary.stepFree, station: a.summary.station, busStops400: a.summary.busStops400, kerbs: a.summary.kerbs, loweredKerbs: a.summary.loweredKerbs };
    result = { ...place, issues: Object.fromEntries(profiles.map((p) => [p.id, findIssues(input, p)])) };
  } catch (e) {
    result = { ...place, error: e.message };
  }
  if (json) { console.log(JSON.stringify(result)); continue; }
  console.log(`\n${place.label}  (${place.lat}, ${place.lon})`);
  if (result.error) { console.log(`  could not check: ${result.error}`); continue; }
  for (const p of profiles) {
    const list = result.issues[p.id];
    console.log(`  ${p.label}: ${list.length ? `${list.filter((i) => i.level === "barrier").length} barrier(s), ${list.length} issue(s)` : "no issues found"}`);
    for (const i of list) console.log(`    ${ICON[i.level]} ${i.title}. ${i.detail}`);
  }
}
