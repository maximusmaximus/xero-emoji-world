/**
 * Procedural generator. Pure & deterministic: same (seed, coords, tick) => same output.
 * The simulation uses it to create new districts/buildings/people as the city grows.
 */
import { emojisWithRole, type EmojiRole } from './emoji-catalog.js';
import { buildingName, districtName, personName, petName } from './names.js';
import { Rng } from './rng.js';
import type {
  Apartment, Block, Building, District, DistrictKind, Floor, Item, Lot, LotKind, Person, Pet, StreetThing,
} from './types.js';

export const LAYOUT = {
  blocksPerDistrict: 4,
  lotsPerBlock: 6,
  maxFloors: { downtown: 40, tech: 32, residential: 14, waterfront: 18, oldtown: 6, industrial: 5, parkland: 3 } as Record<DistrictKind, number>,
  apartmentsPerFloor: [2, 5] as [number, number],
} as const;

const glyph = (r: Rng, role: EmojiRole) => r.pick(emojisWithRole(role)).glyph;

const LOT_WEIGHTS: Record<DistrictKind, [LotKind, number][]> = {
  downtown:    [['tower', 7], ['shop', 2], ['civic', 1], ['landmark', 0.5], ['park', 0.5]],
  tech:        [['tower', 6], ['shop', 1], ['park', 1], ['landmark', 0.3]],
  residential: [['tower', 4], ['house', 3], ['shop', 1], ['park', 1], ['civic', 0.6]],
  waterfront:  [['tower', 3], ['shop', 1], ['park', 1], ['landmark', 0.6]],
  oldtown:     [['house', 4], ['civic', 1.5], ['shop', 2], ['landmark', 0.6]],
  industrial:  [['tower', 2], ['shop', 1], ['empty', 1]],
  parkland:    [['park', 5], ['house', 1], ['landmark', 0.5]],
};

export interface GenContext { seed: string; tick: number; }

export function generatePerson(ctx: GenContext, r: Rng, opts: { homeId?: string; minAge?: number } = {}): Person {
  const age = r.int(opts.minAge ?? 0, 92);
  const role: EmojiRole = age >= 20 && age < 68 && r.chance(0.55) ? 'worker' : 'resident';
  let pool = emojisWithRole(role);
  if (age < 4) pool = pool.filter((e) => e.name === 'baby');
  else if (age < 14) pool = emojisWithRole('resident').filter((e) => /child|boy|girl/.test(e.name));
  else if (age > 70) pool = emojisWithRole('resident').filter((e) => /old|older/.test(e.name));
  const e = r.pick(pool.length ? pool : emojisWithRole('resident'));
  return {
    id: r.id('psn'), kind: 'person', emoji: e.glyph, name: personName(r), age,
    job: role === 'worker' ? e.name : undefined, homeId: opts.homeId, mood: r.next(),
    money: r.int(10, 5000), petIds: [],
  };
}

export function generateItem(ctx: GenContext, r: Rng, ownerId?: string): Item {
  const role = r.weighted<EmojiRole>([['furniture', 4], ['appliance', 3], ['gadget', 3], ['decor', 2], ['book', 2],
    ['clothing', 2], ['toy', 1], ['music', 1], ['hobby', 1], ['plant', 1], ['food', 2], ['drink', 1], ['tool', 1], ['sport', 1]]);
  const e = r.pick(emojisWithRole(role));
  return { id: r.id('itm'), kind: 'item', emoji: e.glyph, label: e.name, ownerId, boughtAtTick: ctx.tick };
}

export function generatePet(r: Rng, ownerId?: string): Pet {
  return { id: r.id('pet'), kind: 'pet', emoji: glyph(r, 'pet'), name: petName(r), ownerId };
}

export function generateApartment(ctx: GenContext, r: Rng, floorIdx: number, unit: number, people: Person[]): Apartment {
  const id = r.id('apt');
  const residents: Person[] = [];
  if (r.chance(0.82)) {
    const n = r.int(1, 4);
    for (let i = 0; i < n; i++) residents.push(generatePerson(ctx, r, { homeId: id, minAge: i === 0 ? 18 : 0 }));
  }
  const items: Item[] = [];
  const nItems = residents.length ? r.int(2, 7) : r.int(0, 2);
  for (let i = 0; i < nItems; i++) items.push(generateItem(ctx, r, residents[0]?.id));
  const pets: Pet[] = [];
  if (residents.length && r.chance(0.35)) { const p = generatePet(r, residents[0]!.id); pets.push(p); residents[0]!.petIds.push(p.id); }
  people.push(...residents);
  return {
    id, kind: 'apartment', emoji: '🚪', number: `${floorIdx + 1}${String.fromCharCode(65 + unit)}`,
    residentIds: residents.map((p) => p.id), items, pets, lightsOn: r.chance(0.6),
  };
}

