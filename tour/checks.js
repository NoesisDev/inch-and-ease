// The 21 mobility checks (master table: notes/research/reports/Scan_Checks_and_Fixes.md §2), the thresholds, the room
// graph with the widest route from the entry, and what counts as critical. Pure functions, no DOM: the page and the tests share them.
// Wheelchair profile only. Units inside: metres. Statuses: pass · verify (check with a tape) · fail · none (not measured yet) · skip (not scored).
export const IN = 0.0254;
export const CLEAR_LOSS = 1.75 * IN; // an open door leaf + stop eat 1.5–2" of the opening (HUD Fair Housing Act Design Manual)
const U_CLICK = 0.02; // two clicks in a Matterport tour: Pro3 scans are ±2–3 cm

// One table of limits. Each is a centre line ± u: fail when even value ± u misses it, pass when value ± u clears it, else "check with a tape".
// door: fail < 81.5 cm, tape 81.5–86.5, pass ≥ 86.5 (opening width) · step: pass ≤ 2 cm, tape 2–5, fail > 5 · turn: fail < 152.5, tape to 157.5
// hall: fail < 91.5, tape to 96.5 · the rest from the master table with the click uncertainty.
export const LIMITS = {
  door: { min: 0.84, u: 0.025 },
  step: { max: 0.035, u: 0.015 },
  turn: { min: 1.55, u: 0.025 },
  hall: { min: 0.94, u: 0.025 },
  tubRim: { max: 0.48, u: U_CLICK },            // ≤ 19 in
  toiletWall: { min: 0.405, max: 0.455, u: U_CLICK }, // centreline 16–18 in from the side wall
  toiletSeat: { min: 0.43, max: 0.485, u: U_CLICK },  // 17–19 in
  curb: { max: 0.013, u: U_CLICK },              // roll-in ≤ ½ in
  sink: { max: 0.865, u: U_CLICK },              // rim ≤ 34 in
  switchH: { min: 0.38, max: 1.22, u: U_CLICK }, // 15–48 in
};
export const NOISE_DOOR = 0.5; // doorways under 50 cm are scan noise

export function judge(limit, v) {
  if (v == null || Number.isNaN(v)) return 'none';
  const { min, max, u = 0 } = limit, e = 1e-9;
  if ((min != null && v + u < min - e) || (max != null && v - u > max + e)) return 'fail';
  if ((min == null || v - u >= min - e) && (max == null || v + u <= max + e)) return 'pass';
  return 'verify';
}

// Feet and inches for the screen.
export const ftin = m => {
  if (m == null) return '—';
  const i = Math.round(m / IN * 2) / 2;
  if (Math.abs(i) < 12) return `${String(i).replace('.5', '½')}"`;
  const r = Math.round(i); return `${Math.floor(r / 12)}' ${r % 12}"`;
};

// Fix ladders: rungs in the master table's order. effect(value, product, item) → the changed number or answer (undefined = no change).
// helps: the rung improves things without changing the number. support:false = shown, never counted as support (with why).
const free = (label, effect, extra) => ({ kind: 'free', label, price: 0, effect, ...extra });
const prod = (types, effect, extra) => ({ kind: 'product', types, effect, ...extra });
const pro = (label, low, high, avg, source, effect) => ({ kind: 'contractor', label, low, high, avg, source, effect });
const text = (label, price, effect, extra) => ({ kind: 'text', label, price, effect, ...extra });
const noSupport = (types, reason) => ({ kind: 'product', types, effect: () => undefined, support: false, reason });
const to = v => () => v;
const when = (from, v) => x => (x === from || (Array.isArray(from) && from.includes(x)) ? v : undefined);
const ramp = (rise, p) => { // a ramp lies flat when its rise covers the step (set up to ¼" higher still sits flat)
  const s = p?.spec || {}, max = s.rise_in ?? s.rise_max_in ?? s.max_rise_in_recommended, min = s.rise_min_in ?? 0;
  return max != null && max * IN >= rise && min * IN <= rise + 0.25 * IN ? 0 : undefined;
};

