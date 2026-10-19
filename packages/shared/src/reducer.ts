/**
 * Shared state reducer: the ONLY way state changes. Server and client both apply
 * the same CityAction.patch, which keeps the browser in lockstep with the sim.
 */
import type { Apartment, Block, Building, CityAction, CityState, District, Lot, StatePatch } from './types.js';

export interface CityIndex {
  districts: Map<string, District>;
  blocks: Map<string, { district: District; block: Block }>;
  buildings: Map<string, { district: District; block: Block; lot: Lot; building: Building }>;
  apartments: Map<string, { building: Building; floor: number; apartment: Apartment }>;
}

export function indexCity(state: CityState): CityIndex {
  const idx: CityIndex = { districts: new Map(), blocks: new Map(), buildings: new Map(), apartments: new Map() };
  for (const d of state.districts) {
    idx.districts.set(d.id, d);
    for (const b of d.blocks) {
      idx.blocks.set(b.id, { district: d, block: b });
      for (const lot of b.lots) if (lot.building) indexBuilding(idx, d, b, lot, lot.building);
    }
  }
  return idx;
}

function indexBuilding(idx: CityIndex, district: District, block: Block, lot: Lot, building: Building) {
  idx.buildings.set(building.id, { district, block, lot, building });
  for (const f of building.floors) for (const a of f.apartments) idx.apartments.set(a.id, { building, floor: f.index, apartment: a });
}

export function recomputeStats(state: CityState, idx: CityIndex): void {
  let items = 0;
  for (const { apartment } of idx.apartments.values()) items += apartment.items.length;
  state.stats.population = Object.keys(state.people).length;
  state.stats.buildings = idx.buildings.size;
  state.stats.apartments = idx.apartments.size;
  state.stats.items = items;
}

export function applyPatch(state: CityState, idx: CityIndex, p: StatePatch): void {
  switch (p.op) {
    case 'addDistrict': {
      state.districts.push(p.district);
      for (const person of p.people) state.people[person.id] = person;
      idx.districts.set(p.district.id, p.district);
      for (const b of p.district.blocks) {
        idx.blocks.set(b.id, { district: p.district, block: b });
        for (const lot of b.lots) if (lot.building) indexBuilding(idx, p.district, b, lot, lot.building);
      }
      break;
    }
    case 'setLot': {
      const ref = idx.blocks.get(p.blockId); if (!ref) return;
      const i = ref.block.lots.findIndex((l) => l.index === p.lot.index);
      const old = ref.block.lots[i];
      if (old?.building) idx.buildings.delete(old.building.id);
      if (i >= 0) ref.block.lots[i] = p.lot; else ref.block.lots.push(p.lot);
      if (p.lot.building) indexBuilding(idx, ref.district, ref.block, p.lot, p.lot.building);
      break;
    }
    case 'addFloor': {
      const ref = idx.buildings.get(p.buildingId); if (!ref) return;
      ref.building.floors.push(p.floor);
      for (const a of p.floor.apartments) idx.apartments.set(a.id, { building: ref.building, floor: p.floor.index, apartment: a });
      break;
    }
    case 'completeBuilding': {
      const ref = idx.buildings.get(p.buildingId); if (ref) ref.building.underConstruction = false;
      break;
    }
    case 'upsertPerson': state.people[p.person.id] = p.person; break;
    case 'removePerson': delete state.people[p.personId]; break;
    case 'setApartment': {
      const ref = idx.apartments.get(p.apartment.id); if (!ref) return;
      const floor = ref.building.floors[ref.floor]; if (!floor) return;
      const i = floor.apartments.findIndex((a) => a.id === p.apartment.id);
      if (i >= 0) floor.apartments[i] = p.apartment;
      ref.apartment = p.apartment;
      break;
    }
    case 'setStreet': { const ref = idx.blocks.get(p.blockId); if (ref) ref.block.street = p.street; break; }
    case 'setWeather': state.weather = p.weather; state.sky = p.sky; break;
    case 'batch': for (const sub of p.patches) applyPatch(state, idx, sub); break;
    case 'none': break;
  }
}

export function applyAction(state: CityState, idx: CityIndex, a: CityAction): void {
  applyPatch(state, idx, a.patch);
  state.tick = Math.max(state.tick, a.tick);
  state.stats.actions++;
}
