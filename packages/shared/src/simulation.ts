/**
 * The life engine. `step()` advances the city by one tick and returns the list of
 * actions that happened. It is pure w.r.t. (state, seed, tick): the RNG is derived
 * from those, so a run is reproducible from its starting snapshot.
 *
 * Add new behaviours by appending to BEHAVIOURS with a weight.
 */
import { emojiInfo, emojisWithRole } from './emoji-catalog.js';
import { generateBuilding, generateDistrict, generateFloor, generateItem, generatePerson, generatePet, generateStreet, LAYOUT } from './generator.js';
import { applyAction, indexCity, recomputeStats, type CityIndex } from './reducer.js';
import { Rng } from './rng.js';
import { WORLD_BEHAVIOURS, dynamicWeight, harvestAction, decreeAction } from './world-behaviours.js';
import { FLOOR_COST, HARVEST_EVERY as HARVEST_TICKS, ensureWorld, has, spend, type BehaviourKey, type Decree } from './world.js';
import type { Apartment, CityAction, CityState, Person } from './types.js';

import type { SimContext, Behaviour } from './sim-util.js';
import { act, clone } from './sim-util.js';
export type { SimContext, Behaviour } from './sim-util.js';

const pickApartment = (c: SimContext, pred: (a: Apartment) => boolean) => {
  const all = [...c.idx.apartments.values()].filter((r) => pred(r.apartment));
  return all.length ? c.rng.pick(all) : undefined;
};
const pickPerson = (c: SimContext): Person | undefined => {
  const ids = Object.keys(c.state.people);
  return ids.length ? c.state.people[c.rng.pick(ids)] : undefined;
};

/** Spiral coordinates so the city grows outward from downtown (0,0). */
export function spiralCoord(n: number): [number, number] {
  if (n === 0) return [0, 0];
  let x = 0, y = 0, dx = 1, dy = 0, len = 1, steps = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    x += dx; y += dy; steps++;
    if (steps === len) { steps = 0; [dx, dy] = [-dy, dx]; if (++turns % 2 === 0) len++; }
  }
  return [x, y];
}

