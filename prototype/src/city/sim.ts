export const CITY_VERSION = 2;

export type Role = "person" | "pet" | "item";
export type Kind = "hut" | "farmhouse" | "house" | "block" | "tower" | "skyscraper";
export type Era = "camp" | "farm" | "roads" | "town" | "city" | "skyline";
export type Task = "raise" | "pave" | "tend" | "visit" | "study";

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
};

export type Plan = {
  id: string;
  name: string;
  kind: Kind;
  emoji: string;
  note: string;
  used: boolean;
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
const PEOPLE = ["👩", "👨", "👧", "👦", "👵", "👴", "🧔", "🧕", "🧙", "🧚", "🧑‍🌾", "👷"];
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
  block: "Court",
  tower: "Tower",
  skyscraper: "Spire",
};

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
  if (kind === "hut" || kind === "farmhouse") return 2;
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
    targetFloors: floorsFor(kind, rng) + extra,
    rising: true,
    apartments: [],
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
  if (at >= 5) return ["skyscraper", "tower", "block"];
  if (at >= 4) return ["tower", "block", "house"];
  if (at >= 3) return ["block", "house", "farmhouse"];
  if (at >= 2) return ["house", "farmhouse", "hut"];
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
    block: 4 + audience,
    tower: 4 + audience,
    skyscraper: 4 + audience,
  };
  const planned = (city.plans ?? []).find(
    (plan) => !plan.used && order.includes(plan.kind) && city.buildings.filter((b) => b.kind === plan.kind).length < caps[plan.kind],
  );
  if (planned) return planned.kind;
  const open = order.filter((kind) => city.buildings.filter((b) => b.kind === kind).length < caps[kind]);
  if (open.length === 0) return null;
  return open[Math.floor(rng() * open.length)]!;
}

export function queuePlans(
  city: City,
  incoming: { name: string; kind: Kind; emoji: string; note: string }[],
): City {
  const plans = [...(city.plans ?? [])];
  const allowed: Kind[] = ["hut", "farmhouse", "house", "block", "tower", "skyscraper"];
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
    });
  }
  return { ...city, plans: plans.slice(-16) };
}

function spawn(city: City, crew: Omit<Crew, "progress"> & { progress?: number }): City {
  return { ...city, crews: [...city.crews, { ...crew, progress: crew.progress ?? 0 }] };
}

function wants(city: City) {
  const builders = city.crews.filter((c) => c.task === "raise").length;
  const pavers = city.crews.filter((c) => c.task === "pave").length;
  const farmers = city.crews.filter((c) => c.task === "tend").length;
  const visitors = city.crews.filter((c) => c.task === "visit").length;
  const scholars = city.crews.filter((c) => c.task === "study").length;
  return { builders, pavers, farmers, visitors, scholars };
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
    if (edge.length === 0 && atEdge && (next.cols < 48 || next.rows < 36)) {
      next = {
        ...next,
        cols: Math.min(48, next.cols + 2),
        rows: Math.min(36, next.rows + 2),
      };
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
    const raised = addFloor(building, rng, city.tick);
    let next: City = {
      ...city,
      buildings: city.buildings.map((b) => (b.id === raised.id ? raised : b)),
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

export function stepCity(city: City): City {
  if (city.version !== CITY_VERSION) return city;
  const rng = mulberry32(hash(`${city.seed}:${city.tick + 1}`));
  let next: City = { ...city, tick: city.tick + 1 };
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
  if (next.crews.length < 8) next = assignWork(next, rng);
  return next;
}

export function personFacts(city: City, subjectId: string): string {
  return city.beats
    .filter((b) => b.subjectId === subjectId || b.text.includes(subjectId))
    .slice(0, 4)
    .map((b) => b.text)
    .join(" ");
}