const BATH = /bath/i, BED = /bed/i, KITCHEN = /kitchen/i;
export const REGISTRY = [
  { n: 1, id: 'tub_bench', tier: 1, title: 'Tub entry: transfer bench fits', room: 'Bathroom', how: 'measure', limit: 'tubRim',
    who: 'Wheelchair and walker users', rule: 'Tub rim ≤ 19" (48 cm) so a transfer bench sits level', anchor: 'ADA 607.2 · Housing Enabler C45, C71 · Algo bathing tool',
    measure: 'Click the bathroom floor, then the top of the tub rim.',
    ladder: [prod(['transfer_bench'], (v, p) => p.spec?.seat_height_max_in * IN >= v ? p.spec.seat_height_min_in * IN : undefined, { note: 'you sit on the bench instead of climbing the rim' }),
      text('Tub-mount sliding bench (not in our catalogue)', 321, v => v <= 0.6 ? 0.45 : undefined),
      pro('Tub cut-out or level shower (contractor)', 995, 3500, null, 'contractor quotes', to(0))] },
  { n: 2, id: 'tub_bar', tier: 1, title: 'Grab bar at the tub entry', room: 'Bathroom', how: 'ask',
    who: 'Everyone who steps or slides into the tub', rule: 'A bar screwed into the wall at the tub entry', anchor: 'ADA 607.4 · Housing Enabler C46',
    question: 'Is there a grab bar screwed to the wall at the tub entry?',
    answers: [['bar', 'Yes, screwed to the wall', 'pass'], ['none', 'No bar', 'fail'], ['suction', 'Only a suction or clamp-on bar', 'fail']],
    ladder: [prod(['grab_bar'], to('bar'), { note: 'needs a stud or a 3½" cavity' }),
      pro('Professional install', 394, 394, 394, 'median price, 23-day wait (Wiseman 2021)', to('bar')),
      noSupport(['tub_rail'], 'Suction bars all failed a 28-day lab test (Deen 2025); 19 of 20 self-installed clamp rails failed a load test (Rand 2024).')] },
  { n: 3, id: 'toilet_side', tier: 1, title: 'Toilet side support', room: 'Bathroom', how: 'measure', limit: 'toiletWall',
    who: 'Wheelchair and walker users', rule: 'Toilet centre 16–18" (40.5–45.5 cm) from the side wall, so a wall bar fits', anchor: 'ADA 604.5 · Housing Enabler C46',
    measure: 'Click the centre of the toilet seat, then the nearest side wall.',
    ladder: [prod(['grab_bar'], v => v >= 0.405 && v <= 0.475 ? 0.43 : undefined, { note: 'only where the wall is in reach' }),
      prod(['toilet_safety_frame'], v => v > 0.405 ? 0.43 : undefined, { note: 'arms on both sides of the seat' }),
      prod(['flip_up_grab_bar'], v => v > 0.405 ? 0.43 : undefined, { note: 'mounts on the rear wall, folds down beside the seat' })] },
  { n: 4, id: 'toilet_seat', tier: 1, title: 'Toilet seat height', room: 'Bathroom', how: 'measure', limit: 'toiletSeat',
    who: 'Wheelchair users (seat close to the chair seat)', rule: 'Seat 17–19" (43–48.5 cm) above the floor', anchor: 'ADA 604.4 · Housing Enabler C64',
    measure: 'Click the bathroom floor, then the top of the toilet seat.',
    ladder: [prod(['raised_toilet_seat'], (v, p) => v < 0.485 ? v + (p.spec?.height_added_in ?? 0) * IN : undefined, { note: 'match the bowl shape' }),
      text('Toilet base riser (Toilevator, not in our catalogue)', 120, v => v < 0.485 ? v + 3.5 * IN : undefined),
      pro('Comfort-height toilet + plumber', 200, 500, null, 'Inch & Ease research', v => v < 0.485 ? 0.46 : undefined)] },
  { n: 5, id: 'toilet_space', tier: 1, title: 'Toilet transfer space', room: 'Bathroom', how: 'ask',
    who: 'Wheelchair users', rule: '42" (107 cm) clear beside the toilet and 56" (142 cm) from the rear wall', anchor: 'ADA 604.3.1 · Housing Enabler C44',
    question: 'Is the floor beside and in front of the toilet clear for the chair?',
    answers: [['clear', 'Yes, clear', 'pass'], ['movable', 'Blocked by a bin, cabinet or hamper', 'fail'], ['fixed', 'Blocked by a wall, tub or sink', 'fail']],
    ladder: [free('Move the bin, cabinet or hamper', when('movable', 'clear')),
      free('Reverse the door swing (ask the landlord)', () => undefined, { helps: true }),
      pro('Rebuild the bathroom (not priced)', null, null, null, 'needs construction work', to('clear'))] },
  { n: 6, id: 'entry_steps', tier: 1, title: 'Steps at the entry', room: 'Entry', how: 'ask',
    who: 'Wheelchair users', rule: 'No step; a ramp needs 12" of length per 1" of rise (1:12)', anchor: 'ADA 405.2 · Housing Enabler B12, B14',
    question: 'Are there steps to get into the building or the unit?',
    answers: [['none', 'No steps', 'pass'], ['small', 'One step up to 3"', 'fail'], ['big', 'Higher steps', 'fail']],
    ladder: [prod(['threshold_ramp'], (v, p) => v === 'small' && (p.spec?.rise_in ?? p.spec?.rise_max_in ?? 0) >= 1 ? 'none' : undefined),
      prod(['portable_ramp'], (v, p) => v === 'small' || (v === 'big' && (p.spec?.max_rise_in_recommended ?? 0) >= 6) ? 'none' : undefined),
      pro('Modular ramp (contractor, not priced)', null, null, null, 'Inch & Ease research', to('none'))] },
  { n: 7, id: 'bed', tier: 1, title: 'Bed transfer', room: 'Bedroom', how: 'ask',
    who: 'Wheelchair users', rule: 'Mattress top 20–23" (51–58.5 cm), 30 × 48" clear floor beside it', anchor: 'ADA 305.3 · ADA National Network guidance',
    question: 'How high is the top of the mattress?',
    answers: [['ok', '20–23"', 'pass'], ['low', 'Lower than 20"', 'fail'], ['high', 'Higher than 23"', 'fail']],
    ladder: [prod(['bed_riser'], when('low', 'ok')), prod(['bed_frame'], when('high', 'ok')), prod(['adjustable_bed_base'], when(['low', 'high'], 'ok')),
      prod(['bed_rail', 'transfer_board'], () => undefined, { helps: true, note: 'something to hold or slide on' })] },
  { n: 8, id: 'door', tier: 2, title: 'Door width', room: 'any', how: 'auto', limit: 'door',
    who: 'Wheelchair users', rule: 'Opening ≥ 34" (86.5 cm) passes, under 32" (81.5 cm) fails', anchor: 'ADA 404.2.3 · Housing Enabler B1, C4',
    ladder: [free('Take the door off its hinges (keep it, rehang it when you move out)', v => v + CLEAR_LOSS),
      prod(['offset_hinge'], (v, p) => p.spec?.clearance_gained_in ? v + p.spec.clearance_gained_in * IN : undefined, { note: 'screws into the same holes; swap back when you move out' }),
      pro('Widen the doorway (contractor)', 600, 2000, 1200, 'Angi cost guide', v => Math.max(v, 0.915))] },
  { n: 9, id: 'step', tier: 2, title: 'Door step', room: 'any', how: 'auto', limit: 'step',
    who: 'Wheelchair users', rule: 'Level within ¾" (2 cm) passes, over 2" (5 cm) fails', anchor: 'ADA 404.2.5 · Housing Enabler B2, C1',
    ladder: [prod(['threshold_ramp', 'portable_ramp'], (v, p) => ramp(v, p)),
      pro('New threshold or built ramp (contractor, not priced)', null, null, null, 'Inch & Ease research', to(0))] },
  { n: 10, id: 'turn', tier: 2, title: 'Turning space', room: 'any', how: 'auto', limit: 'turn',
    who: 'Wheelchair users', rule: '5\' (152.5 cm) circle across the room\'s short side', anchor: 'ADA 304.3 · Housing Enabler C44',
    ladder: [free('Move the furniture out of the turning circle', () => undefined, { helps: true, note: 'the walls themselves are the limit here' }),
      pro('Remodel the room (not priced)', null, null, null, 'Inch & Ease research', to(1.6))] },
  { n: 11, id: 'hall', tier: 2, title: 'Hallway width', room: 'Hallway', how: 'auto', limit: 'hall',
    who: 'Wheelchair users', rule: 'Hallway ≥ 38" (96.5 cm) passes, under 36" (91.5 cm) fails', anchor: 'ADA 403.5.1 · Housing Enabler C3',
    ladder: [free('Keep the hallway clear of furniture', () => undefined, { helps: true }),
      pro('Widen the hallway (not priced)', null, null, null, 'Inch & Ease research', to(1))] },
  { n: 12, id: 'door_swing', tier: 2, title: 'Bathroom door swing', room: 'Bathroom', how: 'ask',
    who: 'Wheelchair users', rule: 'The door must not swing into the 30 × 48" clear floor', anchor: 'ADA 603.2.3 · Fair Housing Design Manual',
    question: 'Does the bathroom door open into the bathroom?',
    answers: [['out', 'No, it opens outward or slides', 'pass'], ['in', 'Yes, it opens inward', 'fail']],
    ladder: [free('Take the door off and hang a curtain', when('in', 'out')),
      free('Reverse the swing (ask the landlord)', when('in', 'out')),
      prod(['offset_hinge'], () => undefined, { helps: true, note: 'swings the leaf clear of the opening' })] },
  { n: 13, id: 'curb', tier: 3, title: 'Shower curb', room: 'Bathroom', how: 'measure', limit: 'curb',
    who: 'Wheelchair users', rule: 'Roll-in curb ≤ ½" (1.3 cm)', anchor: 'ADA 608.7 · Housing Enabler C70',
    measure: 'Click the bathroom floor, then the top of the shower curb.',
    ladder: [prod(['threshold_ramp'], (v, p) => ramp(v, p)),
      prod(['transfer_bench'], () => undefined, { helps: true, note: 'transfer over the curb instead' }),
      pro('Roll-in shower (contractor, not priced)', null, null, null, 'Inch & Ease research', to(0))] },
  { n: 14, id: 'shower_controls', tier: 3, title: 'Shower controls', room: 'Bathroom', how: 'ask',
    who: 'Wheelchair users', rule: 'Hand-held shower on a 59" hose; water no hotter than 120 °F', anchor: 'ADA 607.6',
    question: 'Is there a hand-held shower, and is the water heater at 120 °F or below?',
    answers: [['yes', 'Both yes', 'pass'], ['no_handheld', 'No hand-held shower', 'fail'], ['hot', 'Water hotter than 120 °F', 'fail']],
    ladder: [free('Turn the water heater down to 120 °F', when('hot', 'yes')), prod(['handheld_shower'], when('no_handheld', 'yes'))] },
  { n: 15, id: 'sink', tier: 3, title: 'Sink height', room: 'Bathroom', how: 'measure', limit: 'sink',
    who: 'Wheelchair users', rule: 'Rim ≤ 34" (86.5 cm), knee space under it', anchor: 'ADA 606 · Housing Enabler C63',
    measure: 'Click the bathroom floor, then the top of the sink rim.',
    ladder: [free('Take the vanity doors off, insulate the pipes', () => undefined, { helps: true }),
      pro('Lower the sink (plumber, not priced)', null, null, null, 'Inch & Ease research', to(0.85))] },
  { n: 16, id: 'kitchen', tier: 3, title: 'Kitchen reach', room: 'Kitchen', how: 'ask',
    who: 'Wheelchair users', rule: '30 × 48" clear floor at the stove, fridge and sink; a shelf within 4\' 7" (1.4 m)', anchor: 'Housing Enabler C21, C22',
    question: 'Can a chair pull up to the stove, fridge and sink, with a shelf in reach?',
    answers: [['ok', 'Yes', 'pass'], ['high', 'Shelves too high', 'fail'], ['floor', 'No room in front of them', 'fail']],
    ladder: [prod(['closet_rod'], when('high', 'ok'), { note: 'pull-down shelf' }), prod(['reacher'], () => undefined, { helps: true }),
      prod(['adjustable_desk'], () => undefined, { helps: true, note: 'seated work surface' }),
      pro('Rebuild the kitchen (not priced)', null, null, null, 'Inch & Ease research', to('ok'))] },
  { n: 17, id: 'switch', tier: 3, title: 'Light switch height', room: 'any', how: 'measure', limit: 'switchH',
    who: 'Wheelchair users', rule: 'Switches 15–48" (38–122 cm) above the floor', anchor: 'ADA 308 · Housing Enabler C42',
    measure: 'Click the floor, then the light switch.',
    ladder: [prod(['reach_aid'], (v, p) => v > 1.22 ? v - (p.spec?.reach_change_in ?? 0) * IN : undefined),
      prod(['switch_aid', 'smart_plug', 'voice_control'], () => undefined, { helps: true, note: 'switches lamps without the wall switch' })] },
  { n: 18, id: 'hardware', tier: 3, title: 'Door hardware', room: 'Entry', how: 'ask',
    who: 'Wheelchair users', rule: 'Lever handles; no round knobs', anchor: 'ADA 309.4 · Housing Enabler B6',
    question: 'What handles are on the doors?',
    answers: [['lever', 'Levers', 'pass'], ['knob', 'Round knobs', 'fail'], ['heavy', 'Heavy entry door', 'fail']],
    ladder: [prod(['lever_handle'], when('knob', 'lever')), prod(['door_opener'], when(['knob', 'heavy'], 'lever'))] },
  { n: 19, id: 'floor', tier: 3, title: 'Floor surface', room: 'any', how: 'ask',
    who: 'Wheelchair users (casters)', rule: 'No loose rugs, cords or slippery bathroom floor', anchor: 'HOME FAST 20–22',
    question: 'Any loose rugs, cords across the floor, or a slippery bathroom floor?',
    answers: [['clear', 'None', 'pass'], ['rugs', 'Loose rugs', 'fail'], ['cords', 'Cords across the floor', 'fail'], ['slippery', 'Slippery bathroom floor', 'fail']],
    ladder: [free('Take up the loose rugs', when('rugs', 'clear')), prod(['rug_gripper'], when('rugs', 'clear')), prod(['cord_cover'], when('cords', 'clear')), prod(['bath_mat'], when('slippery', 'clear'))] },
  { n: 20, id: 'night', tier: 3, title: 'Night path', room: 'Bedroom', how: 'ask',
    who: 'Everyone getting up at night', rule: 'Light along the way from the bed to the bathroom', anchor: 'HOME FAST 8, 23',
    question: 'Is there light between the bed and the bathroom at night?',
    answers: [['lit', 'Yes', 'pass'], ['dark', 'No', 'fail']],
    ladder: [prod(['night_light'], when('dark', 'lit'))] },
  { n: 21, id: 'levels', tier: 3, title: 'Essential rooms on the entry floor', room: 'any', how: 'auto',
    who: 'Wheelchair users', rule: 'Bedroom, bathroom and kitchen on the entry floor, no stairs inside', anchor: 'Housing Enabler B12, B16, C14',
    ladder: [text('Stair lift (not in our catalogue)', null, () => undefined, { helps: true }), free('Live on the entry floor', () => undefined, { helps: true })] },
];
export const CHECK = Object.fromEntries(REGISTRY.map(c => [c.n, c]));