const BEHAVIOURS: [BehaviourKey, Behaviour, number][] = [
  // --- growth ---
  ['found', (c) => {
    const n = c.state.districts.length;
    // demand-driven: a new district is founded when the city runs out of room (no empty lots / homes nearly full)
    if (n > 3 && !c.rng.chance(c.pressure > 0.85 || c.emptyLots === 0 ? 0.6 : 0.03)) return null;
    const [gx, gy] = spiralCoord(n);
    const people: Person[] = [];
    const d = generateDistrict(c.gen, gx, gy, people);
    // new districts start as mostly construction sites
    for (const b of d.blocks) for (const lot of b.lots) if (lot.building && c.rng.chance(0.5)) {
      lot.building.floors = lot.building.floors.slice(0, 1); lot.building.underConstruction = true;
      for (const a of lot.building.floors[0]?.apartments ?? []) a.residentIds = a.residentIds.slice(0, 1);
    }
    const keep = new Set<string>();
    for (const b of d.blocks) for (const l of b.lots) for (const f of l.building?.floors ?? []) for (const a of f.apartments) a.residentIds.forEach((id) => keep.add(id));
    return act('district.founded', '🏙️', `A new district, ${d.name} (${d.kind}), was founded at grid ${gx},${gy}.`, { op: 'addDistrict', district: d, people: people.filter((p) => keep.has(p.id)) }, [d.id]);
  }, 1],
  ['build', (c) => {
    const empties = [...c.idx.blocks.values()].flatMap(({ district, block }) => block.lots.filter((l) => l.kind === 'empty' || l.kind === 'park' && c.rng.chance(0.05)).map((lot) => ({ district, block, lot })));
    if (!empties.length) return null;
    const { district, block, lot } = c.rng.pick(empties);
    const people: Person[] = [];
    const b = generateBuilding(c.gen, c.rng, c.rng.chance(0.7) ? 'tower' : 'shop', district.kind, people, 0);
    b.underConstruction = true;
    return act('lot.construction_started', '🏗️', `👷 Crews broke ground on ${b.name} in ${district.name}; ${b.plannedFloors} floors planned.`,
      { op: 'setLot', districtId: district.id, blockId: block.id, lot: { ...lot, kind: 'tower', building: b } }, [district.id, block.id, b.id]);
  }, 3],
  ['build', (c) => {
    const sites = [...c.idx.buildings.values()].filter((r) => r.building.underConstruction);
    if (!sites.length) return null;
    const { district, building } = c.rng.pick(sites);
    if (building.floors.length >= building.plannedFloors)
      return act('building.completed', '🎉', `${building.name} in ${district.name} is complete at ${building.floors.length} floors!`, { op: 'completeBuilding', buildingId: building.id }, [district.id, building.id]);
    const w = c.state.world!;
    if (!has(w, FLOOR_COST)) return c.rng.chance(0.2)
      ? act('building.stalled', '🚧', `🚧 Work on ${building.name} stalled: the city is out of ${Object.keys(FLOOR_COST).join('')}. Someone needs to fire more bricks.`, { op: 'none' }, [district.id, building.id])
      : null;
    const people: Person[] = [];
    const floor = generateFloor(c.gen, c.rng, building.floors.length, people);
    for (const a of floor.apartments) { a.residentIds = []; a.items = []; a.pets = []; a.lightsOn = false; }
    const nw = clone(w); spend(nw, FLOOR_COST);
    return act('building.floor_added', '🧱', `🏗️ Floor ${floor.index + 1} of ${building.name} topped out (${floor.apartments.length} apartments), built from ${Object.entries(FLOOR_COST).map(([e, q]) => `${e}×${q}`).join(' ')}.`,
      { op: 'batch', patches: [{ op: 'addFloor', buildingId: building.id, floor }, { op: 'setWorld', world: nw }] }, [district.id, building.id]);
  }, 8],
  // --- people ---
  ['immigrate', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length === 0); if (!ref) return null;
    const apt = clone(ref.apartment);
    const p = generatePerson(c.gen, c.rng, { homeId: apt.id, minAge: 18 });
    apt.residentIds.push(p.id); apt.lightsOn = true;
    apt.items.push(generateItem(c.gen, c.rng, p.id));
    return act('person.moved_in', p.emoji, `${p.emoji} ${p.name} (${p.age}) moved into apartment ${apt.number} at ${ref.building.name}, bringing a ${apt.items.at(-1)!.label} ${apt.items.at(-1)!.emoji}.`,
      { op: 'batch', patches: [{ op: 'upsertPerson', person: p }, { op: 'setApartment', apartment: apt }] }, [ref.building.id, apt.id, p.id], p.id, apt.id);
  }, 6],
  ['family', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length >= 2 && a.residentIds.length < 6); if (!ref) return null;
    const apt = clone(ref.apartment);
    const baby = generatePerson(c.gen, c.rng, { homeId: apt.id }); baby.age = 0; baby.emoji = '👶'; baby.job = undefined;
    apt.residentIds.push(baby.id);
    return act('person.born', '👶', `👶 ${baby.name} was born in apartment ${apt.number}, ${ref.building.name}. 🎉`, { op: 'batch', patches: [{ op: 'upsertPerson', person: baby }, { op: 'setApartment', apartment: apt }] }, [ref.building.id, apt.id, baby.id], baby.id);
  }, 1],
  ['economy', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length > 0); if (!ref) return null;
    const apt = clone(ref.apartment);
    const ownerId = c.rng.pick(apt.residentIds); const owner = c.state.people[ownerId];
    const item = generateItem(c.gen, c.rng, ownerId);
    apt.items.push(item); if (apt.items.length > 14) apt.items.shift();
    return act('person.bought', item.emoji, `🛍️ ${owner?.name ?? 'Someone'} bought a ${item.label} ${item.emoji} for apartment ${apt.number}.`, { op: 'setApartment', apartment: apt }, [ref.building.id, apt.id, item.id], ownerId, item.id);
  }, 10],
  ['family', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length > 0 && a.pets.length < 3); if (!ref) return null;
    const apt = clone(ref.apartment); const ownerId = c.rng.pick(apt.residentIds);
    const pet = generatePet(c.rng, ownerId); apt.pets.push(pet);
    return act('person.adopted_pet', pet.emoji, `${pet.emoji} ${c.state.people[ownerId]?.name ?? 'A resident'} adopted ${pet.name} in ${ref.building.name}.`, { op: 'setApartment', apartment: apt }, [ref.building.id, apt.id, pet.id], ownerId, pet.id);
  }, 2],
  ['leisure', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length > 0); if (!ref) return null;
    const apt = clone(ref.apartment); apt.lightsOn = !apt.lightsOn;
    const p = c.state.people[apt.residentIds[0]!];
    return act(apt.lightsOn ? 'person.woke' : 'person.slept', apt.lightsOn ? '💡' : '💤',
      apt.lightsOn ? `💡 Lights on in ${apt.number}, ${ref.building.name}: ${p?.name ?? 'someone'} is up.` : `💤 ${p?.name ?? 'Someone'} turned in for the night in ${apt.number}.`,
      { op: 'setApartment', apartment: apt }, [ref.building.id, apt.id], p?.id);
  }, 6],
  ['economy', (c) => {
    const p = pickPerson(c); if (!p || p.age < 18 || p.workId) return null;
    const work = [...c.idx.buildings.values()].filter((b) => !b.building.underConstruction && b.lot.kind !== 'house');
    if (!work.length) return null;
    const w = c.rng.pick(work); const worker = c.rng.pick(emojisWithRole('worker'));
    const np = { ...p, workId: w.building.id, job: worker.name, emoji: worker.glyph, money: p.money + 500 };
    return act('person.got_job', worker.glyph, `💼 ${p.name} got a job as ${worker.name} at ${w.building.name}.`, { op: 'upsertPerson', person: np }, [w.building.id, p.id], p.id, w.building.id);
  }, 3],
  ['economy', (c) => {
    const p = pickPerson(c); if (!p?.workId) return null;
    const w = c.idx.buildings.get(p.workId); const v = c.rng.pick([...emojisWithRole('vehicle'), ...emojisWithRole('transit')]);
    return act('person.commuted', v.glyph, `${v.glyph} ${p.name} commuted by ${v.name} to ${w?.building.name ?? 'work'}.`, { op: 'none' }, [p.workId, p.id], p.id);
  }, 5],
  ['leisure', (c) => {
    const p = pickPerson(c); if (!p) return null;
    const h = c.rng.pick([...emojisWithRole('hobby'), ...emojisWithRole('sport'), ...emojisWithRole('music')]);
    return act('person.hobby', h.glyph, `${h.glyph} ${p.name} spent an hour on ${h.name}.`, { op: 'upsertPerson', person: { ...p, mood: Math.min(1, p.mood + 0.1) } }, [p.id], p.id);
  }, 4],
  ['leisure', (c) => {
    const p = pickPerson(c); if (!p) return null;
    const e = c.rng.pick(emojisWithRole('event'));
    return act('person.celebrated', e.glyph, `${e.glyph} ${p.name} had a moment: ${e.name}.`, { op: 'none' }, [p.id], p.id);
  }, 2],
  ['immigrate', (c) => {
    const ref = pickApartment(c, (a) => a.residentIds.length > 0); if (!ref || !c.rng.chance(0.15 + 0.4 * (1 - c.avgMood))) return null;
    const apt = clone(ref.apartment); const leaverId = apt.residentIds.pop()!; const leaver = c.state.people[leaverId];
    if (!apt.residentIds.length) apt.lightsOn = false;
    return act('person.moved_out', '📦', `📦 ${leaver?.name ?? 'A resident'} moved out of ${apt.number}, ${ref.building.name}.`, { op: 'batch', patches: [{ op: 'removePerson', personId: leaverId }, { op: 'setApartment', apartment: apt }] }, [ref.building.id, apt.id], leaverId);
  }, 2],
  // --- streets & sky ---
  ['streets', (c) => {
    const blocks = [...c.idx.blocks.values()]; if (!blocks.length) return null;
    const { district, block } = c.rng.pick(blocks);
    const street = generateStreet(Rng.at(c.gen.seed, 'street', block.id, c.gen.tick), district.kind, LAYOUT.lotsPerBlock);
    const v = street.find((s) => s.kind === 'vehicle');
    return act('vehicle.arrived', v?.emoji ?? '🚗', `${v?.emoji ?? '🚗'} Traffic shifted on ${district.name} street #${block.x + 1}.`, { op: 'setStreet', blockId: block.id, street }, [district.id, block.id]);
  }, 4],
  ['streets', (c) => {
    if (!c.rng.chance(0.15)) return null;
    const weather = c.rng.pick(['☀️', '☁️', '🌧️', '⛈️', '🌈', '❄️', '🌙']);
    const sky = Array.from({ length: c.rng.int(4, 12) }, () => {
      const e = c.rng.pick(emojisWithRole('sky').concat(emojisWithRole('aircraft')));
      return { id: c.rng.id('sky'), emoji: e.glyph };
    });
    return act('weather.changed', weather, `${weather} The weather over the city turned to ${emojiInfo(weather)?.name ?? weather}.`, { op: 'setWeather', weather, sky }, []);
  }, 1],
];

