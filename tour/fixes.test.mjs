// Run: node --test tour/*.test.mjs  (uses the real catalogue in data/products.json and made-up items)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixOptions, planAll, recheck } from './fixes.js';
import { statusOf, IN } from './checks.js';

const products = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url))).products;
const item = (n, kind, value, extra) => ({ id: `${kind}-${value}`, n, kind, value, s: statusOf(n, value), critical: false, ...extra });
const door = cm => item(8, 'door', cm / 100);
const step = inches => item(9, 'step', inches * IN);

test('fix options: every rung of the door ladder, $0 first, one product per tier, contractor with its source', () => {
  const o = fixOptions(door(84), products);
  assert.equal(o[0].kind, 'free'); assert.equal(o[0].price, 0);
  const tiers = o.filter(x => x.kind === 'product').map(x => x.product.tier);
  assert.ok(tiers.length >= 2 && tiers.length <= 3 && new Set(tiers).size === tiers.length);
  const pro = o.find(x => x.kind === 'contractor');
  assert.deepEqual([pro.low, pro.high, pro.price, pro.source], [600, 2000, 1200, 'Angi cost guide']);
  assert.ok(o.every(x => ['closes', 'helps', 'na', 'nosupport'].includes(x.verdict)));
  assert.ok(o.find(x => x.kind === 'product').product.install);
});

test('re-check: a tape-check door closes by taking the door off; a 75 cm door only gets help from hinges', () => {
  const tape = fixOptions(door(84), products);
  assert.equal(tape[0].verdict, 'closes'); // 84 + 4.4 cm = 88.4 cm opening ≥ 86.5
  const narrow = fixOptions(door(75), products);
  assert.ok(narrow.filter(x => x.kind === 'product').every(x => x.verdict === 'helps'));
  assert.match(narrow.find(x => x.kind === 'product').change, /adds 2" → about 2' 8" opening/);
  assert.equal(narrow.find(x => x.kind === 'contractor').verdict, 'closes');
  assert.equal(recheck(door(75), 0.75).verdict, 'na'); // no change, no help
});

test('steps: only ramps whose rise covers the step close it', () => {
  const o = fixOptions(step(1.2), products).filter(x => x.kind === 'product');
  assert.ok(o.some(x => x.verdict === 'closes'));
  for (const x of o.filter(x => x.verdict === 'closes')) {
    const p = products.find(q => q.id === x.product.id).spec;
    assert.ok((p.rise_in ?? p.rise_max_in ?? p.max_rise_in_recommended) >= 1.2);
  }
});

test('suction and clamp-on tub bars are shown but never count as support', () => {
  const bar = item(2, 'ask', 'none');
  const o = fixOptions(bar, products), ns = o.filter(x => x.kind === 'nosupport');
  assert.ok(ns.length >= 1);
  assert.ok(ns.every(x => x.verdict === 'nosupport' && /Deen 2025/.test(x.reason)));
  assert.notEqual(planAll([bar], products).rows[0].default.kind, 'nosupport');
});

test('items the catalogue lacks appear as text with the table price and no link', () => {
  const rim = item(1, 'measure', 0.53);
  const t = fixOptions(rim, products).find(x => x.kind === 'text');
  assert.equal(t.price, 321); assert.equal(t.product, undefined);
});

test('plan: default is the cheapest purchase that closes; choosing another option changes the total', () => {
  const items = [door(84), step(1.2)];
  const p = planAll(items, products);
  assert.equal(p.rows[0].chosen.price, 0);
  const hinge = p.rows[0].options.find(x => x.kind === 'product' && x.verdict === 'closes');
  const p2 = planAll(items, products, { choices: { [items[0].id]: hinge.key } });
  assert.equal(p2.purchases, Math.round((p.purchases + hinge.price) * 100) / 100);
  const widen = p.rows[0].options.find(x => x.kind === 'contractor');
  const p3 = planAll(items, products, { choices: { [items[0].id]: widen.key } });
  assert.deepEqual([p3.contractor.low, p3.contractor.high], [600, 2000]); // contractor range kept apart from purchases
  assert.equal(p3.rows[0].after, 'fixed');
});

test('plan: a room too small for a 5\' turn has no purchase fix and stays unsolved', () => {
  const turn = item(10, 'turn', 1.2);
  const p = planAll([turn], products);
  assert.equal(p.rows[0].chosen, null);
  assert.deepEqual(p.noPurchaseFix.map(i => i.id), [turn.id]);
  assert.equal(p.unsolved.length, 1);
});

test('budget: critical items are filled first, then the cheapest, until the money runs out', () => {
  const crit = { ...step(1.2), id: 'crit', critical: true }, night = item(20, 'ask', 'dark', { id: 'night' });
  const cheap = planAll([crit, night], products).rows.find(r => r.item.id === 'crit').default.price;
  const tight = planAll([crit, night], products, { budget: cheap - 1 });
  assert.equal(tight.rows.find(r => r.item.id === 'crit').chosen, null);
  assert.ok(tight.rows.find(r => r.item.id === 'night').chosen); // the cheap one still fits
  const enough = planAll([crit, night], products, { budget: cheap + 1 });
  assert.ok(enough.rows.find(r => r.item.id === 'crit').chosen);
  assert.equal(enough.rows.find(r => r.item.id === 'night').chosen, null); // night light doesn't fit in what's left
  assert.ok(enough.purchases <= cheap + 1);
});

test('a door to outside or to a balcony is never taken off its hinges', () => {
  const kinds = between => fixOptions({ ...door(76), between }, products).map(o => o.kind === 'product' ? 'hinge' : o.kind);
  assert.ok(kinds('Hallway ↔ Bedroom').includes('free'));
  assert.deepEqual(kinds('Living Room ↔ Balcony'), ['contractor']); // most often a slider: no hinges to take off or swap
  assert.ok(!kinds('Hallway ↔ Void').includes('free') && kinds('Hallway ↔ Void').includes('hinge')); // the front door: offset hinges yes, off its hinges no
  assert.ok(!kinds('outside').includes('free'));
});
