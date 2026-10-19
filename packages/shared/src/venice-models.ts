/**
 * Production Venice selection for Xero Emoji World.
 * See docs/MODELS.md. Do not put API keys in this file.
 *
 * Chosen 2026-10-19 from the live private catalog:
 *   voice  grok-4-20                 (private, 2M context)
 *   memory text-embedding-qwen3-8b   (private, 4096-d)
 */
export const VENICE_WORLD_MODEL = 'grok-4-20';
export const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';
export const VENICE_EMBED_MODEL = 'text-embedding-qwen3-8b';
export const VENICE_EMBED_DIM = 4096;
export const VENICE_EMBED_URL = 'https://api.venice.ai/api/v1/embeddings';
