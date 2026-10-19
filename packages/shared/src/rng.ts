/**
 * Deterministic PRNG utilities. The city layout is a pure function of
 * (CITY_SEED, coordinates), so any agent / test can regenerate any part of it.
 */

/** cyrb53-style 32-bit string hash -> seed. */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

/** mulberry32: small, fast, good-enough PRNG. */
export class Rng {
  private s: number;
  constructor(seed: number | string) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }
  /** Derive an independent child stream, e.g. rng.fork(`block:${x},${y}`). */
  static at(seed: string, ...path: (string | number)[]): Rng {
    return new Rng(hashString(seed + '|' + path.join('/')));
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  weighted<T>(items: readonly [T, number][]): T {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) if ((r -= w) <= 0) return v;
    return items[items.length - 1]![0];
  }
  /** Short base36 id; deterministic for a given stream position. */
  id(prefix: string): string {
    return prefix + '_' + Math.floor(this.next() * 36 ** 8).toString(36).padStart(8, '0');
  }
}
