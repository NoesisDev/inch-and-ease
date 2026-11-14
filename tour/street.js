// The street check in the tour app: a plain-JS port of the old Next.js site's area view (AreaView, SlopeMap, Terrain3D; removed
// Nov 14, see git history). Same numbers and texts; the look is the tour's Tape measure sidebar, and the voice is the tour's bar (voice.js), so every
// control can be said: a profile, Map or 3D, an example place, an issue by number, or a free description that goes to /api/ask.
// Data: /api/area (src/lib/area.ts analyze()), /api/buildings, /api/image, /api/ask, all from serve.py.
import { PROFILES, verdict, findIssues, askStreets, askFacts, spokenLimit } from './street_issues.js';
import initVoice from './voice.js';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Apple system colours, the vivid set, so lines stay readable on an aerial photo.
const COLOR = { both: '#0A84FF', one: '#FF9F0A', no: '#FF453A' };
const LEVEL = {
  barrier: { label: 'Barrier', color: '#FF3B30', path: 'M8 8l8 8M16 8l-8 8' },
  warning: { label: 'Warning', color: '#FF9500', path: 'M12 7v6M12 16.5v.5' },
  unknown: { label: 'Not known', color: '#8E8E93', path: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5v.5' },
};
// Two streets already in the cache, so the examples open fast. Northeast LA is the neighbourhood in the live demo.
const EXAMPLES = [
  { label: 'Northeast Los Angeles', q: '34.09511,-118.21221', keys: 'los angeles|la|l a|northeast los angeles|north east los angeles|northeast la|ne los angeles|example in los angeles|check los angeles|la example' },
  { label: 'Downtown Houston', q: '29.75334,-95.37605', keys: 'houston|downtown houston|houston downtown|example in houston|check houston|houston example' },
];
const R = 6378137; // Web Mercator, like the photo and the rasters (src/lib/area.ts merc)
const merc = ([lat, lon]) => [R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)), (R * lon * Math.PI) / 180];

// ---- State: one object, render() draws whatever depends on the profile ----
const st = { q: '', area: null, segs: [], pois: [], home: [0, 0], facts: null, view: '3d', lift: 1, buildings: true,
  profile: 'manual', up: 8, down: 10, avoidSteps: true, sel: null, label: '', answer: '', answerErr: false, at: -1 };
let three = null, threeKey = '', loaded = Promise.resolve(), asking = null, run = 0;
const limits = () => ({ up: st.up, down: st.down, avoidSteps: st.avoidSteps });
const issues = () => st.area ? findIssues({ ...st.facts, segs: st.segs }, limits()) : [];
const streetName = s => s.name ?? `Unnamed ${s.kind ?? 'path'}`;

// ---- Loading a place: ?q=lat,lon, with the public site's checks and messages ----
async function load(q, push) {
  const my = ++run;
  st.q = q = String(q ?? '').trim(); $('q').value = q;
  if (push) history.pushState(null, '', q ? '?q=' + encodeURIComponent(q).replace(/%2C/gi, ',') : location.pathname);
  const [lat, lon] = q.split(',').map(s => Number(s.trim()));
  const ok = q !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  unmount3D(); st.area = null; st.sel = null; st.at = -1; st.answer = '';
  $('area').hidden = true; $('start').hidden = ok;
  message(q !== '' && !ok ? `“${q}” is not a location. Type the latitude, then a comma, then the longitude, for example 34.0522, -118.2437.` : '');
  if (!ok) return;
  message('Measuring the streets around this building', true);
  const p = (async () => {
    const r = await fetch(`/api/area?lat=${lat}&lon=${lon}`);
    const t = await r.text();
    if (!r.ok) { let e = ''; try { e = JSON.parse(t).error; } catch {} throw new Error(e || t || `the server answered ${r.status}`); }
    return JSON.parse(t);
  })();
  loaded = p.catch(() => {});
  try { const a = await p; if (my === run) show(a); }
  catch (e) { if (my === run) message(`Could not check this area: ${e.message}`); }
}
function message(text, wait) { const m = $('msg'); m.hidden = !text; m.textContent = text; m.className = 'card alert' + (wait ? ' wait' : ''); m.setAttribute('role', wait ? 'status' : 'alert'); }

