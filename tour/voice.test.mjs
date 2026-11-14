// node --test tour/voice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { quick, speakable } from './voice.js';

const places = { rooms: [{ id: 'turn-1', name: 'Bathroom', say: 'Bathroom too small to turn around' }, { id: 'turn-2', name: 'Bedroom' }, { id: 'turn-3', name: 'Bedroom' }, { id: 'turn-4', name: 'Living Room' }],
  issues: [{ id: 'door-3', say: 'Door too narrow' }, { id: 'turn-1', say: 'Bathroom too small to turn around' }] };

test('whole-sentence commands run in the page', () => {
  assert.deepEqual(quick('Next.'), { tool: 'walkthrough', input: { action: 'next' } });
  assert.deepEqual(quick('Can you show me the floor plan, please?'), { tool: 'set_view', input: { mode: 'floorplan' } });
  assert.deepEqual(quick('switch to night mode'), { tool: 'set_look', input: { look: 'night' } });
  assert.deepEqual(quick('Hide the panel'), { tool: 'show_panel', input: { tab: 'hidden' } });
  assert.deepEqual(quick('start the walkthrough'), { tool: 'set_view', input: { mode: 'walkthrough' } });
  assert.deepEqual(quick('Stop!'), { stop: true });
});
test('rooms and pin numbers fly there without Claude', () => {
  assert.deepEqual(quick('go to the bath room', places), { tool: 'show_issue', input: { id: 'turn-1' }, say: 'Bathroom too small to turn around' });
  assert.equal(quick('take me to the living room', places).input.id, 'turn-4');
  assert.equal(quick('number two', places).input.id, 'turn-1');
  assert.equal(quick('show me issue 1', places).input.id, 'door-3');
});
test('questions, unclear rooms and unknown numbers go to Claude', () => {
  assert.equal(quick('Can my dad get into the bathroom?', places), null);
  assert.equal(quick('show me the floor plan and tell me what is wrong', places), null);
  assert.equal(quick('the bedroom', places), null); // two bedrooms
  assert.equal(quick('number nine', places), null);
  assert.equal(quick('show me', places), null);
  assert.equal(quick('', places), null);
});
test('measurements are spelled out for the speech voice', () => {
  assert.equal(speakable(`The door is 2' 6" wide and the step is ½".`), 'The door is 2 feet 6 inches wide and the step is half an inch.');
  assert.equal(speakable(`It measures 4' 10½" across.`), 'It measures 4 feet 10 and a half inches across.');
  assert.equal(speakable(`A 1" step, 5' 0" to turn, 11" deep, 1' 3" high`), 'A 1 inch step, 5 feet to turn, 11 inches deep, 1 foot 3 inches high');
  assert.equal(speakable('Needs 5\' to turn. Offset hinges, $70.99, or a ramp for $40.00.'), 'Needs 5 feet to turn. Offset hinges, $70.99, or a ramp for $40.');
  assert.equal(speakable(`Door may be too narrow (2' 10")`), 'Door may be too narrow, 2 feet 10 inches');
  assert.equal(speakable(`Level within ¾", seat 17–19", a 3/4 inch lip, 1½–2" less, Bathroom ↔ Hallway, $600 to $2,000`), 'Level within three quarters of an inch, seat 17 to 19 inches, a three quarters inch lip, 1 and a half to 2 inches less, Bathroom to Hallway, $600 to $2,000');
});
test('doors, shared rooms, the worst problem and the other pages are found without Claude', () => {
  const p = { rooms: [{ id: 'turn-1', name: 'Bathroom' }, { id: 'turn-2', name: 'Kitchen, Living Room, Dining Room' }, { id: 'hall-3', name: 'Hallway' }, { id: 'turn-4', name: 'Bedroom' }],
    doors: [{ id: 'door-1', rooms: ['Bathroom', 'Hallway'] }, { id: 'door-2', rooms: ['Kitchen, Living Room, Dining Room', 'Balcony'] }, { id: 'door-3', rooms: ['Hallway', 'Bedroom'] }, { id: 'door-4', rooms: ['Bedroom'] }],
    issues: [{ id: 'turn-1', say: 'Bathroom too small to turn around' }] };
  assert.equal(quick('take me to the kitchen', p).input.id, 'turn-2');
  assert.equal(quick('the living room', p).input.id, 'turn-2');
  assert.equal(quick('go to the hall way', p).input.id, 'hall-3');
  assert.equal(quick('show me the balcony door', p).input.id, 'door-2');
  assert.equal(quick('the balcony', p).input.id, 'door-2'); // no room check there: the door that leads to it
  assert.equal(quick('the door between the hallway and the bedroom', p).input.id, 'door-3');
  assert.equal(quick('bedroom to hallway door', p).input.id, 'door-3'); // either order
  assert.equal(quick('the bathroom door', p).input.id, 'door-1');
  assert.equal(quick('the bedroom door', p), null); // two doors touch the bedroom: Claude asks or picks
  assert.equal(quick('the hallway door', p), null);
  assert.equal(quick('the garage', p), null);
  assert.equal(quick('show me the worst problem', p).input.id, 'turn-1');
  assert.deepEqual(quick('go home'), { tool: 'open_page', input: { page: 'home' } });
  assert.deepEqual(quick('compare the neighbourhood'), { tool: 'open_page', input: { page: 'neighbourhood' } });
  assert.deepEqual(quick('show the issues by room'), { tool: 'ui', input: { action: 'issues_by_room' } });
  assert.deepEqual(quick('say that again'), { repeat: true });
  assert.deepEqual(quick('What can I say?'), { help: true });
});
test('the page\'s own commands come first', () => {
  const also = [{ keys: 'go inside|enter', tool: 'dive', input: {} }, { keys: 'apartment b|b', tool: 'show_unit', input: { id: 'x' }, say: '410 Hillcrest' }];
  assert.deepEqual(quick('go inside', { also }), { tool: 'dive', input: {} });
  assert.deepEqual(quick('Apartment B.', { also }), { tool: 'show_unit', input: { id: 'x' }, say: '410 Hillcrest' });
});
test('words the recogniser is known to mishear still run at once', () => {
  const p = { rooms: [{ id: 'hall-3', name: 'Hallway' }] };
  assert.equal(quick('the whole way', p).input.id, 'hall-3');
  assert.deepEqual(quick('Warcraft'), { tool: 'set_view', input: { mode: 'walkthrough' } });
  assert.deepEqual(quick('eye contrast'), { tool: 'set_look', input: { look: 'contrast' } });
  assert.deepEqual(quick('show me the floor plant'), { tool: 'set_view', input: { mode: 'floorplan' } });
  assert.deepEqual(quick('night more'), { tool: 'set_look', input: { look: 'night' } });
});
test('pins by number and order, and words that used to be swallowed', () => {
  const p = { issues: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  assert.equal(quick('number to', p).input.id, 'b');
  assert.equal(quick('show me problem number three', p).input.id, 'c');
  assert.equal(quick('the first one', p).input.id, 'a');
  assert.equal(quick('show me the last one', p).input.id, 'c');
  assert.equal(quick('number nine', p), null); // Claude says there are three
  assert.equal(quick('what is problem two', p), null); // a question
  assert.deepEqual(quick('go back'), { tool: 'walkthrough', input: { action: 'back' } });
  assert.deepEqual(quick('What can you do?'), { help: true });
  assert.deepEqual(quick('go to the start page'), { tool: 'open_page', input: { page: 'home' } });
  assert.deepEqual(quick('um can you uh show me the doll house'), { tool: 'set_view', input: { mode: 'dollhouse' } });
  assert.deepEqual(quick('take me back to all the apartments'), { tool: 'open_page', input: { page: 'home' } });
  assert.deepEqual(quick('open the chat'), { tool: 'show_panel', input: { tab: 'ask' } });
});

// The pages keep their code inline, so a slip there (a name declared twice) stops the whole page and no other test sees it.
test('the inline page scripts parse', async () => {
  const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs'), { execFileSync } = await import('node:child_process'), { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/ie-');
  for (const f of ['index.html', 'region.html']) {
    const html = readFileSync(new URL(f, import.meta.url), 'utf8');
    const code = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.ok(code.length, f + ' has a module script');
    code.forEach((c, i) => { const p = `${dir}/${f}.${i}.mjs`; writeFileSync(p, c); execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); });
  }
});

