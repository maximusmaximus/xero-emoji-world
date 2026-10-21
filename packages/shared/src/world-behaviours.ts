/**
 * Behaviours of the world layer (harvest, alchemy, wonders, decrees) plus the
 * demand-driven weighting applied to every behaviour. See world.ts for the model.
 */
import { emojiInfo } from './emoji-catalog.js';
import { generateBuilding, generateFloor } from './generator.js';
import { act, clone, type Behaviour, type SimContext } from './sim-util.js';
import type { Person } from './types.js';
import {
  applyDecree, builtWonders, chronicle, ensureWorld, gain, growthMultiplier, harvest, pendingWonder, refreshEra,
  sanitizeDecree, type BehaviourKey, type Decree, type OracleBudget,
} from './world.js';

const fmt = (m: Record<string, number>) => Object.entries(m).map(([e, n]) => `${e}×${n}`).join(' ');

/**
 * Demand-driven multipliers so the city behaves more like a city:
 * crowding drives construction, vacancy + happiness drive immigration,
 * abundant materials drive alchemy, and a pending wonder pulls effort toward it.
 */
export function dynamicWeight(k: BehaviourKey, c: SimContext): number {
  const w = ensureWorld(c.state);
  switch (k) {
    case 'build': return 0.5 + 2 * Math.min(1.5, c.pressure);
    case 'immigrate': return Math.max(0.1, (1.2 - Math.min(1.2, c.pressure)) * (0.5 + c.avgMood) * (1 + 0.2 * builtWonders(w).length));
    case 'family': return 0.5 + c.avgMood;
    case 'alchemy': {
      // curiosity: strong pull while undiscovered recipes are craftable, a trickle of routine crafting otherwise
      const fresh = w.recipes.some((r) => r.discoveredAtTick === undefined && (w.materials[r.a] ?? 0) > 0 && (w.materials[r.b] ?? 0) > 0);
      return fresh ? 2 : 0.3;
    }
    case 'wonder': return pendingWonder(w) ? 3 : 0;
    default: return 1;
  }
}

/** Periodic harvest: completed buildings produce their district's element emojis. */
export function harvestAction(c: SimContext) {
  const byKind: Record<string, number> = {};
  for (const { district, building } of c.idx.buildings.values()) if (!building.underConstruction) byKind[district.kind] = (byKind[district.kind] ?? 0) + 1;
  const nw = clone(ensureWorld(c.state));
  const got = harvest(c.state, nw, byKind);
  if (!Object.keys(got).length) return null;
  return act('world.harvest', '⛏️', `⛏️ The city harvested ${fmt(got)} (growth ×${growthMultiplier(nw).toFixed(2)}).`, { op: 'setWorld', world: nw });
}

/** Turn an oracle decree into an ordinary action so clients replay it in lockstep. */
export function decreeAction(c: SimContext, raw: Decree, source: 'oracle' | 'local', oracle: string, budget?: OracleBudget) {
  const nw = clone(ensureWorld(c.state));
  if (budget) nw.oracleBudget = { ...budget };
  const d = sanitizeDecree(raw, nw);
  const text = applyDecree(nw, d, c.gen.tick, source, oracle, () => c.rng.id('wonder'));
  return act('world.decree', '🔮', text, { op: 'setWorld', world: nw });
}

const alchemy: Behaviour = (c) => {
  const w = ensureWorld(c.state);
  const ready = w.recipes.filter((r) => (w.materials[r.a] ?? 0) >= 1 && (w.materials[r.b] ?? 0) >= (r.a === r.b ? 2 : 1));
  if (!ready.length) return null;
  // prefer undiscovered recipes: curiosity is what makes the graph grow
  const fresh = ready.filter((r) => r.discoveredAtTick === undefined);
  const r = fresh.length && c.rng.chance(0.6) ? c.rng.pick(fresh) : c.rng.pick(ready);
  const nw = clone(w); const nr = nw.recipes.find((x) => x.a === r.a && x.b === r.b && x.out === r.out)!;
  const batch = Math.max(1, Math.min(nw.materials[r.a]!, nw.materials[r.b]!, Math.floor(growthMultiplier(nw) * 2)) >> (r.a === r.b ? 1 : 0));
  nw.materials[r.a]! -= batch; nw.materials[r.b]! -= batch; gain(nw, r.out, batch);
  const person = Object.keys(c.state.people).length ? c.state.people[c.rng.pick(Object.keys(c.state.people))] : undefined;
  const who = person ? `${person.emoji} ${person.name}` : 'Someone';
  if (nr.discoveredAtTick === undefined) {
    nr.discoveredAtTick = c.gen.tick;
    const newEra = refreshEra(nw);
    chronicle(nw, `💡 ${who} discovered ${r.a}+${r.b}→${r.out} (${r.name}).`);
    const text = `💡 ${who} discovered ${r.name}: ${r.a} + ${r.b} → ${r.out} ${emojiInfo(r.out)?.name ?? ''}! Knowledge ${nw.knowledge}, growth ×${growthMultiplier(nw).toFixed(2)}.`
      + (newEra ? ` 🌅 A new era dawns: the ${nw.eraName}.` : '');
    return act(newEra ? 'world.era' : 'world.discovery', r.out, text, { op: 'setWorld', world: nw }, [], person?.id);
  }
  return act('world.crafted', r.out, `⚗️ ${who} crafted ${r.out}×${batch} from ${r.a}+${r.b}.`, { op: 'setWorld', world: nw }, [], person?.id);
};