/** Create the very first city state. Called once, the first time the server ever boots. */
export function createInitialCity(seed: string, now: string): CityState {
  const state: CityState = {
    seed, name: 'Xero Emoji World', tick: 0, startedAt: now, districts: [], people: {}, sky: [{ id: 'sky_sun', emoji: '☀️' }], weather: '☀️',
    stats: { population: 0, buildings: 0, apartments: 0, items: 0, actions: 0 },
  };
  // Seed the core: downtown plus its ring, fully generated (the city "exists" when turned on).
  for (let n = 0; n < 5; n++) {
    const [gx, gy] = spiralCoord(n); const people: Person[] = [];
    state.districts.push(generateDistrict({ seed, tick: 0 }, gx, gy, people));
    for (const p of people) state.people[p.id] = p;
  }
  recomputeStats(state, indexCity(state));
  return state;
}

/** Measure the pressures that make growth demand-driven rather than purely random. */
export function measure(state: CityState, idx: CityIndex) {
  let emptyLots = 0, mood = 0;
  for (const { block } of idx.blocks.values()) for (const l of block.lots) if (l.kind === 'empty') emptyLots++;
  const people = Object.values(state.people); for (const p of people) mood += p.mood;
  return { pressure: idx.apartments.size ? people.length / (idx.apartments.size * 2) : 1, emptyLots, avgMood: people.length ? mood / people.length : 0.5 };
}

