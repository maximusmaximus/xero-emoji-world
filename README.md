# 🏙️ Xero Emoji World

A living, self-building **emoji megacity**, generated procedurally down to the individual apartment, with the people in it, their pets and their things. Every glyph is a Unicode emoji from a typed catalog.

- **One screen, one button.** The city fills the viewport on desktop and mobile. The only UI is the **ⓘ** button at the top left.
- **Always alive.** The sim server keeps ticking whether anyone is watching or not. Crews top out floors, people move in, buy a 🛋️, adopt a 🐈, get jobs, commute by 🚇, and new districts get founded.
- **ⓘ on** shows the **life story**: a live feed of every action, in lockstep with the canvas. Click any emoji to get a close-up with its Unicode info (codepoints, name, version, category, UTF-8), reference links and the entity's own story. Click outside the close-up to go back to the city.
- **Vector memory.** Every action and entity is embedded and stored in **Qdrant**, so you can search it semantically ("who bought pizza?").
- **Backups.** You can download a full DB export (`.ndjson.gz`) from the ⓘ panel at any time. Hourly snapshots are kept on the server too.
- **Mobile.** You can scroll across the landscape, but pinch zoom is off. After 30 s of use the app asks for fullscreen.

## 🔮 How the world grows: emoji-alchemy + the Oracle
The city is built **out of emojis**, not just decorated with them.

1. **Harvest.** Every 5 ticks each completed building yields its district's element emojis (industrial 🧱🔥⚙️, waterfront 💧🌊, old town 📜🪨, tech ⚡💡🧲, parkland 🌳🌱🍯, residential 🍞🌱, downtown 🪙💡). Population adds 🪙. Stockpiles spoil 3% per harvest.
2. **Build.** Every new floor costs 🧱×3. When bricks run out, sites show 🚧 and stall until someone fires more.
3. **Alchemy.** Residents combine two emojis into a new one (🪨+🔥→🧱, 💡+📜→📚, 🔭+💎→🌌, 🌌+🔮→🪄, 🪄+🔥→🐉, …). Each new emoji discovered raises **knowledge**. Discovered emojis become inputs for further recipes, so the recipe graph keeps branching.
4. **Compounding.** The harvest multiplier is `1.12^knowledge × (1 + 0.25 × wonders)`, so production grows exponentially. Eras advance at `floor(log2(1 + knowledge))` (Age of Clay → Bread → Gears → Light → Stars → Crystals → Magic → Dragons → Myth). Wonder prices scale with the multiplier and spoilage keeps the economy a race, so growth never becomes a flat runaway.
5. **Demand-driven city life.** Construction scales with crowding (residents ÷ 2 × apartments). Immigration scales with vacancy, mood and wonders. A new district is founded when the city runs out of lots or homes, not by a coin flip. Unhappy residents move out more often.
6. **The Oracle (inference).** Every `ORACLE_EVERY_TICKS` the server sends a compact world summary (era, materials, discoveries, wonders, recent events) to an OpenAI-compatible chat endpoint (xAI `grok-4.7` by default). The model returns a JSON **decree** containing an era name, a prophecy, **new recipes**, a **wonder** to raise from emojis, and **behaviour multipliers** (`found, build, immigrate, family, economy, leisure, streets, alchemy, wonder`, clamped to 0.33–3). Citizens pour materials into the wonder until it rises as a real landmark building made of that emoji, and every wonder speeds up the whole economy.
   - Model output is untrusted. `sanitizeDecree` drops unknown emojis and duplicate recipes, clamps every number, and strips markup.
   - The decree becomes an ordinary `world.decree` action/patch, so browsers replay it in lockstep and runs stay reproducible.
   - The call is async and never blocks the tick loop. Without a key, or on error or timeout, a deterministic **local oracle** issues the decree instead. The ⓘ panel shows who is steering (`🔮 llm:grok-4.7` or `🔮 local`).

`GET /api/world` returns the full world layer (era, materials, recipes, wonders, chronicle).

### Environment variables
| var | default | meaning |
|---|---|---|
| `ORACLE` | `auto` | `auto` uses the LLM when a key is set, otherwise local. `llm` / `local` force one or the other |
| `ORACLE_API_KEY` | (falls back to `XAI_API_KEY`) | inference key. **Never commit it.** |
| `ORACLE_API_URL` | `https://api.x.ai/v1/chat/completions` | any OpenAI-compatible chat endpoint |
| `ORACLE_MODEL` | `grok-4.7` | model id |
| `ORACLE_EVERY_TICKS` | `120` | how often the oracle is consulted |
| `ORACLE_TIMEOUT_MS` | `30000` | inference timeout; on timeout the local oracle decides |

All other variables are in [.env.example](.env.example).

## Development checks
```bash
npm run lint && npm run typecheck && npm test   # or: npm run check
npm run build && npm run smoke                  # e2e: sim-server + vite preview + headless Chrome + mock LLM oracle
```
The smoke test needs Chrome (`CHROME_PATH`, default `/usr/bin/google-chrome`). By default it runs a local mock inference endpoint. To smoke against a real model, set `SMOKE_ORACLE_URL` and `ORACLE_API_KEY`.

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