// Status of one item from its number or answer. The re-check of a fix runs this with the changed value.
export function statusOf(n, value) {
  const c = CHECK[n];
  if (c.how === 'ask') return c.answers.find(a => a[0] === value)?.[2] ?? 'none';
  if (n === 21) return value == null ? 'none' : value ? 'pass' : 'fail';
  return judge(LIMITS[c.limit], value);
}

// ---- Geometry from the Matterport wall graph ----
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const roomName = r => (r.classifications || []).map(c => c.label).filter(Boolean).join(', ') || 'Room';
const SKIP_TURN = /void|closet|balcony|hallway|patio/i, NO_ROUTE = /closet|pantry|laundry|garage|void|patio|balcony|utility/i;

// Room outline in plan (x, y): chain the boundary edges into one loop. Returns [] when the edges don't close.
export function roomPolygon(floor, room) {
  const V = Object.fromEntries(floor.vertices.map(v => [v.id, v.position]));
  const E = Object.fromEntries(floor.edges.map(e => [e.id, e.vertices.map(v => v.id)]));
  const segs = (room.boundary?.edges || []).map(e => E[e.id]).filter(Boolean);
  if (segs.length < 3) return [];
  const out = [segs[0][0], segs[0][1]], left = segs.slice(1);
  while (left.length) {
    const end = out[out.length - 1], k = left.findIndex(s => s.includes(end));
    if (k < 0) return [];
    const [s] = left.splice(k, 1); out.push(s[0] === end ? s[1] : s[0]);
  }
  out.pop(); // the loop closes on the first vertex
  return out.map(id => V[id]).filter(Boolean);
}
const centroid = pts => pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });

