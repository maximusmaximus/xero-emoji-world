/** Flatten city state into embeddable entity documents (buildings, apartments, people). */
import type { CityState, CityIndex } from '@xew/shared';
import type { EntityDoc } from './store/vector-store.js';

export function entityDocs(state: CityState, idx: CityIndex, onlyIds?: Set<string>): EntityDoc[] {
  const docs: EntityDoc[] = [];
  const want = (id: string) => !onlyIds || onlyIds.has(id);
  for (const { district, building } of idx.buildings.values()) if (want(building.id))
    docs.push({ id: building.id, kind: 'building', emoji: building.emoji,
      text: `${building.emoji} ${building.name}, a ${building.lotKind} in ${district.name} (${district.kind}), ${building.floors.length}/${building.plannedFloors} floors${building.underConstruction ? ', under construction' : ''}`,
      data: { name: building.name, districtId: district.id, floors: building.floors.length, planned: building.plannedFloors } });
  for (const { building, apartment } of idx.apartments.values()) if (want(apartment.id))
    docs.push({ id: apartment.id, kind: 'apartment', emoji: '🚪',
      text: `Apartment ${apartment.number} at ${building.name}: residents ${apartment.residentIds.map((r) => state.people[r]?.name).join(', ') || 'none'}; things ${apartment.items.map((i) => i.emoji + ' ' + i.label).join(', ')}; pets ${apartment.pets.map((p) => p.emoji + ' ' + p.name).join(', ') || 'none'}`,
      data: apartment });
  for (const p of Object.values(state.people)) if (want(p.id))
    docs.push({ id: p.id, kind: 'person', emoji: p.emoji, text: `${p.emoji} ${p.name}, age ${p.age}${p.job ? ', ' + p.job : ''}`, data: p });
  return docs;
}
