# Models that power Xero Emoji World

Selected 2026-10-19 from the live Venice catalog (`GET /api/v1/models`).
Both are **private** (inference stays on Venice; not anonymized proxies).

| Job | Model id | Why this one |
|---|---|---|
| World voice (life stories, close-ups) | `grok-4-20` | Strongest private text model on the account: Grok 4.20, 2M context. Cheaper output than Kimi K3, and it already writes the city in the right register. |
| Semantic memory ("who bought pizza?") | `text-embedding-qwen3-8b` | Best private embedding available: 4096 dimensions, $0.0125 / 1M tokens. Beats `text-embedding-bge-m3` (1024-d, $0.15) and stays private unlike `text-embedding-3-large`. |

## Endpoints

```
WORLD_MODEL=grok-4-20
WORLD_API_URL=https://api.venice.ai/api/v1/chat/completions

EMBEDDER=openai-compatible
EMBED_API_URL=https://api.venice.ai/api/v1/embeddings
EMBED_MODEL=text-embedding-qwen3-8b
EMBED_DIM=4096
EMBED_API_KEY=   # local .env or host secret only. Never commit.
```

Auth header: `Authorization: Bearer <key>`.

## Rules

- Offline / CI stays on `EMBEDDER=hash` and `EMBED_DIM=256`. No key required.
- Switching embedder or dimension **creates new Qdrant collections**. Do not mix 256-d hash vectors with 4096-d Qwen vectors in `xew_actions` / `xew_entities`.
- The hash embedder remains the fallback if Venice errors.
- Source of truth in code: `packages/shared/src/venice-models.ts`.

## What we did not pick

- `claude-opus-5-5`, `openai-gpt-56-sol-pro`, and other frontier anonymized models are stronger on some public benches, but they are **not private**. This world stays on private Venice inference.
- `kimi-k3` is private and excellent, and much more expensive per output token ($18.75 vs $2.83). Use it only if a story needs that specific voice.
