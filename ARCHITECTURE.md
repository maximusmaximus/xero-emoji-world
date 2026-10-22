# Architecture

```
 ┌─────────── sim-server (Node) ────────────┐        ┌─────── web (browser) ────────┐
 │ CityEngine ── setTimeout loop (TICK_MS)    │  WS    │ snapshot → indexCity           │
 │   step(state) ─► CityAction[] ────────────┼──────► │ action → applyAction (same     │
 │   │  (shared/simulation.ts, deterministic) │  SSE   │   reducer) → project iso → canvas│
 │   ├─► Qdrant xew_actions  (embed(text))    │        │ ℹ️ feed / popup / search        │
 │   ├─► Qdrant xew_entities (touched docs)   │  HTTP  │ ⬇️ /api/backup/download        │
 │   └─► snapshot point every N ticks         │ ◄──────└─────────────────────────────┘
 │ Backups: hourly ndjson.gz to ./backups     │
 └───────────────────────────────────────────────┘
```

How a thing moves through those boxes is written out in [docs/WORKFLOW.md](docs/WORKFLOW.md): **make → project → remember → speak**.

## Core ideas
1. **The city is a pure function plus a log.** `createInitialCity(seed, now)` builds the core. `step(state)` derives its RNG from `(seed, tick)` and returns actions. Each action carries a `patch`, and patches are the only way state changes (`shared/reducer.ts`). Server and client run the same reducer, so the canvas stays in **lockstep** with the life story. The test suite checks this by replaying patches on a replica.
2. **Genesis = now.** On first boot there's no snapshot, so the engine creates the city at the current time and writes a `city.event` genesis action. History before that is not replayed or invented. After that, every action is persisted.
3. **Runs headless.** The tick loop doesn't depend on any connected client, and it does not call Venice. Inference runs only when a person searches or opens a life.
4. **Hierarchy:** City → District (isometric grid, streets every third column and row) → Lot → Building → Floor → Apartment → People / Pets / Items, plus street lamps, trees, and the tram.
5. **Emoji catalog** (`shared/emoji-catalog.ts`). It's a single source of truth with name, category, roles and version. Codepoints are derived from the glyph itself. The generator picks glyphs by *role*, so adding a catalog row with `role=pet` makes new pets appear automatically.

