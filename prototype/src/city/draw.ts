import { drawXero, drawXeroOnto } from "./xero-emoji";
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

function aim() {
  const az = viewYaw + Math.PI * 1.25;
  const elev = Math.min(1.2, Math.max(0.14, viewPitch));
  const dist = 36;
  const tx = focusC;
  const ty = focusR;
  const tz = 1.5;
  const ex = tx + Math.cos(az) * Math.cos(elev) * dist;
  const ey = ty + Math.sin(az) * Math.cos(elev) * dist;
  const ez = tz + Math.sin(elev) * dist;
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = fy;
  let ry = -fx;
  const rl = Math.hypot(rx, ry) || 1;
  rx /= rl;
  ry /= rl;
  const ux = ry * fz - 0 * fy;
  const uy = 0 * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  return { ex, ey, ez, fx, fy, fz, rx, ry, ux, uy, uz };
}

function placed(col: number, row: number, z: number) {
  const cam = aim();
  const dx = col - cam.ex;
  const dy = row - cam.ey;
  const dz = z / 54 - cam.ez;
  return {
    camX: dx * cam.rx + dy * cam.ry,
    camY: dx * cam.ux + dy * cam.uy + dz * cam.uz,
    camZ: dx * cam.fx + dy * cam.fy + dz * cam.fz,
  };
}

function iso(col: number, row: number, z = 0): Point {
  const p = placed(col, row, z);
  const s = 640 / Math.max(0.4, p.camZ);
  return { x: p.camX * s, y: -p.camY * s };
}

