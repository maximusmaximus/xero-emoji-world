import { DISTINCT_BODIES } from "./catalog.ts";
import { isCoat, pickCoat, type CoatName } from "./coats.ts";

export const CITY_VERSION = 2;

export type Role = "person" | "pet" | "item";
export type Kind = "hut" | "farmhouse" | "house" | "store" | "gas" | "school" | "hospital" | "block" | "tower" | "skyscraper";
export type Era = "camp" | "farm" | "roads" | "town" | "city" | "skyline";
export type Task = "raise" | "pave" | "tend" | "visit" | "study" | "haul" | "enter";
export type Goods = "timber" | "grain" | "brick" | "steel" | "glass" | "tools";
export type Stock = Record<Goods, number>;

export type Works = {
  id: string;
  kind: "yard" | "mill" | "kiln" | "factory" | "shop";
  emoji: string;
  name: string;
  col: number;
  row: number;
  goods: Goods;
};

export type Infra = {
  id: string;
  emoji: string;
  name: string;
  col: number;
  row: number;
  kind: "well" | "lamp" | "pipe" | "power";
};

export type Resident = {
  id: string;
  name: string;
  emoji: string;
  role: Role;
};

export type Apartment = {
  id: string;
  floor: number;
  lit: boolean;
  residents: Resident[];
};

export type Building = {
  id: string;
  name: string;
  col: number;
  row: number;
  material: number;
  kind: Kind;
  targetFloors: number;
  rising: boolean;
  apartments: Apartment[];
  /** Set only when the building is staked. Older buildings stay unpainted. */
  coat?: CoatName;
  mark?: string;
};

export type Farm = { col: number; row: number; growth: number };

export type Crew = {
  id: string;
  emoji: string;
  task: Task;
  name: string;
  col: number;
  row: number;
  destCol: number;
  destRow: number;
  progress: number;
  targetId: string;
  cargo?: string;
  /** Set when this crew stepped aside for someone else this tick. */
  yield?: string;
};

export type Vehicle = {
  id: string;
  emoji: string;
  name: string;
  col: number;
  row: number;
  destCol: number;
  destRow: number;
  progress: number;
  wait: number;
  lane: number;
};

export type Focus = {
  kind: Kind;
  note: string;
  notes?: Partial<Record<Kind, string>>;
};

export type Plan = {
  id: string;
  name: string;
  kind: Kind;
  emoji: string;
  note: string;
  used: boolean;
  coat?: CoatName;
  floors?: number;
};

export type Beat = {
  id: string;
  tick: number;
  emoji: string;
  text: string;
  subjectId: string;
  subjectName: string;
  place: string;
};

export type Alchemy = {
  knowledge: number;
  eraName: string;
  materials: Record<string, number>;
  recipes: { a: string; b: string; out: string; name: string; found?: number }[];
  wonder?: { emoji: string; name: string; cost: Record<string, number>; paid: Record<string, number>; built?: boolean };
  prophecy?: string;
  last?: string;
};

export type City = {
  version: typeof CITY_VERSION;
  seed: string;
  tick: number;
  era: Era;
  research: number;
  cols: number;
  rows: number;
  roads: string[];
  farms: Farm[];
  trees: string[];
  crews: Crew[];
  buildings: Building[];
  beats: Beat[];
  plans?: Plan[];
  watchers?: number;
  sophistication?: number;
  focus?: Focus;
  alchemy?: Alchemy;
  stock?: Stock;
  works?: Works[];
  infra?: Infra[];
  vehicles?: Vehicle[];
};

const ERA_ORDER: Era[] = ["camp", "farm", "roads", "town", "city", "skyline"];
const ERA_GOAL: Record<Era, number> = {
  camp: 48,
  farm: 140,
  roads: 260,
  town: 420,
  city: 620,
  skyline: 860,
};

const NAMES = [
  "Nia", "Jo", "Ren", "Sol", "Maru", "Ivo", "Tess", "Kip",
  "Ada", "Noor", "Leo", "Ves", "Quin", "Hana", "Otis", "Pia",
  "Bram", "Lux", "Cora", "Ned", "Yuki", "Sable", "Wren", "Ida",
];
const PEOPLE = DISTINCT_BODIES;
const PETS = ["🐈", "🐕", "🐇", "🐦", "🐹", "🐢", "🐄", "🐑", "🐖"];
const ITEMS = ["🍕", "🥖", "📚", "🪴", "🎸", "🚲", "🧸", "📺", "🪞", "🧺", "🪓", "🌾"];
const STEMS = [
  "Kindling", "Amber", "Glyph", "Moon", "Font", "Basin", "Spiral", "Neon",
  "Orchard", "Harbor", "Cedar", "Quartz", "Loom", "Signal", "Terrace", "Cinder",
  "Willow", "Market", "Kiln", "North",
];
const SUFFIX: Record<Kind, string> = {
  hut: "Camp",
  farmhouse: "Farm",
  house: "House",
  store: "Market",
  gas: "Fuel",
  school: "School",
  hospital: "Hospital",
  block: "Court",
  tower: "Tower",
  skyscraper: "Spire",
};

const CARGO: Record<Goods, string> = {
  timber: "🪵",
  grain: "🌾",
  brick: "🧱",
  steel: "⚙️",
  glass: "🪟",
  tools: "🔧",
};

const COST: Record<Kind, Partial<Stock>> = {
  hut: { timber: 1 },
  farmhouse: { timber: 1, grain: 1 },
  house: { timber: 1, brick: 1 },
  store: { timber: 1, brick: 1 },
  gas: { brick: 1, steel: 1 },
  school: { brick: 2, glass: 1 },
  hospital: { brick: 2, glass: 1, steel: 1 },
  block: { brick: 2, glass: 1 },
  tower: { brick: 1, steel: 1, glass: 1 },
  skyscraper: { steel: 2, glass: 1, tools: 1 },
};

const WORK_PLAN: { kind: Works["kind"]; emoji: string; name: string; goods: Goods; era: Era }[] = [
  { kind: "yard", emoji: "🪓", name: "Timber Yard", goods: "timber", era: "camp" },
  { kind: "mill", emoji: "🌾", name: "Grain Mill", goods: "grain", era: "farm" },
  { kind: "kiln", emoji: "🔥", name: "Brick Kiln", goods: "brick", era: "roads" },
  { kind: "factory", emoji: "🏭", name: "Steel Works", goods: "steel", era: "city" },
  { kind: "shop", emoji: "🛠️", name: "Tool Shop", goods: "tools", era: "town" },
];

function emptyStock(era: Era): Stock {
  const at = eraIndex(era);
  return {
    timber: 6,
    grain: at >= 1 ? 4 : 1,
    brick: at >= 2 ? 4 : 0,
    steel: at >= 4 ? 3 : 0,
    glass: at >= 3 ? 2 : 0,
    tools: at >= 4 ? 2 : 0,
  };
}

function takenCells(city: City) {
  return new Set([
    ...city.buildings.map((b) => keyOf(b.col, b.row)),
    ...city.farms.map((f) => keyOf(f.col, f.row)),
    ...(city.works ?? []).map((w) => keyOf(w.col, w.row)),
    ...(city.infra ?? []).map((item) => keyOf(item.col, item.row)),
    ...city.trees,
    ...city.roads,
  ]);
}

