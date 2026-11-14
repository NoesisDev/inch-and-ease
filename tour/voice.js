// Voice for the tour: hold Space (or click the mic to keep it open) and say anything.
// Short commands ("next", "floor plan", "the kitchen", "number two") run at once in the page; everything else goes to
// Claude, which drives the same tools. The bar shows what was heard, each thing the tour does, and the answer, which is
// also read aloud. Speech in: the browser's speech recognition (Chrome). Speech out: the browser's own voice.

// ---- quick(): which sentences need no Claude round trip. Pure; tested in voice.test.mjs ----
// Only a whole sentence that is nothing but the command matches; anything longer is a question for Claude.
const FILLER = /\b(the|a|an|please|now|hey|ok|okay|just|me|my|can you|could you|would you|lets|let s|i want|to|at|show|go|switch|open|take|give|see|turn on|put on|start|view|mode|look)\b/g;
const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
const squash = t => norm(t).replace(/ /g, '');
const NUM = { one: 1, two: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PHRASES = new Map([
  ['stop|quiet|be quiet|cancel|never mind|nevermind|enough|shut up', { stop: true }],
  ['next|next one|next stop|next problem|next issue|continue|keep going', ['walkthrough', { action: 'next' }]],
  ['back|previous|previous one|previous stop|previous problem|last one', ['walkthrough', { action: 'previous' }]],
  ['pause|wait|hold on', ['walkthrough', { action: 'pause' }]],
  ['play|resume', ['walkthrough', { action: 'play' }]],
  ['end walkthrough|end tour|stop walkthrough|stop tour', ['walkthrough', { action: 'stop' }]],
  ['overview|whole apartment|whole place|dollhouse|doll house|zoom out|3d', ['set_view', { mode: 'dollhouse' }]],
  ['floor plan|floorplan|top|from above|map', ['set_view', { mode: 'floorplan' }]],
  ['inside|walk inside|walk around', ['set_view', { mode: 'inside' }]],
  ['drone|fly|fly around|drone flight', ['set_view', { mode: 'drone' }]],
  ['walkthrough|walk through|walk through it|walk through apartment|tour|guided tour', ['set_view', { mode: 'walkthrough' }]],
  ['night|dark|night time', ['set_look', { look: 'night' }]],
  ['daylight|day|light|daytime', ['set_look', { look: 'daylight' }]],
  ['high contrast|contrast', ['set_look', { look: 'contrast' }]],
  ['hide panel|hide sidebar|close panel|close sidebar|hide list|full screen', ['show_panel', { tab: 'hidden' }]],
  ['panel|sidebar|issues|problems|list|issue list|all issues|all problems', ['show_panel', { tab: 'issues' }]],
  ['plan|fix plan|budget|costs|shopping list', ['show_panel', { tab: 'plan' }]],
  ['close|close it|close card|close that|hide card', ['close', {}]],
].flatMap(([keys, act]) => keys.split('|').map(k => [k, act])));

// rooms: [{ id, name, say }], issues: [{ id, say }] in pin order (pin 1 first). Returns { stop } | { tool, input, say? } | null.
export function quick(text, { rooms = [], issues = [] } = {}) {
  const t = norm(text); if (!t) return null;
  const hit = PHRASES.get(t);
  if (hit) return hit.stop ? { stop: true } : { tool: hit[0], input: hit[1] };
  const n = t.match(/^(?:number|issue|problem|pin) (\d+|[a-z]+)$/), k = n && (+n[1] || NUM[n[1]]);
  if (k && issues[k - 1]) return { tool: 'show_issue', input: { id: issues[k - 1].id }, say: issues[k - 1].say };
  const room = rooms.filter(r => squash(r.name) === t.replace(/ /g, '')); // "bath room" = "Bathroom"; two bedrooms = ask Claude which
  if (room.length === 1) return { tool: 'show_issue', input: { id: room[0].id }, say: room[0].say };
  return null;
}

// What the speech voice should read: feet and inches spelled out, no symbols.
export const speakable = t => String(t).replace(/(\d)½/g, '$1 and a half').replace(/½"/g, 'half an inch').replace(/½/g, 'a half')
  .replace(/(\d+)' ?(\d+(?: and a half)?)"/g, '$1 foot $2').replace(/(\d+(?: and a half)?)"/g, '$1 inches').replace(/(\d+)'/g, '$1 feet')
  .replace(/[↔/]/g, ' ').replace(/\$(\d+)\.00\b/g, '$$$1');

const CSS = `
#voice { left:50%; top:44px; transform:translateX(-50%); z-index:7; display:flex; gap:10px; align-items:flex-start; padding:6px; border-radius:22px; max-width:min(620px, calc(100% - 120px)); transition:left var(--ease), top var(--ease); }
#voice.home { position:fixed; top:auto; bottom:20px; z-index:45; }
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
@media print { #voice { display:none; } }`;
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const LABEL = { listening: 'Listening', thinking: 'Working', speaking: 'Speaking' };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };

// api (from the page): ask(text, { on, note }) → { text, error, open }, run(tool, input, on) → result, places() → { rooms, issues },
// stop() aborts a running question, open(id) loads another apartment, mode() → current view, home → true on the start page,
// ready → a promise that settles when the page has loaded its data.
export default function initVoice(api) {
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  const bar = document.createElement('div'); bar.id = 'voice'; bar.className = 'float' + (api.home ? ' home' : '');
  bar.innerHTML = `<button id="v-mic" type="button" aria-pressed="false" title="Click to keep listening, or hold Space to talk" aria-label="Voice: click to keep listening, or hold Space to talk">${MIC}</button>
    <div id="v-body"><div id="v-state"></div><div id="v-heard"></div><div id="v-steps"></div><div id="v-say" role="status" aria-live="polite"></div>
    <div id="v-hint">Hold <kbd>Space</kbd> and ask anything: “${api.home ? 'Which apartment is worst?' : 'Can he get into the bathroom?'}”</div></div>`;
  (api.home ? document.body : document.querySelector('main')).appendChild(bar);
  const el = id => bar.querySelector('#' + id);

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
  let voice = null, talk = 0;
  const canSpeak = 'speechSynthesis' in window;
  const pickVoice = () => { const vs = speechSynthesis.getVoices(); voice = ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria'].map(n => vs.find(v => v.name.startsWith(n))).find(Boolean) || vs.find(v => /^en[-_]US/.test(v.lang)) || null; };
  if (canSpeak) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }
  function hush() { talk++; if (canSpeak) speechSynthesis.cancel(); }
  function speak(text) {
    hush(); const my = talk;
    rec?.abort(); // the open mic must not hear our own voice; it reopens when we finish
    show({ state: 'speaking', say: text, err: false });
    return new Promise(res => {
      const done = () => { if (my !== talk) return res(); talk++; res(); if (open) listen(true); else rest(); };
      if (!canSpeak) return setTimeout(done, Math.max(2000, text.split(/\s+/).length * 330));
      const parts = speakable(text).split(/(?<=[.!?])\s+/).filter(Boolean);
      parts.forEach((p, k) => {
        const u = new SpeechSynthesisUtterance(p); if (voice) u.voice = voice; u.rate = 1.04;
        if (k === parts.length - 1) u.onend = u.onerror = done; // blocked speech (no click yet) ends at once: the caption stays
        speechSynthesis.speak(u);
      });
      const poll = setInterval(() => { if (my !== talk) { clearInterval(poll); res(); } }, 150); // hushed from outside
      setTimeout(done, 4000 + text.split(/\s+/).length * 700); // a browser that never reports the end must not hang the request
    });
  }

  // ---- One request: a quick command runs here, the rest goes to Claude ----
  let turn = 0;
  async function handle(text, note) {
    const my = ++turn; hush(); api.stop();
    show({ state: 'thinking', heard: text, steps: [], say: '', err: false });
    let said = null; // the answer being read aloud; it starts as soon as Claude has it, while the tour is still moving
    const on = (kind, v) => { if (my !== turn) return; if (kind === 'step') show({ steps: [...ui.steps, { text: v }] }); else if (kind === 'say') said = speak(v); };
    await api.ready; if (my !== turn) return; // something said while the tour is still loading waits for it
    const q = note ? null : quick(text, api.places());
    if (q?.stop) return rest();
    if (q) {
      if (q.say) speak(q.say); // the name of the place, said while the camera flies there
      const out = await api.run(q.tool, q.input, on); if (my !== turn) return;
      if (out?.error) { hush(); return show({ state: rec ? 'listening' : 'idle', say: out.error, err: true }); }
      if (!q.say) show({ state: rec ? 'listening' : 'idle', say: q.tool === 'walkthrough' ? out : '' }); // "Showing problem 3 of 6: …" as a caption
      return;
    }
    const r = await api.ask(text, { on, note }); if (my !== turn) return;
    if (r.error) return show({ state: rec ? 'listening' : 'idle', say: r.error, err: true });
    if (r.open && !note) store.set('ie-voice-next', text); // the new page finishes this request ("…and show me the bathroom")
    await said; if (my !== turn) return;
    if (r.open) return api.open(r.open);
    if (!said) rest();
  }
  function stopAll() { turn++; hush(); api.stop(); if (open) setOpen(false); if (rec) { rec.onend = null; rec.abort(); rec = null; } show({ state: 'idle' }); } // half a sentence is dropped, not sent

  // ---- Speech in: hold Space to talk, or click the mic to keep it open (each finished sentence is a request) ----
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, open = false, held = false;
  function setOpen(v) { open = v; store.set('ie-voice', v ? 'open' : null); }
  function listen(on) {
    if (!on) return rec?.stop();
    if (!Rec) return show({ state: 'idle', say: 'Voice input needs Chrome. You can type in "Ask Claude".', err: true });
    if (rec) return;
    hush(); let done = '', live = '';
    const r = rec = new Rec(); r.lang = 'en-US'; r.interimResults = true; r.continuous = true;
    r.onresult = e => {
      live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (done += e.results[i][0].transcript + ' ') : (live += e.results[i][0].transcript));
      show({ state: 'listening', heard: (done + live).trim(), steps: [], say: '', err: false });
      if (open && !held && done.trim() && !live) { const t = done.trim(); done = ''; handle(t); }
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setOpen(false);
      show({ state: 'idle', err: true, say: e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'The microphone is blocked. Allow it in the address bar, then try again.' : e.error === 'network' ? 'Voice input is not available in this browser. Open the page in Chrome, or type in "Ask Claude".' : `Voice input stopped (${e.error}).` });
    };
    r.onend = () => {
      if (rec === r) rec = null;
      const t = (done + live).trim();
      if (t && (!open || held)) return handle(t); // push-to-talk: the request is what was said while the key was down
      if (open && ui.state !== 'speaking') return listen(true); // Chrome closes an open mic after a silence
      if (ui.state === 'listening') show({ state: 'idle', say: ui.err ? ui.say : 'I didn’t hear anything. Hold Space while you talk.' });
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
    held = true; turn++; api.stop(); listen(true);
  }, true);
  addEventListener('keyup', e => { if (e.code !== 'Space' || !held) return; e.preventDefault(); held = false; if (!open) listen(false); }, true); // also keeps Space from pressing a focused button

  show({});
  if (store.get('ie-voice') === 'open') { open = true; listen(true); } // the mic stays open from one apartment to the next
  const next = store.get('ie-voice-next'); store.set('ie-voice-next', null);
  if (next) handle(next, 'the page has just opened this apartment for this request');
  window.__voice = { hear: handle, ui }; // test hook: feed a sentence as if it had been spoken
  return { toggle: () => el('v-mic').click() };
}