test('the guide says each walkthrough stop with the scan numbers and the plan', async () => {
  const { stopLine } = await import('./voice.js');
  const typeOf = o => ({ ramp1: 'threshold ramp' })[o.product?.id];
  const free = { kind: 'free', label: 'Take the door off its hinges (keep it, rehang it when you move out)', price: 0, verdict: 'closes' };
  const ramp = { kind: 'product', label: '1\' L x 3\' W EZ-ACCESS Ramp', price: 70.99, product: { id: 'ramp1' }, verdict: 'closes' };
  const wide = { kind: 'contractor', label: 'Widen the doorway', low: 600, high: 2000, verdict: 'closes' };
  assert.equal(stopLine({ kind: 'turn', s: 'fail', critical: true, room: 'Bathroom', measured: '4\' 10"', need: '5\' 0" across' }, { options: [{ kind: 'free', label: 'Remodel the room (not priced)', verdict: 'closes' }] }).text,
    'This one is critical. The bathroom is 4\' 10" across, and turning around needs 5\' 0". Only this fixes it: remodel the room.');
  assert.equal(stopLine({ kind: 'turn', s: 'pass', room: 'Kitchen, Living Room, Dining Room', measured: '11\' 9"', need: '5\' 0" across' }).text, 'The kitchen is 11\' 9" across, so there is room to turn around.');
  assert.equal(stopLine({ kind: 'door', s: 'verify', between: 'Hallway ↔ Bedroom', measured: '2\' 10"', need: '2\' 10" opening' }, { chosen: free, options: [free] }).text,
    'The door between the hallway and the bedroom is 2\' 10", and it needs 2\' 10". That\'s too close to call from the scan, so check it with a tape. Your plan fixes it: take the door off its hinges, $0.');
  assert.equal(stopLine({ kind: 'door', s: 'fail', between: 'Kitchen, Living Room ↔ Balcony', measured: '2\' 6"', need: '2\' 10" opening' }, { options: [free, wide].map(o => o === free ? { ...o, verdict: 'helps' } : o) }).text,
    'The door between the kitchen and the balcony is 2\' 6", and it needs 2\' 10". Only this fixes it: widen the doorway, $600 to $2,000.');
  const step = { kind: 'step', s: 'verify', between: 'Kitchen ↔ Balcony', measured: '1"', need: 'level (¾")' };
  assert.equal(stopLine(step, { chosen: ramp, options: [ramp] }, typeOf).text, 'There\'s a 1" step at the door between the kitchen and the balcony, and it should be level. That\'s too close to call from the scan, so check it with a tape. Your plan fixes it: a threshold ramp, $70.99.');
  assert.deepEqual(stopLine(step, { options: [ramp] }, typeOf).ask, true);
  assert.match(stopLine(step, { options: [ramp] }, typeOf).text, /A threshold ramp for \$70\.99 would fix it\. Shall I add it to your plan\?$/);
  assert.equal(stopLine({ kind: 'door', s: 'fail', between: 'Void ↔ Entry', measured: '2\' 5"', need: '2\' 10" opening' }).text, 'The door to outside is 2\' 5", and it needs 2\' 10".');
});