function openNear(city: City, originCol: number, originRow: number): [number, number] | null {
  const blocked = takenCells(city);
  for (let rad = 1; rad < 10; rad++) {
    for (let dc = -rad; dc <= rad; dc++) {
      for (let dr = -rad; dr <= rad; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const col = originCol + dc;
        const row = originRow + dr;
        if (col < 0 || row < 0 || col >= city.cols || row >= city.rows) continue;
        if (blocked.has(keyOf(col, row))) continue;
        return [col, row];
      }
    }
  }
  return null;
}

function withEconomy(city: City): City {
  const stock = city.stock ?? emptyStock(city.era);
  const works = [...(city.works ?? [])];
  const home = city.buildings[0];
  for (const plan of WORK_PLAN) {
    if (eraIndex(city.era) < eraIndex(plan.era)) continue;
    if (works.some((works) => works.kind === plan.kind)) continue;
    const spot = openNear({ ...city, works }, home?.col ?? 5, home?.row ?? 4);
    if (!spot) break;
    works.push({
      id: `works-${plan.kind}`,
      kind: plan.kind,
      emoji: plan.emoji,
      name: plan.name,
      col: spot[0],
      row: spot[1],
      goods: plan.goods,
    });
  }
  const infra = [...(city.infra ?? [])];
  if (!infra.some((item) => item.kind === "well")) {
    const spot = openNear({ ...city, works, infra }, home?.col ?? 5, (home?.row ?? 4) + 1);
    if (spot) infra.push({ id: "infra-well", emoji: "🪣", name: "Well", col: spot[0], row: spot[1], kind: "well" });
  }
  return { ...city, stock, works, infra };
}

function canPay(stock: Stock, cost: Partial<Stock>) {
  return (Object.keys(cost) as Goods[]).every((good) => stock[good] >= (cost[good] || 0));
}

function pay(stock: Stock, cost: Partial<Stock>): Stock {
  const next = { ...stock };
  for (const good of Object.keys(cost) as Goods[]) next[good] -= cost[good] || 0;
  return next;
}

function shortGood(stock: Stock, kind: Kind): Goods | null {
  const cost = COST[kind];
  return ((Object.keys(cost) as Goods[]).find((good) => stock[good] < (cost[good] || 0)) ?? null);
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function eraLabel(era: Era): string {
  if (era === "skyline") return "Skyline";
  if (era === "roads") return "Roads";
  return era.charAt(0).toUpperCase() + era.slice(1);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function keyOf(col: number, row: number) {
  return `${col},${row}`;
}

function eraIndex(era: Era) {
  return ERA_ORDER.indexOf(era);
}

function pushBeat(city: City, beat: Beat): City {
  return { ...city, beats: [beat, ...city.beats].slice(0, 18) };
}

function makeResident(rng: () => number, tick: number, n: number, role: Role): Resident {
  if (role === "pet") {
    return {
      id: `pet-${tick}-${n}`,
      name: pick(rng, ["Miso", "Pebble", "Nori", "Fig", "Soot", "Lumen", "Bramble"]),
      emoji: pick(rng, PETS),
      role,
    };
  }
  if (role === "item") {
    const emoji = pick(rng, ITEMS);
    return { id: `item-${tick}-${n}`, name: "kept thing", emoji, role };
  }
  return {
    id: `p-${tick}-${n}`,
    name: pick(rng, NAMES),
    emoji: pick(rng, PEOPLE),
    role: "person",
  };
}

function floorsFor(kind: Kind, rng: () => number) {
  if (kind === "gas") return 1;
  if (kind === "hut" || kind === "farmhouse" || kind === "store") return 2;
  if (kind === "school") return 3 + Math.floor(rng() * 2);
  if (kind === "hospital") return 4 + Math.floor(rng() * 2);
  if (kind === "house") return 3 + Math.floor(rng() * 2);
  if (kind === "block") return 5 + Math.floor(rng() * 2);
  if (kind === "tower") return 8 + Math.floor(rng() * 3);
  return 12 + Math.floor(rng() * 4);
}

function materialFor(kind: Kind, index: number) {
  if (kind === "skyscraper" || kind === "tower") return 3;
  if (kind === "farmhouse") return 1;
  return index % 4;
}

function buildingSet(city: City) {
  return new Set(city.buildings.map((b) => keyOf(b.col, b.row)));
}

function farmSet(city: City) {
  return new Set(city.farms.map((f) => keyOf(f.col, f.row)));
}

function claimed(city: City) {
  return new Set(city.crews.map((c) => keyOf(c.destCol, c.destRow)));
}

function nearBuilding(city: City, col: number, row: number, gap: number) {
  return city.buildings.some((b) => Math.max(Math.abs(b.col - col), Math.abs(b.row - row)) < gap);
}

function adjacentRoad(city: City, col: number, row: number) {
  const roads = new Set(city.roads);
  return DIRS.some(([dc, dr]) => roads.has(keyOf(col + dc, row + dr)));
}

function frontier(city: City): { col: number; row: number; eat: boolean }[] {
  const roads = new Set(city.roads);
  const blocked = buildingSet(city);
  const taken = claimed(city);
  const farms = farmSet(city);
  const wild: { col: number; row: number; eat: boolean }[] = [];
  const eat: { col: number; row: number; eat: boolean }[] = [];
  for (const key of city.roads) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= city.cols || nr >= city.rows) continue;
      const next = keyOf(nc, nr);
      if (roads.has(next) || blocked.has(next) || taken.has(next)) continue;
      if (farms.has(next)) eat.push({ col: nc, row: nr, eat: true });
      else wild.push({ col: nc, row: nr, eat: false });
    }
  }
  return wild.length > 0 ? wild : eat;
}

function findLot(city: City): [number, number] | null {
  const roads = new Set(city.roads);
  const farms = farmSet(city);
  const trees = new Set(city.trees);
  const spots: [number, number][] = [];
  for (let row = 0; row < city.rows; row++) {
    for (let col = 0; col < city.cols; col++) {
      const key = keyOf(col, row);
      if (roads.has(key) || farms.has(key) || trees.has(key)) continue;
      if (buildingSet(city).has(key)) continue;
      if (!adjacentRoad(city, col, row)) continue;
      if (nearBuilding(city, col, row, 1)) continue;
      spots.push([col, row]);
    }
  }
  return spots.length ? spots[Math.floor(spots.length / 2)]! : null;
}

function findFarmSpot(city: City): [number, number] | null {
  const roads = new Set(city.roads);
  const farms = farmSet(city);
  const blocked = buildingSet(city);
  const taken = claimed(city);
  const spots: [number, number][] = [];
  for (const key of city.roads) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= city.cols || nr >= city.rows) continue;
      const next = keyOf(nc, nr);
      if (roads.has(next) || farms.has(next) || blocked.has(next) || taken.has(next)) continue;
      spots.push([nc, nr]);
    }
  }
  return spots.length ? spots[spots.length - 1]! : null;
}

