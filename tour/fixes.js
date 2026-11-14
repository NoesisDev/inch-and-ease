// Fix options and the plan. For one failed or check-with-tape item: every rung of its fix ladder (checks.js REGISTRY), $0 first,
// up to three catalogue products (one per tier), the contractor / owner option, and items the catalogue lacks as text.
// Each option's verdict comes from running the check again with the changed number (the re-check), never from the planner.
// Pure functions, no DOM: the page and the tests share them.
import { CHECK, LIMITS, statusOf, ftin, IN } from './checks.js';

export const INSTALL = { none: 'no tools', 'tool-free': 'tool-free', screws: 'screws: ask the landlord' };
const RANK = { none: 0, fail: 1, verify: 2, pass: 3 };
const V = { closes: 0, helps: 1, na: 2, nosupport: 3 };

// How far a number sits outside its band (0 = inside).
const off = (n, v) => { const l = LIMITS[CHECK[n].limit]; return !l || typeof v !== 'number' ? null : Math.max(0, (l.min ?? -Infinity) - v, v - (l.max ?? Infinity)); };

// The re-check: the item's check judged again with the changed value.
export function recheck(item, value, rung = {}) {
  if (rung.support === false) return { verdict: 'nosupport' };
  if (value === undefined) return { verdict: rung.helps ? 'helps' : 'na' };
  const s = statusOf(item.n, value);
  if (s === 'pass') return { verdict: 'closes', s, value };
  const a = off(item.n, item.value), b = off(item.n, value);
  return { verdict: RANK[s] > RANK[item.s] || (a != null && b != null && b < a - 1e-9) ? 'helps' : 'na', s, value };
}

const change = (item, value) => {
  if (typeof value !== 'number' || typeof item.value !== 'number') return '';
  const d = value - item.value, what = { door: 'opening', step: 'step', turn: 'across', hall: 'wide' }[item.kind] || 'measured';
  return `${d >= 0 ? 'adds' : 'takes off'} ${ftin(Math.abs(d))} → about ${ftin(value)} ${what}`;
};
const productOf = p => ({ id: p.id, name: p.name, price: p.price_usd, store: p.store, url: p.url, photo: p.photo, tier: p.tier,
  install: INSTALL[p.install] || p.install, evidence: p.evidence_note || null });

export function fixOptions(item, products) {
  if (item.s !== 'fail' && item.s !== 'verify') return [];
  const out = [];
  CHECK[item.n].ladder.forEach((r, k) => {
    const base = { key: `${item.n}.${k}`, kind: r.kind, label: r.label, note: r.note || '', reason: r.reason || '' };
    if (r.kind === 'product') {
      const cands = products.filter(p => r.types.includes(p.type)).map(p => {
        const value = r.effect(item.value, p, item), rc = recheck(item, value, r);
        return { ...base, key: `${item.n}.${k}.${p.id}`, kind: r.support === false ? 'nosupport' : 'product', label: p.name, price: p.price_usd, product: productOf(p), ...rc, change: change(item, value) };
      });
      // One per tier: the best verdict, then the cheapest; at most three.
      const best = {};
      for (const c of cands.sort((a, b) => V[a.verdict] - V[b.verdict] || a.price - b.price)) best[c.product.tier === 'only' ? c.product.id : c.product.tier] ||= c;
      out.push(...Object.values(best).sort((a, b) => V[a.verdict] - V[b.verdict] || a.price - b.price).slice(0, 3));
      return;
    }
    const value = r.effect(item.value, null, item);
    out.push({ ...base, price: r.kind === 'contractor' ? r.avg ?? r.low : r.price, low: r.low, high: r.high, source: r.source || (r.kind === 'text' ? 'master table price, not in our catalogue' : ''),
      ...recheck(item, value, r), change: change(item, value) });
  });
  return out.sort((a, b) => (b.kind === 'free') - (a.kind === 'free')); // $0 first, ladder order otherwise
}

const purchase = o => o.kind === 'free' || o.kind === 'product' || o.kind === 'text';
const cost = o => o?.price ?? 0;

// The plan for the problems: default = the cheapest option a purchase (or $0) can do that closes the check.
// With a budget: critical items first, then the cheapest, until the money runs out. choices: { itemId: optionKey | 'none' }.
export function planAll(items, products, { choices = {}, budget = null } = {}) {
  const rows = items.filter(i => i.s === 'fail' || i.s === 'verify').map(item => {
    const options = fixOptions(item, products);
    const def = options.filter(o => purchase(o) && o.verdict === 'closes' && o.price != null).sort((a, b) => a.price - b.price)[0] || null;
    return { item, options, default: def, chosen: null };
  });
  let left = budget ?? Infinity;
  const order = [...rows].sort((a, b) => (b.item.critical === true) - (a.item.critical === true) || cost(a.default) - cost(b.default));
  for (const r of order) {
    const pick = choices[r.item.id];
    if (pick !== undefined) { r.chosen = pick === 'none' ? null : r.options.find(o => o.key === pick) || null; r.byYou = true; }
    else if (r.default && cost(r.default) <= left + 1e-9) r.chosen = r.default;
    else if (r.default) r.overBudget = true;
    if (r.chosen && purchase(r.chosen)) left -= cost(r.chosen);
  }
  for (const r of rows) r.after = r.chosen?.verdict === 'closes' ? 'fixed' : r.chosen?.verdict === 'helps' ? 'helps' : r.item.s;
  const chosen = rows.map(r => r.chosen).filter(Boolean);
  const pro = chosen.filter(o => o.kind === 'contractor');
  return {
    rows,
    purchases: Math.round(chosen.filter(purchase).reduce((s, o) => s + cost(o), 0) * 100) / 100,
    contractor: { low: pro.reduce((s, o) => s + (o.low ?? 0), 0), high: pro.reduce((s, o) => s + (o.high ?? 0), 0), unpriced: pro.filter(o => o.low == null).length },
    closed: rows.filter(r => r.after === 'fixed').length,
    noPurchaseFix: rows.filter(r => !r.options.some(o => purchase(o) && o.verdict === 'closes')).map(r => r.item),
    unsolved: rows.filter(r => r.after !== 'fixed').map(r => r.item),
    budget, left: budget == null ? null : Math.max(0, left),
  };
}
export const hasPricedFix = (item, products) => fixOptions(item, products).some(o => o.price > 0 && o.verdict !== 'nosupport');
export { IN };
