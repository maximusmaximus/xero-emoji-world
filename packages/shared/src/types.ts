import type { WorldState } from './world.js';
/**
 * City domain model. Hierarchy:
 *   City -> District -> Block -> Lot -> Building -> Floor -> Apartment -> {Person, Item}
 * Plus street-level entities: vehicles, trees, pets, sky objects.
 * Every renderable thing has an `emoji` from EMOJI_CATALOG and a stable `id`.
 */

export type DistrictKind = 'downtown' | 'residential' | 'industrial' | 'waterfront' | 'parkland' | 'oldtown' | 'tech';
export type LotKind = 'tower' | 'house' | 'civic' | 'shop' | 'landmark' | 'park' | 'construction' | 'empty';

export interface Entity { id: string; emoji: string; }

export interface Person extends Entity {
  kind: 'person';
  name: string;
  age: number;
  job?: string;
  homeId?: string;      // apartment id
  workId?: string;      // building id
  mood: number;         // 0..1
  money: number;
  petIds: string[];
}

export interface Item extends Entity { kind: 'item'; label: string; ownerId?: string; boughtAtTick: number; }
export interface Pet extends Entity { kind: 'pet'; name: string; ownerId?: string; }

export interface Apartment extends Entity {
  kind: 'apartment';
  number: string;         // e.g. "12B"
  residentIds: string[];
  items: Item[];
  pets: Pet[];
  lightsOn: boolean;
}

export interface Floor { index: number; apartments: Apartment[]; }

export interface Building extends Entity {
  kind: 'building';
  lotKind: LotKind;
  name: string;
  floors: Floor[];
  /** Target height; construction adds floors until reached. */
  plannedFloors: number;
  underConstruction: boolean;
  builtAtTick: number;
}

export interface StreetThing extends Entity { kind: 'vehicle' | 'tree' | 'flower' | 'decor' | 'walker'; x: number; }

export interface Lot { id: string; index: number; kind: LotKind; building?: Building; ground: StreetThing[]; }
export interface Block { id: string; x: number; y: number; lots: Lot[]; street: StreetThing[]; }
export interface District { id: string; name: string; kind: DistrictKind; gx: number; gy: number; blocks: Block[]; foundedAtTick: number; }

export interface CityState {
  seed: string;
  name: string;
  tick: number;
  startedAt: string;       // ISO, when this city instance first booted
  districts: District[];
  people: Record<string, Person>;
  sky: Entity[];
  weather: string;
  stats: { population: number; buildings: number; apartments: number; items: number; actions: number };
  /** Emoji-alchemy / oracle layer. Optional only so old snapshots still load (see ensureWorld). */
  world?: WorldState;
}

/** Everything that happens is an Action. Actions are the unit stored in the vector DB. */
export type ActionType =
  | 'district.founded' | 'lot.construction_started' | 'building.floor_added' | 'building.completed'
  | 'person.born' | 'person.moved_in' | 'person.moved_out' | 'person.got_job' | 'person.bought'
  | 'person.adopted_pet' | 'person.commuted' | 'person.slept' | 'person.woke' | 'person.married'
  | 'person.celebrated' | 'person.hobby' | 'vehicle.arrived' | 'vehicle.departed' | 'tree.planted'
  | 'weather.changed' | 'city.event' | 'apartment.lights'
  | 'world.harvest' | 'world.discovery' | 'world.crafted' | 'world.decree' | 'world.wonder_progress' | 'world.wonder_built' | 'world.era' | 'building.stalled';

export interface CityAction {
  id: string;
  tick: number;
  at: string;              // ISO timestamp
  type: ActionType;
  emoji: string;           // primary emoji for the life-story line
  actorId?: string;
  targetId?: string;
  /** Path of ids from district down to the most specific entity, for zoom/highlight. */
  path: string[];
  /** Human readable life-story sentence. Also the text that gets embedded. */
  text: string;
  /** Minimal JSON patch describing the state change (applied identically on client + server). */
  patch: StatePatch;
}

export type StatePatch =
  | { op: 'addDistrict'; district: District; people: Person[] }
  | { op: 'setLot'; districtId: string; blockId: string; lot: Lot }
  | { op: 'addFloor'; buildingId: string; floor: Floor }
  | { op: 'completeBuilding'; buildingId: string }
  | { op: 'upsertPerson'; person: Person }
  | { op: 'removePerson'; personId: string }
  | { op: 'setApartment'; apartment: Apartment }
  | { op: 'setStreet'; blockId: string; street: StreetThing[] }
  | { op: 'setWeather'; weather: string; sky: Entity[] }
  | { op: 'setWorld'; world: WorldState }
  | { op: 'batch'; patches: StatePatch[] }
  | { op: 'none' };