// The area as map units 0..1000 across the box (x east, y south), like AreaView in page.tsx.
function show(a) {
  const [y1, x0] = merc([a.b.n, a.b.w]), [y0, x1] = merc([a.b.s, a.b.e]);
  const xy = p => { const [y, x] = merc(p); return [((x - x0) / (x1 - x0)) * 1000, ((y1 - y) / (y1 - y0)) * 1000]; };
  st.area = a; st.home = xy([a.lat, a.lon]);
  st.segs = a.segs.map(g => { const [x1, y1] = xy(g.a), [x2, y2] = xy(g.b); return { x1, y1, x2, y2, za: g.za, zb: g.zb, slope: g.slope, len: g.len, near: g.near, name: g.name, kind: g.kind, steps: g.steps }; });
  st.pois = a.pois.filter(p => p.at[0] > a.b.s && p.at[0] < a.b.n && p.at[1] > a.b.w && p.at[1] < a.b.e).map(p => { const [x, y] = xy(p.at); return { x, y, kind: p.kind, name: p.name, kerb: p.kerb }; });
  const s = a.summary;
  st.facts = { stepFree: s.stepFree, station: s.station, busStops400: s.busStops400, kerbs: s.kerbs, loweredKerbs: s.loweredKerbs };
  const img = (view, half) => `/api/image?lat=${a.lat}&lon=${a.lon}&half=${half}&view=${view}`;
  $('ortho').src = img('ortho', a.half);
  const stat = (label, value, note, bad) => `<div class="card stat"><p>${esc(label)}</p><div class="v${bad ? ' bad' : ''}">${esc(value)}</div>${note ? `<p>${esc(note)}</p>` : ''}</div>`;
  const m = PROFILES[0];
  $('stats').innerHTML = [
    stat('Steepest stretch within 100 m', s.steepestNear ? (s.steepestNear.steps ? 'Steps' : `${s.steepestNear.slope.toFixed(1)}%`) : 'No streets',
      s.steepestNear ? [s.steepestNear.name, `Red when a manual wheelchair can't use it both ways (${m.up}% up, ${m.down}% down)`].filter(Boolean).join('. ') : '',
      !!s.steepestNear && verdict(s.steepestNear, m) !== 'both'),
    stat('Nearest step-free station', s.stepFree ? `${s.stepFree.dist} m` : s.station ? 'Not known' : 'None within 2 km',
      s.stepFree ? `${s.stepFree.name ?? 'Station'}, straight-line distance` : s.station ? `${s.station.name ?? 'The nearest station'} (${s.station.dist} m) has no wheelchair information` : ''),
    stat('Bus stops within 400 m', String(s.busStops400)),
    stat('Curb ramps within 150 m', s.kerbs ? `${s.loweredKerbs} of ${s.kerbs} lowered` : 'Not mapped', s.kerbs ? '' : 'Unmapped does not mean missing. Check on site.'),
    stat('Mapped elevators within 1 km', String(s.elevators.length), s.elevators[0] ? `Nearest is ${s.elevators[0].dist} m away` : ''),
  ].join('');
  $('sidesGrid').innerHTML = ['north', 'east', 'south', 'west'].map(d => `<figure><img src="${img(`oblique-${d}`, 40)}" alt="Vexcel oblique photo looking ${d}" loading="lazy"><figcaption>Looking ${d}</figcaption></figure>`).join('');
  message(''); $('start').hidden = true; $('area').hidden = false;
  render();
  if (st.view === '3d') mount3DView();
}

