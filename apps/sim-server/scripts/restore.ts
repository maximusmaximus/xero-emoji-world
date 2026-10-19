/**
 * Restore a backup into Qdrant: `tsx apps/sim-server/scripts/restore.ts backups/<file>.ndjson.gz`
 * Recreates points with their original vectors and payloads.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { config } from '../src/config.js';
import { toUuid } from '../src/store/qdrant.js';

const file = process.argv[2];
if (!file) { console.error('usage: restore <backup.ndjson.gz>'); process.exit(1); }
const client = new QdrantClient({ url: config.qdrant.url, apiKey: config.qdrant.apiKey });
const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
const buf = new Map<string, { id: string; vector: number[]; payload: Record<string, unknown> }[]>();
let header = true, n = 0;
for await (const line of rl) {
  if (header) { console.log('header', line); header = false; continue; }
  const r = JSON.parse(line) as { collection: string; id: string; payload: Record<string, unknown>; vector: number[] };
  if (!r.vector) continue;
  const list = buf.get(r.collection) ?? []; list.push({ id: toUuid(r.id), vector: r.vector, payload: r.payload }); buf.set(r.collection, list);
  if (list.length >= 500) { await client.upsert(r.collection, { points: list.splice(0) }); }
  n++;
}
for (const [c, pts] of buf) if (pts.length) await client.upsert(c, { points: pts });
console.log(`restored ${n} records`);