// Every item the app lists: the automatic checks from the wall graph, plus one "not measured yet" item for each check the
// scan can't see. Never guesses: missing data stays "none".
export function evaluate(m) {
  const items = [], rooms = [], links = [];
  let k = 0; const id = p => `${p}-${++k}`;
  const floors = m.floors || [];
  for (const f of floors) {
    const V = Object.fromEntries(f.vertices.map(v => [v.id, v.position]));
    const edgeRooms = {};
    for (const r of (m.rooms || []).filter(r => r.floor?.id === f.id)) {
      const name = roomName(r), poly = roomPolygon(f, r);
      const ids = [...new Set((r.boundary?.edges || []).flatMap(e => f.edges.find(x => x.id === e.id)?.vertices.map(v => v.id) || []))];
      const at = poly.length ? centroid(poly) : ids.length ? centroid(ids.map(i => V[i]).filter(Boolean)) : null;
      const room = { id: r.id, name, floor: f.id, poly, at, dims: r.dimensions || {} };
      rooms.push(room);
      for (const e of r.boundary?.edges || []) (edgeRooms[e.id] ||= []).push(room);
    }
    const ops = f.edges.flatMap(e => (e.openings || []).filter(o => o.type !== 'window' && o.width >= NOISE_DOOR).map(o => o.lowerElevation || 0));
    const floorLevel = median(ops);
    for (const e of f.edges) {
      const a = V[e.vertices[0].id], b = V[e.vertices[1].id], rs = edgeRooms[e.id] || [];
      if (e.type === 'invisible' && rs.length === 2) links.push({ a: rs[0].id, b: rs[1].id, w: Infinity, items: [] });
      for (const o of e.openings || []) {
        if (o.type === 'window' || o.width < NOISE_DOOR) continue;
        const between = [...new Set(rs.map(r => r.name))].join(' ↔ ') || 'outside';
        const at = lerp(a, b, o.relativeCenter), angle = Math.atan2(b.y - a.y, b.x - a.x), t = e.thickness || 0.12;
        const inside = rs.filter(r => !/void/i.test(r.name)); // "Void" = space the scan didn't cover, so a door into it leads outside
        const link = { a: inside[0]?.id, b: inside[1]?.id, w: o.width, exterior: inside.length === 1, items: [], at };
        if (inside.length) links.push(link);
        if (o.type !== 'doorway') continue; // open passages are route links, not doors
        // shortcut: closet doors aren't on a wheelchair route, so they're listed but not scored; a walk-in closet would need a real check.
        const closet = rs.some(r => /closet/i.test(r.name)), geo = { between, at, angle, t, floor: f.id, rooms: rs.map(r => r.id) };
        const door = { id: id('door'), n: 8, kind: 'door', value: o.width, h: o.height || 2.03, w: o.width, source: 'Matterport scan', ...geo };
        door.s = closet ? 'skip' : statusOf(8, door.value);
        items.push(door); link.items.push(door);
        if (closet) continue;
        const rise = Math.abs((o.lowerElevation || 0) - floorLevel);
        const step = { id: id('step'), n: 9, kind: 'step', value: rise, w: o.width, source: 'Matterport scan', ...geo };
        step.s = statusOf(9, rise); items.push(step); link.items.push(step);
      }
    }
  }
  for (const r of rooms) {
    const { width: w, depth: d } = r.dims;
    // shortcut: a room missing a side is a scan fragment (e.g. a 0.5 m "Bedroom" sliver) unless it's a hallway; skipped, not scored.
    if (!r.at || (!w && !d) || (!(w && d) && !/hallway/i.test(r.name))) continue;
    const hall = /hallway/i.test(r.name);
    if (SKIP_TURN.test(r.name) && !hall) continue;
    // Never guess: with one side missing, the short side is only known when the one side we have already fails.
    const n = hall ? 11 : 10, lim = LIMITS[hall ? 'hall' : 'turn'];
    const across = w && d ? Math.min(w, d) : (w || d) + lim.u < lim.min ? (w || d) : null;
    items.push({ id: id(hall ? 'hall' : 'turn'), n, kind: hall ? 'hall' : 'turn', room: r.name, roomId: r.id, at: r.at, floor: r.floor, value: across, dims: r.dims, source: 'Matterport scan', s: statusOf(n, across) });
  }
  // 21: essential rooms on the entry floor. One floor = no stairs inside.
  const essential = rooms.filter(r => /bath|bed|kitchen/i.test(r.name));
  const entryFloor = floors[0]?.id;
  items.push({ id: id('levels'), n: 21, kind: 'levels', source: 'Matterport scan', at: null, room: 'Whole apartment',
    value: floors.length ? floors.length === 1 || [BATH, BED, KITCHEN].every(re => !essential.some(r => re.test(r.name)) || essential.some(r => re.test(r.name) && r.floor === entryFloor)) : null,
    floors: floors.length });
  items[items.length - 1].s = statusOf(21, items[items.length - 1].value);
  // Placeholders for the checks with no automatic number: measured in the tour or answered, in their room.
  const noDoorData = !items.some(i => i.n === 8), has = new Set(items.map(i => i.n));
  for (const c of REGISTRY) {
    if (has.has(c.n)) continue;
    const room = c.room === 'any' || c.room === 'Entry' ? null : rooms.find(r => new RegExp(c.room, 'i').test(r.name) && r.at);
    items.push({ id: `c${c.n}`, n: c.n, kind: c.how, room: room?.name || c.room, roomId: room?.id, at: room?.at || null, floor: room?.floor || floors[0]?.id, value: null, s: 'none', source: null });
  }
  const route = routes(rooms, links);
  for (const i of items) i.critical = isCritical(i, route);
  return { items, rooms, links, route, floors: floors.length, noDoorData };
}