// ---- Everything that changes with the profile, the limits or the selection ----
function render() {
  if (!st.area) return;
  const { up, down, avoidSteps } = st, segs = st.segs;
  for (const b of $('profiles').children) b.setAttribute('aria-pressed', (b.dataset.p ?? 'custom') === st.profile);
  $('custom').textContent = st.profile === 'custom' && st.label ? st.label : 'Custom';
  $('up').value = up; $('down').value = down; $('steps').checked = avoidSteps; $('upV').textContent = up + '%'; $('downV').textContent = down + '%';
  $('answer').textContent = st.answer; $('answer').className = st.answerErr ? 'err' : '';
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === st.view);
  for (const el of document.querySelectorAll('[data-3d]')) el.hidden = st.view !== '3d';
  $('wrap3d').hidden = st.view !== '3d'; $('mapbox').hidden = st.view !== 'map';
  $('bld').checked = st.buildings; $('lift').value = st.lift; $('liftV').textContent = `Ground height ${st.lift === 1 ? 'true scale' : `×${st.lift}`}`;

  const vs = segs.map(s => verdict(s, limits()));
  const len = { both: 0, one: 0, no: 0 };
  vs.forEach((v, i) => (len[v] += segs[i].len));
  const total = len.both + len.one + len.no || 1;
  const pct = v => `${Math.round((len[v] / total) * 100)}%`;
  const oneWayLabel = up < down ? 'downhill only' : up > down ? 'uphill only' : 'one way only';

  // The map: a dark casing, the colour, and a wide invisible line to click.
  const ln = (s, extra) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" vector-effect="non-scaling-stroke" stroke-linecap="round" ${extra}/>`;
  const picked = st.sel === null ? null : segs[st.sel];
  $('svg').setAttribute('aria-label', `Streets coloured for this profile: ${pct('both')} usable both ways, ${pct('one')} ${oneWayLabel}, ${pct('no')} too steep`);
  $('svg').innerHTML = segs.map((s, i) => `<g>${ln(s, 'stroke="rgba(0,0,0,0.55)" stroke-width="7"')}${ln(s, `stroke="${COLOR[vs[i]]}" stroke-width="4"${s.steps ? ' stroke-dasharray="2 3"' : ''}`)}${ln(s, `stroke="transparent" stroke-width="16" class="hit" data-i="${i}"`).replace('/>', `><title>${esc(`${streetName(s)}, ${s.steps ? 'steps' : `${s.slope.toFixed(1)}%`}`)}</title></line>`)}</g>`).join('')
    + (picked ? `<g pointer-events="none">${ln(picked, 'stroke="#ffffff" stroke-width="12"')}${ln(picked, `stroke="${COLOR[vs[st.sel]]}" stroke-width="6"`)}</g>` : '')
    + st.pois.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.kind === 'kerb' ? 5 : 9}" stroke-width="2" stroke="rgba(0,0,0,0.6)" vector-effect="non-scaling-stroke" fill="${p.kind === 'kerb' ? (p.kerb === 'lowered' || p.kerb === 'flush' ? '#ffffff' : '#FF9F0A') : p.kind === 'bus' ? '#FFD60A' : '#BF5AF2'}"><title>${esc(`${p.kind === 'bus' ? 'Bus stop' : p.kind === 'kerb' ? `Kerb, ${p.kerb}` : p.kind}${p.name ? `, ${p.name}` : ''}`)}</title></circle>`).join('')
    + `<circle cx="${st.home[0]}" cy="${st.home[1]}" r="14" fill="none" stroke="#ffffff" stroke-width="4" vector-effect="non-scaling-stroke"/><circle cx="${st.home[0]}" cy="${st.home[1]}" r="5" fill="#ffffff"/>`;
  three?.setColors(vs.map(v => COLOR[v])); three?.select(st.sel);

  // The selected street.
  $('picked').hidden = !picked;
  if (picked) {
    const v = vs[st.sel];
    const meaning = v === 'both' ? `Usable in both directions within your limits of ${up}% up and ${down}% down.`
      : v === 'one' ? (up < down ? 'Fine going down, too steep going up.' : 'Fine going up, too steep going down.')
      : picked.steps ? 'Steps, not passable with these settings.' : `Too steep in both directions, over ${Math.max(up, down)}%.`;
    $('picked').innerHTML = `<div class="what"><b><i class="dot" style="background:${COLOR[v]}" aria-hidden="true"></i>${esc(streetName(picked))}</b><p>${meaning}</p></div>
      <dl>${[['Slope', picked.steps ? 'Steps' : `${picked.slope.toFixed(1)}%`], ['Rise', `${Math.abs(picked.zb - picked.za).toFixed(1)} m`], ['Length', `${Math.round(picked.len)} m`], ['From building', `${Math.round(picked.near)} m`]].map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join('')}</dl>
      <button type="button" class="show" id="unpick">Close</button>`;
  }

  $('bar').innerHTML = ['both', 'one', 'no'].map(v => `<div style="width:${pct(v)};background:${COLOR[v]}"></div>`).join('');
  $('legend').innerHTML = [[COLOR.both, `<b>${pct('both')}</b> usable both ways`], [COLOR.one, `<b>${pct('one')}</b> ${oneWayLabel}`], [COLOR.no, `<b>${pct('no')}</b> too steep${avoidSteps ? ' or steps' : ''}`],
    ['#FFD60A', 'Bus stop'], ['#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)', 'Lowered curb']].map(([c, t]) => `<li><i class="dot" style="background:${c}"></i>${t}</li>`).join('');

  const list = issues();
  $('issuesH').textContent = list.length ? `${list.length} issue${list.length > 1 ? 's' : ''} around this building` : 'No issues found around this building';
  $('issues').innerHTML = list.map((x, k) => `<li${k === st.at ? ' class="on"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${LEVEL[x.level].color}"/><path d="${LEVEL[x.level].path}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>
    <span><span class="sr">${LEVEL[x.level].label}: </span><b>${esc(x.title)}</b><small>${esc(x.detail)}</small></span>${x.seg ? `<button type="button" class="show" data-k="${k}">Show</button>` : ''}</li>`).join('');
}

