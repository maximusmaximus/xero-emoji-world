/**
 * Converts CityState into a flat list of positioned glyphs ("sprites") in world pixels.
 * The view is a cut-away elevation: every district is a strip of blocks; every lot shows
 * its building sliced open floor-by-floor so each apartment's people, pets and things are
 * visible. Districts are tiled on a grid by (gx, gy).
 */
import type { Building, CityState, District, StreetThing } from '@xew/shared';

export const CELL = 24;                 // px per glyph cell
export const LOT_COLS = 9;              // cells per lot
export const LOTS_PER_BLOCK = 6;
export const ROAD_COLS = 2;
export const SKY_ROWS = 4;
export const MAX_FLOORS = 40;
export const GROUND_ROWS = 3;
export const DISTRICT_ROWS = SKY_ROWS + MAX_FLOORS + 2 + GROUND_ROWS;

export type RefKind = 'person' | 'pet' | 'item' | 'building' | 'apartment' | 'street' | 'sky' | 'district' | 'ground';
export interface Sprite {
  x: number; y: number; g: string; size: number;
  ref: { kind: RefKind; id: string; label: string; parentId?: string };
  /** moving sprites: x = base + (t*speed) mod span */
  move?: { speed: number; span: number; base: number };
  dim?: boolean;
}
export interface Panel { x: number; y: number; w: number; h: number; fill: string; label?: string; }
export interface Layout { width: number; height: number; sprites: Sprite[]; panels: Panel[]; }

const districtCols = (d: District) => d.blocks.length * (LOTS_PER_BLOCK * LOT_COLS + ROAD_COLS);
const KIND_TINT: Record<District['kind'], string> = {
  downtown: '#1c2140', tech: '#132a35', residential: '#24203a', waterfront: '#0f2a40', oldtown: '#2e2224', industrial: '#262626', parkland: '#132c1c',
};

export function computeLayout(state: CityState): Layout {
  const sprites: Sprite[] = []; const panels: Panel[] = [];
  const gxs = state.districts.map((d) => d.gx), gys = state.districts.map((d) => d.gy);
  const minX = Math.min(0, ...gxs), minY = Math.min(0, ...gys);
  const maxCols = Math.max(...state.districts.map(districtCols), 1);
  const colW = maxCols * CELL, rowH = DISTRICT_ROWS * CELL;

  for (const d of state.districts) {
    const ox = (d.gx - minX) * colW, oy = (d.gy - minY) * rowH;
    panels.push({ x: ox, y: oy, w: colW, h: rowH, fill: KIND_TINT[d.kind], label: `${d.name} · ${d.kind}` });
    // sky
    state.sky.forEach((s, i) => sprites.push({ x: ox + ((i * 137) % maxCols) * CELL, y: oy + (1 + (i % 3)) * CELL, g: s.emoji, size: CELL,
      ref: { kind: 'sky', id: s.id, label: 'sky' }, move: { speed: 4 + (i % 5), span: colW, base: ox } }));
    const groundY = oy + (SKY_ROWS + MAX_FLOORS + 1) * CELL;
    panels.push({ x: ox, y: groundY + CELL, w: colW, h: CELL, fill: '#2b2b33' }); // road
    let cx = ox;
    for (const b of d.blocks) {
      for (const lot of b.lots) {
        if (lot.building) layoutBuilding(lot.building, cx, groundY, state, sprites, panels);
        for (const gnd of lot.ground)
          sprites.push({ x: cx + gnd.x * (LOT_COLS - 1) * CELL, y: groundY, g: gnd.emoji, size: CELL, ref: { kind: 'ground', id: gnd.id, label: gnd.kind } });
        cx += LOT_COLS * CELL;
      }
      layoutStreet(b.street, cx - LOTS_PER_BLOCK * LOT_COLS * CELL, groundY + CELL, sprites);
      sprites.push({ x: cx, y: groundY, g: '🚦', size: CELL, ref: { kind: 'street', id: b.id + ':light', label: 'traffic light' } });
      cx += ROAD_COLS * CELL;
    }
  }
  const cols = Math.max(...gxs, 0) - minX + 1, rows = Math.max(...gys, 0) - minY + 1;
  return { width: cols * colW, height: rows * rowH, sprites, panels };
}

function layoutBuilding(b: Building, x: number, groundY: number, state: CityState, sprites: Sprite[], panels: Panel[]) {
  const w = (LOT_COLS - 1) * CELL;
  const h = b.floors.length * CELL;
  panels.push({ x, y: groundY - h + CELL, w, h, fill: b.underConstruction ? '#3a3020' : '#2a2f55' });
  b.floors.forEach((floor, fi) => {
    const y = groundY - fi * CELL;
    const per = Math.max(1, Math.floor((LOT_COLS - 1) / floor.apartments.length));
    floor.apartments.forEach((apt, ai) => {
      const ax = x + ai * per * CELL;
      const glyphs: Sprite[] = [];
      for (const rid of apt.residentIds) { const p = state.people[rid]; if (p) glyphs.push({ x: 0, y, g: p.emoji, size: CELL, ref: { kind: 'person', id: p.id, label: p.name, parentId: apt.id } }); }
      for (const pet of apt.pets) glyphs.push({ x: 0, y, g: pet.emoji, size: CELL, ref: { kind: 'pet', id: pet.id, label: pet.name, parentId: apt.id } });
      for (const it of apt.items) glyphs.push({ x: 0, y, g: it.emoji, size: CELL, ref: { kind: 'item', id: it.id, label: it.label, parentId: apt.id } });
      if (!glyphs.length) glyphs.push({ x: 0, y, g: '🪟', size: CELL, ref: { kind: 'apartment', id: apt.id, label: `Apt ${apt.number}` } });
      // squeeze everything into the apartment's cells
      const slots = per; const scale = Math.min(1, slots / glyphs.length);
      glyphs.forEach((s, i) => { s.x = ax + i * CELL * scale; s.size = Math.max(10, CELL * Math.max(scale, 0.5)); s.dim = !apt.lightsOn; sprites.push(s); });
      panels.push({ x: ax, y: y - CELL + 2, w: per * CELL - 2, h: CELL - 2, fill: apt.lightsOn ? 'rgba(255,216,74,.10)' : 'rgba(0,0,0,.25)' });
    });
  });
  const topY = groundY - b.floors.length * CELL;
  sprites.push({ x: x + w / 2 - CELL / 2, y: topY, g: b.underConstruction ? '🏗️' : b.emoji, size: CELL * 1.2, ref: { kind: 'building', id: b.id, label: b.name } });
  if (b.underConstruction) sprites.push({ x: x + w / 2 + CELL / 2, y: topY, g: '👷', size: CELL * 0.9, ref: { kind: 'building', id: b.id, label: b.name } });
}

function layoutStreet(street: StreetThing[], x: number, y: number, sprites: Sprite[]) {
  const span = LOTS_PER_BLOCK * LOT_COLS * CELL;
  for (const s of street) {
    const moving = s.kind === 'vehicle' || s.kind === 'walker';
    sprites.push({ x: x + (s.x / LOTS_PER_BLOCK) * span, y: s.kind === 'vehicle' ? y + CELL : y, g: s.emoji, size: CELL,
      ref: { kind: 'street', id: s.id, label: s.kind },
      move: moving ? { speed: s.kind === 'vehicle' ? 30 + (s.id.charCodeAt(4) % 40) : 8, span, base: x } : undefined });
  }
}
