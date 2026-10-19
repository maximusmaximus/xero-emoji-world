/**
 * Production Venice selection for Xero Emoji World.
 * See docs/MODELS.md. Do not put API keys in this file.
 *
 * Chosen 2026-10-19 from the live private catalog:
 *   voice  grok-4-20                 (private, 2M context)
 *   memory text-embedding-qwen3-8b   (private, 4096-d)
 *
 * The key is funded at $1 of inference per Pacific day.
 * Voice calls set reasoning_effort=none so that dollar buys sentences,
 * not hidden thinking tokens.
 */
export const VENICE_WORLD_MODEL = 'grok-4-20';
export const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';
export const VENICE_EMBED_MODEL = 'text-embedding-qwen3-8b';
export const VENICE_EMBED_DIM = 4096;
export const VENICE_EMBED_URL = 'https://api.venice.ai/api/v1/embeddings';

/** Hard cap. Reset at midnight America/Los_Angeles. */
export const VENICE_DAILY_BUDGET_USD = 1;

/** Catalog USD per token, grok-4-20. */
export const VENICE_VOICE_INPUT_USD = 1.42 / 1_000_000;
export const VENICE_VOICE_CACHE_USD = 0.23 / 1_000_000;
export const VENICE_VOICE_OUTPUT_USD = 2.83 / 1_000_000;
/** text-embedding-qwen3-8b, USD per token. */
export const VENICE_EMBED_USD = 0.0125 / 1_000_000;
/** Kept back so search still works after the voice has spent the day. */
export const VENICE_MEMORY_RESERVE_USD = 0.02;
