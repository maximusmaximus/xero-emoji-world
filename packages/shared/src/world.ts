/**
 * The World layer: emoji-alchemy, compounding growth and inference-driven decrees.
 *
 * The city is literally built from emojis. Completed buildings HARVEST element
 * emojis (🧱 from industry, 💧 from the waterfront, 📜 from old town...). Construction
 * CONSUMES them. Residents run ALCHEMY: two element emojis combine into a new one
 * (🪨+🔥→🧱, 💡+📜→📚, 🔮+🌌→🪄...). Every distinct discovery raises `knowledge`, and
 * the harvest multiplier is `GROWTH_BASE ** knowledge`, so production compounds.
 * Stockpiles spoil a little each harvest and wonder prices scale with the multiplier,
 * so growth stays a race rather than a runaway.
 * Discovered outputs become new inputs, so the recipe graph widens combinatorially.
 *
 * Every so often an ORACLE (an LLM on the server, or the deterministic local fallback
 * below) reads a summary of the world and issues a DECREE: a new era name, a prophecy,
 * new recipes, a WONDER to build out of emojis, and multipliers on behaviour weights.
 * Decrees enter the simulation as an ordinary action/patch, so clients stay in lockstep
 * and replays stay deterministic. Everything here is pure (no Math.random, no I/O).
 */
import { EMOJI_CATALOG, emojiInfo, emojisWithRole } from './emoji-catalog.js';
import { Rng } from './rng.js';
import type { CityState, DistrictKind } from './types.js';

export const BEHAVIOUR_KEYS = ['found', 'build', 'immigrate', 'family', 'economy', 'leisure', 'streets', 'alchemy', 'wonder'] as const;
export type BehaviourKey = (typeof BEHAVIOUR_KEYS)[number];

export interface Recipe { a: string; b: string; out: string; name: string; source: 'base' | 'oracle' | 'local'; discoveredAtTick?: number }
export interface Wonder {
  id: string; emoji: string; name: string;
  cost: Record<string, number>; paid: Record<string, number>;
  proposedAtTick: number; builtAtTick?: number; buildingId?: string; source: 'oracle' | 'local';
}
export interface WorldState {
  era: number; eraName: string; essence: string;
  /** Count of distinct discoveries + wonder bonuses. Drives the compounding multiplier. */
  knowledge: number;
  materials: Record<string, number>;
  recipes: Recipe[];
  wonders: Wonder[];
  boosts: Partial<Record<BehaviourKey, number>>;
  /** Latest prophecies / decrees, newest last (bounded). */
  chronicle: string[];
  lastDecreeTick: number;
  oracle: string;
  /** Oracle spend for the current UTC day, as of the last decree (absent when no LLM is configured). */
  oracleBudget?: OracleBudget;
}
export interface OracleBudget { day: string; spentUsd: number; capUsd: number; remainingUsd: number; calls: number; capped: boolean }

/** What an oracle may return. Everything is optional and sanitised before use. */
export interface Decree {
  eraName?: string; essence?: string; prophecy?: string;
  recipes?: { a: string; b: string; out: string; name: string }[];
  wonder?: { emoji: string; name: string; cost: Record<string, number> };
  boosts?: Partial<Record<BehaviourKey, number>>;
}

export const GROWTH_BASE = 1.12;
export const HARVEST_EVERY = 5;
export const FLOOR_COST: Record<string, number> = { '🧱': 3 };
export const CHRONICLE_MAX = 24;
/** Fraction of every stockpile lost per harvest. */
export const SPOILAGE = 0.03;
export const MAX_RECIPES = 120;

/** What each district kind harvests. The first glyph is its main export. */
export const DISTRICT_YIELD: Record<DistrictKind, string[]> = {
  downtown: ['🪙', '💡'], residential: ['🍞', '🌱'], industrial: ['🧱', '🔥', '⚙️'], waterfront: ['💧', '🌊'],
  parkland: ['🌳', '🌱', '🍯'], oldtown: ['📜', '🪨'], tech: ['⚡', '💡', '🧲'],
};

