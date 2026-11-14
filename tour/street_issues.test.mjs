// node --test tour/street_issues.test.mjs  (the same cases as src/lib/issues.test.mjs, so the two ports stay equal)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIssues, verdict, PROFILES, askStreets, spokenLimit } from './street_issues.js';

const manual = PROFILES[0];
const base = { stepFree: { dist: 600 }, station: { dist: 600 }, busStops400: 3, kerbs: 2, loweredKerbs: 2 };

test('verdict: both / one way / too steep / steps', () => {
  assert.equal(verdict({ slope: 7 }, manual), 'both');
  assert.equal(verdict({ slope: 9 }, manual), 'one');
  assert.equal(verdict({ slope: 11 }, manual), 'no');
  assert.equal(verdict({ slope: 0, steps: true }, manual), 'no');
  assert.equal(verdict({ slope: 0, steps: true }, PROFILES[2]), 'both');
  assert.equal(verdict({ slope: 9 }, PROFILES[1]), 'both'); // a power chair manages it
});

test('every street at the door too steep -> one barrier naming the flattest', () => {
  const segs = [{ slope: 12, len: 10, near: 20, name: 'A St' }, { slope: 15, len: 10, near: 40, name: 'B St' }];
  const issues = findIssues({ ...base, segs }, manual);
  assert.equal(issues[0].level, 'barrier');
  assert.match(issues[0].detail, /12\.0% on A St/);
});

test('a steep driveway or alley at the door is not a barrier', () => {
  const segs = [{ slope: 2, len: 50, near: 10, kind: 'residential' }, { slope: 18, len: 20, near: 20, kind: 'alley' }, { slope: 12, len: 20, near: 30, kind: 'service' }];
  assert.deepEqual(findIssues({ ...base, segs }, manual), []);
});

test('missing data shows as unknown or warning, never silence', () => {
  const segs = [{ slope: 2, len: 50, near: 10 }];
  const titles = findIssues({ segs, stepFree: null, station: null, busStops400: 0, kerbs: 0, loweredKerbs: 0 }, manual).map(i => i.title);
  assert.deepEqual(titles, ['No rail station within 2 km', 'No bus stop within 400 m', 'Curb ramps not known']);
  const untagged = findIssues({ ...base, segs, stepFree: null, station: { dist: 257, name: 'Wilshire/Normandie' } }, manual);
  assert.deepEqual(untagged.map(i => i.level), ['unknown']);
});

test('one-way and steps warnings', () => {
  const segs = [{ slope: 2, len: 50, near: 10 }, { slope: 9, len: 20, near: 30, name: 'Hill St' }, { slope: 0, len: 5, near: 70, steps: true, kind: 'steps' }];
  const t = findIssues({ ...base, segs }, manual).map(i => i.title);
  assert.deepEqual(t, ['9.0% on Hill St: one way only', 'Steps 70 m from the building']);
});

test('what Claude is told: a street by its piece near the door', () => {
  const segs = [{ name: 'A St', slope: 3, near: 50 }, { name: 'A St', slope: 14, near: 200 }, { name: 'B St', slope: 6, near: 300 }, { name: 'B St', slope: 9, near: 310 }, { slope: 20, near: 5 }];
  assert.deepEqual(askStreets(segs), [{ name: 'A St', slope: 3, near: 50 }, { name: 'B St', slope: 9, near: 310 }]);
});

test('slope limits by voice', () => {
  assert.deepEqual(spokenLimit('Uphill 10.'), { up: 10 });
  assert.deepEqual(spokenLimit('set the downhill limit to six percent'), { down: 6 });
  assert.deepEqual(spokenLimit('down 12%'), { down: 12 });
  assert.equal(spokenLimit('uphill 30'), null);
  assert.equal(spokenLimit('is the street uphill from the station'), null);
});