// Widest route (max-min Dijkstra) from the entry door to every room, never through closets, laundry, balconies.
// Start: a doorway on an edge with one room, preferring Entrance > Hallway / Living / Kitchen / Dining, widest first.
export function routes(rooms, links) {
  const pref = r => /entr|foyer/i.test(r.name) ? 0 : /hall|living|kitchen|dining/i.test(r.name) ? 1 : 2;
  const byId = Object.fromEntries(rooms.map(r => [r.id, r]));
  const doors = links.filter(l => l.exterior && byId[l.a] && !NO_ROUTE.test(byId[l.a].name) && l.items.some(i => i.n === 8))
    .sort((p, q) => pref(byId[p.a]) - pref(byId[q.a]) || q.w - p.w);
  const entry = doors[0];
  if (!entry) return { entry: null, to: {} };
  const best = { [entry.a]: { w: entry.w, via: [entry] } }, done = new Set();
  for (;;) {
    const cur = Object.keys(best).filter(k => !done.has(k)).sort((p, q) => best[q].w - best[p].w)[0];
    if (!cur) break; done.add(cur);
    if (cur !== entry.a && NO_ROUTE.test(byId[cur]?.name || '')) continue; // can end in one, never pass through
    for (const l of links.filter(l => !l.exterior && (l.a === cur || l.b === cur))) {
      const nxt = l.a === cur ? l.b : l.a, w = Math.min(best[cur].w, l.w);
      if (!byId[nxt] || done.has(nxt)) continue;
      if (!best[nxt] || w > best[nxt].w) best[nxt] = { w, via: [...best[cur].via, l] };
    }
  }
  const to = {};
  for (const [rid, b] of Object.entries(best)) to[rid] = { room: byId[rid].name, narrowest: b.w, items: b.via.flatMap(l => l.items.map(i => i.id)) };
  return { entry: { room: byId[entry.a].name, at: entry.at }, to };
}