/** The seed recipe graph. Oracles extend it with their own inventions. */
export const BASE_RECIPES: Recipe[] = ([
  ['🪨', '🔥', '🧱', 'kiln-fired brick'], ['🌱', '💧', '🌾', 'first harvest'], ['🌾', '🔥', '🍞', 'bread ovens'],
  ['🌳', '⚙️', '🪵', 'sawmills'], ['🪨', '⚙️', '⛏️', 'the pick'], ['⚙️', '⚡', '💡', 'the light bulb'],
  ['💡', '📜', '📚', 'libraries'], ['📚', '💡', '🔭', 'astronomy'], ['⛏️', '🪨', '💎', 'gem mining'],
  ['💧', '⚡', '🧪', 'chemistry'], ['🧪', '🌱', '🧬', 'genetics'], ['💎', '📚', '🔮', 'divination'],
  ['🔭', '💎', '🌌', 'star maps'], ['🔮', '🌊', '🫧', 'dream bubbles'], ['🌊', '⚡', '🌀', 'storm engines'],
  ['🌌', '🔮', '🪄', 'true magic'], ['🪄', '🌳', '🦄', 'unicorn groves'], ['🪄', '🔥', '🐉', 'dragon hatcheries'],
  ['🧬', '🪄', '✨', 'living light'], ['🔥', '🌀', '🌋', 'raising volcanoes'],
] as const).map(([a, b, out, name]) => ({ a, b, out, name, source: 'base' as const }));

const ERA_NAMES = ['Age of Clay', 'Age of Bread', 'Age of Gears', 'Age of Light', 'Age of Stars', 'Age of Crystals', 'Age of Magic', 'Age of Dragons', 'Age of Myth'];

export function createWorld(): WorldState {
  return {
    era: 0, eraName: ERA_NAMES[0]!, essence: '🧱', knowledge: 0,
    materials: { '🧱': 60, '🪨': 20, '🔥': 10, '💧': 20, '🌱': 20 },
    recipes: BASE_RECIPES.map((r) => ({ ...r })), wonders: [], boosts: {},
    chronicle: ['✨ The emojis woke up and began to build a world out of themselves.'], lastDecreeTick: 0, oracle: 'none',
  };
}

/** Back-fill `world` on snapshots from before this layer existed. Idempotent. */
export function ensureWorld(state: CityState): WorldState {
  return (state.world ??= createWorld());
}

export const eraFor = (knowledge: number) => Math.floor(Math.log2(1 + knowledge));
export const growthMultiplier = (w: WorldState) => GROWTH_BASE ** w.knowledge * (1 + 0.25 * builtWonders(w).length);
export const builtWonders = (w: WorldState) => w.wonders.filter((x) => x.builtAtTick !== undefined);
export const pendingWonder = (w: WorldState) => w.wonders.find((x) => x.builtAtTick === undefined);
export const boost = (w: WorldState, k: BehaviourKey) => w.boosts[k] ?? 1;
export const has = (w: WorldState, cost: Record<string, number>) => Object.entries(cost).every(([e, n]) => (w.materials[e] ?? 0) >= n);
export function spend(w: WorldState, cost: Record<string, number>) { for (const [e, n] of Object.entries(cost)) w.materials[e] = (w.materials[e] ?? 0) - n; }
export function gain(w: WorldState, e: string, n: number) { if (n > 0) w.materials[e] = (w.materials[e] ?? 0) + n; }
export const discovered = (w: WorldState) => w.recipes.filter((r) => r.discoveredAtTick !== undefined);
export function chronicle(w: WorldState, line: string) { w.chronicle.push(line); if (w.chronicle.length > CHRONICLE_MAX) w.chronicle.splice(0, w.chronicle.length - CHRONICLE_MAX); }

/** Recompute knowledge/era after a discovery or wonder. Returns true if a new era began. */
export function refreshEra(w: WorldState): boolean {
  w.knowledge = new Set(discovered(w).map((r) => r.out)).size + 3 * builtWonders(w).length;
  const era = eraFor(w.knowledge);
  if (era <= w.era) return false;
  w.era = era; w.eraName = ERA_NAMES[Math.min(era, ERA_NAMES.length - 1)]!;
  return true;
}

