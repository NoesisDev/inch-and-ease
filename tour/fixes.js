// Fix planner: for one measured problem, the cheapest renter-friendly product that closes it (from data/products.json),
// and the owner / contractor fix when no product can. Pure functions, no DOM, so the page and the tests share them.
export const IN = 0.0254;
export const CLEAR_LOSS_IN = 1.75; // an open door eats 1.5-2" of the opening (HUD Fair Housing Act Design Manual)
export const DOOR_CLEAR_IN = 32;   // ADA 404.2.3 reference
export const WIDEN_DOOR = { low: 600, high: 2000, avg: 1200, source: 'Angi cost guide' };

const cheapestFirst = (a, b) => (a.install !== 'none') - (b.install !== 'none') || a.price_usd - b.price_usd; // no-install first: renters can't drill
const pick = p => p && { id: p.id, name: p.name, price: p.price_usd, store: p.store, url: p.url, photo: p.photo, install: p.install };

export function planFix(check, products) {
  if (check.kind === 'door') {
    const clear = check.w / IN - CLEAR_LOSS_IN, gap = DOOR_CLEAR_IN - clear;
    const hinges = products.filter(p => p.type === 'offset_hinge' && p.spec?.clearance_gained_in).sort((a, b) => a.price_usd - b.price_usd);
    const h = hinges[0], gained = h?.spec.clearance_gained_in ?? 0, after = clear + gained;
    if (gap <= 0) return { verdict: 'No fix needed.', renter: null, owner: null, cost: 0 };
    if (h && gap <= gained)
      return { verdict: `Swing-clear hinges add ${gained}": about ${after.toFixed(0)}" clear, enough for 32".`, closes: true,
        renter: { ...pick(h), note: 'Screws into the same holes; keep the old hinges and swap them back when you move out.' }, owner: null, cost: h.price_usd };
    return { verdict: h ? `Hinges add ${gained}" (about ${after.toFixed(0)}" clear), still ${(gap - gained).toFixed(1)}" short. Only widening the doorway fixes it.` : 'Only widening the doorway fixes it.',
      closes: false, renter: h ? { ...pick(h), note: 'Helps, but does not reach 32" clear.' } : null,
      owner: { label: 'Widen the doorway (contractor)', low: WIDEN_DOOR.low, high: WIDEN_DOOR.high, avg: WIDEN_DOOR.avg, source: WIDEN_DOOR.source }, cost: h?.price_usd ?? 0 };
  }
  if (check.kind === 'step') {
    const rise = check.h / IN;
    const covers = p => {
      const max = p.spec?.rise_in ?? p.spec?.rise_max_in ?? p.spec?.max_rise_in_recommended, min = p.spec?.rise_min_in ?? 0;
      return max >= rise && min <= rise + 0.25; // a ramp set slightly higher than the step still sits flat
    };
    const r = products.filter(p => (p.type === 'threshold_ramp' || p.type === 'portable_ramp') && covers(p)).sort(cheapestFirst)[0];
    if (!r) return { verdict: `No ramp in the catalogue covers a ${rise.toFixed(1)}" step.`, renter: null, owner: { label: 'Built ramp (contractor)', low: null, high: null }, cost: 0 };
    return { verdict: `A ${r.type === 'portable_ramp' ? 'portable' : 'threshold'} ramp covers the ${rise.toFixed(1)}" step.`, closes: true,
      renter: { ...pick(r), note: r.install === 'none' ? 'Lies in place, no tools; take it with you.' : 'Screws down; ask the landlord first.' }, owner: null, cost: r.price_usd };
  }
  if (check.kind === 'turn')
    return { verdict: 'No product makes a room bigger. Clear the floor, or ask for a different unit.', closes: false, renter: null,
      owner: { label: 'Remodel the room (not priced)', low: null, high: null }, cost: 0 };
  return { verdict: '', renter: null, owner: null, cost: 0 };
}

// The apartment total: what a renter spends on purchases that actually solve a problem (a partial fix like hinges on a
// door that stays too narrow is shown on its card but not counted), and how many problems no purchase solves.
export function planAll(issues, products) {
  const plans = issues.map(i => ({ issue: i, plan: planFix(i, products) }));
  return { plans, renterTotal: plans.reduce((s, p) => s + (p.plan.closes ? p.plan.cost : 0), 0), unsolved: plans.filter(p => !p.plan.closes).length };
}
