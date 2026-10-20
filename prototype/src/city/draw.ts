import { drawXero } from "./xero-emoji";
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

export type Camera = { zoom: number; panX: number; panY: number; yaw: number };

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
  return { zoom: 1, panX: 0, panY: 0, yaw: 0 };
}

let viewYaw = 0;

function cellHash(col: number, row: number) {
  let h = Math.imul(col | 0, 374761393) ^ Math.imul(row | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function iso(col: number, row: number, z = 0): Point {
  const ca = Math.cos(viewYaw);
  const sa = Math.sin(viewYaw);
  const u = col * ca - row * sa;
  const v = col * sa + row * ca;
  return { x: (u - v) * (TW / 2), y: (u + v) * (TH / 2) - z };
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

export function viewOf(city: City, width: number, height: number, camera: Camera): View {
  viewYaw = camera.yaw || 0;
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

function face(col: number, row: number, z0: number, z1: number, side: "left" | "right"): Point[] {
  if (side === "right") {
    return [iso(col + 1, row, z0), iso(col + 1, row + 1, z0), iso(col + 1, row + 1, z1), iso(col + 1, row, z1)];
  }
  return [iso(col, row + 1, z0), iso(col + 1, row + 1, z0), iso(col + 1, row + 1, z1), iso(col, row + 1, z1)];
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
  const corners = [
    { x: -40, y: -40 },
    { x: width + 40, y: -40 },
    { x: -40, y: height + 40 },
    { x: width + 40, y: height + 40 },
  ].map((p) => {
    const wx = (p.x - view.ox) / view.scale;
    const wy = (p.y - view.oy) / view.scale;
    return { col: wx / TW + wy / TH, row: wy / TH - wx / TW };
  });
  let minC = Math.floor(Math.min(...corners.map((c) => c.col))) - 1;
  let minR = Math.floor(Math.min(...corners.map((c) => c.row))) - 1;
  let maxC = Math.ceil(Math.max(...corners.map((c) => c.col))) + 1;
  let maxR = Math.ceil(Math.max(...corners.map((c) => c.row))) + 1;
  minC = Math.max(-12, minC);
  minR = Math.max(-12, minR);
  maxC = Math.min(spanC + 6, maxC);
  maxR = Math.min(spanR + 6, maxR);

  const roadSet = new Set(city.roads ?? []);
  const farmAt = new Map((city.farms ?? []).map((farm) => [`${farm.col},${farm.row}`, farm]));

  const ground: { col: number; row: number }[] = [];
  for (let row = minR; row < maxR; row++) {
    for (let col = minC; col < maxC; col++) ground.push({ col, row });
  }
  ground.sort((a, b) => a.col + a.row - (b.col + b.row));

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
      hit?: { id: string; name: string; role: Hit["role"]; place: string; floor?: number; detail: string };
    },
  ) => {
    const p = to(iso(col, row, z));
    const size = Math.max(12, world * view.scale);
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
    return 0.42 + n * 0.25 + watch * (0.55 + n * 0.7);
  };

  for (const cell of city.trees ?? []) {
    const [col, row] = cell.split(",").map(Number) as [number, number];
    const emoji = (col + row) % 2 === 0 ? "🌳" : "🌲";
    const scale = growOf(col, row);
    props.push({
      depth: col + row + 0.15,
      draw: () =>
        glyph(emoji, col + 0.5, row + 0.45, 0, 28 * scale, {
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
    const world = (16 + farm.growth * 30) * (0.85 + watch * 0.35);
    props.push({
      depth: farm.col + farm.row + 0.2,
      draw: () =>
        glyph(emoji, farm.col + 0.5, farm.row + 0.5, 0, world, {
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
      if (h % 6 !== 0) continue;
      const emoji = pool[h % pool.length]!;
      const scale = emoji === "🪨" || emoji === "🪵" ? 0.8 : growOf(col, row);
      props.push({
        depth: col + row + 0.12,
        draw: () =>
          glyph(emoji, col + 0.5, row + 0.5, 0, 16 * scale, {
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
    const emoji = junction ? "🚦" : (col * 3 + row) % 9 === 0 ? "🚏" : "🛣️";
    props.push({
      depth: col + row + 0.08,
      draw: () =>
        glyph(emoji, col + 0.5, row + 0.5, 0, junction ? 26 : 46, {
          hit: {
            id: `road-${key}`,
            name: junction ? "Crossing" : "Road",
            role: "road",
            place: "the road",
            detail: junction
              ? "A crossing where the emoji roads meet. Carts have to take a turn."
              : `A stretch of road made of ${emoji}. It was paved one cell at a time and can keep going.`,
          },
        }),
    });
  }
  for (const crew of city.crews ?? []) {
    const col = crew.col + (crew.destCol - crew.col) * crew.progress;
    const row = crew.row + (crew.destRow - crew.row) * crew.progress;
    props.push({
      depth: col + row + 0.8,
      draw: () =>
        glyph(crew.emoji, col + 0.5, row + 0.5, 0, crew.task === "raise" ? 28 : 24, {
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
      { emoji: "🚲", world: 22, speed: 0.15, name: "Bicycle" },
      { emoji: "🚗", world: 30, speed: 0.22, name: "Car" },
      { emoji: "🚜", world: 34, speed: 0.08, name: "Tractor" },
      { emoji: "🚌", world: 40, speed: 0.12, name: "Bus" },
      { emoji: "🚚", world: 42, speed: 0.1, name: "Truck" },
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
        depth: col + row + 0.55,
        draw: () =>
          glyph(ride.emoji, col, row, 0, ride.world, {
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
    const world = (emoji === "🌙" || emoji === "🪐" || emoji === "🌍" || emoji === "☀️" ? 40 : 22) * (0.75 + watch * 0.5);
    props.push({
      depth: -30 - i,
      draw: () =>
        glyph(emoji, col, row, z, world, {
          feet: false,
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
      depth: building.col + building.row + 0.5,
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

    quad(ctx, face(col, row, 0, floors * FH, "left").map(to));
    ctx.fillStyle = mat.left;
    ctx.fill();
    quad(ctx, face(col, row, 0, floors * FH, "right").map(to));
    ctx.fillStyle = mat.right;
    ctx.fill();

    for (const apt of building.apartments) {
      const z0 = (apt.floor - 1) * FH;
      const z1 = apt.floor * FH;
      const openings: { foot: Point; head: Point; along: Point }[] = [];
      for (const side of ["left", "right"] as const) {
        const wall = face(col, row, z0 + FH * 0.16, z1 - FH * 0.06, side).map(to);
        for (const pane of [0, 1]) {
          const cell = split(wall[0]!, wall[1]!, wall[2]!, wall[3]!, pane, 2);
          const shrunk = inset(cell, 0.22);
          quad(ctx, shrunk);
          if (apt.lit) {
            ctx.fillStyle = "rgba(242, 197, 122, 0.5)";
            ctx.shadowColor = "rgba(232,165,75,0.85)";
            ctx.shadowBlur = 12;
          } else {
            ctx.fillStyle = "#14110e";
            ctx.shadowBlur = 0;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          openings.push({
            foot: { x: (shrunk[0]!.x + shrunk[1]!.x) / 2, y: (shrunk[0]!.y + shrunk[1]!.y) / 2 },
            head: { x: (shrunk[2]!.x + shrunk[3]!.x) / 2, y: (shrunk[2]!.y + shrunk[3]!.y) / 2 },
            along: { x: shrunk[1]!.x - shrunk[0]!.x, y: shrunk[1]!.y - shrunk[0]!.y },
          });
        }
      }
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      const seam = [iso(col, row + 1, z1), iso(col + 1, row + 1, z1), iso(col + 1, row, z1)].map(to);
      ctx.moveTo(seam[0]!.x, seam[0]!.y);
      ctx.lineTo(seam[1]!.x, seam[1]!.y);
      ctx.lineTo(seam[2]!.x, seam[2]!.y);
      ctx.stroke();

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
    glyph("🚪", col + 0.78, row + 1.06, 0, 22);
    if (building.rising) glyph("🏗️", col + 0.55, row + 0.35, roofZ, 30);
    quad(ctx, top(col, row, roofZ).map(to));
    ctx.fillStyle = mat.top;
    ctx.fill();
    ctx.strokeStyle = mat.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (building.material % 2 === 0) {
      const cap = ["📡", "🛰️", "📺", "🪺", "🎐"][building.material % 5]!;
      glyph(cap, col + 0.72, row + 0.28, roofZ, 20);
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
  ctx.fillText("one finger turns · two fingers move and zoom · tap any emoji", 16, height - 16);
  return hits;
}