## Why Qdrant
- It's a purpose-built vector DB with payload filtering (`path` keyword index), so "life story of entity X" is a filtered scroll and "semantic search" is ANN, both in one store.
- It runs as one Docker container with on-disk persistence, has an official JS client, and has an easy scroll API for full exports.
- Alternatives we considered: **pgvector** (great if you already have Postgres, but it's more schema work), and **LanceDB** (embedded, but the Node bindings are native, and concurrent writers plus HTTP export are harder).
- Everything goes through the `VectorStore` interface (`apps/sim-server/src/store/vector-store.ts`), so swapping stores is local. A `MemoryStore` is included.

## Embeddings
`HashEmbedder` is the default. It does deterministic feature hashing of words, bigrams and emoji graphemes into 256 dims (L2-normalised). It works offline and is reproducible. `OpenAICompatibleEmbedder` calls any `/v1/embeddings` endpoint and falls back to hash on error. Production memory is `text-embedding-qwen3-8b` (private, 4096-d) and the voice is `grok-4-20` with reasoning off. See [docs/MODELS.md](docs/MODELS.md). Switching embedder or dim needs **new collections**.

## Data in Qdrant
| collection | point | vector | payload |
|---|---|---|---|
| `xew_actions` | one per action | embed(text) | full `CityAction` (+ `xewId`, `embedder`) |
| `xew_entities` | building / apartment / person | embed(description) | doc + data |
| `xew_entities` | `__city_snapshot__` | unit vector | gzipped base64 `CityState`, tick |

Ids are UUIDv5-style hashes of our string ids (Qdrant needs a uint or UUID).

## Rendering
The view is a full-bleed isometric diorama, not a cutaway elevation. The ground plane covers the whole viewport. Each building is a prism: shaded left face, lit right face, roof, one glowing window per floor, residents standing on the front ledge of their floor. The camera fits every roof inside the screen, then the tile grid continues to the edges. Drag looks around, the wheel zooms, a tap hits the glyph. Painter's order is `col + row`. The Grok prototype implements this pipeline now; `apps/web` should use the same passes when its canvas is next ported.

## Backups
`GET /api/backup/download` streams a gzipped NDJSON file. It has a header line, then every point from both collections with vectors. Scheduled copies are written every `BACKUP_INTERVAL_MIN` and the newest `BACKUP_KEEP` are kept. `apps/sim-server/scripts/restore.ts` restores a backup.

## World layer (emoji-alchemy + Oracle)
- `packages/shared/src/world.ts` contains the pure model: materials, recipes, wonders, eras, the compounding multiplier, `sanitizeDecree`, `localDecree` and `worldSummary`.
- `packages/shared/src/world-behaviours.ts` contains the harvest, alchemy, wonder and decree actions, plus `dynamicWeight` (demand-driven behaviour weights).
- `apps/sim-server/src/oracle.ts` has `LLMOracle` (OpenAI-compatible chat, JSON mode) and `LocalOracle`. `CityEngine.consult()` runs every `ORACLE_EVERY_TICKS` without blocking and injects the decree into the next `step()`.
- State: `CityState.world`. Patch: `{ op: 'setWorld' }`. Snapshots from before this layer are back-filled by `ensureWorld` inside `indexCity`.

## Invariants (don't break)
- `step()` applies a *copy* of each patch, so emitted actions stay immutable. Mutating an emitted patch breaks client lockstep. This was a latent bug: a floor added in the same tick as a `setLot` was double-applied on clients.
- Oracle and LLM output only enters state through `sanitizeDecree` → `world.decree` action.
- Only patches mutate state, and the client and server use the same reducer.
- `step()` randomness comes only from `Rng.at(seed, 'tick', tick)`. No `Math.random` in `packages/shared`.
- Every `emoji` field must exist in `EMOJI_CATALOG` (there's a test for this).
- First boot creates the city at the current time and logs genesis. Prior history is never backfilled.

## Mobile caveats
- Pinch zoom is blocked with the viewport meta, `touch-action: pan-x pan-y`, `gesture*` preventDefault, and multi-touch `touchmove` preventDefault.
- Browsers only allow fullscreen from a user gesture. After 30 s the app tries right away, then retries on the next tap or keypress (`mobile.ts`).
- **iPhone Safari has no element Fullscreen API.** The fallbacks are `scrollTo(0,1)` and the PWA manifest (`display: fullscreen`) via "Add to Home Screen". iPadOS supports `webkitRequestFullscreen`.

## Open TODOs (server + web workspaces)
- [ ] **State growth.** `CityState` is sent whole on connect. Once the city passes about 50 districts, switch to per-district chunks (`/api/district/:id`) and have the client fetch only districts in view.
- [ ] Relayout is a full `computeLayout` (throttled to 4/s). Make it incremental per building using `action.path`.
- [ ] The engine's write queue is in memory. Add a disk WAL if DB outages longer than the process lifetime matter.
- [ ] People who move out are deleted. Consider an "emigrated" archive so their stories stay linked.
- [ ] More behaviours in `packages/shared/src/simulation.ts`: weddings (`person.married` is typed but not emitted), schools, fires 🚒, festivals 🎆, a day/night cycle tied to a clock.
- [ ] Extend the emoji catalog. The target is **every** RGI emoji. Generate rows from `unicode.org/Public/emoji/latest/emoji-test.txt` with a script, then hand-assign roles.
- [ ] Emoji version values are approximate. Verify them against emoji-test.txt during that import.
- [ ] Auth/rate limiting on `/api/backup/download`. Full exports are expensive.
- [ ] Optional: let users switch to a Xero Emoji sprite atlas instead of system emoji fonts, so output looks the same on every platform.