function stake(city: City, rng: () => number, kind: Kind): City | null {
  const spot = findLot(city);
  if (!spot) return null;
  const [col, row] = spot;
  const index = city.buildings.length;
  const plans = city.plans ?? [];
  const planAt = plans.findIndex((plan) => !plan.used && plan.kind === kind);
  const plan = planAt >= 0 ? plans[planAt] : undefined;
  const extra = plan ? Math.min(4, Math.max(0, (city.watchers || 1) - 1)) : 0;
  const building: Building = {
    id: `b-${city.tick}-${index}`,
    name: plan?.name || `${STEMS[index % STEMS.length]} ${SUFFIX[kind]}`,
    col,
    row,
    material: materialFor(kind, index),
    kind,
    targetFloors: Math.max(floorsFor(kind, rng) + extra, plan?.floors ?? 0),
    rising: true,
    apartments: [],
    coat: pickCoat(rng, plan?.coat),
    mark: plan?.emoji,
  };
  const nextPlans = plan ? plans.map((item, i) => (i === planAt ? { ...item, used: true } : item)) : plans;
  return pushBeat(
    { ...city, plans: nextPlans, buildings: [...city.buildings, building] },
    {
      id: `beat-${city.tick}-stake`,
      tick: city.tick,
      emoji: plan?.emoji || "🪵",
      text: plan
        ? `${building.name} is staked because ${city.watchers || 1} are watching. ${plan.note}`
        : `Crews stake ${building.name}. The lot is still open ground.`,
      subjectId: building.id,
      subjectName: building.name,
      place: building.name,
    },
  );
}

function addFloor(building: Building, rng: () => number, tick: number): Building {
  const floor = building.apartments.length + 1;
  const residents = [makeResident(rng, tick, floor, "person")];
  if (rng() > 0.5) residents.push(makeResident(rng, tick, floor + 20, "pet"));
  if (rng() > 0.62) residents.push(makeResident(rng, tick, floor + 40, "item"));
  const done = floor >= building.targetFloors;
  return {
    ...building,
    rising: !done,
    apartments: [
      ...building.apartments,
      { id: `apt-${building.id}-${floor}`, floor, lit: true, residents },
    ],
  };
}

function kindsFor(era: Era): Kind[] {
  const at = eraIndex(era);
  if (at >= 5) return ["skyscraper", "hospital", "school", "store", "gas", "tower", "block"];
  if (at >= 4) return ["hospital", "school", "store", "gas", "tower", "block", "house"];
  if (at >= 3) return ["school", "store", "block", "house", "farmhouse"];
  if (at >= 2) return ["store", "gas", "house", "farmhouse", "hut"];
  if (at >= 1) return ["farmhouse", "hut"];
  return ["hut"];
}

function kindFor(era: Era, rng: () => number, city: City): Kind | null {
  const order = kindsFor(era);
  const audience = Math.max(0, (city.watchers || 1) - 1);
  const caps: Record<Kind, number> = {
    hut: 4 + audience,
    farmhouse: 4 + audience,
    house: 5 + audience,
    store: 6 + audience,
    gas: 3 + audience,
    school: 3 + audience,
    hospital: 3 + audience,
    block: 4 + audience,
    tower: 4 + audience,
    skyscraper: 4 + audience,
  };
  const planned = (city.plans ?? []).find(
    (plan) => !plan.used && order.includes(plan.kind) && city.buildings.filter((b) => b.kind === plan.kind).length < caps[plan.kind],
  );
  const focus = city.focus?.kind;
  if (focus && order.includes(focus) && city.buildings.filter((b) => b.kind === focus).length < caps[focus] && rng() > 0.3) {
    return focus;
  }
  if (planned) return planned.kind;
  const open = order.filter((kind) => city.buildings.filter((b) => b.kind === kind).length < caps[kind]);
  if (open.length === 0) return null;
  return open[Math.floor(rng() * open.length)]!;
}

export function queuePlans(
  city: City,
  incoming: { name: string; kind: Kind; emoji: string; note: string; coat?: string; floors?: number }[],
  focus?: { kind?: string; note?: string; notes?: Partial<Record<string, string>> },
): City {
  const plans = [...(city.plans ?? [])];
  const allowed: Kind[] = ["hut", "farmhouse", "house", "store", "gas", "school", "hospital", "block", "tower", "skyscraper"];
  for (const item of incoming) {
    if (!allowed.includes(item.kind)) continue;
    if (plans.some((plan) => plan.name === item.name)) continue;
    plans.push({
      id: `plan-${city.tick}-${plans.length}`,
      name: item.name,
      kind: item.kind,
      emoji: item.emoji,
      note: item.note,
      used: false,
      coat: isCoat(item.coat) ? item.coat : undefined,
      floors: Number.isFinite(item.floors) ? Math.max(2, Math.min(8, Math.floor(item.floors as number))) : undefined,
    });
  }
  const kind = allowed.includes(focus?.kind as Kind) ? (focus?.kind as Kind) : city.focus?.kind;
  const notes: Partial<Record<Kind, string>> = { ...(city.focus?.notes ?? {}) };
  for (const [key, value] of Object.entries(focus?.notes ?? {})) {
    if (!allowed.includes(key as Kind) || !value) continue;
    notes[key as Kind] = value.slice(0, 140);
  }
  const nextFocus = kind
    ? { kind, note: (focus?.note || notes[kind] || city.focus?.note || `${kind} is the next thing to move forward.`).slice(0, 160), notes }
    : city.focus;
  return {
    ...city,
    plans: plans.slice(-16),
    focus: nextFocus,
    sophistication: (city.sophistication ?? 0) + Math.max(1, incoming.length),
  };
}

function spawn(city: City, crew: Omit<Crew, "progress"> & { progress?: number }): City {
  return { ...city, crews: [...city.crews, { ...crew, progress: crew.progress ?? 0 }] };
}

function spawnHaul(city: City, good: Goods, destCol: number, destRow: number, destId: string): City {
  const hauling = city.crews.filter((crew) => crew.task === "haul");
  if (hauling.length >= 3) return city;
  const cargo = CARGO[good];
  if (hauling.some((crew) => crew.cargo === cargo && crew.targetId === `${good}:${destId}`)) return city;
  const from = (city.works ?? []).find((works) => works.goods === good) ?? (city.works ?? [])[0];
  if (!from) return city;
  const truck = eraIndex(city.era) >= 2;
  return spawn(city, {
    id: `crew-${city.tick}-haul-${good}`,
    emoji: truck ? "🚚" : "🧑",
    task: "haul",
    name: truck ? "wagon" : "porter",
    cargo,
    col: from.col,
    row: from.row,
    destCol,
    destRow,
    targetId: `${good}:${destId}`,
  });
}

