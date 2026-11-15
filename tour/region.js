// Region comparison: one fact sheet per apartment (inside = the 21 checks + the fix plan, outside = street slopes and transit),
// the ranking rule, and a plain script used when Claude can't answer. Pure functions, no DOM: the page and the tests share them.
import { evaluate, describe, ftin } from './checks.js';
import { planAll } from './fixes.js';

// Spoken forms for the narration: 2' 4" → 2 foot 4, 2½" → 2½ inches, "12 Oak Dr" → "12 Oak Drive".
const feet = m => ftin(m).replace(/^(\d+)' 0"$/, (_, f) => f === '1' ? '1 foot' : `${f} feet`).replace(/^(\d+)' (.+)"$/, '$1 foot $2').replace(/^(.+)"$/, '$1 inches');
const STREET = { Dr: 'Drive', St: 'Street', Ave: 'Avenue', Blvd: 'Boulevard', Rd: 'Road', Ln: 'Lane', Pl: 'Place', Ct: 'Court', N: 'North', S: 'South', E: 'East', W: 'West' };
const spokenAddress = a => a.replace(/\b(Dr|St|Ave|Blvd|Rd|Ln|Pl|Ct|N|S|E|W)\b\.?/g, m => STREET[m.replace('.', '')]);
const dollars = n => `$${n % 1 ? n.toFixed(2) : n.toLocaleString()}`;
const lower = s => s.replace(/\s*\(.*?\)/g, '').replace(/^./, c => c.toLowerCase());
const cap = s => s.replace(/^./, c => c.toUpperCase());
const NOUN = { offset_hinge: 'swing-clear hinges', threshold_ramp: 'ramp', portable_ramp: 'ramp' };
// "the door between the bedroom and the hallway is 2 foot 4 wide": one short spoken clause for one problem.
function what(i) {
  const sides = (i.between || '').split(' ↔ ').filter(r => r && !/^(outside|void)$/i.test(r)).map(r => `the ${r.split(', ')[0].toLowerCase()}`);
  const where = sides.length > 1 ? `between ${sides[0]} and ${sides[1]}` : sides.length ? `from ${sides[0]} to outside` : 'at the entrance'; // one room = the door on its outside wall, not something "in" the room
  const tape = i.s === 'verify' ? ', check it with a tape' : '';
  if (i.n === 8) return `the door ${where} is ${feet(i.value)} wide${tape}`;
  if (i.n === 9) return `there's a ${feet(i.value).replace(/inches$/, 'inch')} step ${sides.length === 1 ? 'at the door ' : ''}${where}${tape}`;
  if (i.n === 10) return i.s === 'verify' ? `turning around in the ${i.room.toLowerCase()} is tight, ${feet(i.value)} across` : `the ${i.room.toLowerCase()} is too small to turn around in, ${feet(i.value)} across`;
  if (i.n === 11) return `the ${i.room.toLowerCase()} is ${feet(i.value)} wide${tape}`;
  return `the ${lower(i.title)} ${i.s === 'verify' ? 'needs a check with a tape' : "doesn't pass"}`;
}
// "a $70.99 ramp fixes it" / "only a contractor can widen the doorway, about $600 to $2,000".
function fixSpoken(r, products) {
  const d = r.default, o = r.options.find(o => o.kind === 'contractor' && o.verdict === 'closes');
  if (d?.kind === 'free') return `you can ${lower(d.label)}, for free`;
  if (d) {
    const t = products.find(p => p.id === d.product?.id)?.type, n = t ? NOUN[t] || t.replace(/_/g, ' ') : lower(d.label);
    return /s$/.test(n) ? `${dollars(d.price)} ${n} fix it` : `a ${dollars(d.price)} ${n} fixes it`;
  }
  if (o) return `only a contractor can ${lower(o.label)}, ${o.low == null ? 'price unknown' : `about ${dollars(o.low)} to ${dollars(o.high)}`}`;
  return 'no purchase fixes it';
}

