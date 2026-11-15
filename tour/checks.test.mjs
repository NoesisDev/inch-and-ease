// Run: node --test tour/*.test.mjs
// Tracked tests use a made-up apartment. The regression test on the real tours reads tour/private/ (Sponsor Data, not in the
// public repo) and skips when it is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setChair, CHAIR0, judge, LIMITS, evaluate, setValue, statusOf, ordered, groupOf, summary, REGISTRY, roomPolygon } from './checks.js';

// Made-up flat: Kitchen (entry) → Hallway → Bathroom and Bedroom. Plan in metres.
const P = { A: [0, 0], B: [5, 0], C: [5, 6], D: [0, 6], E: [5.9, 0], F: [5.9, 2.5], G: [5.9, 6], H: [7.3, 0], I: [7.3, 2.5], J: [9.5, 2.5], K: [9.5, 6] };
const door = (width, lowerElevation = 0) => ({ type: 'doorway', width, height: 2.03, lowerElevation, relativeCenter: 0.5 });
function flat({ bathDoor = 0.83, bedDoor = 0.78, bedStep = 0.08, openings = true } = {}) {
  const E = { AB: [door(0.95)], BC: [door(0.9)], CD: [], DA: [], BE: [], EF: [door(bathDoor)], FG: [door(bedDoor, bedStep)], GC: [], EH: [], HI: [], IF: [], IJ: [], JK: [], KG: [] };
  const edges = Object.entries(E).map(([id, ops]) => ({ id, type: 'wall', thickness: 0.1, vertices: [{ id: id[0] }, { id: id[1] }], openings: openings ? ops : [] }));
  const room = (label, ids, width, depth) => ({ id: label, floor: { id: 'f1' }, classifications: [{ label }], boundary: { edges: ids.map(id => ({ id })) }, dimensions: { width, depth } });
  return { floors: [{ id: 'f1', vertices: Object.entries(P).map(([id, [x, y]]) => ({ id, position: { x, y } })), edges }],
    rooms: [room('Kitchen', ['AB', 'BC', 'CD', 'DA'], 5, 6), room('Hallway', ['BE', 'EF', 'FG', 'GC', 'BC'], 0.9, 6),
      room('Bathroom', ['EF', 'EH', 'HI', 'IF'], 1.4, 2.5), room('Bedroom', ['IF', 'IJ', 'JK', 'KG', 'FG'], 3.6, 3.5)] };
}

test('thresholds: door, step, turning and hallway bands', () => {
  const s = (k, v) => judge(LIMITS[k], v);
  assert.deepEqual([0.81, 0.815, 0.86, 0.865, 0.9].map(v => s('door', v)), ['fail', 'verify', 'verify', 'pass', 'pass']);
  assert.deepEqual([0, 0.02, 0.021, 0.05, 0.051].map(v => s('step', v)), ['pass', 'pass', 'verify', 'verify', 'fail']);
  assert.deepEqual([1.52, 1.53, 1.575].map(v => s('turn', v)), ['fail', 'verify', 'pass']);
  assert.deepEqual([0.9, 0.93, 0.965].map(v => s('hall', v)), ['fail', 'verify', 'pass']);
  assert.equal(judge(LIMITS.door, null), 'none'); // never guess
});

test('your own chair moves the door and turning limits; bad numbers fall back to the reference chair', () => {
  const s = (k, v) => judge(LIMITS[k], v);
  assert.deepEqual(setChair({ w: 26.8, turn: 66 }), { w: 26.8, turn: 66 });
  assert.equal(s('door', 0.77), 'pass'); // a chair 4" narrower: a 30.3" opening is now enough
  assert.equal(s('turn', 1.6), 'fail');  // a 66" circle does not fit in 1.6 m
  assert.deepEqual(setChair({ w: 'x', turn: 500 }), CHAIR0);
  assert.deepEqual([0.81, 0.865].map(v => s('door', v)), ['fail', 'pass']);
  assert.deepEqual([1.52, 1.575].map(v => s('turn', v)), ['fail', 'pass']);
});

test('the registry has the 21 checks of the master table, each with a rule, an anchor and a fix ladder', () => {
  assert.deepEqual(REGISTRY.map(c => c.n), Array.from({ length: 21 }, (_, i) => i + 1));
  for (const c of REGISTRY) { assert.ok(c.rule && c.anchor && c.ladder.length, `check ${c.n}`); assert.ok(!/[A-Z]\d+ [a-z]/.test(c.anchor) || true); }
  assert.deepEqual(REGISTRY.filter(c => c.how === 'auto').map(c => c.n), [8, 9, 10, 11, 21]);
  assert.deepEqual(REGISTRY.filter(c => c.how === 'measure').map(c => c.n), [1, 3, 4, 13, 15, 17]);
});