const wonder: Behaviour = (c) => {
  const w = ensureWorld(c.state); const pw = pendingWonder(w); if (!pw) return null;
  const nw = clone(w); const nwonder = nw.wonders.find((x) => x.id === pw.id)!;
  const moved: Record<string, number> = {};
  const chunk = Math.max(1, Math.floor(5 * growthMultiplier(nw)));
  for (const [e, need] of Object.entries(nwonder.cost)) {
    const q = Math.min(need - (nwonder.paid[e] ?? 0), nw.materials[e] ?? 0, chunk);
    if (q > 0) { nw.materials[e]! -= q; nwonder.paid[e] = (nwonder.paid[e] ?? 0) + q; moved[e] = q; }
  }
  const done = Object.entries(nwonder.cost).every(([e, n]) => (nwonder.paid[e] ?? 0) >= n);
  if (!done) {
    if (!Object.keys(moved).length) return null;
    const pct = Math.round(100 * Object.entries(nwonder.cost).reduce((a, [e, n]) => a + Math.min(n, nwonder.paid[e] ?? 0), 0) / Object.values(nwonder.cost).reduce((a, b) => a + b, 0));
    return act('world.wonder_progress', nwonder.emoji, `🏗️ Citizens poured ${fmt(moved)} into ${nwonder.emoji} ${nwonder.name} (${pct}%).`, { op: 'setWorld', world: nw });
  }
  // raise the wonder on a free lot, as a real building made of the emoji
  const lots = [...c.idx.blocks.values()].flatMap(({ district, block }) => block.lots.filter((l) => l.kind === 'empty' || l.kind === 'park').map((lot) => ({ district, block, lot })));
  const site = lots.length ? c.rng.pick(lots) : undefined;
  nwonder.builtAtTick = c.gen.tick;
  const newEra = refreshEra(nw);
  const text = `🌟 ${nwonder.emoji} ${nwonder.name} rose from ${fmt(nwonder.cost)}${site ? ` in ${site.district.name}` : ''}! Every harvest now grows faster.` + (newEra ? ` 🌅 The ${nw.eraName} begins.` : '');
  chronicle(nw, text);
  if (!site) return act('world.wonder_built', nwonder.emoji, text, { op: 'setWorld', world: nw });
  const people: Person[] = [];
  const b = generateBuilding(c.gen, c.rng, 'landmark', site.district.kind, people, 0);
  b.emoji = nwonder.emoji; b.name = nwonder.name; b.underConstruction = false;
  b.plannedFloors = Math.min(10, 2 + nw.era);
  for (let i = 0; i < b.plannedFloors; i++) { const f = generateFloor(c.gen, c.rng, i, people); for (const a of f.apartments) { a.residentIds = []; a.items = []; a.pets = []; a.lightsOn = true; } b.floors.push(f); }
  nwonder.buildingId = b.id;
  return act('world.wonder_built', nwonder.emoji, text, {
    op: 'batch', patches: [{ op: 'setLot', districtId: site.district.id, blockId: site.block.id, lot: { ...site.lot, kind: 'landmark', building: b } }, { op: 'setWorld', world: nw }],
  }, [site.district.id, site.block.id, b.id]);
};

export const WORLD_BEHAVIOURS: [BehaviourKey, Behaviour, number][] = [['alchemy', alchemy, 4], ['wonder', wonder, 2]];