// Critical = a fail on the best route from the entry to a bathroom, bedroom or kitchen, a bathroom where the turning circle
// fails, or any failed Tier 1 check (1–7).
export function isCritical(i, route) {
  if (i.s !== 'fail') return false;
  if (CHECK[i.n].tier === 1) return true;
  if (i.n === 10 && BATH.test(i.room || '')) return true;
  return Object.values(route.to).some(r => /bath|bed|kitchen/i.test(r.room) && r.items.includes(i.id));
}

// A person's measurement or answer for one item: re-judged, and critical recomputed.
export function setValue(item, value, source, route = { to: {} }) {
  const s = statusOf(item.n, value);
  return { ...item, value, s, source, critical: isCritical({ ...item, s }, route) };
}

// The list order: Critical → Other problems → Check with a tape → Not measured yet → Passed (and not scored).
export const GROUPS = [['critical', 'Critical'], ['other', 'Other problems'], ['verify', 'Check with a tape'], ['none', 'Not measured yet'], ['pass', 'Passed']];
export const groupOf = i => i.s === 'fail' ? (i.critical ? 'critical' : 'other') : i.s === 'skip' ? 'pass' : i.s;
export function ordered(items) {
  const g = Object.fromEntries(GROUPS.map(([k], x) => [k, x]));
  return [...items].sort((p, q) => g[groupOf(p)] - g[groupOf(q)] || CHECK[p.n].tier - CHECK[q.n].tier || p.n - q.n);
}
export function summary(items) {
  const measured = items.filter(i => i.s === 'pass' || i.s === 'fail' || i.s === 'verify');
  return { pass: measured.filter(i => i.s === 'pass').length, measured: measured.length, critical: items.filter(i => i.critical).length,
    fail: items.filter(i => i.s === 'fail').length, verify: items.filter(i => i.s === 'verify').length, none: items.filter(i => i.s === 'none').length,
    checks: new Set(items.map(i => i.n)).size };
}

