/**
 * Qdrant implementation.
 * Collections:
 *   xew_actions  : one point per CityAction; vector = embed(action.text); payload = action (+ path for filtering)
 *   xew_entities : one point per building/person/apartment doc, plus the special `__city_snapshot__` point
 *                  whose payload holds the gzipped full CityState (fast restart; vector = zeros).
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { CityAction, CityState } from '@xew/shared';
import { config } from '../config.js';
import type { Embedder } from '../embedder.js';
import type { BackupRecord, EntityDoc, VectorStore } from './vector-store.js';

const SNAPSHOT_KEY = '__city_snapshot__';

/** Qdrant ids must be uint or UUID: derive a stable UUID from our string ids. */
export function toUuid(id: string): string {
  const h = createHash('sha1').update(id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export class QdrantStore implements VectorStore {
  private client: QdrantClient;
  private A = config.qdrant.actions;
  private E = config.qdrant.entities;
  constructor(private embedder: Embedder) {
    this.client = new QdrantClient({ url: config.qdrant.url, apiKey: config.qdrant.apiKey });
  }

  async init() {
    const existing = new Set((await this.client.getCollections()).collections.map((c) => c.name));
    for (const name of [this.A, this.E]) {
      if (existing.has(name)) continue;
      await this.client.createCollection(name, { vectors: { size: this.embedder.dim, distance: 'Cosine' }, on_disk_payload: true });
    }
    await this.client.createPayloadIndex(this.A, { field_name: 'path', field_schema: 'keyword' }).catch(() => {});
    await this.client.createPayloadIndex(this.A, { field_name: 'tick', field_schema: 'integer' }).catch(() => {});
    await this.client.createPayloadIndex(this.A, { field_name: 'type', field_schema: 'keyword' }).catch(() => {});
    await this.client.createPayloadIndex(this.E, { field_name: 'kind', field_schema: 'keyword' }).catch(() => {});
  }

  async writeActions(actions: CityAction[]) {
    if (!actions.length) return;
    const vecs = await this.embedder.embed(actions.map((a) => a.text));
    await this.client.upsert(this.A, {
      wait: false,
      points: actions.map((a, i) => ({ id: toUuid(a.id), vector: vecs[i]!, payload: { ...a, xewId: a.id, embedder: this.embedder.name } as Record<string, unknown> })),
    });
  }

  async upsertEntities(docs: EntityDoc[]) {
    for (let i = 0; i < docs.length; i += 256) {
      const chunk = docs.slice(i, i + 256);
      const vecs = await this.embedder.embed(chunk.map((d) => d.text));
      await this.client.upsert(this.E, {
        wait: false,
        points: chunk.map((d, j) => ({ id: toUuid(d.id), vector: vecs[j]!, payload: { xewId: d.id, kind: d.kind, emoji: d.emoji, text: d.text, data: d.data as Record<string, unknown> } })),
      });
    }
  }

  async saveSnapshot(state: CityState) {
    const blob = gzipSync(Buffer.from(JSON.stringify(state))).toString('base64');
    await this.client.upsert(this.E, {
      wait: true,
      points: [{ id: toUuid(SNAPSHOT_KEY), vector: new Array(this.embedder.dim).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
        payload: { xewId: SNAPSHOT_KEY, kind: 'snapshot', tick: state.tick, savedAt: new Date().toISOString(), stateGzB64: blob } }],
    });
  }

  async loadSnapshot(): Promise<CityState | null> {
    const res = await this.client.retrieve(this.E, { ids: [toUuid(SNAPSHOT_KEY)], with_payload: true });
    const b64 = res[0]?.payload?.stateGzB64 as string | undefined;
    return b64 ? (JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString()) as CityState) : null;
  }

  async search(query: string, limit: number) {
    const [vector] = await this.embedder.embed([query]);
    const res = await this.client.search(this.A, { vector: vector!, limit, with_payload: true });
    return res.map((p) => p.payload as unknown as CityAction);
  }

  async storyFor(entityId: string, limit: number) {
    const res = await this.client.scroll(this.A, {
      filter: { must: [{ key: 'path', match: { value: entityId } }] }, limit: 500, with_payload: true,
    });
    return res.points.map((p) => p.payload as unknown as CityAction).sort((a, b) => b.tick - a.tick).slice(0, limit);
  }

  async *exportAll(): AsyncIterable<BackupRecord> {
    for (const collection of [this.E, this.A]) {
      let offset: string | number | undefined | null = undefined;
      do {
        const page = await this.client.scroll(collection, { limit: 512, offset: offset ?? undefined, with_payload: true, with_vector: true });
        for (const p of page.points) yield { collection, id: String(p.payload?.xewId ?? p.id), payload: p.payload ?? {}, vector: p.vector as number[] };
        offset = page.next_page_offset as string | number | null | undefined;
      } while (offset);
    }
  }
}
