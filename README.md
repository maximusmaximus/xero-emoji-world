# Xero Emoji World

![Xero, a future city still being built. Moon and farms on the left, a packed skyline in the middle, sun and a construction yard on the right.](public/x-banner.jpg)

Xero is a future city that builds itself out of emoji, and you are standing in one neighborhood of it. The map does not shrink to fit the screen. It is already dozens of tiles across, and it keeps spreading past every edge. Drag toward the dark and there is more ground.

What you are watching is a construction site that learned to be a city. Towers, markets, schools, hospitals, and gas stations do not pop into place. Crews haul timber, brick, steel, glass, and tools to an open lot, and those loads are drawn huge so you can see the floor being paid for while the crane is still up. People walk the sidewalk, reach a door, and step inside. A moment later they are in a window, with the room around them: a cart in a shop, a book in a school, a bed in a hospital.

Venice looks at the categories that already exist and says which one is furthest behind, and what that category should do next. The next lots follow that. Stories, search, and those plans run on private Venice inference, capped at about a dollar a day. The clock itself does not spend the dollar. Keys are not in this repo.

The glyphs are [XeroEmoji](https://github.com/maximusmaximus/xeroemoji), drawn as pictures rather than as a system font. The preview card is [public/og.jpg](public/og.jpg). The banner above is [public/x-banner.jpg](public/x-banner.jpg).

## What is on the canvas

- **A world bigger than the frame.** The header shows the size, such as `37×35 and past the frame`. It can keep growing. Pan and zoom to go find the edge.
- **Open sites.** A rising building keeps a yard of materials and a crane until the floors it was planned for are up.
- **Sidewalks and doors.** Walkers move along the front of a building. Some of them shrink into the doorway and show up in the glass.
- **Civic life.** Stores, gas stations, schools, and hospitals are real kinds, not just renamed towers. Each one has its own window scenes.
- **A sky.** A large moon and sun sit on the horizon. Stars and a planet come out as the city gets older.
- **People watching.** The header counts live tabs. More watchers, faster steps, and a more specific next building.

One finger, or the mouse, turns the view. Drag down to look across the city. Two fingers pan and pinch. The wheel zooms. Tap any emoji for its story. The city is saved in the browser, so a refresh continues the same place.

## Live prototype

The city you can open now is the Grok build in [prototype/](prototype/). That is the isometric world, the yards, the sidewalks, and the Venice plans. See [docs/CIVILIZATION.md](docs/CIVILIZATION.md). The Docker apps below are the earlier server layout.

Venice keys stay off the repo. Put one in `.secrets/` on the host, or paste it from the Venice badge. When a key is spent or rejected, that badge asks for another. `.secrets/` is gitignored.

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

The canvas prototype in `prototype/` is a TanStack app. From that directory: `npm install` and `npm run dev`.

## Layout
```
packages/shared   emoji catalog, PRNG, generator, reducer, simulation rules, protocol (pure, tested)
apps/sim-server   tick loop, Qdrant store, embedder, HTTP/WS/SSE API, backups, restore script
apps/web          Vite + Canvas2D isometric renderer, story panel, close-up popup
prototype/        the living city: yards, sidewalks, Venice plans, share cards
```
See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/WORKFLOW.md](docs/WORKFLOW.md), and [HANDOFF.md](HANDOFF.md). License: MIT.

## Embeddings & Venice.ai
By default the sim uses a local hash embedder (offline, deterministic). Production inference is private Venice:

- Voice and plans: `grok-4-20`, with `reasoning_effort` set to `none`
- Memory: `text-embedding-qwen3-8b` (4096-d)
- Budget: `$1` per Pacific day
- Each plan names a focus category and a next step for every category already standing

See [docs/MODELS.md](docs/MODELS.md) and [docs/SECRETS.md](docs/SECRETS.md). Changing the embedder or dimensions requires new Qdrant collections.

## Contributing / Grok workflow
Prototype and product are built with Grok agents. Preferred flow:
1. Read [docs/WORKFLOW.md](docs/WORKFLOW.md) before adding a pass. Make and project stay free. Remember and speak are the only paid passes, and they are cached.
2. Agents open PRs (or push to `main` when asked) with that pipeline intact.
3. Review on GitHub (enable Watch + notifications to see acceptance/merges).
See [HANDOFF.md](HANDOFF.md) for bring-up and [docs/SECRETS.md](docs/SECRETS.md) for keys.
