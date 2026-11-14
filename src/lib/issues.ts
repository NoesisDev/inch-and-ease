// Area issue rules, shared by the page (live, per profile) and scripts/area-issues.mjs. Pure: no imports.

// Presets copied from AccessMap (accessmap.app, UW Taskar Center), read off its profile panel Nov 14, 2026.
export const PROFILES = [
  { id: "manual", label: "Manual wheelchair", up: 8, down: 10, avoidSteps: true },
  { id: "power", label: "Power wheelchair", up: 12, down: 12, avoidSteps: true },
  { id: "cane", label: "Cane", up: 14, down: 14, avoidSteps: false },
];
export type Limits = { up: number; down: number; avoidSteps: boolean };
export type Verdict = "both" | "one" | "no";

// A street piece with slope s is uphill one way and downhill the other.
export function verdict(s: { slope: number; steps?: boolean }, p: Limits): Verdict {
  if (s.steps) return p.avoidSteps ? "no" : "both";
  if (s.slope <= Math.min(p.up, p.down)) return "both";
  return s.slope <= Math.max(p.up, p.down) ? "one" : "no";
}

export type IssueInput = {
  segs: { slope: number; len: number; near: number; name?: string; kind?: string; steps?: boolean }[]; // near = metres from the building; kind = OSM highway/service
  stepFree: { dist: number; name?: string } | null;
  station: { dist: number; name?: string } | null; // nearest rail station, tagged or not
  busStops400: number;
  kerbs: number;
  loweredKerbs: number;
};
type S = IssueInput["segs"][number];
export type Issue = { level: "barrier" | "warning" | "unknown"; title: string; detail: string; seg?: S }; // seg: the street piece it is about

const DOOR = 60; // metres: the streets you must use to leave the building
// Driveways, parking aisles and back alleys are not the way out; garage ramps there gave false barriers.
const MINOR = new Set(["service", "alley", "driveway", "parking_aisle", "drive-through", "emergency_access"]);

export function findIssues(a: IssueInput, p: Limits): Issue[] {
  const out: Issue[] = [];
  const name = (s: { name?: string; kind?: string }) => s.name ?? `an unnamed ${s.kind ?? "path"}`;
  const door = a.segs.filter((s) => s.near <= DOOR && !MINOR.has(s.kind ?? ""));
  const doorVs = door.map((s) => verdict(s, p));

  if (door.length && !doorVs.includes("both")) {
    const flattest = door.reduce((m, s) => (s.slope < m.slope ? s : m));
    out.push({ level: "barrier", title: "No usable way out of the building", seg: flattest,
      detail: `Every street within ${DOOR} m is too steep or one-way for these limits. The flattest is ${flattest.slope.toFixed(1)}% on ${name(flattest)}.` });
  } else {
    const worst = door.filter((s, i) => doorVs[i] === "no" && !s.steps).sort((x, y) => y.slope - x.slope)[0];
    if (worst) out.push({ level: "barrier", seg: worst, title: `${worst.slope.toFixed(1)}% on ${name(worst)}, ${Math.round(worst.near)} m from the door`,
      detail: `Steeper than ${Math.max(p.up, p.down)}% in both directions, so there is no way up or down it.` });
    const oneWay = door.filter((s, i) => doorVs[i] === "one").sort((x, y) => y.slope - x.slope)[0];
    if (oneWay) out.push({ level: "warning", seg: oneWay, title: `${oneWay.slope.toFixed(1)}% on ${name(oneWay)}: one way only`,
      detail: `Fine going ${p.up < p.down ? "down" : "up"} but too steep going ${p.up < p.down ? "up" : "down"}, with limits of ${p.up}% up and ${p.down}% down.` });
  }

  const steps = a.segs.filter((s) => s.steps && s.near <= 100).sort((x, y) => x.near - y.near)[0];
  if (steps && p.avoidSteps) out.push({ level: "warning", seg: steps, title: `Steps ${Math.round(steps.near)} m from the building`, detail: `On ${name(steps)}.` });

  const total = a.segs.reduce((t, s) => t + s.len, 0);
  const usable = a.segs.reduce((t, s) => t + (verdict(s, p) === "both" ? s.len : 0), 0);
  if (total && usable / total < 0.5)
    out.push({ level: "warning", title: `Only ${Math.round((usable / total) * 100)}% of nearby streets usable both ways`, detail: "Share of street and path length within 250 m." });

  // Untagged is not the same as not step-free: say "not known" when a station exists but has no wheelchair tag.
  if (!a.station) out.push({ level: "warning", title: "No rail station within 2 km", detail: "From OpenStreetMap." });
  else if (!a.stepFree) out.push({ level: "unknown", title: `Step-free access at ${a.station.name ?? "the nearest station"} (${a.station.dist} m) not known`, detail: "No station within 2 km has wheelchair information in OpenStreetMap. Check with the transit agency." });
  // 400 m: the walkshed used by Bolten & Caspi (PLOS ONE 2021) for wheelchair reach.
  if (a.busStops400 === 0) out.push({ level: "warning", title: "No bus stop within 400 m", detail: "Straight-line distance." });
  if (a.kerbs === 0) out.push({ level: "unknown", title: "Curb ramps not known", detail: "No curbs are mapped in OpenStreetMap within 150 m. Check on site." });
  else if (a.loweredKerbs < a.kerbs) out.push({ level: "warning", title: `${a.kerbs - a.loweredKerbs} of ${a.kerbs} mapped curbs are raised`, detail: "Within 150 m." });

  const rank = { barrier: 0, warning: 1, unknown: 2 };
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}