// Plain-words title and "measured vs needed" line for one item.
export function describe(i) {
  const c = CHECK[i.n];
  const need = { door: '2\' 10" opening', step: 'level (¾")', turn: "5' 0\" across", hall: '3\' 2" wide', tubRim: '19" or lower', toiletWall: '16–18"', toiletSeat: '17–19"', curb: '½" or lower', sink: '34" or lower', switchH: '15–48"' }[c.limit];
  const needed = need ?? (c.how === 'ask' ? c.answers.find(a => a[2] === 'pass')[1] : 'see the rule');
  const rooms = (i.between || '').replaceAll(' ↔ ', ' to ').replace(/\bVoid\b/g, 'Outside'); // "Kitchen to Balcony" on the secondary line; "Void" = area the scan didn't cover
  if (i.s === 'none') { const todo = c.how === 'ask' ? 'answer one question' : c.how === 'measure' ? 'measure it in the tour (two clicks)' : 'no data in this scan';
    return { title: c.title, detail: i.room && c.room !== 'any' ? `${i.room}, ${todo}` : todo, measured: '—', need: needed }; }
  // Titles say what is wrong in plain words; the number follows in brackets.
  const may = { fail: '', verify: 'may be ' }[i.s];
  if (i.n === 8) return { title: i.s === 'skip' ? `Closet door (${ftin(i.value)})` : i.s === 'pass' ? `Door wide enough (${ftin(i.value)})` : `Door ${may}too narrow (${ftin(i.value)})`, detail: i.s === 'skip' ? `${rooms}, closet door, not scored` : rooms, measured: ftin(i.value), need };
  if (i.n === 9) return { title: i.s === 'pass' ? 'Level threshold' : i.s === 'verify' ? `Small step at the door (${ftin(i.value)})` : `Step at the door (${ftin(i.value)})`, detail: rooms, measured: ftin(i.value), need };
  if (i.n === 10) return { title: i.s === 'pass' ? `${i.room}: room to turn around` : `${i.room} ${may}too small to turn around`, detail: i.value == null ? 'room size missing' : `room is ${ftin(i.value)} across, needs ${need}`, measured: ftin(i.value), need };
  if (i.n === 11) return { title: i.s === 'pass' ? `${i.room} wide enough (${ftin(i.value)})` : `${i.room} ${may}too narrow (${ftin(i.value)})`, detail: `needs ${need}`, measured: ftin(i.value), need };
  if (i.n === 21) return { title: c.title, detail: i.floors === 1 ? 'one floor, no stairs inside' : i.value ? 'all on the entry floor' : 'an essential room is upstairs', measured: `${i.floors} floor${i.floors > 1 ? 's' : ''}`, need: 'all on one floor' };
  if (c.how === 'ask') { const a = c.answers.find(a => a[0] === i.value); return { title: c.title, detail: `your answer: ${a?.[1] ?? '—'}`, measured: a?.[1] ?? '—', need: c.answers.find(a => a[2] === 'pass')[1] }; }
  return { title: c.title, detail: `${ftin(i.value)} measured, needs ${need}`, measured: ftin(i.value), need };
}