function growInfra(city: City): City {
  const infra = [...(city.infra ?? [])];
  const at = eraIndex(city.era);
  const place = (kind: Infra["kind"], emoji: string, name: string, col: number, row: number) => {
    if (infra.some((item) => item.kind === kind && item.col === col && item.row === row)) return;
    if (infra.filter((item) => item.kind === kind).length >= (kind === "lamp" ? 10 : 3)) return;
    infra.push({ id: `infra-${kind}-${col}-${row}`, emoji, name, col, row, kind });
  };
  if (at >= 3 && city.tick % 36 === 0) {
    const road = city.roads[city.tick % city.roads.length];
    if (road) {
      const [col, row] = road.split(",").map(Number) as [number, number];
      place("lamp", "🏮", "Street lamp", col, row);
    }
  }
  if (at >= 4 && !infra.some((item) => item.kind === "pipe")) {
    const spot = openNear(city, city.buildings[0]?.col ?? 5, city.buildings[0]?.row ?? 4);
    if (spot) place("pipe", "🚰", "Water main", spot[0], spot[1]);
  }
  if (at >= 4 && !infra.some((item) => item.kind === "power")) {
    const factory = (city.works ?? []).find((works) => works.kind === "factory");
    const spot = openNear(city, factory?.col ?? 6, factory?.row ?? 5);
    if (spot) place("power", "⚡", "Power shed", spot[0], spot[1]);
  }
  return infra.length === (city.infra ?? []).length ? city : { ...city, infra };
}

function runWorks(city: City): City {
  let next = city;
  const stock = { ...(next.stock ?? emptyStock(next.era)) };
  const site = next.buildings.find((building) => building.rising);
  for (const works of next.works ?? []) {
    const period = works.kind === "yard" || works.kind === "mill" ? 20 : 28;
    if (next.tick % period !== works.col % Math.max(1, period)) continue;
    let good = works.goods;
    if (works.kind === "kiln") {
      if (stock.timber < 1) continue;
      stock.timber -= 1;
      good = next.tick % 2 === 0 ? "glass" : "brick";
    } else if (works.kind === "factory") {
      if (stock.brick < 1) continue;
      stock.brick -= 1;
    } else if (works.kind === "shop") {
      if (stock.steel < 1) continue;
      stock.steel -= 1;
    }
    next = { ...next, stock };
    const before = next.crews.length;
    if (site) next = spawnHaul(next, good, site.col, site.row, site.id);
    if (next.crews.length === before) {
      stock[good] += 1;
      next = { ...next, stock: { ...stock } };
    }
  }
  return next.stock === city.stock && next.crews === city.crews ? city : next;
}

function wants(city: City) {
  const builders = city.crews.filter((c) => c.task === "raise").length;
  const pavers = city.crews.filter((c) => c.task === "pave").length;
  const farmers = city.crews.filter((c) => c.task === "tend").length;
  const visitors = city.crews.filter((c) => c.task === "visit").length;
  const scholars = city.crews.filter((c) => c.task === "study").length;
  const entering = city.crews.filter((c) => c.task === "enter").length;
  return { builders, pavers, farmers, visitors, scholars, entering };
}

function assignWork(city: City, rng: () => number): City {
  let next = city;
  const count = wants(next);
  const rising = next.buildings.filter((b) => b.rising);
  if (rising.length > count.builders && count.builders < 3) {
    const site = rising[count.builders % rising.length]!;
    next = spawn(next, {
      id: `crew-${next.tick}-raise`,
      emoji: "👷",
      task: "raise",
      name: pick(rng, NAMES),
      col: site.col + 1,
      row: site.row,
      destCol: site.col,
      destRow: site.row,
      targetId: site.id,
    });
  }
  if (eraIndex(next.era) >= 1 && next.farms.length < 36 && count.farmers < 2 && (next.roads.length > 10 || next.farms.length < 2)) {
    const spot = findFarmSpot(next);
    if (spot && next.farms.length < 36) {
      next = {
        ...next,
        farms: [...next.farms, { col: spot[0], row: spot[1], growth: 0.05 }],
      };
      next = spawn(next, {
        id: `crew-${next.tick}-tend`,
        emoji: "🧑‍🌾",
        task: "tend",
        name: pick(rng, NAMES),
        col: spot[0] + 1,
        row: spot[1],
        destCol: spot[0],
        destRow: spot[1],
        targetId: keyOf(spot[0], spot[1]),
      });
    }
  }
  const paveCap = eraIndex(next.era) >= 2 ? 2 : 1;
  if (next.roads.length < 280 && count.pavers < paveCap) {
    const edge = frontier(next);
    const atEdge = next.roads.some((key) => {
      const [col, row] = key.split(",").map(Number) as [number, number];
      return col <= 1 || row <= 1 || col >= next.cols - 2 || row >= next.rows - 2;
    });
    if (edge.length === 0 && atEdge && (next.cols < 72 || next.rows < 54)) {
      const cols = Math.min(72, next.cols + 2);
      const rows = Math.min(54, next.rows + 2);
      next = pushBeat(
        { ...next, cols, rows },
        {
          id: `beat-${next.tick}-spread`,
          tick: next.tick,
          emoji: "🗺️",
          text: `The world spreads to ${cols} by ${rows}. The new ground is past the edge of the frame.`,
          subjectId: "world",
          subjectName: "the map",
          place: "the edge",
        },
      );
    } else if (edge.length > 0) {
      const dest = pick(rng, edge);
      const from = next.roads[next.roads.length - 1]!.split(",").map(Number) as [number, number];
      next = spawn(next, {
        id: `crew-${next.tick}-pave`,
        emoji: "🚧",
        task: "pave",
        name: "road crew",
        col: from[0],
        row: from[1],
        destCol: dest.col,
        destRow: dest.row,
        targetId: keyOf(dest.col, dest.row),
      });
    }
  }
  if (next.buildings.filter((b) => b.apartments.length > 0).length >= 1 && count.entering < 4) {
    const homes = next.buildings.filter((b) => b.apartments.length > 0);
    const to = homes[Math.floor(rng() * homes.length)]!;
    const person = pick(rng, PEOPLE);
    next = spawn(next, {
      id: `crew-${next.tick}-enter-${to.id}`,
      emoji: person,
      task: "enter",
      name: pick(rng, NAMES),
      col: to.col + (rng() > 0.5 ? 0.1 : 0.9),
      row: to.row + 1.2,
      destCol: to.col + 0.5,
      destRow: to.row + 0.45,
      targetId: to.id,
    });
  }
  if (next.buildings.filter((b) => b.apartments.length > 0).length >= 2 && count.visitors < 2 && rng() > 0.55) {
    const homes = next.buildings.filter((b) => b.apartments.some((a) => a.residents.some((r) => r.role === "person")));
    if (homes.length >= 2) {
      const from = pick(rng, homes);
      const to = pick(rng, homes.filter((b) => b.id !== from.id));
      const person = from.apartments.flatMap((a) => a.residents).find((r) => r.role === "person");
      if (to && person) {
        next = spawn(next, {
          id: `crew-${next.tick}-visit`,
          emoji: person.emoji,
          task: "visit",
          name: person.name,
          col: from.col,
          row: from.row,
          destCol: to.col,
          destRow: to.row,
          targetId: to.id,
        });
      }
    }
  }
  if (count.scholars < 1 && next.tick % 70 === 0 && next.buildings[0]) {
    const home = next.buildings[0];
    next = spawn(next, {
      id: `crew-${next.tick}-study`,
      emoji: "🔬",
      task: "study",
      name: pick(rng, NAMES),
      col: home.col,
      row: home.row + 1,
      destCol: home.col,
      destRow: home.row,
      targetId: home.id,
    });
  }
  const audience = Math.max(1, city.watchers || 1);
  if (next.buildings.length < 48 + audience * 2 && next.buildings.filter((b) => b.rising).length < 2 + Math.min(3, audience) && next.tick % Math.max(6, Math.floor(18 / audience)) === 0) {
    const kind = kindFor(next.era, rng, next);
    if (kind) {
      const staked = stake(next, rng, kind);
      if (staked) next = staked;
    }
  }
  return next;
}

