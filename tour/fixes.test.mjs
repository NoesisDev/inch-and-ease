// Run: node --test tour/fixes.test.mjs  (uses the real catalogue in data/products.json)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFix, planAll, IN } from './fixes.js';

const products = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url))).products;
const door = cm => ({ kind: 'door', w: cm / 100 });
const step = inches => ({ kind: 'step', h: inches * IN });

test('a door 1-2" short is fixed by the cheapest swing-clear hinges', () => {
  const p = planFix(door(81), products); // 31.9" opening ≈ 30.1" clear, 1.9" short
  assert.equal(p.closes, true);
  assert.equal(p.renter.price, 27.99);
  assert.equal(p.owner, null);
});

test('the 75 cm balcony door needs a contractor; hinges only help', () => {
  const p = planFix(door(75.4), products); // ≈ 27.9" clear, 4.1" short
  assert.equal(p.closes, false);
  assert.equal(p.owner.avg, 1200);
  assert.match(p.verdict, /still .* short/);
});

test('a wide door needs nothing', () => assert.equal(planFix(door(91), products).cost, 0));

test('steps get the cheapest no-tools ramp that is tall enough', () => {
  for (const h of [0.8, 1.2, 2.8, 3.5]) {
    const p = planFix(step(h), products);
    assert.ok(p.renter, `no ramp for ${h}"`);
    const prod = products.find(x => x.id === p.renter.id);
    const max = prod.spec.rise_in ?? prod.spec.rise_max_in ?? prod.spec.max_rise_in_recommended;
    assert.ok(max >= h, `${prod.id} too short for ${h}"`);
  }
});

test('no product fixes a small room, and the total counts it as unsolved', () => {
  const all = planAll([{ kind: 'turn' }, door(81), step(1.2)], products);
  assert.equal(all.unsolved, 1);
  assert.equal(all.renterTotal, all.plans[1].plan.cost + all.plans[2].plan.cost);
});

test('partial fixes are not counted in the total', () => {
  const all = planAll([door(75.4)], products);
  assert.equal(all.renterTotal, 0);
  assert.equal(all.unsolved, 1);
});
