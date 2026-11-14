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
  assert.equal(speakable(`The door is 2' 6" wide and the step is ½".`), 'The door is 2 foot 6 wide and the step is half an inch.');
  assert.equal(speakable(`It measures 4' 10½" across.`), 'It measures 4 foot 10 and a half across.');
  assert.equal(speakable('Needs 5\' to turn. Offset hinges, $70.99, or a ramp for $40.00.'), 'Needs 5 feet to turn. Offset hinges, $70.99, or a ramp for $40.');
});
