import { describe, expect, it } from 'vitest';
import {
  BASE_RECIPES, applyAction, createInitialCity, createWorld, emojiInfo, ensureWorld, eraFor, growthMultiplier, harvest,
  indexCity, localDecree, sanitizeDecree, step, wonderBudget, type CityState,
} from '../src/index.js';

const NOW = '2026-10-20T00:00:00.000Z';

describe('world model', () => {
  it('base recipes and district yields only use catalogued emojis', () => {
    for (const r of BASE_RECIPES) for (const g of [r.a, r.b, r.out]) expect(emojiInfo(g), g).toBeDefined();
    for (const [e] of Object.entries(createWorld().materials)) expect(emojiInfo(e), e).toBeDefined();
  });

  it('growth compounds with knowledge (exponential multiplier)', () => {
    const w = createWorld();
    const m0 = growthMultiplier(w); w.knowledge = 10; const m10 = growthMultiplier(w); w.knowledge = 20; const m20 = growthMultiplier(w);
    expect(m10 / m0).toBeCloseTo(m20 / m10, 6);
    expect(m20).toBeGreaterThan(m10 * 2);
    expect(eraFor(0)).toBe(0); expect(eraFor(1)).toBe(1); expect(eraFor(7)).toBe(3);
  });

  it('harvest yields scale with the multiplier and stockpiles spoil', () => {
    const s = { people: {} } as unknown as CityState;
    const a = createWorld(), b = createWorld(); b.knowledge = 15;
    const ga = harvest(s, a, { industrial: 40 }), gb = harvest(s, b, { industrial: 40 });
    expect(gb['🧱']!).toBeGreaterThan(ga['🧱']! * 4);
    const w = createWorld(); w.materials = { '💧': 100 }; harvest(s, w, {});
    expect(w.materials['💧']).toBe(97);
  });

  it('ensureWorld backfills old snapshots idempotently', () => {
    const s = createInitialCity('xew', NOW); delete s.world;
    const w = ensureWorld(s); expect(ensureWorld(s)).toBe(w);
  });
});

describe('sanitizeDecree (untrusted model output)', () => {
  it('drops unknown emojis, duplicate pairs, bad numbers and clamps boosts', () => {
    const w = createWorld();
    const d = sanitizeDecree({
      eraName: '<script>Age of Glitter</script>' + 'x'.repeat(100), essence: 'not-an-emoji', prophecy: 42,
      recipes: [{ a: '🪨', b: '🔥', out: '💎', name: 'dup of base pair' }, { a: '💎', b: '🐉', out: '🌈', name: 'rainbow scales' },
        { a: 'Z', b: '🔥', out: '🌈', name: 'bad' }, { a: '🌈', b: '🔥', out: '🔥', name: 'self' }],
      wonder: { emoji: '🏰', name: 'Glass Keep', cost: { '🧱': 1e12, nope: 5, '💎': -3, '🪙': 1 } },
      boosts: { build: 100, alchemy: 0, bogus: 2, wonder: Number.NaN },
    }, w);
    expect(d.eraName).not.toContain('<'); expect(d.eraName!.length).toBeLessThanOrEqual(48);
    expect(d.essence).toBeUndefined(); expect(d.prophecy).toBeUndefined();
    expect(d.recipes).toEqual([{ a: '💎', b: '🐉', out: '🌈', name: 'rainbow scales' }]);
    expect(Object.keys(d.wonder!.cost).sort()).toEqual(['🧱', '🪙'].sort());
    expect(d.wonder!.cost['🧱']).toBe(wonderBudget(w) * 2);
    expect(d.wonder!.cost['🪙']).toBe(Math.ceil(wonderBudget(w) / 4));
    expect(d.boosts).toEqual({ build: 3, alchemy: 0.33 });
  });
  it('tolerates garbage', () => {
    expect(sanitizeDecree(null, createWorld())).toEqual({});
    expect(sanitizeDecree('lol', createWorld())).toEqual({});
  });
});

describe('world simulation', () => {
  it('decrees, discoveries and wonders replay in lockstep and the world grows', () => {
    const a = createInitialCity('xew', NOW); const replica = structuredClone(a);
    const ia = indexCity(a), ir = indexCity(replica);
    const b0 = a.stats.buildings;
    const types = new Set<string>();
    for (let t = 1; t <= 260; t++) {
      const decree = t % 40 === 0 ? { decree: localDecree(a, ensureWorld(a), t), source: 'local' as const, oracle: 'local' } : undefined;
      const acts = step(a, ia, { actionsPerTick: 6, now: NOW, decree });
      for (const act of structuredClone(acts)) { types.add(act.type); applyAction(replica, ir, act); }
    }
    expect(JSON.parse(JSON.stringify(replica.world))).toEqual(JSON.parse(JSON.stringify(a.world)));
    expect(JSON.parse(JSON.stringify(replica.districts))).toEqual(JSON.parse(JSON.stringify(a.districts)));
    for (const t of ['world.decree', 'world.harvest', 'building.floor_added']) expect(types).toContain(t);
    expect(a.world!.knowledge).toBeGreaterThan(0);
    expect(a.world!.wonders.length).toBeGreaterThan(0);
    expect(a.stats.buildings).toBeGreaterThanOrEqual(b0);
  }, 60_000);

  it('an oracle decree is applied to the world on the next tick', () => {
    const s = createInitialCity('xew', NOW); const idx = indexCity(s);
    const acts = step(s, idx, { actionsPerTick: 3, now: NOW, decree: { source: 'oracle', oracle: 'llm:test', decree: {
      eraName: 'Age of Honey', essence: '🍯', prophecy: 'Sweet towers rise.', recipes: [{ a: '🍯', b: '🔥', out: '🕯️', name: 'candles' }],
      wonder: { emoji: '🏰', name: 'Honeycomb Keep', cost: { '🍯': 50 } }, boosts: { wonder: 2 },
    } } });
    expect(acts[0]!.type).toBe('world.decree');
    expect(acts[0]!.text).toContain('Sweet towers rise.');
    const w = (acts[0]!.patch as { world: NonNullable<CityState['world']> }).world;
    expect(w.eraName).toBe('Age of Honey'); expect(w.essence).toBe('🍯'); expect(w.oracle).toBe('llm:test');
    expect(w.wonders.at(-1)!.name).toBe('Honeycomb Keep'); expect(w.boosts.wonder).toBe(2);
    expect(w.recipes.some((r) => r.out === '🕯️') || !emojiInfo('🕯️')).toBe(true);
  });
});
