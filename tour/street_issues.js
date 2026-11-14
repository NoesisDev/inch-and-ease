// The street check's rules, ported from src/lib/issues.ts (the public site) for the tour's street page. Pure: no imports.
// Keep the two in step: same profiles, same verdicts, same issue texts. Tested in street_issues.test.mjs.

// Presets copied from AccessMap (accessmap.app, UW Taskar Center), read off its profile panel Nov 14, 2026.
export const PROFILES = [
  { id: 'manual', label: 'Manual wheelchair', up: 8, down: 10, avoidSteps: true },
  { id: 'power', label: 'Power wheelchair', up: 12, down: 12, avoidSteps: true },
  { id: 'cane', label: 'Cane', up: 14, down: 14, avoidSteps: false },
];

// A street piece with slope s is uphill one way and downhill the other. → 'both' | 'one' | 'no'
export function verdict(s, p) {
  if (s.steps) return p.avoidSteps ? 'no' : 'both';
  if (s.slope <= Math.min(p.up, p.down)) return 'both';
  return s.slope <= Math.max(p.up, p.down) ? 'one' : 'no';
}

const DOOR = 60; // metres: the streets you must use to leave the building
// Driveways, parking aisles and back alleys are not the way out; garage ramps there gave false barriers.
const MINOR = new Set(['service', 'alley', 'driveway', 'parking_aisle', 'drive-through', 'emergency_access']);

// a = { segs: [{ slope, len, near, name?, kind?, steps? }], stepFree, station, busStops400, kerbs, loweredKerbs }, p = limits.
// Returns [{ level: 'barrier' | 'warning' | 'unknown', title, detail, seg? }], barriers first.
export function findIssues(a, p) {
  const out = [];
  const name = s => s.name ?? `an unnamed ${s.kind ?? 'path'}`;
  const door = a.segs.filter(s => s.near <= DOOR && !MINOR.has(s.kind ?? ''));
  const doorVs = door.map(s => verdict(s, p));

  if (door.length && !doorVs.includes('both')) {
    const flattest = door.reduce((m, s) => (s.slope < m.slope ? s : m));
    out.push({ level: 'barrier', title: 'No usable way out of the building', seg: flattest,
      detail: `Every street within ${DOOR} m is too steep or one-way for these limits. The flattest is ${flattest.slope.toFixed(1)}% on ${name(flattest)}.` });
  } else {
    const worst = door.filter((s, i) => doorVs[i] === 'no' && !s.steps).sort((x, y) => y.slope - x.slope)[0];
    if (worst) out.push({ level: 'barrier', seg: worst, title: `${worst.slope.toFixed(1)}% on ${name(worst)}, ${Math.round(worst.near)} m from the door`,
      detail: `Steeper than ${Math.max(p.up, p.down)}% in both directions, so there is no way up or down it.` });
    const oneWay = door.filter((s, i) => doorVs[i] === 'one').sort((x, y) => y.slope - x.slope)[0];
    if (oneWay) out.push({ level: 'warning', seg: oneWay, title: `${oneWay.slope.toFixed(1)}% on ${name(oneWay)}: one way only`,
      detail: `Fine going ${p.up < p.down ? 'down' : 'up'} but too steep going ${p.up < p.down ? 'up' : 'down'}, with limits of ${p.up}% up and ${p.down}% down.` });
  }

  const steps = a.segs.filter(s => s.steps && s.near <= 100).sort((x, y) => x.near - y.near)[0];
  if (steps && p.avoidSteps) out.push({ level: 'warning', seg: steps, title: `Steps ${Math.round(steps.near)} m from the building`, detail: `On ${name(steps)}.` });

  const total = a.segs.reduce((t, s) => t + s.len, 0);
  const usable = a.segs.reduce((t, s) => t + (verdict(s, p) === 'both' ? s.len : 0), 0);
  if (total && usable / total < 0.5)
    out.push({ level: 'warning', title: `Only ${Math.round((usable / total) * 100)}% of nearby streets usable both ways`, detail: 'Share of street and path length within 250 m.' });

  // Untagged is not the same as not step-free: say "not known" when a station exists but has no wheelchair tag.
  if (!a.station) out.push({ level: 'warning', title: 'No rail station within 2 km', detail: 'From OpenStreetMap.' });
  else if (!a.stepFree) out.push({ level: 'unknown', title: `Step-free access at ${a.station.name ?? 'the nearest station'} (${a.station.dist} m) not known`, detail: 'No station within 2 km has wheelchair information in OpenStreetMap. Check with the transit agency.' });
  // 400 m: the walkshed used by Bolten & Caspi (PLOS ONE 2021) for wheelchair reach.
  if (a.busStops400 === 0) out.push({ level: 'warning', title: 'No bus stop within 400 m', detail: 'Straight-line distance.' });
  if (a.kerbs === 0) out.push({ level: 'unknown', title: 'Curb ramps not known', detail: 'No curbs are mapped in OpenStreetMap within 150 m. Check on site.' });
  else if (a.loweredKerbs < a.kerbs) out.push({ level: 'warning', title: `${a.kerbs - a.loweredKerbs} of ${a.kerbs} mapped curbs are raised`, detail: 'Within 150 m.' });

  const rank = { barrier: 0, warning: 1, unknown: 2 };
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}

// What /api/ask is told (same as SlopeMap.tsx): per street, its steepest piece within 120 m of the building if it has one, else its
// steepest piece; slope and distance always come from the same piece, so "right by the door" means what it says.
export function askStreets(segs) {
  const byName = new Map();
  for (const s of segs) {
    if (!s.name || s.steps) continue;
    const b = byName.get(s.name), close = s.near <= 120, bClose = !!b && b.near <= 120;
    if (!b || (close && !bClose) || (close === bClose && s.slope > b.slope)) byName.set(s.name, { name: s.name, slope: s.slope, near: s.near });
  }
  return [...byName.values()].sort((x, y) => x.near - y.near).slice(0, 40);
}
export const askFacts = f => [
  f.stepFree ? `Nearest step-free station ${f.stepFree.name ?? ''} ${f.stepFree.dist} m.` : f.station ? `Nearest station ${f.station.name ?? ''} ${f.station.dist} m, step-free access unknown.` : 'No rail station within 2 km.',
  `${f.busStops400} bus stops within 400 m.`,
  f.kerbs ? `${f.loweredKerbs} of ${f.kerbs} mapped curbs within 150 m are lowered.` : 'No curbs mapped within 150 m.',
].join(' ');

// The sliders by voice, without Claude: "uphill 10", "downhill 12 percent", "set the uphill limit to 6%". → { up } | { down } | null
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
export function spokenLimit(text) {
  const t = String(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(?:(?:set|make|change|put) )?(?:the )?(up|uphill|up hill|down|downhill|down hill)(?: limit| slope)?(?: to| at)? (\d+|[a-z]+)(?: percent| per cent)?$/);
  const n = m && (/^\d+$/.test(m[2]) ? +m[2] : WORDS[m[2]]);
  if (n == null || n > 20) return null;
  return m[1].startsWith('up') ? { up: n } : { down: n };
}
