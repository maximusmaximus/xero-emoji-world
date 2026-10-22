import type { City } from "./sim";

export type Milestone = {
  id: string;
  tick: number;
  era: string;
  title: string;
  summary: string;
  at: string;
  city: City;
};

const MAX = 24;
const TICK_GAP = 160;
const KEY = "xero-emoji-milestones";

export function milestoneReason(prev: City | null, next: City): string | null {
  if (!prev) return next.tick > 40 ? "As it stands" : "Founding";
  if (next.era !== prev.era) return `Became ${next.era}`;
  const kinds = new Set(prev.buildings.map((building) => building.kind));
  const fresh = next.buildings.find((building) => !kinds.has(building.kind));
  if (fresh) return `First ${fresh.kind}`;
  if (next.buildings.length >= prev.buildings.length + 3) return `${next.buildings.length} buildings`;
  if ((next.cols || 0) > (prev.cols || 0) || (next.rows || 0) > (prev.rows || 0)) return `Map ${next.cols}×${next.rows}`;
  if (next.tick >= prev.tick + TICK_GAP) return `Tick ${next.tick}`;
  return null;
}

function slim(city: City): City {
  return {
    ...city,
    beats: city.beats.slice(0, 3),
    plans: city.plans?.filter((plan) => !plan.used).slice(0, 4),
    buildings: city.buildings.map((building) => ({
      ...building,
      apartments: (building.apartments ?? []).map((floor) => ({
        ...floor,
        residents: (floor.residents ?? []).slice(0, 2),
      })),
    })),
  };
}

export function makeMilestone(city: City, title: string, at = new Date().toISOString()): Milestone {
  const snap = slim(city);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return {
    id: `m-${snap.tick}-${slug || "mark"}`,
    tick: snap.tick,
    era: snap.era,
    title,
    summary: `${snap.buildings.length} buildings · ${snap.cols}×${snap.rows}`,
    at,
    city: snap,
  };
}

export function thinMilestones(history: Milestone[], max = MAX): Milestone[] {
  const sorted = [...history].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  if (sorted.length <= max) return sorted;
  const keep = new Set<string>();
  keep.add(sorted[0]!.id);
  keep.add(sorted[sorted.length - 1]!.id);
  for (const item of sorted) {
    if (item.title === "Founding" || item.title.startsWith("Became")) keep.add(item.id);
  }
  const rest = sorted.filter((item) => !keep.has(item.id));
  const room = Math.max(0, max - keep.size);
  const step = rest.length / Math.max(1, room);
  for (let i = 0; i < room; i += 1) keep.add(rest[Math.min(rest.length - 1, Math.floor(i * step))]!.id);
  return sorted.filter((item) => keep.has(item.id)).slice(-max);
}

export function recordMilestone(history: Milestone[], city: City, at?: string): Milestone[] {
  const prev = history.length ? history[history.length - 1]!.city : null;
  const title = milestoneReason(prev, city);
  if (!title) return history;
  if (history.some((item) => item.tick === city.tick && item.title === title)) return history;
  return thinMilestones([...history, makeMilestone(city, title, at)]);
}

export function cityAt(history: Milestone[], tick: number): City | null {
  let found: Milestone | null = null;
  for (const item of history) {
    if (item.tick <= tick && (!found || item.tick > found.tick)) found = item;
  }
  return found?.city ?? null;
}

export function mergeMilestones(lists: Milestone[][]): Milestone[] {
  const byId = new Map<string, Milestone>();
  for (const list of lists) {
    for (const item of list) {
      if (!item?.city || !Array.isArray(item.city.buildings) || item.tick < 0) continue;
      byId.set(item.id, item);
    }
  }
  return thinMilestones([...byId.values()]);
}

export function loadLocalMilestones(): Milestone[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Milestone[];
    return Array.isArray(parsed) ? mergeMilestones([parsed]) : [];
  } catch {
    return [];
  }
}

export function saveLocalMilestones(history: Milestone[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    /* private mode or a full disk */
  }
}