export function generateFloor(ctx: GenContext, r: Rng, index: number, people: Person[]): Floor {
  const n = r.int(...LAYOUT.apartmentsPerFloor);
  return { index, apartments: Array.from({ length: n }, (_, u) => generateApartment(ctx, r, index, u, people)) };
}

export function generateBuilding(ctx: GenContext, r: Rng, kind: LotKind, dk: DistrictKind, people: Person[], floorsNow?: number): Building {
  const role: EmojiRole = kind === 'tower' ? 'tower' : kind === 'house' ? 'house' : kind === 'civic' ? 'civic'
    : kind === 'shop' ? 'shop' : kind === 'landmark' ? 'landmark' : 'construction';
  const max = LAYOUT.maxFloors[dk];
  const planned = kind === 'tower' ? r.int(Math.max(4, Math.floor(max / 3)), max) : kind === 'house' ? r.int(1, 3) : r.int(1, 5);
  const built = Math.min(planned, floorsNow ?? planned);
  const floors: Floor[] = [];
  for (let f = 0; f < built; f++) floors.push(generateFloor(ctx, r, f, people));
  return {
    id: r.id('bld'), kind: 'building', lotKind: kind, emoji: glyph(r, role), name: buildingName(r),
    floors, plannedFloors: planned, underConstruction: built < planned, builtAtTick: ctx.tick,
  };
}

export function generateStreet(r: Rng, dk: DistrictKind, width: number): StreetThing[] {
  const out: StreetThing[] = [];
  const n = Math.floor(width * (dk === 'downtown' ? 0.6 : 0.35));
  for (let i = 0; i < n; i++) {
    const kind = r.weighted<StreetThing['kind']>([['vehicle', 4], ['tree', dk === 'parkland' ? 5 : 2], ['flower', 1], ['decor', 1], ['walker', 3]]);
    const role: EmojiRole = kind === 'vehicle' ? (dk === 'waterfront' && r.chance(0.3) ? 'boat' : 'vehicle')
      : kind === 'tree' ? 'tree' : kind === 'flower' ? 'flower' : kind === 'decor' ? 'road' : 'resident';
    out.push({ id: r.id('st'), kind, emoji: glyph(r, role), x: r.next() * width });
  }
  return out.sort((a, b) => a.x - b.x);
}

export function generateLot(ctx: GenContext, r: Rng, index: number, dk: DistrictKind, people: Person[], forceKind?: LotKind): Lot {
  const kind = forceKind ?? r.weighted(LOT_WEIGHTS[dk]);
  const lot: Lot = { id: r.id('lot'), index, kind, ground: [] };
  if (kind === 'park') {
    const n = r.int(3, 8);
    for (let i = 0; i < n; i++) {
      const k = r.weighted<StreetThing['kind']>([['tree', 4], ['flower', 3], ['walker', 2], ['decor', 1]]);
      const role: EmojiRole = k === 'tree' ? 'tree' : k === 'flower' ? 'flower' : k === 'walker' ? 'resident' : 'decor';
      lot.ground.push({ id: r.id('gnd'), kind: k, emoji: glyph(r, role), x: r.next() });
    }
  } else if (kind !== 'empty') {
    lot.building = generateBuilding(ctx, r, kind, dk, people);
  }
  return lot;
}

export function districtKindFor(seed: string, gx: number, gy: number): DistrictKind {
  if (gx === 0 && gy === 0) return 'downtown';
  const r = Rng.at(seed, 'dkind', gx, gy);
  const dist = Math.hypot(gx, gy);
  return r.weighted<DistrictKind>([
    ['downtown', Math.max(0.2, 3 - dist)], ['tech', 1.5], ['residential', 4], ['waterfront', gy < 0 ? 3 : 0.5],
    ['oldtown', 1], ['industrial', dist > 2 ? 2 : 0.3], ['parkland', 1],
  ]);
}

/**
 * Generate a full district. `people` is an out-param collecting every generated person.
 * Determinism: depends only on (seed, gx, gy, tick).
 */
export function generateDistrict(ctx: GenContext, gx: number, gy: number, people: Person[]): District {
  const r = Rng.at(ctx.seed, 'district', gx, gy, ctx.tick);
  const kind = districtKindFor(ctx.seed, gx, gy);
  const blocks: Block[] = [];
  for (let b = 0; b < LAYOUT.blocksPerDistrict; b++) {
    const lots = Array.from({ length: LAYOUT.lotsPerBlock }, (_, i) => generateLot(ctx, r, i, kind, people));
    blocks.push({ id: r.id('blk'), x: b, y: 0, lots, street: generateStreet(r, kind, LAYOUT.lotsPerBlock) });
  }
  return { id: r.id('dst'), name: districtName(r), kind, gx, gy, blocks, foundedAtTick: ctx.tick };
}