function resolve(city: City, crew: Crew, rng: () => number): { city: City; keep: boolean } {
  if (crew.task === "raise") {
    const building = city.buildings.find((b) => b.id === crew.targetId);
    if (!building || !building.rising) return { city, keep: false };
    const ready = withEconomy(city);
    const cost = COST[building.kind];
    const stock = ready.stock ?? emptyStock(ready.era);
    if (!canPay(stock, cost)) {
      const good = shortGood(stock, building.kind);
      const waiting = good ? spawnHaul(ready, good, building.col, building.row, building.id) : ready;
      return { city: waiting, keep: true };
    }
    const raised = addFloor(building, rng, city.tick);
    let next: City = {
      ...ready,
      stock: pay(stock, cost),
      buildings: ready.buildings.map((b) => (b.id === raised.id ? raised : b)),
    };
    if (!raised.rising) {
      const people = raised.apartments.reduce(
        (sum, apt) => sum + apt.residents.filter((r) => r.role === "person").length,
        0,
      );
      next = pushBeat(next, {
        id: `beat-${city.tick}-open`,
        tick: city.tick,
        emoji: raised.kind === "skyscraper" ? "🏙️" : raised.kind === "farmhouse" ? "🏡" : "🏠",
        text: `${raised.name} opens, ${raised.apartments.length} floors, ${people} already at the windows.`,
        subjectId: raised.id,
        subjectName: raised.name,
        place: raised.name,
      });
      return { city: next, keep: false };
    }
    return { city: next, keep: true };
  }
  if (crew.task === "haul") {
    const good = crew.targetId.split(":")[0] as Goods;
    const stock = { ...(city.stock ?? emptyStock(city.era)) };
    if (good in CARGO) stock[good] += 1;
    const host = city.buildings.find((b) => b.id === crew.targetId.split(":")[1]) ?? city.buildings.find((b) => b.rising);
    return {
      city: pushBeat(
        { ...city, stock },
        {
          id: `beat-${city.tick}-haul-${good}`,
          tick: city.tick,
          emoji: crew.cargo || CARGO[good] || "📦",
          text: `${crew.emoji} carries ${crew.cargo || "a load"} to ${host?.name ?? "the yard"}.`,
          subjectId: host?.id ?? crew.id,
          subjectName: crew.name,
          place: host?.name ?? "the works",
        },
      ),
      keep: false,
    };
  }
  if (crew.task === "pave") {
    const cell = keyOf(crew.destCol, crew.destRow);
    if (city.roads.includes(cell) || buildingSet(city).has(cell)) return { city, keep: false };
    const roads = [...city.roads, cell];
    let next: City = {
      ...city,
      roads,
      farms: city.farms.filter((farm) => keyOf(farm.col, farm.row) !== cell),
    };
    if (roads.length % 4 === 0) {
      next = pushBeat(next, {
        id: `beat-${city.tick}-road`,
        tick: city.tick,
        emoji: "🛣️",
        text: `The road reaches a new block. ${roads.length} cells are open to carts.`,
        subjectId: "roads",
        subjectName: "the road",
        place: "the road",
      });
    }
    return { city: next, keep: false };
  }
  if (crew.task === "tend") {
    const farms = city.farms.map((farm) => {
      if (keyOf(farm.col, farm.row) !== crew.targetId) return farm;
      return { ...farm, growth: Math.min(1.2, farm.growth + 0.42) };
    });
    let next: City = { ...city, farms };
    const ripe = next.farms.find((farm) => keyOf(farm.col, farm.row) === crew.targetId && farm.growth >= 1);
    if (ripe) {
      next = {
        ...next,
        farms: next.farms.map((farm) =>
          keyOf(farm.col, farm.row) === crew.targetId ? { ...farm, growth: 0.12 } : farm,
        ),
      };
      const barn = next.buildings.find((b) => b.kind === "farmhouse" && b.apartments[0]) ?? next.buildings.find((b) => b.apartments[0]);
      if (barn?.apartments[0]) {
        const grain = makeResident(rng, city.tick, 7, "item");
        grain.emoji = "🌾";
        next = {
          ...next,
          buildings: next.buildings.map((b) =>
            b.id !== barn.id
              ? b
              : {
                  ...b,
                  apartments: b.apartments.map((a, i) =>
                    i === 0 ? { ...a, residents: [...a.residents, grain].slice(0, 6) } : a,
                  ),
                },
          ),
        };
      }
      next = pushBeat(next, {
        id: `beat-${city.tick}-harvest`,
        tick: city.tick,
        emoji: "🌾",
        text: `${crew.name} cuts a ripe field and carries grain back into the city.`,
        subjectId: barn?.id ?? "farms",
        subjectName: crew.name,
        place: barn?.name ?? "the fields",
      });
    }
    return { city: next, keep: false };
  }
  if (crew.task === "enter") {
    const host = city.buildings.find((b) => b.id === crew.targetId);
    if (!host?.apartments.length) return { city, keep: false };
    const guest = makeResident(rng, city.tick, 9, "person");
    guest.emoji = crew.emoji;
    guest.name = crew.name;
    const floor = host.kind === "tower" || host.kind === "skyscraper" ? Math.min(host.apartments.length - 1, 1 + Math.floor(rng() * 2)) : 0;
    const next = pushBeat(
      {
        ...city,
        buildings: city.buildings.map((b) =>
          b.id !== host.id
            ? b
            : {
                ...b,
                apartments: b.apartments.map((apt, index) =>
                  index !== floor ? apt : { ...apt, lit: true, residents: [...apt.residents, guest].slice(0, 4) },
                ),
              },
        ),
      },
      {
        id: `beat-${city.tick}-enter`,
        tick: city.tick,
        emoji: crew.emoji,
        text: `${crew.name} leaves the sidewalk and steps inside ${host.name}.`,
        subjectId: host.id,
        subjectName: crew.name,
        place: host.name,
      },
    );
    return { city: next, keep: false };
  }
  if (crew.task === "visit") {
    const gift = pick(rng, ["🥖", "🍕", "📚", "🧺", "🌸"]);
    const host = city.buildings.find((b) => b.id === crew.targetId);
    let next = city;
    if (host?.apartments[0]) {
      const item = makeResident(rng, city.tick, 3, "item");
      item.emoji = gift;
      next = {
        ...city,
        buildings: city.buildings.map((b) =>
          b.id !== host.id
            ? b
            : {
                ...b,
                apartments: b.apartments.map((a, i) =>
                  i === 0 ? { ...a, lit: true, residents: [...a.residents, item].slice(0, 6) } : a,
                ),
              },
        ),
      };
    }
    next = pushBeat(next, {
      id: `beat-${city.tick}-visit`,
      tick: city.tick,
      emoji: gift,
      text: `${crew.name} walks to ${host?.name ?? "a neighbor"} and leaves ${gift}.`,
      subjectId: host?.id ?? crew.id,
      subjectName: crew.name,
      place: host?.name ?? "the road",
    });
    return { city: next, keep: false };
  }
  const discoveries: Record<Era, string> = {
    camp: "how to keep a fire through the night",
    farm: "how to save seed and fence a field",
    roads: "how to drain a street so carts can pass",
    town: "how to stack rooms above a shop",
    city: "how to pump water to a high floor",
    skyline: "how to hang a floor from a steel frame",
  };
  const burst = 28;
  let research = city.research + burst;
  let era = city.era;
  let next: City = { ...city, research };
  if (research >= ERA_GOAL[era] && era !== "skyline") {
    era = ERA_ORDER[eraIndex(era) + 1]!;
    next = { ...next, era, research };
    next = pushBeat(next, {
      id: `beat-${city.tick}-era`,
      tick: city.tick,
      emoji: "🔬",
      text: `${crew.name} shows the city ${discoveries[era]}. The era turns to ${eraLabel(era)}.`,
      subjectId: "research",
      subjectName: crew.name,
      place: city.buildings[0]?.name ?? "camp",
    });
  } else {
    next = pushBeat(next, {
      id: `beat-${city.tick}-study`,
      tick: city.tick,
      emoji: "🔬",
      text: `${crew.name} writes down ${discoveries[era]}. Research is ${research}.`,
      subjectId: "research",
      subjectName: crew.name,
      place: city.buildings[0]?.name ?? "camp",
    });
  }
  return { city: next, keep: false };
}