const money = o => o.kind === 'contractor' ? (o.low == null ? 'a contractor (not priced)' : `a contractor, $${o.low.toLocaleString()}–${o.high.toLocaleString()}`) : o.price ? `$${o.price.toFixed(2)}` : '$0';

export function unitFacts(unit, model, products) {
  const items = evaluate(model).items.map(i => ({ ...i, ...describe(i) }));
  const plan = planAll(items, products), measured = items.filter(i => ['pass', 'fail', 'verify'].includes(i.s));
  const problems = plan.rows.map(r => ({
    title: r.item.title, critical: !!r.item.critical, status: r.item.s,
    fix: r.default ? `${r.default.label} (${money(r.default)})` : (o => o ? `no purchase fixes it; ${o.label}: ${money(o)}` : 'no purchase fixes it')(r.options.find(o => o.kind === 'contractor' && o.verdict === 'closes')),
    fixed_by_purchase: r.after === 'fixed', what: what(r.item), fix_spoken: fixSpoken(r, products),
  })).sort((a, b) => b.critical - a.critical || (a.status === 'fail' ? -1 : 1));
  return {
    id: unit.id, address: unit.address, name: unit.name,
    inside: { pass: measured.filter(i => i.s === 'pass').length, measured: measured.length, critical: problems.filter(p => p.critical).length,
      critical_left: problems.filter(p => p.critical && !p.fixed_by_purchase).length, purchases_usd: plan.purchases, closed: plan.closed, problems: problems.length,
      top: problems.slice(0, 3), not_measured: items.filter(i => i.s === 'none').length },
    outside: unit.terrain,
  };
}

// The rule shown on screen: critical problems left after the cheapest purchase fixes, then share of steep streets, then cost.
export const RULE = 'Ranked by: critical problems left after the cheapest fixes → steep streets nearby → cost';
export function rank(facts) {
  return [...facts].sort((a, b) => a.inside.critical_left - b.inside.critical_left || a.outside.steep_pct - b.outside.steep_pct || a.inside.purchases_usd - b.inside.purchases_usd);
}
// Colour of a pin: green = nothing critical left, amber = one, red = more.
export const tone = f => f.inside.critical_left === 0 ? 'pass' : f.inside.critical_left === 1 ? 'verify' : 'fail';

// What Ethan says about one apartment: head = its address, then the inside sentence and the outside sentence.
function sentences(f) {
  const t = f.inside.top[0], o = f.outside, st = o.station;
  return { head: spokenAddress(f.address),
    inside: t ? `${cap(t.what)}, and ${t.fix_spoken}.` : 'Every measured check passes inside.',
    outside: o.steep_pct >= 10 ? `Outside, ${o.steep_pct}% of the nearby streets are steeper than 8%.`
      : `Outside, ${o.flat_pct}% of the nearby streets are flat${st ? `, and ${st.name.replace('/', ' ')} station is about ${Math.round(st.m * 3.28084 / 50) * 50} feet away` : ''}.` };
}
const line = f => { const s = sentences(f); return `${s.head}. ${s.inside} ${s.outside}`; };

// The script when Claude doesn't answer in time: visit worst → best, end on the best one.
export function fallbackScript(ranked) {
  const best = ranked[0];
  return {
    intro: `I checked ${ranked.length} apartments in this area, inside and out. Here they are, from hardest to easiest.`,
    stops: [...ranked].reverse().slice(0, -1).map(f => ({ id: f.id, line: line(f) })),
    answer: { id: best.id, line: `For your father: ${line(best)} Let's go inside.`, dive: true },
  };
}

