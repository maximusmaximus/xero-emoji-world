const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => Number(process.env[k] ?? d);

/** Keep in sync with packages/shared/src/venice-models.ts and docs/MODELS.md. */
const VENICE_WORLD_MODEL = 'grok-4-20';
const VENICE_EMBED_MODEL = 'text-embedding-qwen3-8b';
const VENICE_EMBED_URL = 'https://api.venice.ai/api/v1/embeddings';
const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';

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
  /** Offline default stays hash/256. Set EMBEDDER=openai-compatible to use Venice memory. */
  embed: {
    kind: env('EMBEDDER', 'hash') as 'hash' | 'openai-compatible',
    dim: num('EMBED_DIM', 256),
    url: env('EMBED_API_URL', ''),
    key: env('EMBED_API_KEY', ''),
    model: env('EMBED_MODEL', ''),
    /** Applied when EMBEDDER=openai-compatible and EMBED_MODEL is empty. */
    veniceModel: VENICE_EMBED_MODEL,
    veniceDim: 4096,
    veniceUrl: VENICE_EMBED_URL,
  },
  /**
   * Life-story voice. Key is EMBED_API_KEY or VENICE_API_KEY — never committed.
   * dailyBudgetUsd is a hard Pacific-day cap. Callers must send reasoning_effort=none
   * and stop voice calls once spent reaches dailyBudgetUsd - memoryReserveUsd.
   * See docs/MODELS.md.
   */
  world: {
    model: env('WORLD_MODEL', VENICE_WORLD_MODEL),
    url: env('WORLD_API_URL', VENICE_CHAT_URL),
    dailyBudgetUsd: num('DAILY_BUDGET_USD', 1),
    memoryReserveUsd: 0.02,
    reasoningEffort: 'none' as const,
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