export function createCity(seed: string): City {
  const rng = mulberry32(hash(seed));
  const col = 5;
  const row = 4;
  const founder = makeResident(rng, 0, 1, "person");
  const home: Building = {
    id: "b-0",
    name: "Kindling Camp",
    col,
    row,
    material: 0,
    kind: "hut",
    targetFloors: 2,
    rising: true,
    apartments: [
      {
        id: "apt-b-0-1",
        floor: 1,
        lit: true,
        residents: [founder, makeResident(rng, 0, 2, "item")],
      },
    ],
  };
  const trees = ["2,2", "3,6", "8,2", "7,6", "1,4", "9,5"].filter((cell) => cell !== keyOf(col, row));
  const city: City = {
    version: CITY_VERSION,
    seed,
    tick: 0,
    era: "camp",
    research: 0,
    cols: 11,
    rows: 9,
    roads: [keyOf(col, row), keyOf(col + 1, row), keyOf(col, row + 1)],
    farms: [],
    trees,
    crews: [
      {
        id: "crew-0",
        emoji: "👷",
        task: "raise",
        name: founder.name,
        col: col + 1,
        row,
        destCol: col,
        destRow: row,
        progress: 0.2,
        targetId: home.id,
      },
    ],
    buildings: [home],
    beats: [
      {
        id: "beat-0",
        tick: 0,
        emoji: "🔥",
        text: `${founder.name} lights a fire at Kindling Camp. The ground around it is still empty.`,
        subjectId: founder.id,
        subjectName: founder.name,
        place: home.name,
      },
    ],
  };
  return city;
}

const ALCHEMY_ERAS = ["Age of Clay", "Age of Bread", "Age of Gears", "Age of Light", "Age of Stars", "Age of Magic", "Age of Dragons"];
const ALCHEMY_YIELD: Record<Kind, string[]> = {
  hut: ["🔥", "🪵"],
  farmhouse: ["🌾", "🌱"],
  house: ["🍞", "💡"],
  store: ["🪙", "🍞"],
  gas: ["⛽", "⚙️"],
  school: ["📚", "📜"],
  hospital: ["💊", "💡"],
  block: ["🧱", "🪙"],
  tower: ["💡", "🪟"],
  skyscraper: ["⚡", "🏙️"],
};
const BASE_RECIPES: NonNullable<City["alchemy"]>["recipes"] = [
  { a: "🪨", b: "🔥", out: "🧱", name: "kiln-fired brick" },
  { a: "🌱", b: "💧", out: "🌾", name: "first harvest" },
  { a: "🌾", b: "🔥", out: "🍞", name: "bread ovens" },
  { a: "🪵", b: "⚙️", out: "🛠️", name: "the workshop" },
  { a: "💡", b: "📜", out: "📚", name: "libraries" },
  { a: "📚", b: "💡", out: "🔭", name: "astronomy" },
  { a: "💧", b: "⚡", out: "🧪", name: "chemistry" },
  { a: "🔭", b: "💎", out: "🌌", name: "star maps" },
  { a: "🌌", b: "🔮", out: "🪄", name: "true magic" },
  { a: "🪄", b: "🔥", out: "🐉", name: "dragon hatcheries" },
];

export function growthOf(alchemy?: Alchemy) {
  const knowledge = alchemy?.knowledge ?? 0;
  const wonders = alchemy?.wonder?.built ? 1 : 0;
  return 1.12 ** knowledge * (1 + 0.25 * wonders);
}