export interface StepOptions {
  actionsPerTick: number; now: string;
  /** A decree from an oracle, applied first this tick (sanitised inside). */
  decree?: { decree: Decree; source: 'oracle' | 'local'; oracle: string };
}

/** Advance one tick. Mutates `state`/`idx` and returns the actions in order. */
export function step(state: CityState, idx: CityIndex, opts: StepOptions): CityAction[] {
  const tick = state.tick + 1;
  const rng = Rng.at(state.seed, 'tick', tick);
  const w = ensureWorld(state);
  const c: SimContext = { state, idx, rng, gen: { seed: state.seed, tick }, now: opts.now, ...measure(state, idx) };
  const out: CityAction[] = [];
  const emit = (res: Omit<CityAction, 'id' | 'tick' | 'at'> | null) => {
    if (!res) return;
    const a: CityAction = { ...res, id: `act_${tick}_${out.length}`, tick, at: opts.now };
    // Apply a deep copy: the emitted action must stay immutable, otherwise later patches in the
    // same tick (e.g. addFloor on a building created by setLot) would mutate an already-emitted
    // patch and clients replaying the stream would double-apply them (lockstep divergence).
    applyAction(state, idx, structuredClone(a)); out.push(a);
  };
  if (opts.decree) emit(decreeAction(c, opts.decree.decree, opts.decree.source, opts.decree.oracle));
  if (tick % HARVEST_TICKS === 0) emit(harvestAction(c));
  const all = [...BEHAVIOURS, ...WORLD_BEHAVIOURS];
  const weighted = all.map(([k, b, base]) => [b, base * (state.world?.boosts[k] ?? 1) * dynamicWeight(k, c)] as [Behaviour, number]).filter(([, wt]) => wt > 0);
  // compounding activity: a more advanced world simply does more per tick (capped)
  const n = rng.int(1, opts.actionsPerTick) + Math.min(opts.actionsPerTick * 2, w.era);
  const start = out.length;
  for (let i = 0; i < n * 3 && out.length - start < n; i++) emit(rng.weighted(weighted)(c));
  state.tick = tick;
  recomputeStats(state, idx);
  return out;
}
