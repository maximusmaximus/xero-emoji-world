/** In-memory VectorStore for tests / `STORE=memory` local hacking without Docker. Not durable. */
import type { CityAction, CityState } from '@xew/shared';
import type { Embedder } from '../embedder.js';
import type { BackupRecord, EntityDoc, VectorStore } from './vector-store.js';

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

export class MemoryStore implements VectorStore {
  private actions: { a: CityAction; v: number[] }[] = [];
  private entities = new Map<string, EntityDoc>();
  private snapshot: CityState | null = null;
  constructor(private embedder: Embedder) {}
  async init() {}
  async writeActions(actions: CityAction[]) {
    const vs = await this.embedder.embed(actions.map((a) => a.text));
    actions.forEach((a, i) => this.actions.push({ a, v: vs[i]! }));
    if (this.actions.length > 200_000) this.actions.splice(0, 50_000);
  }
  async upsertEntities(docs: EntityDoc[]) { for (const d of docs) this.entities.set(d.id, d); }
  async saveSnapshot(s: CityState) { this.snapshot = structuredClone(s); }
  async loadSnapshot() { return this.snapshot; }
  async search(q: string, limit: number) {
    const [v] = await this.embedder.embed([q]);
    return [...this.actions].sort((x, y) => cos(y.v, v!) - cos(x.v, v!)).slice(0, limit).map((x) => x.a);
  }
  async storyFor(id: string, limit: number) {
    return this.actions.filter((x) => x.a.path.includes(id) || x.a.actorId === id).slice(-limit).reverse().map((x) => x.a);
  }
  async *exportAll(): AsyncIterable<BackupRecord> {
    if (this.snapshot) yield { collection: 'snapshot', id: '__city_snapshot__', payload: this.snapshot as unknown as Record<string, unknown> };
    for (const d of this.entities.values()) yield { collection: 'entities', id: d.id, payload: d as unknown as Record<string, unknown> };
    for (const { a, v } of this.actions) yield { collection: 'actions', id: a.id, payload: a as unknown as Record<string, unknown>, vector: v };
  }
}