function stepAlchemy(city: City, rng: () => number): City {
  const prior = city.alchemy?.recipes?.length
    ? city.alchemy
    : {
        knowledge: 0,
        eraName: ALCHEMY_ERAS[0]!,
        materials: { "🧱": 24, "🪨": 12, "🔥": 12, "💧": 10, "🌱": 10, "🪵": 8 },
        recipes: BASE_RECIPES.map((recipe) => ({ ...recipe })),
        prophecy: "From brick and fire the towers will learn to sing.",
      };
  const materials = { ...prior.materials };
  if (city.tick % 8 === 0) {
    for (const key of Object.keys(materials)) materials[key] = Math.floor((materials[key] ?? 0) * 0.97);
    const mult = growthOf(prior);
    for (const building of city.buildings) {
      if (!building.apartments.length || building.rising) continue;
      (ALCHEMY_YIELD[building.kind] ?? ["🧱"]).forEach((emoji, index) => {
        materials[emoji] = (materials[emoji] ?? 0) + Math.max(1, Math.floor(mult / (index + 1)));
      });
    }
  }
  let next = prior;
  let beat: Beat | null = null;
  if (city.tick % 6 === 0) {
    const ready = next.recipes.filter((recipe) => (materials[recipe.a] ?? 0) >= 1 && (materials[recipe.b] ?? 0) >= 1);
    const fresh = ready.filter((recipe) => !recipe.found);
    const pool = fresh.length ? fresh : ready;
    const recipe = pool[Math.floor(rng() * pool.length)];
    if (recipe) {
      materials[recipe.a] = (materials[recipe.a] ?? 0) - 1;
      materials[recipe.b] = (materials[recipe.b] ?? 0) - 1;
      materials[recipe.out] = (materials[recipe.out] ?? 0) + 1;
      const wasFound = recipe.found;
      const recipes = next.recipes.map((item) =>
        item.a === recipe.a && item.b === recipe.b && item.out === recipe.out ? { ...item, found: item.found ?? city.tick } : item,
      );
      const knowledge = new Set(recipes.filter((item) => item.found).map((item) => item.out)).size + (next.wonder?.built ? 3 : 0);
      const eraName = ALCHEMY_ERAS[Math.min(ALCHEMY_ERAS.length - 1, Math.floor(Math.log2(1 + knowledge)))]!;
      next = { ...next, recipes, knowledge, eraName, last: recipe.out };
      beat = {
        id: `beat-${city.tick}-alchemy`,
        tick: city.tick,
        emoji: recipe.out,
        text: wasFound
          ? `Someone crafts ${recipe.out} from ${recipe.a} and ${recipe.b}.`
          : `Discovered ${recipe.name}: ${recipe.a} + ${recipe.b} → ${recipe.out}. Knowledge ${knowledge}.`,
        subjectId: "alchemy",
        subjectName: recipe.name,
        place: "the workshop",
      };
    }
  }
  if (!next.wonder && next.knowledge >= 1 && city.tick % 20 === 0) {
    const emoji = next.knowledge > 6 ? "🐉" : next.knowledge > 3 ? "🔭" : "🗼";
    next = {
      ...next,
      wonder: {
        emoji,
        name: emoji === "🐉" ? "the Sleeping Dragon" : emoji === "🔭" ? "the Star Glass" : "the Great Tower",
        cost: { "🧱": 8 + next.knowledge, "🪵": 4, "💡": 2 },
        paid: {},
      },
    };
  }
  if (next.wonder && !next.wonder.built && city.tick % 5 === 0) {
    const paid = { ...next.wonder.paid };
    let moved = false;
    for (const [emoji, need] of Object.entries(next.wonder.cost)) {
      const have = materials[emoji] ?? 0;
      const q = Math.min(need - (paid[emoji] ?? 0), have, 3);
      if (q > 0) {
        materials[emoji] = have - q;
        paid[emoji] = (paid[emoji] ?? 0) + q;
        moved = true;
      }
    }
    const built = Object.entries(next.wonder.cost).every(([emoji, need]) => (paid[emoji] ?? 0) >= need);
    const wonder = { ...next.wonder, paid, built };
    next = { ...next, wonder, knowledge: next.knowledge + (built ? 3 : 0) };
    if (built) {
      beat = {
        id: `beat-${city.tick}-wonder`,
        tick: city.tick,
        emoji: wonder.emoji,
        text: `${wonder.emoji} ${wonder.name} stands. Every harvest grows faster now.`,
        subjectId: "wonder",
        subjectName: wonder.name,
        place: "the skyline",
      };
    } else if (moved && city.tick % 15 === 0) {
      beat = {
        id: `beat-${city.tick}-wonder-pay`,
        tick: city.tick,
        emoji: wonder.emoji,
        text: `Citizens pour materials into ${wonder.emoji} ${wonder.name}.`,
        subjectId: "wonder",
        subjectName: wonder.name,
        place: "the yard",
      };
    }
  }
  const alchemy = { ...next, materials };
  return beat ? pushBeat({ ...city, alchemy }, beat) : { ...city, alchemy };
}

const FLEET = [
  { emoji: "🚗", name: "Car" },
  { emoji: "🚕", name: "Taxi" },
  { emoji: "🚌", name: "Bus" },
  { emoji: "🚚", name: "Truck" },
  { emoji: "🚓", name: "Patrol" },
  { emoji: "🚲", name: "Bicycle" },
];

function onAvenue(col: number, row: number) {
  const band = (value: number) => ((value % 3) + 3) % 3 === 1;
  return band(col) || band(row);
}

function vehiclePos(v: Vehicle) {
  const dirC = v.destCol - v.col;
  const dirR = v.destRow - v.row;
  const len = Math.hypot(dirC, dirR) || 1;
  const side = v.lane ? 0.22 : -0.22;
  return {
    col: v.col + dirC * v.progress + (-dirR / len) * side,
    row: v.row + dirR * v.progress + (dirC / len) * side,
  };
}

function crewPos(crew: Crew) {
  return {
    col: crew.col + (crew.destCol - crew.col) * crew.progress,
    row: crew.row + (crew.destRow - crew.row) * crew.progress,
  };
}

function nextAvenue(city: City, col: number, row: number, fromCol: number, fromRow: number): [number, number] {
  const roads = new Set(city.roads);
  const options = DIRS.map(([dc, dr]) => [col + dc, row + dr] as [number, number]).filter(([c, r]) => {
    if (c === fromCol && r === fromRow) return false;
    if (c < 0 || r < 0 || c >= city.cols || r >= city.rows) return false;
    return roads.has(keyOf(c, r)) && onAvenue(c, r);
  });
  const straight = options.find(([c, r]) => c - col === col - fromCol && r - row === row - fromRow);
  if (straight) return straight;
  if (options.length) return options[(col * 3 + row + city.tick) % options.length]!;
  return [fromCol, fromRow];
}

function ensureFleet(city: City): City {
  if (eraIndex(city.era) < 2) return city;
  const avenues = city.roads.filter((key) => {
    const [col, row] = key.split(",").map(Number) as [number, number];
    return onAvenue(col, row);
  });
  if (avenues.length < 6) return city;
  const want = Math.min(FLEET.length, 2 + eraIndex(city.era));
  const have = city.vehicles ?? [];
  if (have.length >= want) return city;
  const vehicles = [...have];
  for (let i = have.length; i < want; i++) {
    const spec = FLEET[i % FLEET.length]!;
    const at = avenues[(i * 5 + 2) % avenues.length]!.split(",").map(Number) as [number, number];
    const hop = nextAvenue(city, at[0], at[1], at[0], at[1] + 1);
    if (hop[0] === at[0] && hop[1] === at[1]) continue;
    vehicles.push({
      id: `veh-${spec.name}-${i}`,
      emoji: spec.emoji,
      name: spec.name,
      col: at[0],
      row: at[1],
      destCol: hop[0],
      destRow: hop[1],
      progress: (i * 0.17) % 1,
      wait: 0,
      lane: i % 2,
    });
  }
  return vehicles.length === have.length ? city : { ...city, vehicles };
}