// ---- Actions: the buttons and the voice call the same ones ----
function pick(id) { const p = PROFILES.find(x => x.id === id); Object.assign(st, { profile: p.id, up: p.up, down: p.down, avoidSteps: p.avoidSteps, at: -1 }); render(); } // at: the issue list changes with the limits
function custom(patch) { Object.assign(st, { profile: 'custom', label: '', at: -1 }, patch); render(); }
function select(i, fly) { st.sel = i; render(); if (fly && i !== null) three?.fly(i); }
const showSeg = seg => select(st.segs.indexOf(seg), true); // "Show": highlight it, and in 3D fly there
function setView(v) { if (st.view === v) return; st.view = v; render(); v === '3d' ? mount3DView() : unmount3D(); }
function set3D(patch) { Object.assign(st, patch); render(); if (st.view === '3d') mount3DView(); }

// ---- 3D: three.js loads only when someone opens it; rebuilt when the place, buildings or ground height change ----
function unmount3D() { three?.dispose(); three = null; threeKey = ''; $('s3d').textContent = ''; }
async function mount3DView() {
  const a = st.area; if (!a) return;
  const key = `${a.lat},${a.lon}|${st.buildings}|${st.lift}`; if (key === threeKey) return;
  unmount3D(); threeKey = key; $('s3d').textContent = 'Loading 3D view';
  let mod;
  try { mod = await import('./street_3d.js'); } catch (e) { if (threeKey === key) $('s3d').textContent = `The 3D view could not load (${e.message}). The map still works.`; return; }
  if (threeKey !== key || st.view !== '3d') return;
  $('s3d').textContent = '';
  const vs = st.segs.map(s => COLOR[verdict(s, limits())]);
  three = mod.mount3D($('box3d'), { lat: a.lat, lon: a.lon, half: a.half, grid: a.grid, size: a.half * 2, segs: st.segs, colors: vs, home: st.home, exaggeration: st.lift,
    buildings: st.buildings, pois: st.pois, onSelect: i => select(i), onStatus: t => { if (threeKey === key) $('s3d').textContent = t; } });
  three.select(st.sel);
}

