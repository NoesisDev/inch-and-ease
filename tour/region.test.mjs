// Run: node --test tour/*.test.mjs  (made-up apartments only)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, tone, fallbackScript, fallbackPlan } from './region.js';

const unit = (id, critical_left, steep_pct, purchases_usd, extra = {}) => ({ id, address: `${id} St`,
  inside: { critical_left, purchases_usd, top: [{ title: `${id} problem`, fix: '$10.00', what: `the ${id} door is 2 foot 4 wide`, fix_spoken: 'a $10 ramp fixes it' }] }, outside: { steep_pct, flat_pct: 100 - steep_pct, station: null }, ...extra });

test('ranking: critical left first, then steep streets, then cost', () => {
  const r = rank([unit('A', 1, 30, 0), unit('B', 0, 50, 99), unit('C', 1, 5, 500), unit('D', 1, 5, 20)]);
  assert.deepEqual(r.map(u => u.id), ['B', 'D', 'C', 'A']);
});

test('pin colour follows what is left after the cheapest fixes', () => {
  assert.deepEqual([0, 1, 3].map(n => tone(unit('x', n, 0, 0))), ['pass', 'verify', 'fail']);
});

test('the fallback script visits worst to best and ends on the best one, diving in', () => {
  const r = rank([unit('A', 2, 30, 0), unit('B', 0, 1, 70), unit('C', 1, 5, 0)]);
  const s = fallbackScript(r);
  assert.deepEqual(s.stops.map(x => x.id), ['A', 'C']);
  assert.equal(s.answer.id, 'B'); assert.equal(s.answer.dive, true);
  assert.match(s.stops[0].line, /^A Street\. The A door is 2 foot 4 wide, and a \$10 ramp fixes it\. /);
  assert.match(s.stops[0].line, /30% of the nearby streets are steeper than 8%/);
  assert.match(s.answer.line, /99% of the nearby streets are flat/);
});

test('fallbackPlan: which apartment, in what order, inside or outside', () => {
  const r = rank([unit('A', 0, 1, 0, { address: '12 Oak Dr' }), unit('B', 1, 1, 0), unit('C', 2, 1, 0), unit('D', 3, 1, 0), unit('E', 4, 1, 0)]);
  const label = { A: 'C', B: 'A', C: 'E', D: 'B', E: 'D' }, ids = p => p.steps.map(s => `${s.id}:${s.where}`);
  assert.deepEqual(ids(fallbackPlan(r, 'Take me to the best one')), ['A:outside', 'A:inside']);
  assert.deepEqual(ids(fallbackPlan(r, 'show the worst')), ['E:outside', 'E:inside']);
  assert.deepEqual(ids(fallbackPlan(r, 'the medium apartment')), ['C:outside', 'C:inside']);
  assert.deepEqual(ids(fallbackPlan(r, 'second best please')), ['B:outside', 'B:inside']);
  assert.deepEqual(ids(fallbackPlan(r, 'show me the medium apartment first and then the best one')), ['C:outside', 'C:inside', 'A:outside', 'A:inside']);
  assert.deepEqual(ids(fallbackPlan(r, 'the best first then the middle one')), ['A:outside', 'A:inside', 'C:outside', 'C:inside']);
  const b = fallbackPlan(r, 'take me inside apartment b', { label }); assert.deepEqual(ids(b), ['D:inside']); assert.equal(b.end, 'stay'); assert.equal(b.steps[0].room, ''); assert.equal(b.steps[0].walk, false);
  assert.deepEqual(ids(fallbackPlan(r, 'what about Oak Drive')), ['A:outside', 'A:inside']);
  assert.equal(fallbackPlan(r, 'walk through the worst one').steps[0].walk, true);
  assert.deepEqual(ids(fallbackPlan(r, 'take me outside', { active: 'C', inside: true })), ['C:outside']);
  const all = fallbackPlan(r, 'all of them worst first'); assert.deepEqual(all.steps.filter(s => s.where === 'outside').map(s => s.id), ['E', 'D', 'C', 'B', 'A']); assert.equal(all.end, 'map'); assert.ok(all.say);
  assert.deepEqual(fallbackPlan(r, 'every apartment').steps.filter(s => s.where === 'inside').map(s => s.id), ['A', 'B', 'C', 'D', 'E']);
  // the flyover's rule: the slopes first, then inside for the walk; only "outside" or "inside" when they said so
  const best = fallbackPlan(r, 'show me the best apartment').steps; assert.deepEqual(best.map(s => [s.where, s.walk]), [['outside', false], ['inside', true]]);
  assert.deepEqual(ids(fallbackPlan(r, 'the best one from outside only')), ['A:outside']);
  assert.deepEqual(ids(fallbackPlan(r, 'all of them inside and out')).slice(0, 2), ['A:outside', 'A:inside']);
  const m = fallbackPlan(r, 'back to the map'); assert.deepEqual([m.steps, m.end], [[], 'map']);
  assert.match(fallbackPlan(r, 'the best').steps[0].line, /^12 Oak Drive\. /);
  assert.equal(fallbackPlan(r, 'blah wibble gibberish'), null);
});