/** Cars, crews, and walkers check the thing in front of them before they move. */
function stepTraffic(city: City): City {
  let next = ensureFleet(city);
  const fleet = next.vehicles;
  if (!fleet?.length) return next;
  const people = next.crews.map((crew) => ({ crew, ...crewPos(crew) }));
  const held = new Set<string>();
  let note: Beat | null = null;
  const vehicles = fleet.map((vehicle, index) => {
    const here = vehiclePos(vehicle);
    const dirC = vehicle.destCol - vehicle.col;
    const dirR = vehicle.destRow - vehicle.row;
    const ahead = fleet.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const there = vehiclePos(other);
      const dc = there.col - here.col;
      const dr = there.row - here.row;
      return Math.hypot(dc, dr) < 0.4 && dc * dirC + dr * dirR > 0.05;
    });
    const person = people.find(
      (p) =>
        (p.crew.task === "enter" || p.crew.task === "visit" || p.crew.task === "tend") &&
        Math.hypot(p.col - here.col, p.row - here.row) < 0.6,
    );
    if (person) held.add(person.crew.id);
    if ((ahead || person) && vehicle.wait > 16) {
      return { ...vehicle, lane: vehicle.lane ? 0 : 1, wait: 0, progress: Math.min(0.95, vehicle.progress + 0.02) };
    }
    if (ahead || person) {
      if (!note && next.tick % 20 === 0) {
        note = {
          id: `beat-${next.tick}-meet-${vehicle.id}`,
          tick: next.tick,
          emoji: vehicle.emoji,
          text: person
            ? `${vehicle.name} brakes. ${person.crew.name} steps out of the lane.`
            : `${vehicle.name} stops short so it does not run into the vehicle ahead.`,
          subjectId: vehicle.id,
          subjectName: vehicle.name,
          place: "the lane",
        };
      }
      return { ...vehicle, wait: vehicle.wait + 1 };
    }
    const pace = vehicle.emoji === "🚲" ? 0.034 : vehicle.emoji === "🚌" || vehicle.emoji === "🚚" ? 0.018 : 0.026;
    const progress = vehicle.progress + pace;
    if (progress < 1) return { ...vehicle, progress, wait: 0 };
    const hop = nextAvenue(next, vehicle.destCol, vehicle.destRow, vehicle.col, vehicle.row);
    const taken = fleet.some(
      (other, otherIndex) =>
        otherIndex !== index && other.destCol === hop[0] && other.destRow === hop[1] && other.progress > 0.45,
    );
    if (taken) {
      const hopAway = nextAvenue(next, vehicle.col, vehicle.row, hop[0], hop[1]);
      return {
        ...vehicle,
        destCol: hopAway[0],
        destRow: hopAway[1],
        progress: 0.2,
        wait: 0,
        lane: vehicle.lane ? 0 : 1,
      };
    }
    return {
      ...vehicle,
      col: vehicle.destCol,
      row: vehicle.destRow,
      destCol: hop[0],
      destRow: hop[1],
      progress: 0,
      wait: 0,
    };
  });
  const crews = next.crews.map((crew) => {
    if (!held.has(crew.id)) return crew.yield ? { ...crew, yield: undefined } : crew;
    return { ...crew, progress: Math.max(0, crew.progress - 0.04), yield: "lane" };
  });
  for (let i = 0; i < crews.length; i++) {
    const a = crews[i]!;
    if (a.task === "haul" || a.task === "raise") continue;
    const pa = crewPos(a);
    for (let j = i + 1; j < crews.length; j++) {
      const b = crews[j]!;
      if (b.task === "haul" || b.task === "raise") continue;
      const pb = crewPos(b);
      if (Math.hypot(pa.col - pb.col, pa.row - pb.row) > 0.34) continue;
      crews[j] = { ...b, progress: Math.max(0, b.progress - 0.03), yield: a.name };
      if (!note && next.tick % 24 === 0) {
        note = {
          id: `beat-${next.tick}-pass-${a.id}`,
          tick: next.tick,
          emoji: a.emoji,
          text: `${a.name} and ${b.name} meet and step around each other.`,
          subjectId: a.id,
          subjectName: a.name,
          place: "the sidewalk",
        };
      }
      break;
    }
  }
  next = { ...next, vehicles, crews };
  return note ? pushBeat(next, note) : next;
}

export function stepCity(city: City): City {
  if (city.version !== CITY_VERSION) return city;
  const rng = mulberry32(hash(`${city.seed}:${city.tick + 1}`));
  let next: City = withEconomy({ ...city, tick: city.tick + 1 });
  const audience = Math.max(1, next.watchers || 1);
  if (next.tick % 4 === 0) next = { ...next, research: next.research + audience };
  if (next.tick % 240 === 0) {
    const sky = ["a new star", "a slower planet", "a wider moon", "another road of emoji", "a taller field"][Math.floor(next.tick / 240) % 5]!;
    next = pushBeat(next, {
      id: `beat-${next.tick}-watch`,
      tick: next.tick,
      emoji: "✨",
      text: `People are watching, so the ${eraLabel(next.era).toLowerCase()} grows ${sky}. Research is ${next.research}.`,
      subjectId: "research",
      subjectName: "the city",
      place: next.buildings[0]?.name ?? "camp",
    });
  }
  if (next.research >= ERA_GOAL[next.era] && next.era !== "skyline") {
    const era = ERA_ORDER[eraIndex(next.era) + 1]!;
    next = { ...next, era };
    if (era === "city" || era === "skyline") {
      const kind = era === "skyline" ? "skyscraper" : "tower";
      const extra = era === "skyline" ? 6 : 4;
      const host = [...next.buildings].reverse().find((b) => b.apartments.length > 0);
      if (host) {
        next = {
          ...next,
          buildings: next.buildings.map((b) =>
            b.id !== host.id
              ? b
              : {
                  ...b,
                  kind,
                  material: materialFor(kind, b.material),
                  name: `${b.name.split(" ")[0]} ${SUFFIX[kind]}`,
                  targetFloors: b.apartments.length + extra,
                  rising: true,
                },
          ),
        };
      }
    }
    next = pushBeat(next, {
        id: `beat-${next.tick}-era`,
        tick: next.tick,
        emoji: "📜",
        text: `Research crosses ${ERA_GOAL[city.era]}. The settlement becomes a ${eraLabel(era).toLowerCase()}.`,
        subjectId: "research",
        subjectName: "the city",
        place: next.buildings[0]?.name ?? "camp",
      },
    );
  }
  next = {
    ...next,
    farms: next.farms.map((farm) => ({ ...farm, growth: Math.min(1.15, farm.growth + 0.012) })),
    crews: next.crews.map((crew) => ({ ...crew, progress: Math.min(1, crew.progress + 0.045) })),
  };
  const staying: Crew[] = [];
  for (const crew of next.crews) {
    if (crew.progress < 1) {
      staying.push(crew);
      continue;
    }
    const done = resolve(next, crew, rng);
    next = done.city;
    if (done.keep) staying.push({ ...crew, progress: 0.05 });
  }
  next = { ...next, crews: staying };
  next = runWorks(next);
  next = growInfra(next);
  for (const building of next.buildings) {
    if (!building.rising || !next.stock) continue;
    const good = shortGood(next.stock, building.kind);
    if (good) next = spawnHaul(next, good, building.col, building.row, building.id);
  }
  if (next.tick % 24 === 0) {
    const missing = (["store", "gas", "school", "hospital"] as Kind[]).filter(
      (kind) => kindsFor(next.era).includes(kind) && !next.buildings.some((building) => building.kind === kind),
    );
    if (missing[0]) {
      const staked = stake(next, rng, missing[0]);
      if (staked) next = staked;
    }
  }
  if (next.crews.length < 16) next = assignWork(next, rng);
  next = stepAlchemy(next, rng);
  next = stepTraffic(next);
  return next;
}

export function personFacts(city: City, subjectId: string): string {
  return city.beats
    .filter((b) => b.subjectId === subjectId || b.text.includes(subjectId))
    .slice(0, 4)
    .map((b) => b.text)
    .join(" ");
}