// ---- Free words → Claude (/api/ask): it sets the limits, says why, and points at one street ----
async function askClaude(message, on) {
  asking?.abort(); const ctl = asking = new AbortController();
  on('step', 'Working out your limits');
  let r, d = {};
  try {
    r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ message, limits: limits(), streets: askStreets(st.segs), facts: askFacts(st.facts) }) });
    d = await r.json().catch(() => ({}));
  } catch (e) { if (e.name === 'AbortError') return { text: '', error: '', open: null }; r = null; }
  if (ctl !== asking) return { text: '', error: '', open: null };
  if (!r?.ok) {
    const error = !r ? 'The server could not be reached. The profiles and voice commands still work.'
      : r.status === 503 ? 'Claude is switched off on this server, so it cannot answer free questions. Say a profile instead, like power chair, or uphill 10.'
      : d.error ?? 'Claude could not answer just now. Try again.';
    Object.assign(st, { answer: error, answerErr: true }); render();
    return { text: '', error, open: null };
  }
  Object.assign(st, { profile: 'custom', label: d.label, up: d.up, down: d.down, avoidSteps: d.avoidSteps, answer: d.reply, answerErr: false });
  on('step', `Limits: ${d.up}% up, ${d.down}% down, steps ${d.avoidSteps ? 'avoided' : 'fine'}`);
  const target = d.focus && st.segs.filter(s => s.name === d.focus).sort((x, y) => x.near - y.near)[0];
  if (target) { on('step', `Showing: ${d.focus}`); showSeg(target); } else render();
  on('say', d.reply);
  return { text: d.reply, error: '', open: null };
}

// ---- Voice: the page's own words (tried first), then voice.js's shared ones, then Claude ----
const share = p => { let both = 0, all = 0; for (const s of st.segs) { all += s.len; if (verdict(s, p) === 'both') both += s.len; } return all ? Math.round((both / all) * 100) : 0; };
const sayProfile = p => { const n = findIssues({ ...st.facts, segs: st.segs }, p).length;
  return `${p.label}: ${p.up}% up, ${p.down}% down. ${share(p)}% of the streets here work both ways, and there ${n === 1 ? 'is 1 issue' : `are ${n} issues`}.`; };
