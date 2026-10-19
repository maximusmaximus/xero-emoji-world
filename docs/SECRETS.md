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

## Grok / agent workflow
Prototype and product development is Grok-driven. Agents open feature-branch PRs with improvements. Review and merge on GitHub. Keys remain only in local `.env` or GitHub secrets — never in commits or PR diffs.
