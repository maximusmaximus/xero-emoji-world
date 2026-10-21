import { drawXero, drawXeroOnto } from "./xero-emoji";
import { laneSignCorners, pitchAfterPull, placedPoint, projectPoint } from "./signs";
import { floorBands, mayMove, motionOf, roomFor, storyCount } from "./motion";
import { DISTINCT_BODIES, frameCast, isBody } from "./catalog.ts";
import { palette } from "./palette";
import type { Building, City, Era } from "./sim";

export type Hit = {
  id: string;
  name: string;
  emoji: string;
  role: "person" | "pet" | "item" | "building" | "road" | "plant" | "sky" | "crew" | "ride";
  place: string;
  floor: number;
  detail: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Camera = { zoom: number; panX: number; panY: number; yaw: number; pitch: number };

type Point = { x: number; y: number };
type View = { scale: number; ox: number; oy: number };

const TW = 92;
const TH = 46;
const FH = 38;

const MATERIALS = [
  { top: "#6e5646", left: "#3a2b24", right: "#51382e", edge: "#8d6b52" },
  { top: "#5d6d58", left: "#2a382c", right: "#3c4d3c", edge: "#7e9278" },
  { top: "#6d5d4a", left: "#332c24", right: "#483e32", edge: "#8e7c62" },
  { top: "#4e5b68", left: "#262c33", right: "#36424c", edge: "#708496" },
] as const;

export function defaultCamera(): Camera {
  return { zoom: 1, panX: 0, panY: 0, yaw: 0, pitch: 0.76 };
}

let viewYaw = 0;
let viewPitch = 0.76;
let focusC = 5;
let focusR = 4;

function shot() {
  return { yaw: viewYaw, pitch: viewPitch, focusC, focusR };
}

function placed(col: number, row: number, z: number) {
  return placedPoint(col, row, z, shot());
}

function iso(col: number, row: number, z = 0): Point {
  return projectPoint(col, row, z, shot());
}

function depthOf(col: number, row: number) {
  return -placed(col, row, 0).camZ;
}

function fogAt(col: number, row: number) {
  const z = placed(col, row, 0).camZ;
  return Math.min(0.75, Math.max(0, (z - 42) / 26));
}

function tone(hex: string, fog: number, light: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) * light;
  let g = ((n >> 8) & 255) * light;
  let b = (n & 255) * light;
  const k = fog * 0.8;
  r += (186 - r) * k;
  g += (198 - g) * k;
  b += (210 - b) * k;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function bounds(city: City) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  const spanC = city.cols || 11;
  const spanR = city.rows || 9;
  for (const col of [0, spanC]) {
    for (const row of [0, spanR]) add(iso(col, row, 0));
  }
  for (const building of city.buildings) {
    const z = building.apartments.length * FH;
    add(iso(building.col, building.row, z));
    add(iso(building.col + 1, building.row, z));
    add(iso(building.col, building.row + 1, z));
    add(iso(building.col + 1, building.row + 1, z));
  }
  return { minX, minY, maxX, maxY };
}

function grownEra(era: Era) {
  const rank: Record<Era, number> = { camp: 0, farm: 1, roads: 2, town: 3, city: 4, skyline: 5 };
  return rank[era] ?? 0;
}