const sayIssue = (x, k, n) => `Issue ${k + 1} of ${n}. ${x.title}. ${x.detail}`;
const PROFILE_KEYS = {
  manual: 'manual wheelchair|manual chair|manual|manual wheel chair|wheelchair|wheel chair|manual profile|i use a manual wheelchair|i push a manual chair',
  power: 'power wheelchair|power chair|power|power wheel chair|powerchair|electric wheelchair|electric chair|motorised wheelchair|motorized wheelchair|power profile|i use a power chair',
  cane: 'cane|cain|kane|walking cane|walking stick|stick|cane profile|i use a cane|i walk with a cane',
};
function commands() {
  const out = EXAMPLES.map(x => ({ keys: x.keys, tool: 'place', input: { q: x.q }, say: `Checking the streets in ${x.label}.` }));
  out.push({ keys: 'map|aerial|aerial photo|photo|2d|2 d|flat map|map view|top down|the map', tool: 'view', input: { view: 'map' } },
    { keys: '3d|3 d|three d|three dimensional|terrain|3d view|3d terrain|in 3d|3d map', tool: 'view', input: { view: '3d' } },
    { keys: 'buildings|buildings and trees|trees|buildings on|with buildings', tool: 'buildings', input: { on: true } },
    { keys: 'no buildings|hide buildings|buildings off|bare ground|ground only|without buildings|hide trees', tool: 'buildings', input: { on: false } },
    { keys: 'exaggerate|exaggerate hills|exaggerate height|exaggerate ground|higher hills|taller hills|steeper hills|ground higher|more height', tool: 'lift', input: { by: 1 } },
    { keys: 'true scale|real scale|real height|normal height|true height', tool: 'lift', input: { to: 1 } },
    { keys: 'avoid steps|no steps|steps are a barrier|i cannot do steps|i can t do steps|steps on', tool: 'steps', input: { avoid: true } },
    { keys: 'allow steps|steps ok|steps okay|steps are ok|steps are fine|i can do steps|steps off', tool: 'steps', input: { avoid: false } });
  if (!st.area) return out;
  for (const p of PROFILES) out.push({ keys: PROFILE_KEYS[p.id], tool: 'profile', input: { id: p.id }, say: sayProfile(p) });
  const list = issues(), n = list.length;
  if (n) {
    const nx = (st.at + 1) % n, pv = (st.at - 1 + n) % n;
    out.push({ keys: 'next|next one|next issue|next problem|next street|continue', tool: 'show_issue', input: { id: nx }, say: sayIssue(list[nx], nx, n) },
      { keys: 'previous|previous one|previous issue|previous problem|back|one before', tool: 'show_issue', input: { id: pv }, say: sayIssue(list[pv], pv, n) });
  }
  return out;
}
function places() {
  const list = issues();
  // A street by its name ("Figueroa Street") selects its steepest piece close to the building.
  const names = askStreets(st.segs).map(s => ({ id: 'street:' + s.name, name: s.name, say: `${s.name}: ${s.slope.toFixed(1)}%, ${Math.round(s.near)} m from the building.` }));
  return { rooms: names, issues: list.map((x, k) => ({ id: k, say: sayIssue(x, k, list.length) })), also: commands() };
}
async function runTool(tool, input = {}, on = () => {}) {
  const need = () => st.area ? null : { error: 'Pick a place first: say Los Angeles or Houston, or type a latitude and longitude.' };
  if (tool === 'place') { on('step', 'Opening: ' + EXAMPLES.find(x => x.q === input.q).label); return void await load(input.q, true); }
  if (tool === 'open_page') { location.href = input.page === 'home' ? './' : 'region.html'; return 'Opening the ' + (input.page === 'home' ? 'start page.' : 'neighbourhood comparison.'); }
  if (tool === 'set_view' && (input.mode === 'dollhouse' || input.mode === 'floorplan')) return runTool('view', { view: input.mode === 'dollhouse' ? '3d' : 'map' }, on);
  if (tool === 'view') { if (need()) return need(); on('step', input.view === '3d' ? 'Showing: 3D' : 'Showing: the map'); return void setView(input.view); }
  if (tool === 'profile') { if (need()) return need(); on('step', 'Profile: ' + PROFILES.find(p => p.id === input.id).label); return void pick(input.id); }
  if (tool === 'buildings') { if (need()) return need(); on('step', input.on ? 'Buildings and trees on' : 'Bare ground'); st.view = '3d'; return void set3D({ buildings: input.on }); }
  if (tool === 'lift') { if (need()) return need(); const lift = input.to ?? Math.min(4, st.lift + input.by); on('step', `Ground height ${lift === 1 ? 'true scale' : '×' + lift}`); st.view = '3d'; return void set3D({ lift }); }
  if (tool === 'steps') { if (need()) return need(); on('step', input.avoid ? 'Avoiding steps' : 'Steps are fine'); return void custom({ avoidSteps: input.avoid }); }
  if (tool === 'close') { if (need()) return need(); st.at = -1; return void select(null); }
  if (tool === 'show_issue') {
    if (need()) return need();
    if (String(input.id).startsWith('street:')) { const name = input.id.slice(7), seg = askSeg(name); on('step', 'Showing: ' + name); return void (seg && showSeg(seg)); }
    const x = issues()[input.id]; if (!x) return { error: 'There is no issue with that number.' };
    st.at = input.id; on('step', `Issue ${input.id + 1}: ${x.title}`);
    if (x.seg) showSeg(x.seg); else render();
    document.querySelectorAll('#issues li')[input.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  return { error: 'That is not on this page. Say a profile, like power chair, Map or 3D, or describe how you get around.' };
}
// The piece askStreets() tells Claude about, so what is said and what is shown are the same stretch.
const askSeg = name => { const a = askStreets(st.segs).find(s => s.name === name); return a && st.segs.find(s => s.name === name && s.slope === a.slope && s.near === a.near); };

const bar = initVoice({
  home: false, // the bar goes into <main>; street.html places it at the bottom
  get ready() { return loaded; },
  mode: () => st.view,
  help: 'Say manual wheelchair, power chair or cane to change who is checking. Say map or 3D, buildings, uphill 10 or avoid steps. Say Los Angeles or Houston for an example, number one or next for an issue, or a street by name. Or say how you get around, like I push a manual chair and my arms tire on hills.',
  stop() { asking?.abort(); asking = null; },
  places,
  run: runTool,
  nav: () => null,
  open: to => { location.href = to === 'page:home' ? './' : 'region.html'; },
  async ask(text, { on }) {
    if (!st.area) return { text: '', error: 'Pick a place first: say Los Angeles or Houston, or type a latitude and longitude.', open: null };
    const lim = spokenLimit(text); // "uphill 10": a slider, no Claude needed
    if (lim) { custom(lim); const t = `Set to ${st.up}% up and ${st.down}% down. ${share(limits())}% of the streets here work both ways.`; on('step', lim.up != null ? `Uphill ${lim.up}%` : `Downhill ${lim.down}%`); const line = await bar.custom(text, t, t); on('say', line); return { text: line, error: '', open: null }; } // Claude says it, in context (user, Nov 14)
    return askClaude(text, on);
  },
});
const hint = document.querySelector('#v-hint'); // voice.js's hint is about apartments; this page's is about streets
if (hint) hint.innerHTML = 'Hold <kbd>Space</kbd> and say a profile, like “power chair”, or how you get around';

// ---- Clicks and typing go the same way ----
$('qf').onsubmit = e => { e.preventDefault(); load($('q').value, true); };
$('ask').onsubmit = e => { e.preventDefault(); const t = $('describe').value.trim(); if (t) { $('describe').value = ''; bar.hear(t); } };
$('profiles').innerHTML = PROFILES.map(p => `<button type="button" data-p="${p.id}">${p.label}</button>`).join('') + '<span id="custom"></span>';
$('examples').innerHTML = EXAMPLES.map((x, k) => `<a class="btn${k ? ' ghost' : ''}" href="?q=${x.q}" data-q="${x.q}" style="display:inline-flex;align-items:center;text-decoration:none">${x.label}</a>`).join('');
$('examples').onclick = e => { const a = e.target.closest('[data-q]'); if (a) { e.preventDefault(); load(a.dataset.q, true); } };
$('profiles').onclick = e => { const b = e.target.closest('[data-p]'); if (b) pick(b.dataset.p); };
$('up').oninput = e => custom({ up: +e.target.value });
$('down').oninput = e => custom({ down: +e.target.value });
$('steps').onchange = e => custom({ avoidSteps: e.target.checked });
document.querySelector('.tools .seg').onclick = e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
$('bld').onchange = e => set3D({ buildings: e.target.checked });
$('lift').oninput = e => set3D({ lift: +e.target.value });
$('svg').onclick = e => { const i = e.target.dataset?.i; if (i != null) select(+i); };
$('picked').onclick = e => { if (e.target.id === 'unpick') select(null); };
$('issues').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { st.at = +b.dataset.k; showSeg(issues()[st.at].seg); } };
addEventListener('popstate', () => load(new URLSearchParams(location.search).get('q') ?? ''));

load(new URLSearchParams(location.search).get('q') ?? '');
window.__street = { st, load, run: runTool, issues, voice: window.__voice, three: () => three }; // test hook
