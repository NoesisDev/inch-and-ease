// Voice for the tour: hold Space (or click the mic to keep it open) and say anything.
// Short commands ("next", "floor plan", "the kitchen", "number two") run at once in the page; everything else goes to
// Claude, which drives the same tools. The bar shows what was heard, each thing the tour does, and the answer, which is
// also read aloud. Speech in: the browser's speech recognition (Chrome). Speech out: Ethan, a Fish Audio voice streamed by
// serve.py (/api/speak), one sentence at a time, and only Ethan (no browser voice: without Fish a reply is a caption). Every spoken
// line is Claude's, fitted to the conversation: a command the page runs itself gets its line from /api/say.

// ---- quick(): which sentences need no Claude round trip. Pure; tested in voice.test.mjs ----
// Only a whole sentence that is nothing but the command matches; anything longer is a question for Claude.
const FILLER = /\b(um|uh|er|erm|hmm|the|a|an|please|now|hey|ok|okay|just|me|my|can you|could you|would you|lets|let s|i want|to|at|show|go|switch|open|take|give|see|turn on|put on|start|view|mode|look|can we|could we|i d like|id like|i would like|wanna|we|us|bring|move|head|and|then|also|check out|visit|over to|thank you|thanks)\b/g;
// What Chrome's recogniser is known to hear instead (measured with generated speech).
const HEARD = [[/\bwalk (?:me |us )?(?:to|into|over to)\b/g, 'go to'], [/\b(whole way|holloway|hall way)\b/g, 'hallway'], [/\b(warcraft|walk true|walk thru|walkthru|work through|walk threw)\b/g, 'walkthrough'],
  [/\b(eye|hi|i) contrast\b/g, 'high contrast'], [/\bfloor plant?s?\b/g, 'floor plan'], [/\bnight more\b/g, 'night mode'], [/\bdoll ?house\b/g, 'dollhouse']];