// A PLAN (see notes/ETHAN_PLAN_AGENT.md) from the words alone, for when Claude can't be reached; null = understood nothing.
// ctx: { active: id on screen | null, inside: a tour is open, label: { id: 'A'..'E' } }.
const STREET_WORDS = new Set('street drive avenue boulevard road lane place court north south east west apt unit terrace square plaza row park view grove live oak station railway metro'.split(' ')); // also everyday words: "where can he park" names no apartment
export function fallbackPlan(ranked, text, ctx = {}) {
  const n = ranked.length; if (!n) return null;
  const orig = ` ${String(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  let s = orig;
  const hits = []; // { i: where in the sentence, f, name }
  const find = (re, pick, name) => { for (const m of [...s.matchAll(re)]) { const f = pick(m); if (f) hits.push({ i: m.index, f, name: name(m) }); s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length); } };
  const ORDS = { second: 1, third: 2, fourth: 3, fifth: 4 };
  find(/\b(second|third|fourth|fifth)(?: best)?\b/g, m => ranked[ORDS[m[1]]], m => `the ${m[1]} best one`); // before "best": "second best" is one pick
  find(/\b(?:apartment|letter|unit|option|number) ([a-e])\b(?! (?:bit|little|lot))/g, m => ranked.find(f => ctx.label?.[f.id] === m[1].toUpperCase()), m => `apartment ${m[1].toUpperCase()}`);
  find(/\b(?:best|top|number one|number 1)\b/g, () => ranked[0], () => 'the best one');
  find(/\b(?:worst|last|hardest)\b/g, () => ranked[n - 1], () => 'the worst one');
  find(/\b(?:middle|medium|average|mid)\b/g, () => ranked[Math.floor(n / 2)], () => 'the middle one');
  for (const f of ranked) { // a house number, a word only this address has, or the whole street name ("station square": each word alone is everyday speech)
    const street = a => a.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/^\s*\d+\s+/, '').trim(), w = f.address.toLowerCase().split(/[^a-z0-9]+/).filter(w => /\d/.test(w) || (w.length > 2 && !STREET_WORDS.has(w)));
    const keys = [...new Set([street(spokenAddress(f.address)), street(f.address), ...w])].filter(Boolean);
    find(new RegExp(`\\b(?:${keys.join('|')})\\b`, 'g'), () => f, () => spokenAddress(f.address)); }
  find(/\b(?:this one|this apartment|this place|here)\b/g, () => ranked.find(f => f.id === ctx.active), () => 'this one');
  const all = /\b(?:all|every|each|everything)\b/.test(s), map = /\b(?:the map|whole neighbou?rhood|overview)\b/.test(s), walk = /\b(?:walk|room by room|tour it)\b/.test(s);
  const outside = /\b(?:outside|streets?|go out|take me out|back out|and out|exterior|drone)\b/.test(s), inside = /\b(?:inside|go in|enter|into|walk through|tour inside)\b/.test(s) || (walk && !outside);
  const act = ranked.find(f => f.id === ctx.active);
  let picks = hits.sort((a, b) => a.i - b.i).filter((h, k, hs) => hs.findIndex(x => x.f === h.f) === k);
  if (all) picks = ranked.map(f => ({ f, name: '' }));
  else if (!picks.length && (inside || outside || walk) && act) picks = [{ f: act, name: 'this one' }];
  if (!picks.length) return map ? { say: 'Back above the whole neighbourhood.', steps: [], end: 'map', camera: '', region: '', person: '' } : null;
  if (all && /\b(?:worst first|worst to best|(?:from|starting with|starting from) (?:the )?(?:worst|hardest)|hardest first)\b/.test(orig)) picks.reverse();
  // The rule of the flyover: an apartment is shown by its streets and slopes first, then the page goes in and walks through it. Only "outside" or only "inside" when they said so.
  const pair = inside === outside, first = new Set(), steps = picks.flatMap(({ f }) => (pair ? ['outside', 'inside'] : inside ? ['inside'] : ['outside']).map(where => {
    const p = sentences(f), head = first.has(f.id) ? '' : `${p.head}. `; first.add(f.id);
    return { id: f.id, where, walk: where === 'inside' && (walk || pair), room: '', line: pair && where === 'inside' ? '' : head + p[where] };
  }));
  const say = picks.length < 2 ? '' : all ? `Here are all ${n} apartments${picks[0].f === ranked[n - 1] ? ', worst first' : ''}.` : `Here's ${picks.map(p => p.name).join(', then ')}.`;
  return { say, steps, end: picks.length > 1 || map ? 'map' : 'stay', camera: '', region: '', person: '' };
}