/** Harvest: each completed building yields its district's emojis, scaled by the compounding multiplier. */
export function harvest(state: CityState, w: WorldState, completedByKind: Partial<Record<DistrictKind, number>>): Record<string, number> {
  const mult = growthMultiplier(w);
  // spoilage: stockpiles slowly decay, so production must keep compounding to stay ahead
  for (const e of Object.keys(w.materials)) w.materials[e] = Math.floor(w.materials[e]! * (1 - SPOILAGE));
  const got: Record<string, number> = {};
  for (const [kind, n] of Object.entries(completedByKind) as [DistrictKind, number][]) {
    DISTRICT_YIELD[kind].forEach((e, i) => {
      const q = Math.floor((n * mult) / (i + 1) / 4);
      if (q > 0) { gain(w, e, q); got[e] = (got[e] ?? 0) + q; }
    });
  }
  const coins = Math.floor((Object.keys(state.people).length / 200) * mult);
  if (coins > 0) { gain(w, '🪙', coins); got['🪙'] = (got['🪙'] ?? 0) + coins; }
  return got;
}

const isGlyph = (g: unknown): g is string => typeof g === 'string' && !!emojiInfo(g);
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/**
 * Validate and clamp an oracle decree. Untrusted model output never reaches state
 * without passing through here: unknown emojis are dropped, numbers are bounded.
 */
export function sanitizeDecree(raw: unknown, w: WorldState): Decree {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Decree = {};
  const eraName = clean(d.eraName, 48); if (eraName) out.eraName = eraName;
  if (isGlyph(d.essence)) out.essence = d.essence;
  const prophecy = clean(d.prophecy, 280); if (prophecy) out.prophecy = prophecy;
  if (Array.isArray(d.recipes)) {
    const known = new Set(w.recipes.map((r) => [r.a, r.b].sort().join('+')));
    out.recipes = d.recipes.slice(0, 4).flatMap((r: Record<string, unknown>) => {
      if (!r || !isGlyph(r.a) || !isGlyph(r.b) || !isGlyph(r.out) || r.out === r.a || r.out === r.b) return [];
      const key = [r.a, r.b].sort().join('+'); if (known.has(key)) return []; known.add(key);
      return [{ a: r.a, b: r.b, out: r.out, name: clean(r.name, 48) || 'a strange new craft' }];
    });
  }
  const wd = d.wonder as Record<string, unknown> | undefined;
  if (wd && isGlyph(wd.emoji) && wd.cost && typeof wd.cost === 'object') {
    const cost = Object.fromEntries(Object.entries(wd.cost as Record<string, unknown>)
      .filter(([e, n]) => isGlyph(e) && typeof n === 'number' && n > 0)
      .slice(0, 5).map(([e, n]) => [e, Math.min(Math.max(Math.ceil(wonderBudget(w) / 4), Math.round(n as number)), wonderBudget(w) * 2)]));
    if (Object.keys(cost).length) out.wonder = { emoji: wd.emoji, name: clean(wd.name, 60) || emojiInfo(wd.emoji)!.name, cost };
  }
  if (d.boosts && typeof d.boosts === 'object') {
    const b: Decree['boosts'] = {};
    for (const k of BEHAVIOUR_KEYS) { const v = (d.boosts as Record<string, unknown>)[k]; if (typeof v === 'number' && Number.isFinite(v)) b[k] = Math.min(3, Math.max(0.33, v)); }
    if (Object.keys(b).length) out.boosts = b;
  }
  return out;
}

/** Wonders get exponentially pricier per era, so each one is a real project. */
export const wonderBudget = (w: WorldState) => Math.round(40 * 2 ** w.era * growthMultiplier(w));

/** Apply a sanitised decree to a world (mutates). Returns the story sentence. */
export function applyDecree(w: WorldState, d: Decree, tick: number, source: 'oracle' | 'local', oracleName: string, idFor: () => string): string {
  const parts: string[] = [];
  if (d.eraName) { w.eraName = d.eraName; parts.push(`proclaimed the ${d.eraName}`); }
  if (d.essence) w.essence = d.essence;
  for (const r of d.recipes ?? []) if (w.recipes.length < MAX_RECIPES) { w.recipes.push({ ...r, source }); parts.push(`revealed ${r.a}+${r.b}→${r.out}`); }
  if (d.wonder && !pendingWonder(w)) {
    w.wonders.push({ id: idFor(), emoji: d.wonder.emoji, name: d.wonder.name, cost: d.wonder.cost, paid: {}, proposedAtTick: tick, source });
    parts.push(`called for ${d.wonder.emoji} ${d.wonder.name} (${Object.entries(d.wonder.cost).map(([e, n]) => `${e}×${n}`).join(' ')})`);
  }
  if (d.boosts) { w.boosts = { ...d.boosts }; parts.push('reshaped the city\'s urges'); }
  w.lastDecreeTick = tick; w.oracle = oracleName;
  const text = `🔮 The ${source === 'oracle' ? 'Oracle' : 'city spirit'} ${parts.join(', ') || 'watched in silence'}.${d.prophecy ? ` “${d.prophecy}”` : ''}`;
  chronicle(w, text);
  return text;
}

