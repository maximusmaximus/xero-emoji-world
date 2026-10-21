const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => Number(process.env[k] ?? d);

export const config = {
  port: num('PORT', 8787),
  seed: env('CITY_SEED', 'xero-emoji-world'),
  tickMs: num('TICK_MS', 1000),
  actionsPerTick: num('ACTIONS_PER_TICK', 6),
  qdrant: {
    url: env('QDRANT_URL', 'http://localhost:6333'),
    apiKey: process.env.QDRANT_API_KEY || undefined,
    actions: env('QDRANT_COLLECTION_ACTIONS', 'xew_actions'),
    entities: env('QDRANT_COLLECTION_ENTITIES', 'xew_entities'),
  },
  embed: {
    kind: env('EMBEDDER', 'hash') as 'hash' | 'openai-compatible',
    dim: num('EMBED_DIM', 256),
    url: env('EMBED_API_URL', ''),
    key: env('EMBED_API_KEY', ''),
    model: env('EMBED_MODEL', ''),
  },
  oracle: {
    /** "auto" (LLM when ORACLE_API_KEY is set, else local) | "llm" | "local" */
    kind: env('ORACLE', 'auto') as 'auto' | 'llm' | 'local',
    url: env('ORACLE_API_URL', 'https://api.x.ai/v1/chat/completions'),
    key: process.env.ORACLE_API_KEY ?? process.env.XAI_API_KEY ?? '',
    model: env('ORACLE_MODEL', 'grok-4.7'),
    everyTicks: num('ORACLE_EVERY_TICKS', 120),
    timeoutMs: num('ORACLE_TIMEOUT_MS', 30000),
  },
  backup: { intervalMin: num('BACKUP_INTERVAL_MIN', 60), dir: env('BACKUP_DIR', './backups'), keep: num('BACKUP_KEEP', 48) },
  /** Snapshot the full city state to the DB every N ticks (actions are written every tick). */
  snapshotEveryTicks: num('SNAPSHOT_EVERY_TICKS', 30),
};
