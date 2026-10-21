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

/** Turn the view, but keep the ground under the cursor from sliding away. */
export function orbitBy(city: City, width: number, height: number, camera: Camera, px: number, py: number, dx: number, dy: number): Camera {
  const before = viewOf(city, width, height, camera);
  let col = (city.cols || 11) / 2;
  let row = (city.rows || 9) / 2;
  let best = Infinity;
  const stepC = Math.max(1, Math.floor((city.cols || 11) / 24));
  const stepR = Math.max(1, Math.floor((city.rows || 9) / 24));
  for (let r = 0; r <= (city.rows || 9); r += stepR) {
    for (let c = 0; c <= (city.cols || 11); c += stepC) {
      const p = iso(c, r, 0);
      const sx = p.x * before.scale + before.ox;
      const sy = p.y * before.scale + before.oy;
      const dist = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (dist < best) {
        best = dist;
        col = c;
        row = r;
      }
    }
  }
  const next: Camera = {
    ...camera,
    yaw: (camera.yaw || 0) - dx * 0.006,
    pitch: Math.min(1.15, Math.max(0.18, (camera.pitch ?? 0.76) - dy * 0.004)),
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
    quad(ctx, pts);
    if (!insideDistrict) {
      ctx.fillStyle = tile.row > spanR + 1 || tile.col < -2 ? "#1d4c56" : "#3b4e34";
    } else if (occupied.has(key)) ctx.fillStyle = "#241c16";
    else if (road) ctx.fillStyle = "#463f36";
    else if (farm) ctx.fillStyle = "#74602c";
    else ctx.fillStyle = (cellHash(tile.col, tile.row) % 3 === 0) ? "#4e673c" : "#466038";
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (insideDistrict && (road || farm)) {
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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
    props.push({
      depth: depthOf(col + 0.5, row + 0.5) - 0.08,
      draw: () => {
        const crossing = (east || west) && (north || south) && col % 5 === 0 && row % 5 === 0;
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
        if (crossing) {
          pave(band(col, row, col + 1, row + 0.18), "⬜");
          pave(band(col, row + 0.82, col + 1, row + 1), "⬜");
          pave(band(col, row + 0.18, col + 0.18, row + 0.82), "⬜");
          pave(band(col + 0.82, row + 0.18, col + 1, row + 0.82), "⬜");
          pave(band(col + 0.18, row + 0.42, col + 0.82, row + 0.58), "⬜");
          pave(band(col + 0.42, row + 0.18, col + 0.58, row + 0.82), "⬜");
          glyph("🚦", col + 0.5, row + 0.5, 2, 16, { feet: false, cover: true });
        } else if (east || west) {
          pave(band(col, row, col + 1, row + 0.16), "⬜");
          pave(band(col, row + 0.16, col + 1, row + 0.46), "⬛");
          pave(band(col, row + 0.46, col + 1, row + 0.54), "🟨");
          pave(band(col, row + 0.54, col + 1, row + 0.84), "⬛");
          pave(band(col, row + 0.84, col + 1, row + 1), "⬜");
        } else {
          pave(band(col, row, col + 0.16, row + 1), "⬜");
          pave(band(col + 0.16, row, col + 0.46, row + 1), "⬛");
          pave(band(col + 0.46, row, col + 0.54, row + 1), "🟨");
          pave(band(col + 0.54, row, col + 0.84, row + 1), "⬛");
          pave(band(col + 0.84, row, col + 1, row + 1), "⬜");
        }
        const hit = to(iso(col + 0.5, row + 0.5, 2));
        hits.push({
          id: `road-${key}`,
          name: crossing ? "Crossing" : "Road",
          emoji: "🛣️",
          role: "road",
          place: "the street",
          floor: 0,
          detail: crossing
            ? "A crossing paved in emoji: sidewalk, crosswalk stripes, and a light."
            : "Emoji lanes, a yellow divider, and a sidewalk along each curb.",
          x: hit.x - 18,
          y: hit.y - 12,
          w: 36,
          h: 24,
        });
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
  const walkers = ["🚶", "👩", "👨", "🧒", "🧳", "🐕", "🧑‍💼", "👵"];
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
    const col = crew.col + (crew.destCol - crew.col) * crew.progress;
    const row = crew.row + (crew.destRow - crew.row) * crew.progress;
    props.push({
      depth: depthOf(col + 0.5, row + 0.5),
      draw: () => {
        glyph(crew.emoji, col + 0.5, row + 0.5, 0, crew.task === "raise" ? 26 : crew.task === "haul" ? 30 : 22, {
          cover: true,
          dc: crew.destCol - crew.col,
          dr: crew.destRow - crew.row,
          ride: crew.emoji === "🚚",
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
        if (crew.cargo) {
          glyph(crew.cargo, col + 0.42, row + 0.12, 22, 78, {
            feet: false,
            huge: true,
            cover: true,
          });
        }
      },
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
  for (const prop of props) prop.draw();

  function windowScene(facade: string, floor: number, index: number, tick: number) {
  const scenes: Record<string, string[]> = {
    shop: ["🛒", "🍞", "🧋", "💳", "🧁"],
    gas: ["⛽", "🧃", "🚗", "🔧"],
    school: ["📚", "✏️", "🎒", "🍎"],
    hospital: ["🩺", "💊", "🛏️", "💉"],
    barn: ["🐄", "🌾", "🥚", "🥛"],
    tower: ["💼", "💻", "📞", "☕"],
    home: ["📺", "☕", "🪴", "🛏️"],
  };
  const list = scenes[facade] ?? scenes.home!;
  return list[(floor + index + Math.floor(tick / 80)) % list.length]!;
}

function paintBuilding(building: Building) {
    const floors = building.apartments.length;
    const { col, row } = building;
    if (floors === 0) {
      glyph("🪵", col + 0.28, row + 0.62, 0, 18);
      glyph("🧱", col + 0.55, row + 0.62, 0, 16);
      glyph("🚩", col + 0.72, row + 0.4, 10, 18);
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
    const cols = 10;
    const rowsEach = 5;
    const lerp = (p: Point, q: Point, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const cell = (pts: Point[], c: number, r: number, cSpan: number, rSpan: number) => {
      const topA = lerp(pts[3]!, pts[2]!, c / cols);
      const topB = lerp(pts[3]!, pts[2]!, (c + cSpan) / cols);
      const botA = lerp(pts[0]!, pts[1]!, c / cols);
      const botB = lerp(pts[0]!, pts[1]!, (c + cSpan) / cols);
      const p0 = lerp(topA, botA, r / (floors * rowsEach));
      const p1 = lerp(topB, botB, r / (floors * rowsEach));
      const p3 = lerp(topA, botA, (r + rSpan) / (floors * rowsEach));
      const p2 = { x: p1.x + (p3.x - p0.x), y: p1.y + (p3.y - p0.y) };
      return [p0, p1, p2, p3];
    };
    const stamp = (pts: Point[], c: number, r: number, emoji: string, cSpan = 1, rSpan = 1) => {
      const quadPts = cell(pts, c, r, cSpan, rSpan);
      const cx = (quadPts[0]!.x + quadPts[1]!.x + quadPts[2]!.x + quadPts[3]!.x) / 4;
      const cy = (quadPts[0]!.y + quadPts[1]!.y + quadPts[2]!.y + quadPts[3]!.y) / 4;
      const w = Math.hypot(quadPts[1]!.x - quadPts[0]!.x, quadPts[1]!.y - quadPts[0]!.y);
      const h = Math.hypot(quadPts[3]!.x - quadPts[0]!.x, quadPts[3]!.y - quadPts[0]!.y);
      const size = Math.min(w, h);
      if (size < 3) return;
      drawXero(ctx, emoji, cx, cy, size, { anchor: "center" });
    };
    const placeOnFace = (quadPts: Point[], emoji: string) => {
      let tl = quadPts[0]!;
      let tr = quadPts[1]!;
      let bl = quadPts[3]!;
      let br = quadPts[2]!;
      if (tr.x < tl.x) {
        [tl, tr] = [tr, tl];
        [bl, br] = [br, bl];
      }
      if (Math.hypot(tr.x - tl.x, tr.y - tl.y) < 3) return;
      drawXeroOnto(ctx, emoji, tl, tr, bl);
    };

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
    const frontMost = front[front.length - 1]?.side;

    for (const side of sides) {
      const pts = wall(col, row, 0, height, side.side).map(to);
      quad(ctx, pts);
      ctx.fillStyle = "rgba(28, 24, 20, 0.35)";
      ctx.fill();
      const facingStreet = front.some((item) => item.side === side.side);
      for (let floor = 0; floor < floors; floor++) {
        const y0 = floor * rowsEach;
        const open = building.rising && floor === floors - 1;
        for (let rr = 0; rr < rowsEach; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const windowBay = facingStreet && rr >= 1 && rr <= 3 && ((cc >= 1 && cc <= 3) || (cc >= 6 && cc <= 8));
            const door = facingStreet && side.side === frontMost && floor === 0 && cc >= 4 && cc <= 5 && rr >= 1;
            if (windowBay || door) continue;
            const pier = cc === 0 || cc === cols - 1 || rr === 0 || rr === rowsEach - 1;
            stamp(pts, cc, y0 + rr, open ? "🏗️" : pier ? skin.pier : skin.mass);
          }
        }
        if (facingStreet) {
          placeOnFace(inset(cell(pts, 1, y0 + 1, 3, 3), 0.08), open ? "🏗️" : skin.bay);
          placeOnFace(inset(cell(pts, 6, y0 + 1, 3, 3), 0.08), open ? "🏗️" : skin.bay);
          if (floor === 1 && !open) stamp(pts, 4, y0 + 4, skin.sill);
        }
      }
      if (facingStreet && side.side === frontMost) {
        placeOnFace(cell(pts, 4, 1, 2, 4), "🚪");
      }
    }

    for (const apt of building.apartments) {
      const people = [...apt.residents].sort((a, b) => (a.role === "person" ? 0 : 1) - (b.role === "person" ? 0 : 1));
      const host = front[front.length - 1];
      if (!host || people.length === 0) continue;
      const pts = wall(col, row, 0, height, host.side).map(to);
      const y0 = (apt.floor - 1) * rowsEach;
      people.slice(0, 2).forEach((resident, index) => {
        const pane = inset(cell(pts, index === 0 ? 1 : 6, y0 + 1, 3, 3), 0.28);
        const flip = pane[1]!.x < pane[0]!.x;
        const foot = { x: (pane[2]!.x + pane[3]!.x) / 2, y: (pane[2]!.y + pane[3]!.y) / 2 };
        const paneW = Math.hypot(pane[1]!.x - pane[0]!.x, pane[1]!.y - pane[0]!.y);
        const paneH = Math.hypot(pane[3]!.x - pane[0]!.x, pane[3]!.y - pane[0]!.y);
        const size = Math.min(paneW, paneH) * 0.9;
        ctx.save();
        quad(ctx, pane);
        ctx.clip();
        ctx.fillStyle = apt.lit ? "rgba(255, 206, 140, 0.94)" : "rgba(16, 18, 24, 0.94)";
        ctx.fill();
        drawXero(ctx, resident.emoji, foot.x, foot.y, size, { anchor: "feet", flip });
        if (resident.role === "person") {
          const scene = windowScene(facade, apt.floor, index, city.tick || 0);
          drawXero(ctx, scene, foot.x + (flip ? -1 : 1) * size * 0.28, foot.y, size * 0.42, { anchor: "feet", flip });
        }
        ctx.restore();
        const xs = pane.map((p) => p.x);
        const ys = pane.map((p) => p.y);
        hits.push({
          id: resident.id,
          name: resident.name,
          emoji: resident.emoji,
          role: resident.role,
          place: building.name,
          floor: apt.floor,
          detail: `${resident.name} is inside ${building.name}, floor ${apt.floor}. The window is one pane in a wall of emoji.`,
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        });
      });
    }

    const roofZ = floors * FH;
    const roof = top(col, row, roofZ + 4, 1, 1).map(to);
    quad(ctx, roof);
    ctx.fillStyle = "rgba(20,16,12,0.25)";
    ctx.fill();
    for (let rr = 0; rr < 4; rr++) {
      for (let cc = 0; cc < 4; cc++) {
        const topA = lerp(roof[0]!, roof[1]!, cc / 4);
        const topB = lerp(roof[0]!, roof[1]!, (cc + 1) / 4);
        const botA = lerp(roof[3]!, roof[2]!, cc / 4);
        const botB = lerp(roof[3]!, roof[2]!, (cc + 1) / 4);
        const p0 = lerp(topA, botA, rr / 4);
        const p1 = lerp(topB, botB, rr / 4);
        const p3 = lerp(topA, botA, (rr + 1) / 4);
        const cx = (p0.x + p1.x + p3.x + (p1.x + p3.x - p0.x)) / 4;
        const cy = (p0.y + p1.y + p3.y + (p1.y + p3.y - p0.y)) / 4;
        const size = Math.min(Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.hypot(p3.x - p0.x, p3.y - p0.y));
        if (size < 3) continue;
        drawXero(ctx, rr === 0 || cc === 0 ? skin.pier : skin.roof, cx, cy, size, { anchor: "center" });
      }
    }
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
  }

  ctx.fillStyle = palette.mute;
  ctx.font = "12px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`world ${spanC}×${spanR} · drag pulls the city with you · right-drag turns around your hand`, 16, height - 16);
  return hits;
}