/**
 * Deterministic fallback oracle: used when no LLM is configured or it fails, and in tests.
 * It reads the same summary an LLM would and makes a plausible, growth-oriented decree.
 */
export function localDecree(state: CityState, w: WorldState, tick: number): Decree {
  const r = Rng.at(state.seed, 'decree', tick);
  const stocked = Object.entries(w.materials).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([e]) => e);
  const d: Decree = { prophecy: r.pick(PROPHECIES) };
  // invent a recipe joining two of the most abundant materials into a new element
  const elements = emojisWithRole('element').map((e) => e.glyph);
  const a = stocked[0], b = stocked[1];
  if (a && b) {
    const out = r.pick(elements.filter((e) => e !== a && e !== b));
    d.recipes = [{ a, b, out, name: `the ${r.pick(['whispering', 'singing', 'folded', 'mirrored', 'midnight'])} ${emojiInfo(out)!.name}` }];
  }
  if (!pendingWonder(w)) {
    const pool = [...emojisWithRole('landmark'), ...emojisWithRole('element').filter((e) => e.roles.includes('landmark'))].map((e) => e.glyph);
    const emoji = r.pick(pool); const budget = wonderBudget(w);
    const cost = Object.fromEntries(stocked.slice(0, 3).map((e, i) => [e, Math.max(5, Math.round(budget / (i + 1)))]));
    if (Object.keys(cost).length) d.wonder = { emoji, name: `the ${r.pick(['Great', 'Eternal', 'Floating', 'Crystal', 'Sleeping'])} ${emojiInfo(emoji)!.name}`, cost };
  }
  const occupancy = state.stats.apartments ? state.stats.population / (state.stats.apartments * 2) : 1;
  d.boosts = { build: occupancy > 0.8 ? 2 : 1, immigrate: occupancy < 0.5 ? 2 : 1, alchemy: 1 + Math.min(2, w.era * 0.25), wonder: 1.5 };
  return sanitizeDecree(d, w);
}

const PROPHECIES = [
  'From brick and droplet the towers will learn to sing.', 'What is mixed today will be a district tomorrow.',
  'The city dreams in emoji and wakes a little larger.', 'Every glyph is a seed; every seed a skyline.',
  'When the wonder stands, the next age begins.', 'Fire remembers the stone it baked.',
];

/** Compact, model-friendly summary of the world for the oracle prompt. */
export function worldSummary(state: CityState, recent: string[]): Record<string, unknown> {
  const w = ensureWorld(state);
  return {
    tick: state.tick, era: w.era, eraName: w.eraName, essence: w.essence, knowledge: w.knowledge,
    growthMultiplier: Number(growthMultiplier(w).toFixed(2)), stats: state.stats,
    districts: state.districts.map((d) => d.kind).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
    materials: Object.fromEntries(Object.entries(w.materials).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    discovered: discovered(w).map((r) => `${r.a}+${r.b}=${r.out}`), undiscovered: w.recipes.length - discovered(w).length,
    wonders: w.wonders.map((x) => ({ emoji: x.emoji, name: x.name, built: x.builtAtTick !== undefined, cost: x.cost, paid: x.paid })),
    chronicle: w.chronicle.slice(-5), recentEvents: recent.slice(-20),
  };
}

/** Glyph palette offered to the oracle (it may only use catalogued emojis). */
export const ORACLE_PALETTE = () => EMOJI_CATALOG.filter((e) => e.roles.some((r) => ['element', 'landmark', 'tower', 'civic', 'water', 'plant', 'tree', 'food', 'sky', 'money', 'tool', 'book'].includes(r))).map((e) => e.glyph);