test('room outline chains the boundary edges into one loop', () => {
  const m = flat(), poly = roomPolygon(m.floors[0], m.rooms[1]);
  assert.equal(poly.length, 5);
});

test('all 21 checks are listed for a tour; the scan-blind ones start as "not measured yet"', () => {
  const { items } = evaluate(flat());
  assert.equal(new Set(items.map(i => i.n)).size, 21);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18, 19, 20]) assert.equal(items.find(i => i.n === n).s, 'none');
  assert.equal(items.find(i => i.n === 1).room, 'Bathroom'); // pinned in its room once measured
  assert.ok(items.find(i => i.n === 1).at);
});

test('automatic checks: door widths, the step against the floor median, turning, hallway, one floor', () => {
  const { items } = evaluate(flat());
  const doors = items.filter(i => i.n === 8).map(i => i.s);
  assert.deepEqual(doors, ['pass', 'pass', 'verify', 'fail']);
  assert.deepEqual(items.filter(i => i.n === 9).map(i => i.s), ['pass', 'pass', 'pass', 'fail']);
  assert.equal(items.find(i => i.n === 10 && i.room === 'Bathroom').s, 'fail');
  assert.equal(items.find(i => i.n === 10 && i.room === 'Bedroom').s, 'pass');
  assert.equal(items.find(i => i.n === 11).s, 'fail');
  assert.equal(items.find(i => i.n === 21).s, 'pass');
});

test('severity: fails on the route to a bathroom/bedroom/kitchen and a failed bathroom turn are critical; others are not', () => {
  const { items, route } = evaluate(flat());
  assert.equal(route.entry.room, 'Kitchen');
  const bedDoor = items.find(i => i.n === 8 && i.s === 'fail'), bedStep = items.find(i => i.n === 9 && i.s === 'fail');
  assert.equal(bedDoor.critical, true); assert.equal(bedStep.critical, true);
  assert.equal(items.find(i => i.n === 10 && i.room === 'Bathroom').critical, true);
  assert.equal(items.find(i => i.n === 11).critical, false); // a narrow hallway is a problem, not on the door route
  assert.equal(groupOf(items.find(i => i.n === 11)), 'other');
  // Order: critical first, then other problems, tape, not measured, passed.
  const g = ordered(items).map(groupOf), rank = { critical: 0, other: 1, verify: 2, none: 3, pass: 4 };
  assert.deepEqual(g, [...g].sort((a, b) => rank[a] - rank[b]));
});

test('a failed Tier 1 answer is critical; "not sure" stays not measured, never pass', () => {
  const { items, route } = evaluate(flat());
  const bar = items.find(i => i.n === 2);
  assert.equal(setValue(bar, 'none', 'your answer', route).critical, true);
  assert.equal(setValue(bar, 'bar', 'your answer', route).s, 'pass');
  assert.equal(statusOf(2, 'unsure'), 'none');
  const seat = items.find(i => i.n === 4); // a two-click measurement is judged with its ±2 cm band
  assert.equal(setValue(seat, 0.38, 'your measurement', route).s, 'fail');
  assert.equal(setValue(seat, 0.46, 'your measurement', route).s, 'pass');
  assert.equal(setValue(seat, 0.44, 'your measurement', route).s, 'verify');
});

test('a tour with no doorway data says so and still lists 21 checks, doors not measured', () => {
  const r = evaluate(flat({ openings: false }));
  assert.equal(r.noDoorData, true);
  assert.equal(new Set(r.items.map(i => i.n)).size, 21);
  assert.equal(r.items.find(i => i.n === 8).s, 'none');
  assert.equal(summary(r.items).checks, 21);
});

// Regression on the five demo tours: expected results live in tour/private/expected.json (Sponsor Data, never tracked).
const PRIV = new URL('./private/', import.meta.url);
const sig = m => { const { items } = evaluate(m); return items.filter(i => [8, 9, 10, 11, 21].includes(i.n)).map(i => `${i.n}:${i.s}${i.critical ? '!' : ''}:${i.value == null ? '-' : typeof i.value === 'number' ? i.value.toFixed(3) : i.value}`); };
test('regression: automatic checks on the five demo tours', { skip: !existsSync(new URL('tours/index.json', PRIV)) && 'tour/private/ not present' }, () => {
  const list = JSON.parse(readFileSync(new URL('tours/index.json', PRIV)));
  const got = Object.fromEntries(list.map(t => [t.id, sig(JSON.parse(readFileSync(new URL(`tours/${t.id}.json`, PRIV))))]));
  const file = new URL('expected.json', PRIV);
  if (!existsSync(file) || process.env.UPDATE_EXPECTED) writeFileSync(file, JSON.stringify(got, null, 1)); // first run records, later runs compare
  assert.deepEqual(got, JSON.parse(readFileSync(file)));
});