function depthOf(col: number, row: number) {
  return -placed(col, row, 0).camZ;
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
  const box = bounds(city);
  let minX = box.minX;
  let minY = box.minY;
  let maxX = box.maxX;
  let maxY = box.maxY;
  let bw = Math.max(1, maxX - minX);
  let bh = Math.max(1, maxY - minY);
  const padX = 8;
  const padTop = 58;
  const padBottom = 22;
  const usableW = Math.max(1, width - padX * 2);
  const usableH = Math.max(1, height - padTop - padBottom);
  const aspect = usableW / usableH;
  if (bw / bh < aspect) {
    const need = bh * aspect;
    const extra = (need - bw) / 2;
    minX -= extra;
    maxX += extra;
    bw = need;
  } else {
    const need = bw / aspect;
    const extra = (need - bh) / 2;
    minY -= extra;
    maxY += extra;
    bh = need;
  }
  const scale = (usableW / bw) * camera.zoom;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    scale,
    ox: padX + usableW / 2 - cx * scale + camera.panX,
    oy: padTop + usableH / 2 - cy * scale + camera.panY,
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, panX: camera.panX + dx, panY: camera.panY + dy };
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
  ctx.fillStyle = "#26221c";
  ctx.fillRect(0, 0, width, height);

  const occupied = new Set(city.buildings.map((b) => `${b.col},${b.row}`));
  const spanC = city.cols || 11;
  const spanR = city.rows || 9;
  const minC = -3;
  const minR = -3;
  const maxC = spanC + 3;
  const maxR = spanR + 3;

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
    const inside = tile.col >= 0 && tile.row >= 0 && tile.col < spanC && tile.row < spanR;
    const drop = road || !inside ? 5 : 0;
    const pts = top(tile.col, tile.row, -drop).map(to);
    quad(ctx, pts);
    if (!inside) ctx.fillStyle = "#211e1a";
    else if (occupied.has(key)) ctx.fillStyle = "#221c17";
    else if (road) ctx.fillStyle = (tile.col + tile.row) % 2 === 0 ? "#3a342c" : "#312c26";
    else if (farm) ctx.fillStyle = (tile.col + tile.row) % 2 === 0 ? "#6a5428" : "#5c4922";
    else ctx.fillStyle = (tile.col + tile.row) % 2 === 0 ? "#3e4d34" : "#35442d";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
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
    },
  ) => {
    if (place?.cover && covered(col, row, z)) return;
    const p = to(iso(col, row, z));
    const east = to(iso(col + 1, row, 0));
    const south = to(iso(col, row + 1, 0));
    const origin = to(iso(col, row, 0));
    const span = Math.max(18, Math.hypot(east.x - origin.x, east.y - origin.y), Math.hypot(south.x - origin.x, south.y - origin.y));
    const fraction = Math.min(place?.sky ? 0.85 : 0.82, Math.max(0.46, world / 58));
    const size = place?.sky ? Math.min(56, Math.max(22, span * fraction)) : span * fraction;
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
    drawXero(ctx, emoji, p.x, p.y, size, { rotation: turn.rotation, flip: turn.flip, anchor });
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
  const roads = city.roads ?? [];
  for (const key of roads) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    if (col < minC || row < minR || col >= maxC || row >= maxR) continue;
    let east = roadSet.has(`${col + 1},${row}`);
    let west = roadSet.has(`${col - 1},${row}`);
    let south = roadSet.has(`${col},${row + 1}`);
    let north = roadSet.has(`${col},${row - 1}`);
    const links = Number(east) + Number(west) + Number(south) + Number(north);
    const junction = links >= 3 && (east || west) && (north || south);
    const emoji = junction ? "🚦" : "🛣️";
    props.push({
      depth: depthOf(col + 0.5, row + 0.5) - 0.08,
      draw: () => {
        if (junction) {
          glyph(emoji, col + 0.5, row + 0.5, 0, 26, {
            cover: true,
            hit: {
              id: `road-${key}`,
              name: "Crossing",
              role: "road",
              place: "the road",
              detail: "A crossing where the emoji roads meet. Carts have to take a turn.",
            },
          });
          return;
        }
        const pad = 0.18;
        const tile = top(col + pad, row + pad, 2, 1 - pad * 2, 1 - pad * 2).map(to);
        drawXeroOnto(ctx, emoji, tile[0]!, tile[1]!, tile[3]!);
        const hit = to(iso(col + 0.5, row + 0.5, 2));
        hits.push({
          id: `road-${key}`,
          name: "Road",
          emoji,
          role: "road",
          place: "the road",
          floor: 0,
          detail: `A stretch of road made of ${emoji}. It lies on the ground and turns with the city.`,
          x: hit.x - 16,
          y: hit.y - 10,
          w: 32,
          h: 20,
        });
      },
    });
  }
  for (const crew of city.crews ?? []) {
    const col = crew.col + (crew.destCol - crew.col) * crew.progress;
    const row = crew.row + (crew.destRow - crew.row) * crew.progress;
    props.push({
      depth: depthOf(col + 0.5, row + 0.5),
      draw: () =>
        glyph(crew.emoji, col + 0.5, row + 0.5, 0, crew.task === "raise" ? 26 : 22, {
          cover: true,
          dc: crew.destCol - crew.col,
          dr: crew.destRow - crew.row,
          hit: {
            id: crew.id,
            name: crew.name,
            role: "crew",
            place: crew.task,
            detail: `${crew.name} is a ${crew.emoji} doing ${crew.task} work. They only walk while someone is watching.`,
          },
        }),
    });
  }
  if (roads.length > 3 && grown >= 2) {
    const rides = [
      { emoji: "🚲", world: 20, speed: 0.15, name: "Bicycle" },
      { emoji: "🚗", world: 26, speed: 0.22, name: "Car" },
      { emoji: "🚜", world: 28, speed: 0.08, name: "Tractor" },
      { emoji: "🚌", world: 32, speed: 0.12, name: "Bus" },
      { emoji: "🚚", world: 30, speed: 0.1, name: "Truck" },
    ];
    rides.forEach((ride, index) => {
      if (grown < 3 && index > 1) return;
      const travel = (phase * ride.speed + index * 3) % roads.length;
      const i = Math.floor(travel);
      const f = travel - i;
      const a = roads[i]!.split(",").map(Number) as [number, number];
      const b = roads[(i + 1) % roads.length]!.split(",").map(Number) as [number, number];
      const col = a[0] + (b[0] - a[0]) * f + 0.5;
      const row = a[1] + (b[1] - a[1]) * f + 0.5;
      const dc = b[0] - a[0];
      const dr = b[1] - a[1];
      props.push({
        depth: depthOf(col, row),
        draw: () =>
          glyph(ride.emoji, col, row, 0, ride.world, {
            cover: true,
            dc,
            dr,
            ride: true,
            hit: {
              id: `ride-${index}`,
              name: ride.name,
              role: "ride",
              place: "the road",
              detail: `A ${ride.emoji} following the emoji road. It only exists while the city is being watched.`,
            },
          }),
      });
    });
  }
  const skyBodies = ["⭐", "✨", "🌟", "🌙", "🪐", "🌍", "☀️", "☄️", "🌌", "🌠", "🛸", "🌕"];
  const skyCount = Math.min(skyBodies.length, 4 + Math.floor((city.tick || 0) / 80));
  for (let i = 0; i < skyCount; i++) {
    const emoji = skyBodies[i]!;
    const col = ((i * 2.6 + phase * 0.004) % (spanC + 6)) - 2;
    const row = (i % 4) * 0.8 - 2.2;
    const z = 210 + (i % 4) * 28;
    const world = emoji === "🌙" || emoji === "🪐" || emoji === "🌍" || emoji === "☀️" ? 28 : 16;
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

  for (const building of city.buildings) {
    props.push({
      depth: depthOf(building.col + 0.5, building.row + 0.5),
      draw: () => paintBuilding(building),
    });
  }

  props.sort((a, b) => a.depth - b.depth);
  for (const prop of props) prop.draw();

  function paintBuilding(building: Building) {
    const floors = building.apartments.length;
    const { col, row } = building;
    if (floors === 0) {
      glyph("🪵", col + 0.35, row + 0.55, 6, 26);
      glyph("🚩", col + 0.7, row + 0.35, 16, 28);
      return;
    }
    const mat = MATERIALS[building.material % MATERIALS.length] ?? MATERIALS[0];
    const base = top(col + 0.08, row + 0.12, 0, 1.05, 1.08).map(to);
    quad(ctx, base);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fill();

    const height = floors * FH;
    const sides = [0, 1, 2, 3]
      .map((side) => {
        const midC = side === 0 ? col + 1 : side === 2 ? col : col + 0.5;
        const midR = side === 1 ? row + 1 : side === 3 ? row : row + 0.5;
        return { side, depth: depthOf(midC, midR) };
      })
      .sort((a, b) => a.depth - b.depth);
    const shade = ["#5c4638", "#3d4a3c", "#2a2420", "#3e4a56"];
    for (const side of sides) {
      const pts = wall(col, row, 0, height, side.side).map(to);
      quad(ctx, pts);
      ctx.fillStyle = shade[side.side] ?? mat.left;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const apt of building.apartments) {
      const z0 = (apt.floor - 1) * FH;
      const z1 = apt.floor * FH;
      const openings: { foot: Point; head: Point; along: Point }[] = [];
      const near = sides.slice(-2);
      for (const side of near) {
        const panes = side.side === 2 ? 1 : side.side === 3 ? 2 : 3;
        const paneWall = wall(col, row, z0 + FH * 0.18, z1 - FH * 0.1, side.side).map(to);
        for (let pane = 0; pane < panes; pane++) {
          const cell = split(paneWall[0]!, paneWall[1]!, paneWall[2]!, paneWall[3]!, pane, panes);
          const shrunk = inset(cell, side.side === 2 ? 0.34 : 0.2);
          quad(ctx, shrunk);
          if (apt.lit && side.side !== 2) {
            ctx.fillStyle = side.side === 0 ? "rgba(242, 197, 122, 0.62)" : "rgba(186, 214, 204, 0.5)";
            ctx.shadowColor = "rgba(232,165,75,0.7)";
            ctx.shadowBlur = 8;
          } else {
            ctx.fillStyle = "#100e0c";
            ctx.shadowBlur = 0;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          if (side.side !== 2) {
            openings.push({
              foot: { x: (shrunk[0]!.x + shrunk[1]!.x) / 2, y: (shrunk[0]!.y + shrunk[1]!.y) / 2 },
              head: { x: (shrunk[2]!.x + shrunk[3]!.x) / 2, y: (shrunk[2]!.y + shrunk[3]!.y) / 2 },
              along: { x: shrunk[1]!.x - shrunk[0]!.x, y: shrunk[1]!.y - shrunk[0]!.y },
            });
          }
        }
      }
      apt.residents.forEach((resident, index) => {
        const opening = openings[index % Math.max(1, openings.length)];
        if (!opening) return;
        const share = Math.floor(index / Math.max(1, openings.length));
        const nudge = resident.role === "person" ? 0 : resident.role === "pet" ? 0.34 : -0.34;
        const foot = {
          x: opening.foot.x + opening.along.x * (nudge + share * 0.12),
          y: opening.foot.y + opening.along.y * (nudge + share * 0.12),
        };
        const paneH = Math.hypot(opening.head.x - opening.foot.x, opening.head.y - opening.foot.y);
        const size = Math.max(10, paneH * (resident.role === "person" ? 0.92 : resident.role === "pet" ? 0.5 : 0.42));
        ctx.globalAlpha = apt.lit ? 1 : 0.6;
        drawXero(ctx, resident.emoji, foot.x, foot.y, size, { anchor: "feet" });
        ctx.globalAlpha = 1;
        if (resident.id === focusId) {
          ctx.strokeStyle = palette.teal;
          ctx.lineWidth = 2;
          ctx.strokeRect(foot.x - size * 0.5, foot.y - size, size, size);
        }
        hits.push({
          id: resident.id,
          name: resident.name,
          emoji: resident.emoji,
          role: resident.role,
          place: building.name,
          floor: apt.floor,
          detail: `${resident.name} the ${resident.role} lives at ${building.name}, floor ${apt.floor}. The city is in the ${city.era} era, research ${city.research}, and people are watching it get more sophisticated.`,
          x: foot.x - size * 0.5,
          y: foot.y - size,
          w: size,
          h: size,
        });
      });
    }

    const roofZ = floors * FH;
    const slab = 8;
    for (const side of sides) {
      const fascia = wall(col, row, roofZ, roofZ + slab, side.side).map(to);
      quad(ctx, fascia);
      ctx.fillStyle = side.side === 2 ? "#241e1a" : mat.edge;
      ctx.fill();
    }
    quad(ctx, top(col - 0.04, row - 0.04, roofZ + slab, 1.08, 1.08).map(to));
    ctx.fillStyle = mat.top;
    ctx.fill();
    ctx.strokeStyle = mat.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(243,234,215,0.35)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (const [c, r] of [
      [col, row],
      [col + 1, row],
      [col, row + 1],
      [col + 1, row + 1],
    ] as const) {
      const a = to(iso(c, r, 0));
      const b = to(iso(c, r, roofZ + slab));
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    const nearSides = new Set(sides.slice(-2).map((side) => side.side));
    if (nearSides.has(0)) glyph("🚪", col + 1.04, row + 0.5, 0, 22);
    if (nearSides.has(2)) glyph("🪜", col - 0.04, row + 0.55, FH, 20);
    if (nearSides.has(3)) glyph("🪴", col + 0.5, row - 0.04, 4, 16);
    if (nearSides.has(1)) glyph("🪧", col + 0.5, row + 1.04, FH * 0.45, 16);
    if (building.rising) glyph("🏗️", col + 0.55, row + 0.35, roofZ + slab, 30);

    if (building.material % 2 === 0) {
      const cap = ["📡", "🛰️", "📺", "🪺", "🎐"][building.material % 5]!;
      glyph(cap, col + 0.72, row + 0.28, roofZ + slab, 20);
    }

    const crown = to(iso(col + 0.5, row + 0.5, roofZ + 1));
    if (building.rising || building.kind === "tower" || building.kind === "skyscraper" || building.kind === "farmhouse") {
      ctx.font = `600 ${Math.max(10, 11 * view.scale)}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const plate = ctx.measureText(building.name).width + 10;
      ctx.fillStyle = "rgba(18,16,12,0.78)";
      ctx.fillRect(crown.x - plate / 2, crown.y - 8, plate, 16);
      ctx.fillStyle = palette.cream;
      ctx.fillText(building.name, crown.x, crown.y);
    }
  }

  ctx.fillStyle = palette.mute;
  ctx.font = "12px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("drag sideways to turn · drag down to level the view · two fingers move and zoom", 16, height - 16);
  return hits;
}
