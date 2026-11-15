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
  assert.deepEqual(quick('make the text bigger'), { tool: 'set_text', input: { size: 'larger' } });
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

test('the guide says what each walkthrough stop means for a wheelchair, in plain words, with the fix and its price but no measurements', async () => {
  const { stopLine } = await import('./voice.js');
  const typeOf = o => ({ ramp1: 'threshold ramp' })[o.product?.id];
  const free = { kind: 'free', label: 'Take the door off its hinges (keep it, rehang it when you move out)', price: 0, verdict: 'closes' };
  const ramp = { kind: 'product', label: '1\' L x 3\' W EZ-ACCESS Ramp', price: 70.99, product: { id: 'ramp1' }, verdict: 'closes' };
  const wide = { kind: 'contractor', label: 'Widen the doorway', low: 600, high: 2000, verdict: 'closes' };
  const noSizes = t => assert.doesNotMatch(t, /\d+'|\d+"|needs \d|across/, t);
  const bath = stopLine({ id: 'turn-1', kind: 'turn', s: 'fail', critical: true, room: 'Bathroom', measured: '4\' 10"', need: '5\' 0" across' }, { options: [{ kind: 'free', label: 'Remodel the room (not priced)', verdict: 'closes' }] }).text;
  assert.match(bath, /^(This is the big one|This one matters most)\. .*bathroom.*\. The fix: remodel the room\.$/i); noSizes(bath);
  const kitchen = stopLine({ id: 'turn-2', kind: 'turn', s: 'pass', room: 'Kitchen, Living Room, Dining Room', measured: '11\' 9"', need: '5\' 0" across' }).text;
  assert.match(kitchen, /kitchen/i); noSizes(kitchen);
  const tape = stopLine({ id: 'door-4', kind: 'door', s: 'verify', between: 'Hallway ↔ Bedroom', measured: '2\' 10"', need: '2\' 10" opening' }, { chosen: free, options: [free] }).text;
  assert.match(tape, /^The doorway into the bedroom .*(tape|Measure).* Easy fix, and free: take the door off its hinges\.$/); noSizes(tape);
  const narrow = stopLine({ id: 'door-5', kind: 'door', s: 'fail', between: 'Kitchen, Living Room ↔ Balcony', measured: '2\' 6"', need: '2\' 10" opening' }, { options: [free, wide].map(o => o === free ? { ...o, verdict: 'helps' } : o) }).text;
  assert.match(narrow, /balcony.* The real fix is a bigger job: widen the doorway, about \$600 to \$2,000\.$/); noSizes(narrow);
  const step = { id: 'step-3', kind: 'step', s: 'verify', between: 'Kitchen ↔ Balcony', measured: '1"', need: 'level (¾")' };
  assert.equal(stopLine(step, { chosen: ramp, options: [ramp] }, typeOf).text, 'There\'s a small lip at the doorway into the balcony, worth a quick check. It\'s in your plan: a threshold ramp for $70.99 sorts it out.');
  assert.deepEqual(stopLine(step, { options: [ramp] }, typeOf).ask, true);
  assert.match(stopLine(step, { options: [ramp] }, typeOf).text, /A threshold ramp for \$70\.99 would fix it\. Shall I add it to your plan\?$/);
  const out = stopLine({ id: 'door-9', kind: 'door', s: 'fail', between: 'Void ↔ Entry', measured: '2\' 5"', need: '2\' 10" opening' }).text;
  assert.match(out, /door to outside/i); noSizes(out);
});

test("keepsNumbers: Ethan's rewrite of a walk line is used only if every number and price survived", async () => {
  const { keepsNumbers } = await import('./voice.js');
  const base = `The door to outside is 2' 5", and it needs 2' 10". Only this fixes it: widen the doorway, $600 to $2,000.`;
  assert.ok(keepsNumbers(base, `We're at the front door. It's 2' 5", but he'd need 2' 10". Widening it is the real fix, $600 to $2,000.`));
  assert.ok(!keepsNumbers(base, `It's 2' 5" and he needs 2' 10". Widening it costs about $600.`)); // a price dropped
  assert.ok(!keepsNumbers(base, `It's 29 inches and he needs 34. Widening it is $600 to $2,000.`)); // numbers reworded
  assert.ok(keepsNumbers(`There's a 1" step at the door. A threshold ramp for $28.90 would fix it.`, `Small thing here: a 1" step. A threshold ramp for $28.90 sorts it.`));
  assert.ok(keepsNumbers('The kitchen has room to turn around.', 'Lovely kitchen, plenty of room to turn.')); // no numbers: nothing to lose
});

test("the recogniser's other guesses get a second chance at a command", async () => {
  const { pickHeard } = await import('./voice.js');
  assert.deepEqual(pickHeard('show me the flow plan', ['show me the floor plan', 'show me the flower plan']), { text: 'show me the floor plan', q: { tool: 'set_view', input: { mode: 'floorplan' } } });
  assert.equal(pickHeard('what about the hallway', ['what about the whole way']).q, null); // a question stays a question, for Claude
  assert.deepEqual(pickHeard('night mode', ['knight mode']).text, 'night mode'); // the first guess wins when it works
});

test('a greeting alone is a greeting; with a request after it, it is a request', () => {
  for (const t of ['hi', 'Hi.', 'hey', 'Hey Ethan!', 'hello there', 'good morning', 'hi ethan how are you', 'High']) assert.deepEqual(quick(t, places), { hello: true }, t);
  for (const t of ['hi I need a place for my dad', 'high contrast', 'again', 'ok', 'hello can he get into the bathroom']) assert.notDeepEqual(quick(t, places), { hello: true }, t);
});
test('more ways to ask for a room, the next one, or another apartment', () => {
  for (const t of ['walk me to the kitchen', 'can we see the kitchen', 'and the kitchen', 'bring me to the kitchen', 'now head over to the kitchen', "I'd like to see the kitchen", 'then the kitchen please'])
    assert.equal(quick(t, { rooms: [{ id: 'turn-9', name: 'Kitchen, Living Room' }] })?.input.id, 'turn-9', t);
  assert.deepEqual(quick('next room'), { tool: 'walkthrough', input: { action: 'next' } });
  assert.deepEqual(quick('walk me through it'), { tool: 'set_view', input: { mode: 'walkthrough' } });
  assert.deepEqual(quick('show me another property'), { tool: 'open_page', input: { page: 'home' } });
});
test('thanks and bye get a fixed line; "apartment A" is not a command of its own', () => {
  assert.ok(quick('Thank you, Ethan!').line); assert.ok(quick('ok bye').line);
  assert.deepEqual(quick('floor plan please, thank you'), { tool: 'set_view', input: { mode: 'floorplan' } });
  assert.equal(quick('apartment A', { also: [{ keys: 'into apartment|enter apartment', tool: 'enter' }] }), null);
});

test('camera commands run at once, in several wordings, with an amount', () => {
  const cam = (t, action, amount = 'normal') => assert.deepEqual(quick(t), { tool: 'camera', input: { action, amount } }, t);
  for (const [a, ws] of Object.entries({ turn_left: ['turn left', 'look left', 'rotate left', 'pan left', 'left'], turn_right: ['turn right', 'look to the right', 'right'],
    turn_around: ['turn around', 'look behind', 'behind me', 'spin around'], look_up: ['look up', 'up'], look_down: ['look down', 'down'],
    forward: ['go forward', 'move forward', 'walk forward', 'forward', 'straight ahead', 'get closer', 'closer'], back: ['step back', 'backwards', 'move backwards', 'further back', 'back up'],
    left: ['step left', 'move left a step'], right: ['step right', 'move right a step'], zoom_in: ['zoom in', 'closer look'], zoom_out: ['zoom out', 'zoom out more'],
    zoom_reset: ['reset zoom', 'normal zoom', 'zoom reset'] })) for (const w of ws) assert.equal(quick(w)?.input?.action, a, w);
  cam('turn left a little', 'turn_left', 'little'); cam('look a bit to the right', 'turn_right', 'little'); cam('turn left slightly', 'turn_left', 'little');
  cam('turn right a lot', 'turn_right', 'lot'); cam('zoom in more', 'zoom_in', 'lot'); cam('can you look a bit more to the right please', 'turn_right', 'little');
  assert.equal(quick('zoom out').tool, 'camera'); assert.deepEqual(quick('dollhouse'), { tool: 'set_view', input: { mode: 'dollhouse' } });
  assert.deepEqual(quick('back'), { tool: 'walkthrough', input: { action: 'back' } }); assert.equal(quick('top').input.mode, 'floorplan');
  assert.equal(quick('turn left and tell me about the kitchen'), null);
});
test('a sentence that only contains a camera phrase goes to Claude', () => {
  assert.equal(quick("I'd like to see what's behind me and then get a closer look at the door"), null);
  assert.deepEqual(quick('a closer look'), { tool: 'camera', input: { action: 'zoom_in', amount: 'normal' } });
  assert.equal(quick('go ahead'), null);
});
