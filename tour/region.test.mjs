// Run: node --test tour/*.test.mjs  (made-up apartments only)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, tone, fallbackScript } from './region.js';

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
