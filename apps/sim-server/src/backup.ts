/**
 * Backups = gzipped NDJSON of every record in every collection (vectors included).
 * Line 1 is a header: {"format":"xew-backup","version":1,...}.
 * Restore with `npm run restore -w @xew/sim-server -- <file>` (see scripts/restore.ts).
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { config } from './config.js';
import type { VectorStore } from './store/vector-store.js';

export function backupStream(store: VectorStore, meta: Record<string, unknown>): Readable {
  async function* lines() {
    yield JSON.stringify({ format: 'xew-backup', version: 1, createdAt: new Date().toISOString(), ...meta }) + '\n';
    for await (const rec of store.exportAll()) yield JSON.stringify(rec) + '\n';
  }
  return Readable.from(lines()).pipe(createGzip());
}

export const backupName = (tick: number) => `xew-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-t${tick}.ndjson.gz`;

export async function writeBackupFile(store: VectorStore, tick: number): Promise<string> {
  await mkdir(config.backup.dir, { recursive: true });
  const name = backupName(tick);
  await pipeline(backupStream(store, { tick }), createWriteStream(join(config.backup.dir, name)));
  await prune();
  return name;
}

export async function listBackups() {
  await mkdir(config.backup.dir, { recursive: true });
  const names = (await readdir(config.backup.dir)).filter((n) => n.endsWith('.ndjson.gz')).sort().reverse();
  return Promise.all(names.map(async (name) => ({ name, bytes: (await stat(join(config.backup.dir, name))).size })));
}

async function prune() {
  const all = await listBackups();
  for (const b of all.slice(config.backup.keep)) await unlink(join(config.backup.dir, b.name)).catch(() => {});
}

export function scheduleBackups(store: VectorStore, getTick: () => number) {
  const ms = config.backup.intervalMin * 60_000;
  if (ms <= 0) return;
  setInterval(() => writeBackupFile(store, getTick()).then((n) => console.log('[backup] wrote', n)).catch((e) => console.error('[backup]', e)), ms);
}
