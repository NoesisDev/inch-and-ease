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
  const sides = (i.between || '').split(' ↔ ').filter(r => r && r !== 'outside').map(r => `the ${r.split(', ')[0].toLowerCase()}`);
  const where = sides.length > 1 ? `between ${sides[0]} and ${sides[1]}` : sides.length ? `in ${sides[0]}` : 'at the entrance';
  const tape = i.s === 'verify' ? ', check it with a tape' : '';
  if (i.n === 8) return `the door ${where} is ${feet(i.value)} wide${tape}`;
  if (i.n === 9) return `there's a ${feet(i.value).replace(/inches$/, 'inch')} step ${where}${tape}`;
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

// The script when Claude doesn't answer in time: visit worst → best, end on the best one.
export function fallbackScript(ranked) {
  const best = ranked[0], line = f => {
    const t = f.inside.top[0], o = f.outside, st = o.station;
    const inside = t ? `${cap(t.what)}, and ${t.fix_spoken}.` : 'Every measured check passes inside.';
    const outside = o.steep_pct >= 10 ? `Outside, ${o.steep_pct}% of the nearby streets are steeper than 8%.`
      : `Outside, ${o.flat_pct}% of the nearby streets are flat${st ? `, and ${st.name.replace('/', ' ')} station is about ${Math.round(st.m * 3.28084 / 50) * 50} feet away` : ''}.`;
    return `${spokenAddress(f.address)}. ${inside} ${outside}`;
  };
  return {
    intro: `I checked ${ranked.length} apartments in this area, inside and out. Here they are, from hardest to easiest.`,
    stops: [...ranked].reverse().slice(0, -1).map(f => ({ id: f.id, line: line(f) })),
    answer: { id: best.id, line: `For your father: ${line(best)} Let's go inside.`, dive: true },
  };
}
