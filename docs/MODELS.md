# Models that power Xero Emoji World

Selected 2026-10-19 from the live Venice catalog (`GET /api/v1/models`).
Both are **private** (inference stays on Venice; not anonymized proxies).

| Job | Model id | Why this one |
|---|---|---|
| World voice (life stories, close-ups) | `grok-4-20` | Strongest private text model on the account: Grok 4.20, 2M context. Cheaper output than Kimi K3, and it already writes the city in the right register. |
| Semantic memory ("who bought pizza?") | `text-embedding-qwen3-8b` | Best private embedding available: 4096 dimensions, $0.0125 / 1M tokens. Beats `text-embedding-bge-m3` (1024-d, $0.15) and stays private unlike `text-embedding-3-large`. |

## $1 per day

This key is funded at **$1 of inference per Pacific day** (`DAILY_BUDGET_USD=1`, midnight America/Los_Angeles). Spend the dollar on what a person actually sees. Do not run the meter out, and do not waste it.

Measured catalog prices:

| Call | Price |
|---|---|
| `grok-4-20` input | $1.42 / 1M tokens ($0.23 / 1M cached) |
| `grok-4-20` output | $2.83 / 1M tokens |
| `text-embedding-qwen3-8b` | $0.0125 / 1M tokens |

`grok-4-20` thinks by default. A two-sentence story was ~770 reasoning tokens (~$0.0045). With `reasoning_effort` set to `none` and Venice's extra system prompt turned off, the same story is ~10 output tokens (**about $0.0003**). That is the required setting. A dollar then covers thousands of fresh stories; repeats are free.

Policy, in order:

1. **No background calls.** The city ticks locally. Venice runs only for a life story or a search.
2. **Cache.** The same resident story is not billed twice. Beat vectors are reused, so a later search only embeds the new query and new lines.
3. **Short voice.** `max_tokens` 72, one or two sentences, reasoning off.
4. **Reserve $0.02 for memory.** Voice stops at $0.98. Search is cheap enough to keep working after that, until the full $1 is gone.
5. **Then local.** Over the cap, stories fall back to the known beat and search falls back to keywords. Nothing errors, nothing overspends.
6. **Charge the real `usage` block**, not a guess, including cached input at the cheaper rate.

## Endpoints

```
WORLD_MODEL=grok-4-20
WORLD_API_URL=https://api.venice.ai/api/v1/chat/completions
DAILY_BUDGET_USD=1

EMBEDDER=openai-compatible
EMBED_API_URL=https://api.venice.ai/api/v1/embeddings
EMBED_MODEL=text-embedding-qwen3-8b
EMBED_DIM=4096
EMBED_API_KEY=   # local .env or host secret only. Never commit.
```

Voice request must include `"reasoning_effort": "none"` and `venice_parameters.include_venice_system_prompt: false`.

Auth header: `Authorization: Bearer <key>`.

## Rules

- Offline / CI stays on `EMBEDDER=hash` and `EMBED_DIM=256`. No key required.
- Switching embedder or dimension **creates new Qdrant collections**. Do not mix 256-d hash vectors with 4096-d Qwen vectors in `xew_actions` / `xew_entities`.
- The hash embedder remains the fallback if Venice errors or the daily dollar is spent.
- Source of truth in code: `packages/shared/src/venice-models.ts`.

## What we did not pick

- `claude-opus-5-5`, `openai-gpt-56-sol-pro`, and other frontier anonymized models are stronger on some public benches, but they are **not private**. This world stays on private Venice inference.
- `kimi-k3` is private and excellent, and much more expensive per output token ($18.75 vs $2.83). Use it only if a story needs that specific voice.
- Leaving reasoning on. It spends most of the dollar on tokens nobody reads.
