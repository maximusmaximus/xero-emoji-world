# How the world is made and processed

Four passes. The first two are free and run all day. The last two are the only ones allowed to touch Venice, and only when someone asks. The key has **$1 per Pacific day** (see [MODELS.md](MODELS.md)).

```
seed ─► plot ─► raise ─► tick        make     local, deterministic
                │
                ▼
         project ─► paint ─► pick       show     isometric, full viewport
                │
        tap or search
                │
                ▼
         remember ─► speak            ask      cached, budgeted
```

## 1. Make

Nothing in this pass calls a model.

1. **Seed.** `mulberry32(hash(seed))`. The same seed is the same city.
2. **Plot.** A district grid. Streets are every third column and every third row. Buildings take lots from a fixed plan, in order, so a newly founded block lands on the next empty lot instead of starting a new flat row.
3. **Raise.** Each lot becomes a building: floors, then people, pets, and things. Every one of those is an emoji first. The block is only the lot they stand on. Light is part of the apartment, not of the renderer.
4. **Tick.** `step` derives its RNG from `(seed, tick)` and appends one beat (bought something, adopted someone, commuted, founded a block, watched the night). Patches are the only way the city changes. The tick loop does not wait for a browser.

## 2. Project

Every frame, still free.

1. **Frame.** The camera fits every roof inside the viewport, then expands the world box to the screen's aspect so the ground plane covers **100%** of the window. Drag pans. The wheel zooms around the cursor.
2. **Paint, back to front.** Sort key is `col + row`. Ground tiles first (streets sunk, parks raised), then the emoji layer, then buildings.
3. **Emoji first, then the block.** Anything the city can create is a Unicode glyph: people, pets, things, trees, flowers, lamps, doors, windows, cars, taxis, buses, trucks. The only blocks are the ground and the building prism. A bigger district gets bigger glyphs — a bus and a truck once the city is grown, a helicopter and a plane once it is full, and landmarks (castle, wheel, ship, bridge) out past the lots. Glyphs sort with the blocks by `col + row`.
4. **Pick.** The hit box is the life glyph's screen rectangle, front-most first. Scenery is not a target.

## 3. Remember

Only when someone searches.

- Model: `text-embedding-qwen3-8b` (private, 4096-d).
- Embed the query and any beat text not already in the vector cache. A repeated search is free.
- **$0.02 of the daily dollar is reserved for this**, so search still works after the voice has spent the rest.
- Over the cap, or if Venice errors, fall back to the hash embedder / keyword match. Do not mix 256-d hash vectors with 4096-d Qwen vectors in the same Qdrant collection.

## 4. Speak

Only when someone taps a life.

- Model: `grok-4-20` (private).
- Request **must** send `reasoning_effort: "none"` and `venice_parameters.include_venice_system_prompt: false`. With reasoning left on, one sentence costs about $0.0045. With it off, about $0.0003, and the dollar covers thousands of fresh stories.
- `max_tokens` stays at 72. One or two sentences.
- The same resident and the same facts are cached. Replays are free.
- Voice stops at **$0.98**. After that, speak the known beat locally. Do not error, do not keep spending.
- Charge the real `usage` block, including cached input at the cheaper rate.

## What never happens

- A tick does not call Venice. The city stays alive with the dollar untouched.
- Keys are never committed. The host secret or a gitignored file is the only copy.
- The renderer does not invent residents. If a life is on a floor, the sim put that emoji there. Scenery glyphs are derived from the same seed and the size of the city.
