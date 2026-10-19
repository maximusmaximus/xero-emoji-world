import type { CityAction, CityState } from '@xew/shared';

/** A row as it appears in backups: one line of NDJSON. */
export interface BackupRecord { collection: string; id: string; payload: Record<string, unknown>; vector?: number[]; }

export interface EntityDoc { id: string; kind: string; emoji: string; text: string; data: unknown; }

/** Storage abstraction so Qdrant can be swapped (LanceDB, pgvector) without touching the sim. */
export interface VectorStore {
  init(): Promise<void>;
  writeActions(actions: CityAction[]): Promise<void>;
  upsertEntities(docs: EntityDoc[]): Promise<void>;
  saveSnapshot(state: CityState): Promise<void>;
  loadSnapshot(): Promise<CityState | null>;
  search(query: string, limit: number): Promise<CityAction[]>;
  storyFor(entityId: string, limit: number): Promise<CityAction[]>;
  /** Stream every record (all collections) for backup export. */
  exportAll(): AsyncIterable<BackupRecord>;
}
