# 🏙️ Xero Emoji World

A living, self-building **emoji megacity**, generated procedurally down to the individual apartment, with the people in it, their pets and their things. Every glyph is a Unicode emoji from a typed catalog. The city is an isometric diorama that fills the screen.

- **One screen, one button.** The ground plane covers the viewport on desktop and mobile. The only UI is the **ℹ** button at the top left.
- **Always alive.** The sim server keeps ticking whether anyone is watching or not. Crews top out floors, people move in, buy a 🛋️, adopt a 🐈, get jobs, commute by 🚇, and new districts get founded. Ticks are local. They do not spend the inference dollar.
- **ℹ on** shows the **life story**: a live feed of every action, in lockstep with the canvas. Click any emoji for its story. Click outside the close-up to go back to the city.
- **Vector memory.** Every action and entity can be embedded and stored in **Qdrant**, so you can search it semantically ("who bought pizza?").
- **Backups.** You can download a full DB export (`.ndjson.gz`) from the ℹ panel at any time. Hourly snapshots are kept on the server too.
- **Look around.** One finger, or the mouse, turns the view. Two fingers pan and pinch to zoom. The wheel still zooms. The header shows how many people are watching, and the city builds faster as that count rises. Tap any emoji for its story.

## Quick start
```bash
cp .env.example .env
docker compose up -d qdrant         # vector DB
npm install
npm run dev:server                   # sim starts ticking; first run = genesis "now"
npm run dev:web                      # http://localhost:5173
```
To run without Docker, use `STORE=memory npm run dev:server` (not durable).
To run everything in Docker: `docker compose up --build` → http://localhost:8080


## Live prototype

The city you can open now is the Grok build in [prototype/](prototype/). That is the source for the isometric world, emoji roads, persistence, live watchers, and Venice building plans. See [docs/CIVILIZATION.md](docs/CIVILIZATION.md). The Docker apps above are the earlier server layout.

Venice keys are not in this repo. Put them in `.secrets/` on the host, or paste them from the Venice badge. `.secrets/` is gitignored.

## Layout
```
packages/shared   emoji catalog, PRNG, generator, reducer, simulation rules, protocol (pure, tested)
apps/sim-server   tick loop, Qdrant store, embedder, HTTP/WS/SSE API, backups, restore script
apps/web          Vite + Canvas2D isometric renderer, ℹ story panel, close-up popup
```
See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/WORKFLOW.md](docs/WORKFLOW.md), and [HANDOFF.md](HANDOFF.md). License: MIT.

## Embeddings & Venice.ai
By default the sim uses a local hash embedder (offline, deterministic). Production inference is private Venice:

- Voice: `grok-4-20`, with `reasoning_effort` set to `none`
- Memory: `text-embedding-qwen3-8b` (4096-d)
- Budget: `$1` per Pacific day

See [docs/MODELS.md](docs/MODELS.md) and [docs/SECRETS.md](docs/SECRETS.md). Changing the embedder or dimensions requires new Qdrant collections.

## Contributing / Grok workflow
Prototype and product are built with Grok agents. Preferred flow:
1. Read [docs/WORKFLOW.md](docs/WORKFLOW.md) before adding a pass. Make and project stay free. Remember and speak are the only paid passes, and they are cached.
2. Agents open PRs (or push to `main` when asked) with that pipeline intact.
3. Review on GitHub (enable Watch + notifications to see acceptance/merges).
See [HANDOFF.md](HANDOFF.md) for bring-up and [docs/SECRETS.md](docs/SECRETS.md) for keys.
