import { describe, expect, it } from 'vitest';
import {
  EMOJI_CATALOG, Rng, applyAction, createInitialCity, emojiInfo, generateDistrict, indexCity, spiralCoord, step,
  type Person,
} from '../src/index.js';

const NOW = '2026-10-19T20:00:00.000Z';

describe('rng', () => {
  it('is deterministic per seed/path', () => {
    const a = Rng.at('s', 'x', 1), b = Rng.at('s', 'x', 1), c = Rng.at('s', 'x', 2);
    const seq = (r: Rng) => Array.from({ length: 10 }, () => r.next());
    expect(seq(a)).toEqual(seq(b));
    expect(seq(Rng.at('s', 'x', 1))).not.toEqual(seq(c));
  });
});

describe('generator', () => {
  it('generates identical districts for identical inputs', () => {
    const p1: Person[] = [], p2: Person[] = [];
    expect(generateDistrict({ seed: 'xew', tick: 0 }, 1, 2, p1)).toEqual(generateDistrict({ seed: 'xew', tick: 0 }, 1, 2, p2));
    expect(p1).toEqual(p2);
  });
  it('different seeds produce different cities', () => {
    expect(generateDistrict({ seed: 'a', tick: 0 }, 0, 0, [])).not.toEqual(generateDistrict({ seed: 'b', tick: 0 }, 0, 0, []));
  });
  it('only uses catalogued emojis', () => {
    const s = createInitialCity('xew', NOW);
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) k === 'emoji' ? expect(emojiInfo(x as string), String(x)).toBeDefined() : walk(x);
    };
    walk(s);
  });
  it('spiral coords are unique', () => {
    const set = new Set(Array.from({ length: 50 }, (_, i) => spiralCoord(i).join(',')));
    expect(set.size).toBe(50);
  });
  it('catalog has unique glyphs and valid codepoints', () => {
    expect(new Set(EMOJI_CATALOG.map((e) => e.glyph)).size).toBe(EMOJI_CATALOG.length);
    for (const e of EMOJI_CATALOG) expect(e.codepoints[0]).toMatch(/^U\+[0-9A-F]{4,6}$/);
  });
});

describe('simulation', () => {
  it('is reproducible and replayable via patches (lockstep)', () => {
    const a = createInitialCity('xew', NOW), b = createInitialCity('xew', NOW);
    const replica = structuredClone(a);
    const ia = indexCity(a), ib = indexCity(b), ir = indexCity(replica);
    for (let t = 0; t < 40; t++) {
      const actsA = step(a, ia, { actionsPerTick: 6, now: NOW });
      const actsB = step(b, ib, { actionsPerTick: 6, now: NOW });
      expect(actsA).toEqual(actsB);
      // a client applying only the streamed patches must stay identical to the server
      for (const act of structuredClone(actsA)) applyAction(replica, ir, act);
    }
    expect(JSON.parse(JSON.stringify(replica.districts))).toEqual(JSON.parse(JSON.stringify(a.districts)));
    expect(Object.keys(replica.people).sort()).toEqual(Object.keys(a.people).sort());
  });
});
