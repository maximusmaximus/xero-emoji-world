# 🏙️ Xero Emoji World

A living, self-building **emoji megacity**, generated procedurally down to the individual apartment, with the people in it, their pets and their things. Every glyph is a Unicode emoji from a typed catalog.

- **One screen, one button.** The city fills the viewport on desktop and mobile. The only UI is the **ⓘ** button at the top left.
- **Always alive.** The sim server keeps ticking whether anyone is watching or not. Crews top out floors, people move in, buy a 🛋️, adopt a 🐈, get jobs, commute by 🚇, and new districts get founded.
- **ⓘ on** shows the **life story**: a live feed of every action, in lockstep with the canvas. Click any emoji to get a close-up with its Unicode info (codepoints, name, version, category, UTF-8), reference links and the entity's own story. Click outside the close-up to go back to the city.
- **Vector memory.** Every action and entity is embedded and stored in **Qdrant**, so you can search it semantically ("who bought pizza?").
- **Backups.** You can download a full DB export (`.ndjson.gz`) from the ⓘ panel at any time. Hourly snapshots are kept on the server too.
- **Mobile.** You can scroll across the landscape, but pinch zoom is off. After 30 s of use the app asks for fullscreen.

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

## Layout
```
packages/shared   emoji catalog, PRNG, generator, reducer, simulation rules, protocol (pure, tested)
apps/sim-server   tick loop, Qdrant store, embedder, HTTP/WS/SSE API, backups, restore script
apps/web          Vite + Canvas2D renderer, ⓘ story panel, close-up popup, mobile guards
```
See [ARCHITECTURE.md](ARCHITECTURE.md) and [HANDOFF.md](HANDOFF.md). License: MIT.