function cellHash(col: number, row: number) {
  let h = Math.imul(col | 0, 374761393) ^ Math.imul(row | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function viewOf(city: City, width: number, height: number, camera: Camera): View {
  viewYaw = camera.yaw || 0;
  viewPitch = camera.pitch ?? 0.76;
  focusC = (city.cols || 11) / 2;
  focusR = (city.rows || 9) / 2;
  const mid = iso(focusC, focusR, 0);
  const east = iso(focusC + 8, focusR, 0);
  const south = iso(focusC, focusR + 6, 0);
  let bw = Math.max(80, Math.abs(east.x - mid.x) * 2);
  let bh = Math.max(80, Math.abs(south.y - mid.y) * 2);
  const padX = 8;
  const padTop = 58;
  const padBottom = 22;
  const usableW = Math.max(1, width - padX * 2);
  const usableH = Math.max(1, height - padTop - padBottom);
  const aspect = usableW / usableH;
  if (bw / bh < aspect) bw = bh * aspect;
  else bh = bw / aspect;
  const scale = (usableW / bw) * camera.zoom;
  return {
    scale,
    ox: padX + usableW / 2 - mid.x * scale + camera.panX,
    oy: padTop + usableH / 2 - mid.y * scale + camera.panY,
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, panX: camera.panX + dx, panY: camera.panY + dy };
}

/** Grab a ground point and move it with the cursor. Pull up to lower the view, pull sideways and the city turns with the hand. */
export function pullBy(
  city: City,
  width: number,
  height: number,
  camera: Camera,
  px: number,
  py: number,
  dx: number,
  dy: number,
  turn = 0.003,
): Camera {
  const before = viewOf(city, width, height, camera);
  const grabX = px - dx;
  const grabY = py - dy;
  let col = (city.cols || 11) / 2;
  let row = (city.rows || 9) / 2;
  let best = Infinity;
  const maxC = city.cols || 11;
  const maxR = city.rows || 9;
  for (let r = -2; r <= maxR + 2; r += 1) {
    for (let c = -2; c <= maxC + 2; c += 1) {
      const p = iso(c, r, 0);
      const sx = p.x * before.scale + before.ox;
      const sy = p.y * before.scale + before.oy;
      const dist = (sx - grabX) * (sx - grabX) + (sy - grabY) * (sy - grabY);
      if (dist < best) {
        best = dist;
        col = c;
        row = r;
      }
    }
  }
  const next: Camera = {
    ...camera,
    yaw: (camera.yaw || 0) + dx * turn,
    pitch: pitchAfterPull(camera.pitch ?? 0.76, dy),
  };
  const after = viewOf(city, width, height, next);
  const held = iso(col, row, 0);
  return {
    ...next,
    panX: next.panX + (px - (held.x * after.scale + after.ox)),
    panY: next.panY + (py - (held.y * after.scale + after.oy)),
  };
}

export function zoomAt(
  city: City,
  width: number,
  height: number,
  camera: Camera,
  px: number,
  py: number,
  nextZoom: number,
): Camera {
  const zoom = Math.min(4.8, Math.max(0.45, nextZoom));
  const before = viewOf(city, width, height, camera);
  const wx = (px - before.ox) / before.scale;
  const wy = (py - before.oy) / before.scale;
  const mid = viewOf(city, width, height, { ...camera, zoom });
  return {
    zoom,
    yaw: camera.yaw || 0,
    pitch: camera.pitch ?? 0.76,
    panX: camera.panX + (px - (wx * mid.scale + mid.ox)),
    panY: camera.panY + (py - (wy * mid.scale + mid.oy)),
  };
}

function screen(p: Point, view: View): Point {
  return { x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy };
}

function quad(ctx: CanvasRenderingContext2D, points: Point[]) {
  const a = points[0];
  if (!a) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

function inset(points: Point[], amount: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => ({ x: cx + (p.x - cx) * (1 - amount), y: cy + (p.y - cy) * (1 - amount) }));
}

function split(a: Point, b: Point, c: Point, d: Point, i: number, n: number): Point[] {
  const l = (p: Point, q: Point, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const t0 = i / n;
  const t1 = (i + 1) / n;
  return [l(a, b, t0), l(a, b, t1), l(d, c, t1), l(d, c, t0)];
}

function wall(col: number, row: number, z0: number, z1: number, side: number): Point[] {
  if (side === 0) return [iso(col + 1, row, z0), iso(col + 1, row + 1, z0), iso(col + 1, row + 1, z1), iso(col + 1, row, z1)];
  if (side === 1) return [iso(col, row + 1, z0), iso(col + 1, row + 1, z0), iso(col + 1, row + 1, z1), iso(col, row + 1, z1)];
  if (side === 2) return [iso(col, row + 1, z0), iso(col, row, z0), iso(col, row, z1), iso(col, row + 1, z1)];
  return [iso(col + 1, row, z0), iso(col, row, z0), iso(col, row, z1), iso(col + 1, row, z1)];
}

function facing(points: Point[]) {
  const a = points[0];
  const b = points[1];
  const c = points[2];
  if (!a || !b || !c) return 0;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function hullOf(points: Point[]): Point[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const crosses = (a.y > p.y) !== (b.y > p.y);
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-6) + a.x) hit = !hit;
  }
  return hit;
}

function top(col: number, row: number, z: number, w = 1, d = 1): Point[] {
  return [iso(col, row, z), iso(col + w, row, z), iso(col + w, row + d, z), iso(col, row + d, z)];
}

export function drawCity(
  ctx: CanvasRenderingContext2D,
  city: City,
  width: number,
  height: number,
  camera: Camera,
  phase: number,
  focusId: string | null,
): Hit[] {
  const view = viewOf(city, width, height, camera);
  const hits: Hit[] = [];
  const to = (p: Point) => screen(p, view);

  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0c121c");
  sky.addColorStop(0.28, "#1d3148");
  sky.addColorStop(0.46, "#c45c3e");
  sky.addColorStop(0.56, "#f2c37a");
  sky.addColorStop(0.64, "#6a7d45");
  sky.addColorStop(1, "#172016");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const horizon = height * 0.57;
  ctx.fillStyle = "#243528";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 8);
  for (let x = 0; x <= width; x += 28) {
    const hill = horizon - 10 - Math.sin(x * 0.012) * 22 - ((x * 17) % 19);
    ctx.lineTo(x, hill);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 220, 170, 0.45)";
  ctx.fillRect(0, horizon, width, 2);
  const moonR = Math.min(width, height) * 0.14;
  const moonX = width * 0.16;
  const moonY = height * 0.15;
  ctx.fillStyle = "#f7f3ea";
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(170, 164, 154, 0.45)";
  ctx.beginPath();
  ctx.arc(moonX - moonR * 0.25, moonY - moonR * 0.12, moonR * 0.22, 0, Math.PI * 2);
  ctx.arc(moonX + moonR * 0.28, moonY + moonR * 0.18, moonR * 0.12, 0, Math.PI * 2);
  ctx.fill();
  const sunR = Math.min(width, height) * 0.18;
  const sunX = width * 0.84;
  const sunY = height * 0.2;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.15, sunX, sunY, sunR);
  glow.addColorStop(0, "#fff8dc");
  glow.addColorStop(0.42, "#f0a020");
  glow.addColorStop(1, "rgba(240, 110, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244, 236, 220, 0.2)";
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 240 + phase * 0.2) % (width + 200)) - 100;
    const cy = height * (0.1 + (i % 3) * 0.05);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 78, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 40, cy + 6, 46, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  hits.push(
    {
      id: "sky-moon",
      name: "Moon",
      emoji: "🌕",
      role: "sky",
      place: "the sky",
      floor: 0,
      detail: "A huge moon sitting on the horizon. It stays while the city grows under it.",
      x: moonX - moonR,
      y: moonY - moonR,
      w: moonR * 2,
      h: moonR * 2,
    },
    {
      id: "sky-sun",
      name: "Sun",
      emoji: "☀️",
      role: "sky",
      place: "the sky",
      floor: 0,
      detail: "A huge sun low on the other side of the horizon, washing the far land.",
      x: sunX - sunR * 0.55,
      y: sunY - sunR * 0.55,
      w: sunR * 1.1,
      h: sunR * 1.1,
    },
  );

  const occupied = new Set(city.buildings.map((b) => `${b.col},${b.row}`));
  const spanC = city.cols || 11;
  const spanR = city.rows || 9;
  const minC = -6;
  const minR = -6;
  const maxC = spanC + 6;
  const maxR = spanR + 6;

  const roadSet = new Set(city.roads ?? []);
  const farmAt = new Map((city.farms ?? []).map((farm) => [`${farm.col},${farm.row}`, farm]));

  const ground: { col: number; row: number }[] = [];
  for (let row = minR; row < maxR; row++) {
    for (let col = minC; col < maxC; col++) ground.push({ col, row });
  }
  ground.sort((a, b) => depthOf(a.col, a.row) - depthOf(b.col, b.row));

  for (const tile of ground) {
    const key = `${tile.col},${tile.row}`;
    const road = roadSet.has(key);
    const farm = farmAt.has(key);
    const insideDistrict = tile.col >= 0 && tile.row >= 0 && tile.col < spanC && tile.row < spanR;
    const drop = road || !insideDistrict ? 4 : 0;
    const pts = top(tile.col, tile.row, -drop).map(to);
    const fog = fogAt(tile.col + 0.5, tile.row + 0.5);
    quad(ctx, pts);
    let fill = "#466038";
    if (!insideDistrict) fill = tile.row > spanR + 1 || tile.col < -2 ? "#1d4c56" : "#3b4e34";
    else if (occupied.has(key)) fill = "#241c16";
    else if (road) fill = "#463f36";
    else if (farm) fill = "#74602c";
    else if (cellHash(tile.col, tile.row) % 3 === 0) fill = "#4e673c";
    ctx.fillStyle = tone(fill, fog, 0.8 + fog * 0.28);
    ctx.fill();
  }

  const props: { depth: number; draw: () => void }[] = [];
  const masks = city.buildings
    .filter((building) => building.apartments.length > 0)
    .map((building) => {
      const h = building.apartments.length * FH;
      const corners = [0, 1].flatMap((z) =>
        [iso(building.col, building.row, z * h), iso(building.col + 1, building.row, z * h), iso(building.col, building.row + 1, z * h), iso(building.col + 1, building.row + 1, z * h)].map(to),
      );
      const front = Math.max(
        depthOf(building.col, building.row),
        depthOf(building.col + 1, building.row),
        depthOf(building.col, building.row + 1),
        depthOf(building.col + 1, building.row + 1),
      );
      return { front, poly: hullOf(corners) };
    });
  const covered = (col: number, row: number, z = 20) => {
    const p = to(iso(col, row, z));
    const depth = z > 80 ? -1000 : depthOf(col, row);
    return masks.some((mask) => depth < mask.front - 0.15 && inside(p, mask.poly));
  };
  const headingOf = (dc: number, dr: number) => {
    if (!dc && !dr) return { rotation: 0, flip: false };
    const origin = iso(0, 0, 0);
    const dest = iso(dc, dr, 0);
    let ang = Math.atan2(dest.y - origin.y, dest.x - origin.x);
    let flip = false;
    if (ang > Math.PI / 2) {
      ang -= Math.PI;
      flip = true;
    } else if (ang < -Math.PI / 2) {
      ang += Math.PI;
      flip = true;
    }
    return { rotation: ang, flip };
  };
  const glyph = (
    emoji: string,
    col: number,
    row: number,
    z: number,
    world: number,
    place?: {
      dc?: number;
      dr?: number;
      feet?: boolean;
      ride?: boolean;
      sky?: boolean;
      hit?: { id: string; name: string; role: Hit["role"]; place: string; floor?: number; detail: string };
      cover?: boolean;
      huge?: boolean;
    },
  ) => {
    if (place?.cover && covered(col, row, z)) return;
    const p = to(iso(col, row, z));
    const east = to(iso(col + 1, row, 0));
    const south = to(iso(col, row + 1, 0));
    const origin = to(iso(col, row, 0));
    const span = Math.max(18, Math.hypot(east.x - origin.x, east.y - origin.y), Math.hypot(south.x - origin.x, south.y - origin.y));
    const age = 1 + Math.min(0.7, (city.tick || 0) / 2400 + grownEra(city.era) * 0.04);
    const fraction = place?.huge
      ? Math.min(2.8, (world / 40) * (1 + age * 0.35))
      : Math.min(0.9, (world / 78) * (1 + (age - 1) * 0.85));
    const size = place?.sky ? Math.min(78, Math.max(22, span * fraction)) : span * fraction;
    const feet = place?.feet !== false;
    if (feet) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 1, size * 0.22, size * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const dc = place?.dc ?? 0;
    const dr = place?.dr ?? 0;
    const ride = Boolean(place?.ride && (dc || dr));
    const turn = ride ? headingOf(dc, dr) : { rotation: 0, flip: false };
    if (!ride && (dc || dr)) {
      const dx = iso(dc, dr, 0).x - iso(0, 0, 0).x;
      turn.flip = dx < 0;
    }
    const anchor = feet ? "feet" : "center";
    // Side-view vehicles: wheels follow the lane, and the roof is squashed toward the road so it stays perpendicular to it.
    const squash = ride ? 0.5 + 0.42 * Math.sin(Math.min(1.2, Math.max(0.14, viewPitch))) : 1;
    drawXero(ctx, emoji, p.x, p.y, size, { rotation: turn.rotation, flip: turn.flip, anchor, squash });
    if (place?.hit) {
      const top = anchor === "feet" ? p.y - size : p.y - size / 2;
      hits.push({
        id: place.hit.id,
        name: place.hit.name,
        emoji,
        role: place.hit.role,
        place: place.hit.place,
        floor: place.hit.floor ?? 0,
        detail: place.hit.detail,
        x: p.x - size / 2,
        y: top,
        w: size,
        h: size,
      });
    }
  };
  const eraRank: Record<Era, number> = { camp: 0, farm: 1, roads: 2, town: 3, city: 4, skyline: 5 };
  const grown = eraRank[city.era] ?? 0;
  const stages = ["🌱", "🌿", "🌾", "🌻"];
  const watch = Math.min(1, (city.tick || 0) / 900);
  const wildPool = ["🌳", "🌲", "🌴", "🌵", "🌸", "🌷", "🌼", "🌻", "🍀", "🌿", "🪴", "🪨", "🍄", "🪵", "🌽", "🐝", "🦋", "🐞", "🦉", "🐸", "🪺", "🍇", "🍎", "🦔", "🦌", "🐿️", "🦚", "🌷"];
  const pool = wildPool.slice(0, 8 + Math.floor(watch * (wildPool.length - 8)));
  const growOf = (col: number, row: number) => {
    const n = (cellHash(col, row) % 1000) / 1000;
    return 0.55 + n * 0.3 + watch * 0.2;
  };

  for (const cell of city.trees ?? []) {
    const [col, row] = cell.split(",").map(Number) as [number, number];
    const emoji = (col + row) % 2 === 0 ? "🌳" : "🌲";
    const scale = growOf(col, row);
    props.push({
      depth: depthOf(col + 0.5, row + 0.5),
      draw: () =>
        glyph(emoji, col + 0.5, row + 0.45, 0, 40 * Math.min(1.05, scale), {
          cover: true,
          hit: {
            id: `tree-${cell}`,
            name: emoji === "🌳" ? "Old tree" : "Pine",
            role: "plant",
            place: "the wild",
            detail: `A ${emoji} that has been growing since the fire. It is ${Math.round(scale * 100)}% of a full tree. People are watching, so it keeps going.`,
          },
        }),
    });
  }
  for (const farm of city.farms ?? []) {
    const emoji = stages[Math.min(3, Math.floor(farm.growth * 4))]!;
    const world = 18 + farm.growth * 16;
    props.push({
      depth: depthOf(farm.col + 0.5, farm.row + 0.5),
      draw: () =>
        glyph(emoji, farm.col + 0.5, farm.row + 0.5, 0, world, {
          cover: true,
          hit: {
            id: `farm-${farm.col}-${farm.row}`,
            name: "Field",
            role: "plant",
            place: "the fields",
            detail: `This field is a ${emoji}, ${Math.round(farm.growth * 100)}% ripe. The longer it is watched, the taller the crop stands.`,
          },
        }),
    });
  }
  for (let row = minR; row < maxR; row++) {
    for (let col = minC; col < maxC; col++) {
      const key = `${col},${row}`;
      if (roadSet.has(key) || occupied.has(key) || farmAt.has(key)) continue;
      if ((city.trees ?? []).includes(key)) continue;
      const h = cellHash(col, row);
      if (h % 8 !== 0) continue;
      const emoji = pool[h % pool.length]!;
      const scale = emoji === "🪨" || emoji === "🪵" ? 0.7 : Math.min(1, growOf(col, row));
      props.push({
        depth: depthOf(col + 0.5, row + 0.5) - 0.04,
        draw: () =>
          glyph(emoji, col + 0.5, row + 0.5, 0, 18 * scale, {
            cover: true,
            hit: {
              id: `wild-${col}-${row}`,
              name: "Wild " + emoji,
              role: "plant",
              place: "open ground",
              detail: `Wild ${emoji} at ${col}, ${row}. It was not planned. It sprouted because the land keeps going, and it is still growing.`,
            },
          }),
      });
    }
  }
  const buildingByCell = new Map(city.buildings.map((building) => [`${building.col},${building.row}`, building]));
  const onRow = (value: number) => ((value % 3) + 3) % 3 === 1;
  const roads = city.roads ?? [];
  for (const key of roads) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    if (col < minC || row < minR || col >= maxC || row >= maxR) continue;
    props.push({
      depth: depthOf(col + 0.5, row + 0.5) - 0.08,
      draw: () => {
        const band = (c0: number, r0: number, c1: number, r1: number) =>
          [iso(c0, r0, 2), iso(c1, r0, 2), iso(c1, r1, 2), iso(c0, r1, 2)].map(to);
        const pave = (quad: Point[], emoji: string) => {
          let p0 = quad[0]!;
          let p1 = quad[1]!;
          let p3 = quad[3]!;
          if (p1.x < p0.x) {
            const next = { x: p1.x + (p3.x - p0.x), y: p1.y + (p3.y - p0.y) };
            p1 = p0;
            p0 = quad[1]!;
            p3 = next;
          }
          drawXeroOnto(ctx, emoji, p0, p1, p3);
        };
        const mark = (
          emoji: string,
          c: number,
          r: number,
          world: number,
          alongCol: boolean,
          hit?: { name: string; detail: string },
          ride = false,
        ) =>
          glyph(emoji, c, r, ride ? 0 : 2, world, {
            feet: ride,
            cover: true,
            dc: alongCol ? 1 : 0,
            dr: alongCol ? 0 : 1,
            ride,
            hit: hit
              ? { id: `street-${key}-${emoji}`, name: hit.name, role: "road", place: "the street", detail: hit.detail }
              : undefined,
          });
        const avenueEW = onRow(row);
        const avenueNS = onRow(col);
        const junction = avenueEW && avenueNS;
        const hash = cellHash(col, row);
        const front = [1, -1, 0, 0]
          .map((dc, index) => buildingByCell.get(`${col + dc},${row + [0, 0, 1, -1][index]!}`))
          .find(Boolean);

        if (!avenueEW && !avenueNS) {
          pave(band(col, row, col + 1, row + 1), hash % 3 === 0 ? "🟫" : "⬜");
          const curb = (c0: number, r0: number, c1: number, r1: number) => pave(band(c0, r0, c1, r1), "🪨");
          if (onRow(row - 1)) curb(col, row, col + 1, row + 0.1);
          if (onRow(row + 1)) curb(col, row + 0.9, col + 1, row + 1);
          if (onRow(col - 1)) curb(col, row, col + 0.1, row + 1);
          if (onRow(col + 1)) curb(col + 0.9, row, col + 1, row + 1);
          const nearCorner = onRow(row - 1) || onRow(row + 1) || onRow(col - 1) || onRow(col + 1);
          const kit = ["🌳", "🪑", "🗑️", "📫", "💡", "🪴", "🚲", "🚶", "🐕", "🪧", "🌸", "🛴", "🧒", "♻️"];
          let piece = kit[hash % kit.length]!;
          if (front?.kind === "school" || /school/.test(front?.name.toLowerCase() ?? "")) piece = "🚸";
          else if (front?.kind === "hospital") piece = "♿";
          else if (front?.kind === "store" || front?.kind === "gas") piece = hash % 2 === 0 ? "☕" : "🛍️";
          else if (front?.rising) piece = "🚧";
          else if (nearCorner && hash % 4 === 0) piece = "🚏";
          else if (nearCorner && hash % 4 === 1) piece = "💡";
          else if (nearCorner && hash % 5 === 0) piece = "♿";
          const side = onRow(row + 1) ? 0.72 : onRow(row - 1) ? 0.28 : onRow(col + 1) ? 0.72 : 0.28;
          const along = onRow(row - 1) || onRow(row + 1);
          mark(piece, col + (along ? 0.55 : side), row + (along ? side : 0.55), piece === "🌳" ? 18 : 12, along, {
            name: "Sidewalk",
            detail: `Sidewalk at the block. ${piece} sits in the furnishing zone, off the walking path, with the curb toward the street.`,
          });
          if (hash % 4 === 2) mark("🚮", col + 0.78, row + 0.22, 11, true);
          return;
        }

        pave(band(col, row, col + 1, row + 1), "⬛");
        if (junction) {
          for (let stripe = 0; stripe < 3; stripe++) {
            const at = 0.02 + stripe * 0.055;
            pave(band(col + at, row + 0.16, col + at + 0.03, row + 0.84), "⬜");
            pave(band(col + 0.8 + at, row + 0.16, col + 0.8 + at + 0.03, row + 0.84), "⬜");
            pave(band(col + 0.16, row + at, col + 0.84, row + at + 0.03), "⬜");
            pave(band(col + 0.16, row + 0.8 + at, col + 0.84, row + 0.8 + at + 0.03), "⬜");
          }
          mark("🚥", col + 0.5, row + 0.5, 18, true, {
            name: "Intersection",
            detail: "Two streets cross. Zebra stripes mark each crosswalk, and the signal hangs over the middle.",
          });
          if (hash % 2 === 0) mark("🚦", col + 0.82, row + 0.18, 14, false);
          return;
        }

        const across = avenueEW;
        const thin = (at: number, emoji: string, thickness = 0.018) => {
          if (across) pave(band(col, row + at, col + 1, row + at + thickness), emoji);
          else pave(band(col + at, row, col + at + thickness, row + 1), emoji);
        };
        thin(0.02, "⬜", 0.015);
        thin(0.965, "⬜", 0.015);
        thin(0.47, "🟨", 0.012);
        thin(0.518, "🟨", 0.012);
        if (hash % 2 === 0) thin(0.3, "⬜", 0.012);
        if ((across ? col : row) % 4 === 2) {
          thin(0.78, "🟦", 0.06);
          mark("🚲", across ? col + 0.5 : col + 0.81, across ? row + 0.81 : row + 0.5, 13, across);
        } else if (hash % 3 === 0) {
          const parked = ["🚗", "🚙", "🚕", "🚐"][hash % 4]!;
          mark(parked, across ? col + 0.5 : col + 0.84, across ? row + 0.84 : row + 0.5, 16, across, {
            name: "Curb lane",
            detail: `${parked} is parked at the curb, out of the travel lane. The double yellow stays in the middle.`,
          });
        }
        if (hash % 6 === 1) mark("⚫", across ? col + 0.42 : col + 0.55, across ? row + 0.55 : row + 0.42, 9, across);
        if (hash % 5 === 0) mark("💧", across ? col + 0.2 : col + 0.08, across ? row + 0.08 : row + 0.2, 10, across);
        const nextIsJunction = across ? onRow(col + 1) : onRow(row + 1);
        if (nextIsJunction) {
          const signC = across ? col + 0.72 : col + 0.4;
          const signR = across ? row + 0.38 : row + 0.72;
          const plate = laneSignCorners(signC, signR, across);
          const p0 = to(iso(plate.p0[0], plate.p0[1], plate.p0[2]));
          const p1 = to(iso(plate.p1[0], plate.p1[1], plate.p1[2]));
          const p3 = to(iso(plate.p3[0], plate.p3[1], plate.p3[2]));
          drawXeroOnto(ctx, "➡️", p0, p1, p3);
          const xs = [p0.x, p1.x, p3.x];
          const ys = [p0.y, p1.y, p3.y];
          hits.push({
            id: `street-${key}-➡️`,
            name: "Lane",
            emoji: "➡️",
            role: "road",
            place: "the street",
            floor: 0,
            detail: "A lane arrow before the crosswalk. It lies on the pavement and points the way the lane runs.",
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
          });
          thin(0, "⬜", 0.02);
        }
        if (hash % 7 === 0) mark("🚌", across ? col + 0.5 : col + 0.2, across ? row + 0.2 : row + 0.5, 18, across);
      },
    });
  }
  for (const works of city.works ?? []) {
    props.push({
      depth: depthOf(works.col + 0.5, works.row + 0.5),
      draw: () =>
        glyph(works.emoji, works.col + 0.5, works.row + 0.45, 0, 36, {
          cover: true,
          hit: {
            id: works.id,
            name: works.name,
            role: "plant",
            place: works.name,
            detail: `${works.name} is tooling for the city. It feeds ${works.goods} to the crews. A floor does not rise until that load is carried over.`,
          },
        }),
    });
  }
  for (const item of city.infra ?? []) {
    props.push({
      depth: depthOf(item.col + 0.5, item.row + 0.5) - 0.02,
      draw: () =>
        glyph(item.emoji, item.col + 0.5, item.row + 0.55, 0, 22, {
          cover: true,
          hit: {
            id: item.id,
            name: item.name,
            role: "road",
            place: item.name,
            detail: `${item.name} is part of the city works. Lamps, water, and power show up only after the era can build them.`,
          },
        }),
    });
  }
  const walkers = DISTINCT_BODIES.filter((emoji) => mayMove(emoji, "self"));
  let walked = 0;
  for (const building of city.buildings) {
    if (!building.apartments.length || walked > 18) continue;
    const lanes = building.kind === "store" || building.kind === "school" || building.kind === "hospital" ? 2 : 1;
    for (let lane = 0; lane < lanes; lane++) {
      walked += 1;
      const shift = (cellHash(building.col + lane, building.row) % 1000) / 1000;
      const t = (phase * 0.012 + shift + lane * 0.47) % 1;
      const entering = lane === 0 && t > 0.78;
      const col = entering ? building.col + 0.15 + (t - 0.78) / 0.22 * 0.35 : building.col + t * 0.9;
      const row = entering ? building.row + 1.16 - ((t - 0.78) / 0.22) * 0.7 : building.row + 1.16 + lane * 0.08;
      const emoji = walkers[(building.col + lane + building.row) % walkers.length]!;
      props.push({
        depth: depthOf(col, row),
        draw: () =>
          glyph(emoji, col, row, 0, entering ? 24 - (t - 0.78) * 30 : 26, {
            cover: true,
            dc: entering ? 0 : 1,
            hit: {
              id: `walk-${building.id}-${lane}`,
              name: "On the sidewalk",
              role: "crew",
              place: building.name,
              detail: entering
                ? `Someone on the sidewalk is walking into ${building.name}.`
                : `Foot traffic along the sidewalk in front of ${building.name}.`,
            },
          }),
      });
    }
  }
  for (const crew of city.crews ?? []) {
    const aside = crew.yield ? 0.2 : 0;
    const col = crew.col + (crew.destCol - crew.col) * crew.progress + aside;
    const row = crew.row + (crew.destRow - crew.row) * crew.progress;
    props.push({
      depth: depthOf(col + 0.5, row + 0.5),
      draw: () => {
        glyph(crew.emoji, col + 0.5, row + 0.5, 0, crew.task === "raise" ? 26 : crew.task === "haul" ? 30 : 22, {
          cover: true,
          dc: crew.destCol - crew.col,
          dr: crew.destRow - crew.row,
          hit: {
            id: crew.id,
            name: crew.name,
            role: "crew",
            place: crew.task,
            detail: crew.cargo
              ? `${crew.name} is carrying ${crew.cargo} from the works to a site that cannot rise without it.`
              : `${crew.name} is a ${crew.emoji} doing ${crew.task} work. They only walk while someone is watching.`,
          },
        });
        if (crew.cargo && mayMove(crew.cargo, "person")) {
          glyph(crew.cargo, col + 0.68, row + 0.38, 6, 12, { feet: false, cover: true });
        }
      },
    });
  }
  if (roads.length > 3) {
    for (const vehicle of city.vehicles ?? []) {
      const dirC = vehicle.destCol - vehicle.col;
      const dirR = vehicle.destRow - vehicle.row;
      const len = Math.hypot(dirC, dirR) || 1;
      const side = vehicle.lane ? 0.16 : -0.16;
      const col = vehicle.col + dirC * vehicle.progress + 0.5 + (-dirR / len) * side;
      const row = vehicle.row + dirR * vehicle.progress + 0.5 + (dirC / len) * side;
      if (col < minC || row < minR || col >= maxC || row >= maxR) continue;
      props.push({
        depth: depthOf(col, row) + 0.02,
        draw: () => {
          glyph(vehicle.emoji, col, row, 2, vehicle.emoji === "🚌" || vehicle.emoji === "🚚" || vehicle.emoji === "🚛" ? 30 : 24, {
            cover: true,
            feet: true,
            dc: dirC,
            dr: dirR,
            ride: false,
            hit: {
              id: vehicle.id,
              name: vehicle.name,
              role: "ride",
              place: "the lane",
              detail: vehicle.wait
                ? `${vehicle.name} is stopped. The lane ahead is taken, so it waits instead of driving through.`
                : `${vehicle.name} stays in its lane. A load only follows when this vehicle is dragging it.`,
            },
          });
          if ((vehicle.emoji === "🚚" || vehicle.emoji === "🚛") && mayMove("📦", "vehicle")) {
            glyph("📦", col - (dirC / len) * 0.42, row - (dirR / len) * 0.42, 2, 13, { feet: true, cover: true });
          }
        },
      });
    }
  }
  const skyBodies = ["⭐", "✨", "🌟", "🪐", "☄️", "🌠"];
  const skyCount = Math.min(skyBodies.length, 3 + Math.floor((city.sophistication ?? 0) / 2));
  for (let i = 0; i < skyCount; i++) {
    const emoji = skyBodies[i]!;
    const col = ((i * 2.6 + phase * 0.004) % (spanC + 6)) - 2;
    const row = (i % 4) * 0.8 - 2.2;
    const z = 210 + (i % 4) * 28;
    const world = emoji === "🪐" ? 22 : 14;
    props.push({
      depth: -1000 - i,
      draw: () =>
        glyph(emoji, col, row, z, world, {
          feet: false,
          sky: true,
          cover: true,
          hit: {
            id: `sky-${emoji}-${i}`,
            name: emoji === "🌙" ? "Moon" : emoji === "🪐" ? "Planet" : emoji === "🌍" ? "World" : emoji === "☀️" ? "Sun" : "Star",
            role: "sky",
            place: "the sky",
            detail: `A ${emoji} over the city. More of them appear the longer people watch. This one is ${Math.round(watch * 100)}% of the way to full size.`,
          },
        }),
    });
  }

  const active = city.buildings.filter((building) => building.rising).slice(0, 4);
  for (const building of active) {
    const queue = ["🪵", "🧱", "🪟", "🛠️"];
    queue.forEach((emoji, index) => {
      const col = building.col + 0.12 + index * 0.22;
      const row = building.row + 1.18;
      props.push({
        depth: depthOf(col, row) + 0.05,
        draw: () =>
          glyph(emoji, col, row, 0, 14, {
            hit: {
              id: `yard-${building.id}-${emoji}`,
              name: "Materials",
              role: "item",
              place: building.name,
              detail: `${emoji} is staged on the sidewalk in front of ${building.name}. The next floor cannot rise until this load is carried in.`,
            },
          }),
      });
    });
  }

  for (const building of city.buildings) {
    props.push({
      depth: depthOf(building.col + 0.5, building.row + 0.5),
      draw: () => paintBuilding(building),
    });
  }

  props.sort((a, b) => a.depth - b.depth);
  for (const prop of props) {
    const fog = Math.min(0.72, Math.max(0, (-prop.depth - 42) / 26));
    ctx.save();
    ctx.globalAlpha = 1 - fog * 0.72;
    prop.draw();
    ctx.restore();
  }

  const veil = ctx.createLinearGradient(0, 0, 0, horizon);
  veil.addColorStop(0, "rgba(150, 176, 198, 0.22)");
  veil.addColorStop(0.7, "rgba(186, 196, 204, 0.06)");
  veil.addColorStop(1, "rgba(186, 196, 204, 0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, horizon);
  const warmth = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, Math.max(width, height) * 0.85);
  warmth.addColorStop(0, "rgba(255, 210, 150, 0.12)");
  warmth.addColorStop(1, "rgba(255, 210, 150, 0)");
  ctx.fillStyle = warmth;
  ctx.fillRect(0, 0, width, height);
  const mist = ctx.createLinearGradient(0, horizon - 18, 0, horizon + 70);
  mist.addColorStop(0, "rgba(220, 214, 200, 0)");
  mist.addColorStop(0.5, "rgba(220, 214, 200, 0.14)");
  mist.addColorStop(1, "rgba(220, 214, 200, 0)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, horizon - 18, width, 96);
  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.62, height * 0.28, width * 0.5, height * 0.6, height * 0.92);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(6, 8, 12, 0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  function paintBuilding(building: Building) {
    ctx.save();
    ctx.globalAlpha = 1;
    const floors = building.apartments.length;
    const { col, row } = building;
    if (floors === 0) {
      glyph("🪵", col + 0.28, row + 0.62, 0, 18);
      glyph("🧱", col + 0.55, row + 0.62, 0, 16);
      glyph("🚩", col + 0.72, row + 0.4, 10, 18);
      ctx.restore();
      return;
    }
    const name = building.name.toLowerCase();
    const facade =
      building.kind === "gas" || /gas|fuel/.test(name)
        ? "gas"
        : building.kind === "store" || /market|store|shop/.test(name)
          ? "shop"
          : building.kind === "school" || /school|archive|library/.test(name)
            ? "school"
            : building.kind === "hospital" || /hospital|clinic|mercy/.test(name)
              ? "hospital"
              : building.kind === "farmhouse"
                ? "barn"
                : building.kind === "tower" || building.kind === "skyscraper"
                  ? "tower"
                  : "home";
    const skin =
      facade === "hospital"
        ? { mass: "⬜", bay: "🪟", pier: "⬜", roof: "⬜", crown: "🏥", sill: "💊" }
        : facade === "school"
          ? { mass: "🟥", bay: "🪟", pier: "🟥", roof: "🟥", crown: "🕐", sill: "📚" }
          : facade === "shop"
            ? { mass: "🟫", bay: "🪟", pier: "🟫", roof: "🟫", crown: "🛍️", sill: "🍞" }
            : facade === "gas"
              ? { mass: "⬜", bay: "🪟", pier: "🟥", roof: "🟥", crown: "⛽", sill: "🔧" }
              : facade === "barn"
                ? { mass: "🟫", bay: "🪟", pier: "🟫", roof: "🟫", crown: "🐄", sill: "🌾" }
                : facade === "tower"
                  ? { mass: "🪟", bay: "🪟", pier: "⬛", roof: "⬛", crown: "📡", sill: "💡" }
                  : { mass: "🟥", bay: "🪟", pier: "🧱", roof: "🏠", crown: "🏡", sill: "🪴" };
    const lerp = (p: Point, q: Point, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

    const base = top(col + 0.08, row + 0.12, 0, 1.05, 1.08).map(to);
    quad(ctx, base);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    const height = floors * FH;
    const sides = [0, 1, 2, 3]
      .map((side) => {
        const midC = side === 0 ? col + 1 : side === 2 ? col : col + 0.5;
        const midR = side === 1 ? row + 1 : side === 3 ? row : row + 0.5;
        return { side, depth: depthOf(midC, midR) };
      })
      .sort((a, b) => a.depth - b.depth);
    const front = sides.slice(-2);

    for (const side of sides) {
      const pts = wall(col, row, 0, height, side.side).map(to);
      quad(ctx, pts);
      const facingStreet = front.some((item) => item.side === side.side);
      ctx.fillStyle = facingStreet ? "#6e4c40" : "#2a211c";
      ctx.fill();
      const frontDoor = facingStreet;
      // t = 0 is whichever wall edge is lower on screen (the street). t = 1 is the roof.
      const z0y = (pts[0]!.y + pts[1]!.y) / 2;
      const z1y = (pts[2]!.y + pts[3]!.y) / 2;
      const streetLow = z0y >= z1y;
      const low0 = streetLow ? pts[0]! : pts[3]!;
      const low1 = streetLow ? pts[1]! : pts[2]!;
      const high0 = streetLow ? pts[3]! : pts[0]!;
      const high1 = streetLow ? pts[2]! : pts[1]!;
      const at = (t: number, u: number) => lerp(lerp(low0, high0, t), lerp(low1, high1, t), u);
      const faceQuad = (t0: number, t1: number, u0: number, u1: number) => [at(t1, u0), at(t1, u1), at(t0, u1), at(t0, u0)];
      const doorTop = frontDoor ? Math.min(0.28, 0.7 / storyCount(building.kind, floors)) : 0;
      if (facingStreet) {
        const wallH = Math.hypot(at(0, 0.5).x - at(1, 0.5).x, at(0, 0.5).y - at(1, 0.5).y);
        const panel = Math.max(22, Math.min(40, wallH * 0.22));
        const pierAt = (u: number, t: number, emoji: string) => {
          const p = at(t, u);
          drawXero(ctx, emoji, p.x, p.y, panel, { anchor: "center" });
        };
        pierAt(0.1, 0.55, skin.pier);
        pierAt(0.9, 0.55, skin.pier);
        if (building.rising) pierAt(0.5, 0.84, "🏗️");
        const stories = storyCount(building.kind, floors);
        const bands = floorBands(stories, doorTop);
        const roomTints = ["#fff1d4", "#f3e2c4", "#efe6f4", "#e7f0ea"];
        bands.forEach((band, bandIndex) => {
          const resident = building.apartments[band.story]?.residents.find((person) => isBody(person.emoji));
          const room = roomFor(facade, band.story, resident?.emoji);
          if (!isBody(room.actor) && motionOf(room.actor) !== "self") {
            room.actor = DISTINCT_BODIES[(band.story + side.side) % DISTINCT_BODIES.length]!;
          }
          const pane = faceQuad(band.t0, band.t1, 0.12, 0.88);
          ctx.save();
          quad(ctx, pane);
          ctx.clip();
          quad(ctx, pane);
          ctx.fillStyle = roomTints[bandIndex % roomTints.length]!;
          ctx.fill();
          const sill = faceQuad(band.t0, band.t0 + (band.t1 - band.t0) * 0.16, 0.12, 0.88);
          quad(ctx, sill);
          ctx.fillStyle = "#c9844a";
          ctx.fill();
          const paneH = Math.hypot(at(band.t0, 0.5).x - at(band.t1, 0.5).x, at(band.t0, 0.5).y - at(band.t1, 0.5).y);
          const fig = Math.max(12, Math.min(34, paneH * 0.92));
          const feetT = band.t0 + (band.t1 - band.t0) * 0.18;
          const prop = room.still[0];
          if (prop && !mayMove(prop.emoji, "self")) {
            const pos = at(feetT, prop.u);
            drawXero(ctx, prop.emoji, pos.x, pos.y, fig * 0.7, { anchor: "feet" });
          }
          if (mayMove(room.actor, "self")) {
            const travel = (phase * 0.005 + band.story * 0.23) % 1;
            const ping = travel < 0.5 ? travel * 2 : (1 - travel) * 2;
            const pos = at(feetT, 0.28 + ping * 0.44);
            drawXero(ctx, room.actor, pos.x, pos.y, fig, { anchor: "feet", flip: travel > 0.5 });
            if (room.carried && mayMove(room.carried, "person")) {
              const hand = at(feetT + (band.t1 - band.t0) * 0.28, 0.28 + ping * 0.44);
              drawXero(ctx, room.carried, hand.x, hand.y, fig * 0.38, { anchor: "center" });
            }
          }
          ctx.restore();
          ctx.save();
          quad(ctx, pane);
          ctx.strokeStyle = "#1c140f";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
          const xs = pane.map((p) => p.x);
          const ys = pane.map((p) => p.y);
          hits.push({
            id: `${building.id}-floor-${side.side}-${band.story}`,
            name: building.name,
            emoji: "🪟",
            role: "building",
            place: building.name,
            floor: band.story + 1,
            detail: `Floor ${band.story + 1} of ${building.name}, separated by a slab. ${room.actor} moves in this room. ${room.still.map((item) => item.emoji).join(" ")} stays put${room.carried ? `, and ${room.carried} only moves because ${room.actor} is carrying it` : ""}.`,
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
          });
        });
      }
      if (frontDoor) {
        const opening = faceQuad(0, doorTop, 0.34, 0.66);
        quad(ctx, opening);
        ctx.fillStyle = "#1a120e";
        ctx.fill();
        quad(ctx, opening);
        ctx.strokeStyle = "#1a120e";
        ctx.lineWidth = 2;
        ctx.stroke();
        const foot = at(0, 0.5);
        const head = at(doorTop, 0.5);
        const doorPx = Math.max(14, Math.hypot(head.x - foot.x, head.y - foot.y));
        drawXero(ctx, "🚪", foot.x, foot.y, doorPx, { anchor: "feet" });
      }
    }

    const roofZ = floors * FH;
    const roof = top(col, row, roofZ + 4, 1, 1).map(to);
    quad(ctx, roof);
    ctx.fillStyle = facade === "tower" ? "#2a211c" : "#6e4c40";
    ctx.fill();
    const roofMid = {
      x: (roof[0]!.x + roof[1]!.x + roof[2]!.x + roof[3]!.x) / 4,
      y: (roof[0]!.y + roof[1]!.y + roof[2]!.y + roof[3]!.y) / 4,
    };
    const roofSpan = Math.hypot(roof[1]!.x - roof[0]!.x, roof[1]!.y - roof[0]!.y);
    drawXero(ctx, skin.roof, roofMid.x, roofMid.y, Math.max(28, Math.min(64, roofSpan * 0.55)), { anchor: "center" });
    glyph(skin.crown, col + 0.72, row + 0.28, roofZ + 8, facade === "tower" ? 22 : 26);
    if (building.rising) glyph("🏗️", col + 0.28, row + 0.35, roofZ + 10, 20);
    if (city.alchemy?.wonder && building.rising && building.targetFloors >= floors) {
      glyph(city.alchemy.wonder.emoji, col + 0.55, row + 0.55, roofZ + 16, 18);
    }

    const crown = to(iso(col + 0.5, row + 0.5, roofZ + 18));
    ctx.font = "600 13px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const plate = ctx.measureText(building.name).width + 10;
    ctx.fillStyle = "rgba(18,16,12,0.72)";
    ctx.fillRect(crown.x - plate / 2, crown.y - 8, plate, 16);
    ctx.fillStyle = palette.cream;
    ctx.fillText(building.name, crown.x, crown.y);
    ctx.restore();
  }

  for (const spot of frameCast(width, height, phase)) {
    const step = Math.sin(phase * 0.015 + spot.x * 0.02) * 6;
    drawXero(ctx, spot.emoji, spot.x + step, spot.y, spot.size, { anchor: "feet", flip: step < 0 });
  }

  ctx.fillStyle = palette.mute;
  ctx.font = "12px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`world ${spanC}×${spanR} · drag pulls the city with you and turns it the way you pull`, 16, height - 16);
  return hits;
}