const norm = t => HEARD.reduce((x, [a, b]) => x.replace(a, b), String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
const squash = t => norm(t).replace(/ /g, '');
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const NUM = { one: 1, two: 2, too: 2, to: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PHRASES = new Map([
  ['stop|quiet|be quiet|cancel|never mind|nevermind|enough|shut up', { stop: true }],
  ['next|next one|next stop|next problem|next issue|continue|keep going|go on|move on|skip|skip this one|skip to the next one|next please|next room|next place', ['walkthrough', { action: 'next' }]],
  ['previous|previous one|previous stop|previous problem|previous issue|one before|previous room|room before', ['walkthrough', { action: 'previous' }]],
  ['back|go back|back there|take me back|where i was', ['walkthrough', { action: 'back' }]], // in a walkthrough: the stop before; outside: the place shown before
  ['last one|last problem|last issue', { pin: -1 }],
  ['pause|wait|hold on', ['walkthrough', { action: 'pause' }]],
  ['play|resume', ['walkthrough', { action: 'play' }]],
  ['end walkthrough|end tour|stop walkthrough|stop tour', ['walkthrough', { action: 'stop' }]],
  ['overview|whole apartment|whole place|dollhouse|doll house|zoom out|3d', ['set_view', { mode: 'dollhouse' }]],
  ['floor plan|floorplan|top|from above|map', ['set_view', { mode: 'floorplan' }]],
  ['inside|walk inside|walk around', ['set_view', { mode: 'inside' }]],
  ['drone|fly|fly around|drone flight|fly around the apartment|fly around the place|fly through the apartment', ['set_view', { mode: 'drone' }]],
  ['walkthrough|walk through|walk through it|walk through apartment|tour|guided tour', ['set_view', { mode: 'walkthrough' }]],
  ['night|dark|night time', ['set_look', { look: 'night' }]],
  ['daylight|day|light|daytime|day light|day mode|light mode|bright', ['set_look', { look: 'daylight' }]],
  ['high contrast|contrast', ['set_look', { look: 'contrast' }]],
  ['bigger text|larger text|text bigger|make the text bigger|big text|large text|bigger letters|zoom in on the text', ['set_text', { size: 'larger' }]],
  ['smaller text|normal text|standard text|text smaller|make the text smaller|small text', ['set_text', { size: 'standard' }]],
  ['hide panel|hide sidebar|close panel|close sidebar|hide list|full screen', ['show_panel', { tab: 'hidden' }]],
  ['panel|sidebar|issues|problems|list|issue list|bring the list back|bring the panel back|list back|panel back|show the panel again|unhide the panel', ['show_panel', { tab: 'issues' }]],
  ['chat|the chat|ask claude|written chat|type a question|keyboard', ['show_panel', { tab: 'ask' }]],
  ['all issues|all problems|everything|full list', ['ui', { action: 'issues_all' }]],
  ['by room|issues by room|problems by room|group by room|room by room|sort by room|sort the problems room by room|sort the issues by room', ['ui', { action: 'issues_by_room' }]],
  ['print|print plan|print it|print that|save as pdf', ['ui', { action: 'print_plan' }]],
  ['home|start page|main page|home page|all apartments|other apartments|apartments|back home|beginning|back to all the apartments|back to the apartments|leave this apartment|exit the apartment|another apartment|another property|other property|other properties|another place|different apartment|different property|another home|other homes|another tour|other tours|another unit|other units', ['open_page', { page: 'home' }]],
  ['neighbourhood|neighborhood|compare neighbourhood|compare neighborhood|neighbourhood flyover|neighborhood flyover|flyover|compare apartments', ['open_page', { page: 'neighbourhood' }]],
  ['repeat|repeat that|again|say again|say that again|say it again|what did you say|pardon|come again|one more time|sorry what did you say|what was that|sorry', { repeat: true }],
  ['help|what can i say|what can you do|what can i ask|commands|what are commands|how does this work', { help: true }],
  ['worst|worst one|worst problem|worst issue|biggest problem|biggest issue|main problem|main issue|most serious|most serious problem|most serious one', { pin: 1 }],
  ['plan|fix plan|budget|costs|shopping list', ['show_panel', { tab: 'plan' }]],
  ['close|close it|close card|close that|hide card', ['close', {}]],
].flatMap(([keys, act]) => keys.split('|').map(k => [norm(k), act]))); // keys go through norm() too, so they are written the way they are said

// rooms: [{ id, name, say }] (name may be "Kitchen, Living Room": each part counts), doors: [{ id, rooms: [names], say }],
// issues: [{ id, say }] in pin order (pin 1 first), also: [{ keys: 'a|b', tool, input, say? }] = the page's own commands, tried first.
// Returns { stop } | { repeat } | { help } | { tool, input, say? } | null.
const parts = name => String(name).split(/\s*,\s*/).map(squash).filter(Boolean);
const DOOR_WORDS = /\b(door|doors|doorway|between|and|of|into|from|in|for|leading|goes|going|that|one)\b/g;
// Chrome gives up to four guesses per finished phrase. The first guess that is a whole command wins ("Warcraft" → "walkthrough"
// is in HEARD, but a guess list also catches the ones nobody listed). Returns the sentence to use and its command, if any.
export function pickHeard(text, others = [], places) {
  for (const t of [text, ...others]) { const q = quick(t, places); if (q) return { text: t, q }; }
  return { text, q: null };
}

// "Hi", "hey Ethan", "good morning": a greeting and nothing else. Anything after it ("hi, I need a place for my dad") is a request.
const HELLO = /^(?:hi+|high|hai|hello+|hey+|hiya|howdy|yo|greetings|good (?:morning|afternoon|evening|day)|ethan)(?: (?:there|ethan|eaton|ethen|eton|even|nathan|buddy|man|everyone|guys|how are you(?: doing)?(?: today)?|how s it going|hows it going|whats up|what s up|nice to meet you|good (?:morning|afternoon|evening)))*$/;
const POLITE = [[/^(?:ok(?:ay)? )?(?:thanks|thank you|cheers)(?: (?:ethan|a lot|so much|very much|man|buddy|that s all|that is all))*$/, 'You’re welcome. I’m here when you need me.'],
  [/^(?:ok(?:ay)? )?(?:bye|goodbye|bye bye|see you|see you later|good night)(?: (?:ethan|then|now))*$/, 'Bye for now. Good luck with the move.']];
export function quick(text, { rooms = [], doors = [], issues = [], also = [] } = {}) {
  const raw = String(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const t = norm(text);
  if (HELLO.test(raw)) return { hello: true };
  const polite = POLITE.find(([re]) => re.test(raw)); if (polite) return { line: polite[1] };
  if (!t) return null;
  const go = x => ({ tool: 'show_issue', input: { id: x.id }, ...(x.say ? { say: x.say } : {}) });
  const own = also.find(a => a.keys.split('|').some(k => norm(k) === t));
  if (own) return { tool: own.tool, input: own.input || {}, ...(own.say ? { say: own.say } : {}) };
  const hit = PHRASES.get(t);
  if (hit?.pin) { const x = issues.at(hit.pin > 0 ? hit.pin - 1 : hit.pin); return x ? go(x) : null; }
  if (hit) return Array.isArray(hit) ? { tool: hit[0], input: hit[1] } : hit;
  // A pin by its number: "number two", "problem number three", "number to" (read from the unfiltered words: "to" is a filler), "the second one".
  const n = raw.match(/\b(?:number|issue|problem|pin)(?: number)? (\d+|[a-z]+)$/), o = t.match(/^([a-z]+)(?: one| problem| issue| pin)?$/);
  const k = n && !norm(raw.slice(0, n.index)) ? +n[1] || NUM[n[1]] : o ? ORD[o[1]] : 0;
  if (k) return issues[k - 1] ? go(issues[k - 1]) : null; // no such pin: Claude says how many there are
  // A room by its name: "bath room" = "Bathroom", "the kitchen" = "Kitchen, Living Room, Dining Room"; two bedrooms = ask Claude which.
  const key = t.replace(/ /g, ''), named = r => squash(r.name) === key || parts(r.name).includes(key);
  const room = rooms.filter(named);
  if (room.length === 1) return go(room[0]);
  if (room.length) return null;
  // A door by the room(s) it joins: "the balcony door", "door between the hallway and the bedroom", or a place only a door leads to ("the balcony").
  const want = t.replace(DOOR_WORDS, ' ').replace(/ /g, ''), asked = /\bdoor/.test(t);
  if (!want || (asked ? false : want !== key)) return null;
  const joins = d => { const ns = d.rooms.map(parts); return ns.some(p => p.includes(want)) || (ns.length === 2 && ns[0].some(a => ns[1].some(b => a + b === want || b + a === want))); };
  const door = doors.filter(joins);
  return door.length === 1 ? go(door[0]) : null;
}

// What the speech voice should read: feet and inches spelled out, no symbols.
const FR = { '½': ['a half', 'half an inch'], '¾': ['three quarters', 'three quarters of an inch'], '¼': ['a quarter', 'a quarter of an inch'] };
const Q = '(?: and (?:a half|three quarters|a quarter))?';
export const speakable = t => String(t).replace(/\s*\(([^)]*)\)/g, ', $1') // "Door too narrow (2' 6")" → "Door too narrow, 2 feet 6 inches"
  .replace(/\b3\/4\b/g, '¾').replace(/\b1\/2\b/g, '½').replace(/\b1\/4\b/g, '¼').replace(/([\d½¾¼])\s?[–-]\s?(\d)/g, '$1 to $2')
  .replace(/(\d)\s?([½¾¼])/g, (m, d, f) => `${d} and ${FR[f][0]}`).replace(/([½¾¼])"/g, (m, f) => FR[f][1]).replace(/[½¾¼]/g, f => FR[f][0])
  .replace(/(\d+)' ?0"/g, '$1 feet').replace(new RegExp(`(\\d+)' ?(\\d+${Q})"`, 'g'), '$1 feet $2 inches').replace(new RegExp(`(\\d+${Q})"`, 'g'), '$1 inches').replace(/(\d+)'/g, '$1 feet')
  .replace(/(?<![\d.,])1 feet\b/g, '1 foot').replace(/(?<![\d.,])1 inches\b/g, '1 inch')
  .replace(/↔/g, ' to ').replace(/(?<!\d)\/(?!\d)/g, ' ').replace(/\$(\d+)\.00\b/g, '$$$1').replace(/ +/g, ' ');

// ---- The guide: what the tour says at a walkthrough stop. Built from the scan's own numbers and the plan, never by Claude, so it is exact and instant. ----
// c = the check, row = its plan row (or none), typeOf(option) = a product's plain type ("threshold ramp"). Returns { text, ask }: ask = it ends on a question.
const placeOf = r => !r || r === 'Void' ? 'outside' : 'the ' + r.split(',')[0].trim().toLowerCase();
const cap = t => t[0].toUpperCase() + t.slice(1);
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const usd = n => '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2));
const fixName = (o, typeOf) => o.kind === 'product' ? an(typeOf?.(o) || o.label) : o.label.replace(/\s*\(.*\)\s*$/, '').replace(/^./, m => m.toLowerCase());
const fixCost = o => o.kind === 'contractor' ? (o.low == null ? '' : `${usd(o.low)} to ${usd(o.high)}`) : o.price == null ? '' : usd(o.price);
// Spoken like a person showing someone round: what the place means for a wheelchair, not the measurement against the rule
// (the card shows the numbers). Only a fix's price is said.
// The wording varies by check, so a walk never says the same opener twice in a row.
const pick = (c, xs) => xs[[...String(c.id || c.room || c.between || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % xs.length];
export function stopLine(c, row, typeOf) {
  const [a, b] = (c.between || '').split(' ↔ ');
  const door = !c.between ? 'the door' : a === 'Void' || b === 'Void' ? 'the door to outside' : `the doorway into ${placeOf(b)}`;
  const room = placeOf(c.room), s = c.s, Door = cap(door), Room = cap(room);
  const say = {
    turn: { pass: [`Plenty of space in ${room}: a wheelchair can turn right round here.`, `${Room} is roomy, so turning the chair is easy.`, `${Room} feels open, with room to spin the chair.`],
      fail: [`${Room} is tight. There isn't room to turn a wheelchair all the way round.`, `Turning around in ${room} would be a real struggle, the space just isn't there.`],
      verify: [`${Room} is close: turning round might just work, but measure it before you decide.`] },
    door: { pass: [`${Door} is wide enough to roll straight through.`],
      fail: [`A wheelchair won't fit through ${door}.`, `${Door} is too narrow for the chair to get through.`],
      verify: [`${Door} is too close to call for a wheelchair, worth checking with a tape.`, `${Door} is right on the limit. Measure it before you sign.`] },
    step: { pass: [`${Door} is level, nothing to catch the wheels.`],
      fail: [`There's a lip at ${door}, big enough to catch the front wheels.`, `Watch the step at ${door}: the front wheels would catch on it.`],
      verify: [`There's a small lip at ${door}, worth a quick check.`] },
    hall: { pass: [`${Room} is wide enough to roll along easily.`], fail: [`${Room} is narrow, the chair would be squeezing through.`], verify: [`${Room} is on the narrow side, worth measuring.`] },
  }[c.kind]?.[s];
  let fact = c.measured && say ? pick(c, say) : `${c.title}.`;
  if (c.critical && s !== 'pass') fact = pick(c, ['This is the big one. ', 'This one matters most. ']) + fact;
  if (s === 'pass' || !row) return { text: fact, ask: false };
  const o = row.chosen, name = x => fixName(x, typeOf), costly = x => fixCost(x) && x.kind !== 'free';
  const priced = x => x.kind === 'contractor' ? (fixCost(x) ? `${name(x)}, about ${fixCost(x)}` : `${name(x)}; a contractor can price it`) : costly(x) ? `${name(x)} for ${fixCost(x)}` : name(x);
  if (o?.verdict === 'closes') return { text: `${fact} ${o.kind === 'free' || !costly(o) ? `Easy fix, and free: ${name(o)}.` : `It's in your plan: ${priced(o)} sorts it out.`}`, ask: false };
  if (o) return { text: `${fact} ${cap(priced(o))} in your plan helps, but won't solve it completely.`, ask: false };
  if (row.byYou) return { text: `${fact} You've left this one for later.`, ask: false };
  const close = row.options?.find(x => x.verdict === 'closes');
  if (!close) return { text: `${fact} There's no simple fix for this one.`, ask: false };
  if (close.kind === 'product' && close.price != null) return { text: `${fact} ${cap(name(close))} for ${usd(close.price)} would fix it. Shall I add it to your plan?`, ask: true };
  return { text: `${fact} ${close.kind === 'contractor' ? `The real fix is a bigger job: ${priced(close)}.` : `The fix: ${priced(close)}.`}`, ask: false };
}

// A line Claude rewrote for the guide may be used only if every number, size and price of the fact line is still in it, word for word.
const NUMS = /\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?(?:\s?[½¾¼])?\s?['"]?|[½¾¼]"?/g;
export const keepsNumbers = (base, line) => (String(base).match(NUMS) || []).every(n => String(line).includes(n.trim()));

const CSS = `
#voice { left:50%; top:44px; transform:translateX(-50%); z-index:7; display:flex; gap:10px; align-items:flex-start; padding:6px; border-radius:22px; max-width:min(620px, calc(100% - 120px)); transition:left var(--ease), top var(--ease); }
#voice.home { position:fixed; top:auto; bottom:10px; z-index:45; left:16px; right:16px; margin:0 auto; transform:none; width:fit-content; max-width:560px; }
#voice.home #v-body { grid-template-columns:minmax(0, 1fr); } #voice.home #v-hint { overflow:hidden; text-overflow:ellipsis; } /* phones: the hint ends in … instead of running off screen */
#hint:not([hidden]) ~ #voice { top:70px; }
body.card-open #voice:not(.home) { left:calc((100% - 352px) / 2); max-width:min(620px, calc(100% - 420px)); }
#v-mic { width:40px; height:40px; padding:0; flex:none; display:grid; place-items:center; background:var(--accent); color:var(--accentInk); position:relative; }
#v-mic svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
#voice[data-state=listening] #v-mic { background:var(--fail); color:#fff; }
#voice[data-state=listening] #v-mic::after { content:""; position:absolute; inset:-5px; border-radius:999px; border:2px solid var(--fail); animation:v-pulse 1.2s ease-out infinite; }
#voice[data-open=true] #v-mic { box-shadow:0 0 0 3px var(--fail); }
@keyframes v-pulse { from { opacity:.9; transform:scale(.85); } to { opacity:0; transform:scale(1.35); } }
@keyframes v-dots { 0%,80%,100% { opacity:.25; } 40% { opacity:1; } }
@media (prefers-reduced-motion: reduce) { #voice[data-state=listening] #v-mic::after { animation:none; opacity:.6; } #v-state i { animation:none !important; } }
#v-body { min-width:0; padding:4px 12px 4px 0; display:grid; gap:4px; align-content:center; min-height:40px; }
#v-state { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); display:flex; gap:6px; align-items:center; }
#voice[data-state=listening] #v-state { color:var(--failInk); }
#v-state i { width:4px; height:4px; border-radius:999px; background:currentColor; animation:v-dots 1.2s infinite; } #v-state i:nth-child(3) { animation-delay:.2s; } #v-state i:nth-child(4) { animation-delay:.4s; }
#v-heard { font-size:13px; color:var(--muted); overflow-wrap:anywhere; }
#voice[data-state=listening] #v-heard { font-size:18px; line-height:1.3; font-weight:500; color:var(--ink); }
#v-steps { display:flex; flex-wrap:wrap; gap:4px; }
#v-steps span { font-size:12px; font-weight:500; padding:2px 9px; border-radius:999px; background:var(--fill); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
#v-steps span.err { color:var(--failInk); }
#v-say { font-size:17px; line-height:1.35; font-weight:500; overflow-wrap:anywhere; }
#v-say.err { color:var(--failInk); font-size:14px; }
#v-hint { font-size:13px; color:var(--muted); white-space:nowrap; }
#v-hint kbd { font:600 11px var(--font); padding:1px 6px; border-radius:6px; background:var(--fill); color:var(--ink); }
#v-body > :empty, #voice[data-state=idle] #v-state, #voice:not([data-state=idle]) #v-hint, #voice[data-full=true] #v-hint { display:none; }
[data-theme=contrast] #voice { border:1px solid #fff; }
#v-intro { position:fixed; inset:0; z-index:60; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.35); }
#v-intro > div { max-width:420px; padding:28px; border-radius:8px; background:#fff; color:#1b1f1d; box-shadow:0 12px 40px rgba(0,0,0,.25); text-align:center; display:grid; gap:14px; justify-items:center; }
#v-intro b { font-size:22px; line-height:1.25; }
#v-intro p { margin:0; font-size:15px; line-height:1.45; color:#4a524e; }
#v-intro kbd { font:600 16px var(--font); padding:6px 22px; border-radius:6px; background:#eef0ee; color:#1b1f1d; box-shadow:inset 0 -2px 0 #c9cdca; }
#v-intro button { padding:10px 22px; background:#1F4D3F; color:#fff; font-weight:600; }
@media print { #voice, #v-intro { display:none; } }`;
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const LABEL = { listening: 'Listening', thinking: 'Working', speaking: 'Speaking' };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };

// api (from the page): ask(text, { on, note }) → { text, error, open }, run(tool, input, on) → result, places() → { rooms, issues },
// stop() aborts a running question, open(id) loads another apartment or page ('page:home', 'page:neighbourhood'), nav() → the page
// a tool has just asked for (or null), mode() → current view, home → true on the start page, help → what "help" answers,
// ready → a promise that settles when the page has loaded its data.
export default function initVoice(api) {
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  const bar = document.createElement('div'); bar.id = 'voice'; bar.className = 'float' + (api.home ? ' home' : '');
  bar.innerHTML = `<button id="v-mic" type="button" aria-pressed="false" title="Click to keep listening, or hold Space to talk" aria-label="Voice: click to keep listening, or hold Space to talk">${MIC}</button>
    <div id="v-body"><div id="v-state"></div><div id="v-heard"></div><div id="v-steps"></div><div id="v-say" role="status" aria-live="polite"></div>
    <div id="v-hint">Hold <kbd>Space</kbd> and ${api.home ? 'say “Hi”, or ask anything' : 'ask anything: “Is the bathroom door wide enough?”'}</div></div>`;
  (api.home ? document.body : document.querySelector('main')).appendChild(bar);
  const el = id => bar.querySelector('#' + id);

  // Intro, once per tab (?intro shows it again): talking to the assistant is the main way in. Not in muted tests/films or the flyover's embedded tour.
  const qs = new URLSearchParams(location.search);
  if (qs.has('intro') || (!store.get('ie-intro') && !window.__mute && !qs.has('mute') && window.top === window)) {
    store.set('ie-intro', '1');
    const touch = matchMedia('(pointer: coarse)').matches, box = document.createElement('div'); box.id = 'v-intro';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'v-intro-h');
    box.innerHTML = `<div>${touch ? '' : '<kbd>Space</kbd>'}<b id="v-intro-h">${touch ? 'Tap the mic' : 'Hold Space'} and say hi to Ethan</b>
      <p>He talks back, shows you round and stops when you press Space again. Or just ask: “Which apartment is best for my dad in Hollywood?”</p>
      <p><b style="font-size:inherit;color:#1b1f1d">Streets and neighbourhoods:</b> Northeast LA, Hollywood, Houston Heights.<br>
      <b style="font-size:inherit;color:#1b1f1d">Rooms:</b> any apartment tour.</p>
      <p>Prefer typing? That works too.</p>
      <button type="button">Got it</button></div>`;
    const close = () => { box.remove(); removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.code === 'Space' || e.key === 'Escape' || e.key === 'Enter') close(); }; // Space also starts listening (handler below)
    box.querySelector('button').onclick = close; box.onclick = e => { if (e.target === box) close(); };
    addEventListener('keydown', onKey, true); document.body.appendChild(box); box.querySelector('button').focus();
  }

  // ---- The bar: one state object, one render ----
  const ui = { state: 'idle', heard: '', steps: [], say: '', err: false };
  let idleTimer = null;
  function show(patch) {
    Object.assign(ui, patch); clearTimeout(idleTimer);
    bar.dataset.state = ui.state; bar.dataset.open = open; bar.dataset.full = !!(ui.heard || ui.say || ui.steps.length);
    el('v-mic').setAttribute('aria-pressed', open || ui.state === 'listening');
    el('v-state').innerHTML = ui.state === 'idle' ? '' : esc(LABEL[ui.state]) + (ui.state === 'thinking' ? '<i></i><i></i><i></i>' : '');
    el('v-heard').textContent = ui.heard ? (ui.state === 'listening' ? ui.heard : `“${ui.heard}”`) : '';
    el('v-steps').innerHTML = ui.steps.map(s => `<span${s.err ? ' class="err"' : ''}>${esc(s.text)}</span>`).join('');
    el('v-say').textContent = ui.say; el('v-say').className = ui.err ? 'err' : '';
    // After an answer the bar keeps it for a while, then goes back to the one-line hint.
    if (ui.state === 'idle' && (ui.heard || ui.say || ui.steps.length)) idleTimer = setTimeout(() => show({ heard: '', steps: [], say: '', err: false }), 12000);
  }
  const rest = () => show({ state: rec ? 'listening' : 'idle' });

  // ---- Speech out: one sentence at a time (long single utterances get cut off in Chrome) ----
  // Silent mode (?mute in the address, or window.__mute set by a test): captions only, nothing is played. 'fast' skips the reading time.
  const muted = window.__mute || new URLSearchParams(location.search).has('mute'), spoken = [];
  let talk = 0, last = ''; // last = the newest answer, for "say that again"
  // Ethan (Fish, through serve.py). fishOk is false only when the server has no voice at all (no key, offline test server): then captions.
  // Each next sentence loads while one plays.
  let fishOk = !muted, audio = null;
  const clip = t => Object.assign(new Audio('/api/speak?t=' + encodeURIComponent(t)), { preload: 'auto' });
  // No fixed filler lines while Claude thinks; this only checks Ethan's voice is there.
  if (fishOk) fetch('/api/speak?t=Hello.').then(r => { if (!r.ok) fishOk = false; }, () => { fishOk = false; });
  function hush() { talk++; audio?.pause(); audio = null; }
  // Plays the sentences in Ethan's voice; a sentence the server can't give is skipped (its words stay in the caption).
  async function playFish(parts, my) {
    let next = clip(parts[0]);
    for (let k = 0; k < parts.length; k++) {
      const a = next; next = k + 1 < parts.length ? clip(parts[k + 1]) : null;
      if (my !== talk) return parts.length;
      audio = a;
      const r = await new Promise(res => { a.onended = () => res('ok'); a.onerror = () => res('fail'); a.play().catch(e => res(e.name === 'NotAllowedError' ? 'blocked' : 'fail')); });
      if (my !== talk || r === 'blocked') return parts.length; // blocked (no click on the page yet): the caption stays
      if (r === 'fail') { window.__fishOff = a.error?.message || a.error?.code || 'play failed'; continue; }
    }
    return parts.length;
  }
  function speak(text, err = false) { // err: a spoken line that says something went wrong (shown red)
    hush(); const my = talk;
    if (held) { show({ say: text, err }); spoken.push(speakable(text)); last = text; return Promise.resolve(); } // the person is talking: caption only, never talk over them
    rec?.abort(); // the open mic must not hear our own voice; it reopens when we finish
    show({ state: 'speaking', say: text, err }); spoken.push(speakable(text)); last = text;
    return new Promise(res => {
      const done = () => { if (my !== talk) return res(); talk++; res(); if (open) listen(true); else rest(); };
      const poll = setInterval(() => { if (my !== talk) { clearInterval(poll); res(); } }, 150); // hushed from outside
      // Ethan's voice (Fish) only, on every page: no browser voice. Without Fish the answer is a caption for its reading time.
      if (!fishOk) return setTimeout(done, muted === 'fast' ? 30 : Math.max(2000, text.split(/\s+/).length * 330));
      const parts = speakable(text).split(/(?<=[.!?])\s+/).filter(Boolean);
      setTimeout(done, 6000 + text.split(/\s+/).length * 900); // a voice that never reports the end must not hang the request
      playFish(parts, my).then(() => my === talk && done());
    });
  }

  // ---- What was said, for Claude's next line; and a line for a command the page ran itself ----
  const talkLog = []; // last 6 { q: what they said, a: what Ethan said }
  const logTalk = (q, a) => { if (q && a) { talkLog.push({ q: String(q).slice(0, 500), a: String(a).slice(0, 600) }); talkLog.splice(0, talkLog.length - 6); } };
  // Claude's spoken line after the page did something itself (a quick command). Without Claude: the page's own words (fallback).
  async function custom(heard, did, fallback = '') {
    try {
      const r = await fetch('/api/say', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(9000), // then the page's own words
        body: JSON.stringify({ heard: String(heard).slice(0, 500), did: String(did).slice(0, 1500), page: `${document.title} (${location.pathname})`, history: talkLog }) });
      const j = await r.json().catch(() => ({})); if (r.ok && j.text) return j.text;
    } catch {}
    return fallback;
  }

  // ---- One request: a quick command runs here at once (then Claude says a line about it), the rest goes to Claude ----
  let turn = 0;
  async function handle(text, note, others = []) {
    if (!String(text).trim()) return; // an empty sentence is not a request
    const my = ++turn; api.hold?.(); hush(); api.stop(); // hold first: a walkthrough must not move on when its line is cut off
    show({ state: 'thinking', heard: text, steps: [], say: '', err: false });
    let said = null; // the answer being read aloud; it starts as soon as Claude has it, while the tour is still moving
    const on = (kind, v) => { if (my !== turn) return; if (kind === 'step') show({ steps: [...ui.steps, { text: v }] }); else if (kind === 'say') { said = speak(v); logTalk(text, v); } };
    await api.ready; if (my !== turn) return; // something said while the tour is still loading waits for it
    let q = null, hint = ''; // the recogniser's other guesses: a second chance at an instant command, else a hint for Claude
    if (!note) { ({ text, q } = pickHeard(text, others, api.places())); if (q && others.length) show({ heard: text }); else if (others.length) hint = `the speech recogniser was unsure; it also heard: ${others.map(o => `"${o}"`).join(' / ')}`; }
    if (q?.stop) { if (api.mode() === 'walk') api.run('walkthrough', { action: 'pause' }); return rest(); } // "stop" also holds a playing walkthrough
    if (q?.line) { logTalk(text, q.line); await speak(q.line); if (my === turn) api.resume?.(); return; }
    if (q?.repeat) { await speak(last || 'I haven’t said anything yet. Ask me about an apartment, or say hi.'); if (my === turn) api.resume?.(); return; } // a paused walkthrough goes on after
    if (q?.hello) { const line = api.hello?.() || 'Hi, I’m Ethan. Hold Space and tell me what you’re looking for.'; logTalk(text, line); await speak(line); if (my === turn) api.resume?.(true); return; } // true: inside a tour the walk starts after the greeting
    if (q?.help) { const help = api.help || 'Say a room, a view, or ask a question.', line = await custom(text, `they asked for help; what they can say on this page: ${help}`, help); if (my !== turn) return; logTalk(text, line); await speak(line); if (my === turn) api.resume?.(); return; }
    // Inside a tour, a place by name ("the kitchen", "number two") flies there at once and Ethan then says what it's like for them.
    if (q && q.tool === 'show_issue' && api.chatty) {
      const out = await Promise.race([api.run(q.tool, q.input, on), new Promise(r => setTimeout(r, 200))]); if (my !== turn) return; // Claude starts while the camera flies
      if (out?.error) { await speak(out.error, true); if (my === turn) api.resume?.(); return; }
      note = 'the tour is already flying there and has opened its card';
    } else if (q) {
      const facts = []; // what the page would have said itself: facts for Claude's line, not the line
      const out = await api.run(q.tool, q.input, (kind, v) => kind === 'say' ? facts.push(v) : on(kind, v)); if (my !== turn) return;
      if (out?.error) { const inside = api.home && /apartment first|inside an apartment|open an apartment/i.test(out.error); await speak(inside ? 'That works inside an apartment. Ask which one is worst, or say “open” and its name.' : out.error, !inside); if (my === turn) api.resume?.(); return; }
      const to = api.nav?.(); if (to) { store.set('ie-hello', '1'); return api.open(to); } // the next page says where they are now // "home", "the neighbourhood": the command asked for another page
      // the walk and "go inside" speak their own lines; a command that leaves the page has no one left to hear a line
      if (q.tool === 'open_page' && typeof out === 'string') { logTalk(text, out); await speak(out); return; } // still on this page ("back to the map"): he says where they are
      if (q.tool === 'walkthrough' && /^(pause|stop)$/.test(q.input.action)) { await speak(typeof out === 'string' && /nothing/i.test(out) ? out : q.input.action === 'pause' ? 'Okay, I’ll wait.' : 'Okay, the walk is over. Where would you like to go?'); return; }
      if (/^(walkthrough|enter|open_region|open_page)$/.test(q.tool)) { show({ state: rec ? 'listening' : 'idle', say: typeof out === 'string' ? out : '' }); return; }
      const did = [q.say && `went to ${q.say}`, `${q.tool} ${JSON.stringify(q.input)}`, typeof out === 'string' && out, ...facts].filter(Boolean).join('. ');
      const line = await custom(text, did, facts.join(' ') || q.say || (typeof out === 'string' ? out : '')); if (my !== turn) return;
      if (line) { logTalk(text, line); await speak(line); } else rest();
      if (my === turn) api.resume?.(); // "night mode" during a walkthrough: done, the walk goes on
      return;
    }
    const r = await api.ask(text, { on, note: [note, hint].filter(Boolean).join('; ') || undefined }); if (my !== turn) return;
    if (r.error) { await speak(r.error, true); if (my === turn) api.resume?.(true); return; } // Claude down: the walk is local, it goes on
    if (r.open && !note) store.set('ie-voice-next', text); // the new page finishes this request ("…and show me the bathroom")
    await said; if (my !== turn) return;
    if (r.open) return api.open(r.open);
    if (!said) rest();
    api.resume?.(true); // the answer has been said: a paused walkthrough goes on, or (inside an apartment) the walk starts
  }
  function stopAll() { turn++; if (api.mode?.() === 'walk') api.run('walkthrough', { action: 'pause' }); hush(); api.stop(); clearTimeout(tail); tail = null; again = stopping = false; if (open) setOpen(false); if (rec) { rec.onend = null; rec.abort(); rec = null; } show({ state: 'idle' }); } // half a sentence is dropped, not sent

  // ---- Speech in: hold Space to talk, or click the mic to keep it open (each finished sentence is a request) ----
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, open = false, held = false, tail = null, again = false, flush = () => {};
  const TAIL = 350; // ms the mic stays on after Space is let go: letting go on the last word cut it off
  function setOpen(v) { open = v; store.set('ie-voice', v ? 'open' : null); }
  function listen(on) {
    if (!on) return rec?.stop();
    if (!Rec) { setOpen(false); return void speak('Voice input needs Chrome. You can type your question instead.', true); } // closed first: an open mic would ask again after every line
    if (rec) return;
    hush(); let done = '', live = '', segs = []; // segs: every guess for each finished phrase
    const r = rec = new Rec(); r.lang = 'en-US'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 4;
    // Whole sentences with one phrase swapped for another guess (Chrome's guesses come per phrase).
    const others = () => { const base = segs.map(g => g[0]), now = (done + live).trim();
      return [...new Set(segs.flatMap((g, k) => g.slice(1).map(a => [...base.slice(0, k), a, ...base.slice(k + 1), live].join(' ').replace(/\s+/g, ' ').trim())))].filter(t => t && t !== now).slice(0, 4); };
    r.onresult = e => {
      live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i];
        if (res.isFinal) { done += res[0].transcript + ' '; segs.push(Array.from(res, a => a.transcript.trim())); } else live += res[0].transcript; }
      show({ state: 'listening', heard: (done + live).trim(), steps: [], say: '', err: false });
      if ((done + live).trim()) api.hold?.(); // open mic: the person started talking
      flush();
    };
    // Open mic: each finished sentence is a request. One finished while Space was held waits for the key to come up.
    flush = () => { if (rec === r && open && !held && done.trim() && !live) { const t = done.trim(), o = others(); done = ''; segs = []; handle(t, undefined, o); } };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setOpen(false);
      speak(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'The microphone is blocked. Allow it in the address bar, then try again.' : e.error === 'network' ? 'Voice input is not available in this browser. Open the page in Chrome, or type your question.' : `Voice input stopped (${e.error}).`, true);
    };
    r.onend = () => {
      if (rec === r) { rec = null; stopping = false; }
      const t = (done + live).trim();
      if (again) { again = false; if (t) handle(t, undefined, others()); return held ? listen(true) : undefined; } // Space pressed again before this one had closed: run it, keep listening
      if (t && (!open || held)) return handle(t, undefined, others()); // push-to-talk: the request is what was said while the key was down
      if (open && ui.state !== 'speaking') return listen(true); // Chrome closes an open mic after a silence
      if (ui.state === 'listening') { show({ state: 'idle', say: ui.err ? ui.say : 'I didn’t hear anything. Hold Space while you talk.' }); api.resume?.(); }
    };
    try { r.start(); } catch { rec = null; return; }
    show({ state: 'listening', heard: '', steps: [], say: '', err: false });
  }
  el('v-mic').onclick = () => { if (open || rec) return stopAll(); setOpen(true); listen(true); };
  const typing = e => e.target.closest?.('input,textarea,select,[contenteditable]');
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.state !== 'idle') return stopAll();
    if (e.code !== 'Space' || typing(e) || api.mode() === 'drone') return; // in Drone, Space flies up: use the mic button there
    e.preventDefault(); if (e.repeat) return;
    held = true; turn++; hush(); api.hold?.(); api.stop(); // Space cuts Ethan off mid-sentence, whatever the mic was doing
    if (tail) { clearTimeout(tail); tail = null; return; } // pressed again inside the tail: the same recording goes on
    if (rec && stopping) { again = true; return; } // the last recording is still closing: start a new one the moment it has
    listen(true);
  }, true);
  let stopping = false;
  addEventListener('keyup', e => { // also keeps Space from pressing a focused button
    if (e.code !== 'Space' || !held) return; e.preventDefault(); held = false;
    if (open) return flush();
    tail = setTimeout(() => { tail = null; stopping = true; listen(false); }, TAIL);
  }, true);

  show({});
  if (store.get('ie-voice') === 'open') { open = true; listen(true); } // the mic stays open from one apartment to the next
  // They came here by saying a neighbourhood's name: Ethan says what is here as the page opens (true = he has already said hello).
  if (store.get('ie-hello')) { store.set('ie-hello', null); Promise.resolve(api.ready).then(() => { if (ui.state !== 'idle' && !(open && ui.state === 'listening' && !ui.heard)) return; const line = api.hello?.(true); if (line) { api.stop(); logTalk('(they opened this page by voice)', line); speak(line); } }); }
  const next = store.get('ie-voice-next'); store.set('ie-voice-next', null);
  if (next) handle(next, 'the page has just opened this apartment for this request');
  window.__voice = { hear: handle, ui, spoken }; // test hook: feed a sentence as if it had been spoken; spoken = every text given to the speech voice
  return { toggle: () => el('v-mic').click(), speak, hush, hear: handle, stop: stopAll, custom }; // custom: Claude's line for something a page did by itself // speak/hush: a page that narrates by itself uses the same voice, so the open mic never hears it
}
