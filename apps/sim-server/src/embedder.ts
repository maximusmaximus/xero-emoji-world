/**
 * Pluggable text embedder.
 *  - HashEmbedder: local, deterministic, zero-network feature hashing of word uni/bigrams
 *    and emoji graphemes into a fixed-dim L2-normalised vector. Good enough for
 *    "find actions about pizza / this building" and keeps the project runnable offline.
 *  - OpenAICompatibleEmbedder: any /v1/embeddings endpoint. Falls back to hash on error.
 * IMPORTANT: changing embedder or dim requires a new collection (see HANDOFF.md).
 */
import { hashString } from '@xew/shared';
import { config } from './config.js';

export interface Embedder { readonly dim: number; readonly name: string; embed(texts: string[]): Promise<number[][]>; }

export class HashEmbedder implements Embedder {
  readonly name = 'hash-v1';
  constructor(readonly dim: number) {}
  private one(text: string): number[] {
    const v = new Float32Array(this.dim);
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const emojis = [...seg.segment(text)].map((s) => s.segment).filter((g) => /\p{Extended_Pictographic}/u.test(g));
    const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const feats = [...words, ...words.slice(1).map((w, i) => words[i] + '_' + w), ...emojis.map((e) => 'emo:' + e)];
    for (const f of feats) {
      const h = hashString(f);
      v[h % this.dim]! += (h & 0x80000000) ? -1 : 1;
    }
    let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
    return Array.from(v, (x) => x / n);
  }
  async embed(texts: string[]) { return texts.map((t) => this.one(t)); }
}

export class OpenAICompatibleEmbedder implements Embedder {
  readonly name: string;
  private fallback: HashEmbedder;
  constructor(readonly dim: number, private url: string, private key: string, private model: string) {
    this.name = `api:${model}`; this.fallback = new HashEmbedder(dim);
  }
  async embed(texts: string[]) {
    try {
      const res = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dim }),
      });
      if (!res.ok) throw new Error(`embed ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      return json.data.map((d) => d.embedding);
    } catch (e) {
      console.warn('[embedder] remote failed, using hash fallback:', (e as Error).message);
      return this.fallback.embed(texts);
    }
  }
}

export function createEmbedder(): Embedder {
  const c = config.embed;
  return c.kind === 'openai-compatible' && c.url && c.key
    ? new OpenAICompatibleEmbedder(c.dim, c.url, c.key, c.model)
    : new HashEmbedder(c.dim);
}
