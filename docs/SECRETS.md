# Secrets & Key Management

This project uses environment variables for all secrets (API keys, etc.). **Never commit real keys.**

## Local development
1. Copy the example:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set values. `.env` is in `.gitignore`.
3. For Venice.ai embeddings (recommended for private, cost-effective inference):
   ```
   EMBEDDER=openai-compatible
   EMBED_API_URL=https://api.venice.ai/api/v1/embeddings
   EMBED_MODEL=text-embedding-bge-m3
   EMBED_DIM=1024
   EMBED_API_KEY=sk-venice-...
   ```
   Get a key at https://venice.ai (API settings). Venice is OpenAI-compatible and supports the `dimensions` parameter.

## GitHub Actions / CI
- Store keys as **repository secrets** (Settings → Secrets and variables → Actions).
- Reference them in workflows as `${{ secrets.VENICE_API_KEY }}` or similar.
- Never echo or log secrets. Default CI to `EMBEDDER=hash` so no key is required.

## Switching embedders
Changing `EMBEDDER`, model, or `EMBED_DIM` requires a **new Qdrant collection** (or wipe existing). See ARCHITECTURE.md. HashEmbedder is always available as offline fallback.

## Notifications for PR acceptance
To see when PRs are reviewed, approved, or merged:
1. On the repo, click **Watch** → **All Activity** (or Custom → Pull requests).
2. In GitHub Settings → Notifications, enable email for Pull request reviews and merges.
3. An Automation is set up to notify on PR merges for this repo.

## Venice inference key

The host key is `VENICE_INFERENCE_KEY` in `.env` locally, or the same variable in the production environment. Never commit it.

Extra keys are pasted in the Venice badge on the city. The browser keeps them in `localStorage` and sends them with the next story, search, or building plan, so a save still works when the production disk is read-only. If the active key is rejected or its daily dollar is spent, that panel opens and asks for another key. Stories, search, and new buildings wait on it. The city itself keeps running.

## Book shop (Stripe + RPI)

`BUY THE BOOK` opens `/book`. Checkout stays off until these are set on the host, not in the repo:

| Name | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe secret. `sk_test_…` for a test shop. `sk_live_…` only with `ALLOW_LIVE_STRIPE=true`. |
| `BOOK_PRICE_CENTS` | Retail price in cents, for example `12800` is $128.00. |
| `RPI_API_AUTH` | Authorization header for the published RPI book (`https://open.api.rpiprint.com`). Used for shipping rates and the print order. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) for `POST /api/book/webhook`. |
| `RPI_LIVE_ORDERS` | `true` only when a paid order should be sent to the printer. Otherwise the webhook records a dry run. |

Optional: `PUBLIC_BASE_URL` (success and cancel links), `RPI_BASE_URL`, `RPI_SKU` (defaults to the published 11.75 in hardcover SKU), `BOOK_COVER_URL` and `BOOK_GUTS_URL` if the SKU does not already have the print files, `BOOK_CHECKOUT=false` to hide a ready shop.

