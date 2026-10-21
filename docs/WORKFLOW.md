# How the world is made and processed

Four passes. The first two are free and run all day. The last two are the only ones allowed to touch Venice, and only when someone asks. The key has **$1 per Pacific day** (see [MODELS.md](MODELS.md)).

The glyphs are not the system emoji font. Every picture is **Xero Emoji** from [maximusmaximus/xeroemoji](https://github.com/maximusmaximus/xeroemoji), pinned at `v1.0.0`. Files are `svg/<codepoints>.svg` on jsDelivr. Credit on screen: "Xero Emoji by Max Infeld". The artwork is CC BY-NC 4.0.

Growth is a civilization, not a drip. See [CIVILIZATION.md](CIVILIZATION.md). One simulation step per frame, about 100× the old 1.6s beat. Research unlocks camp, farm, roads, town, city, then skyline.

```
seed ─► stake ─► raise ─► research     make     local, deterministic, every frame
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

1. **Seed.** `mulberry32(hash(seed))`. The same seed is the same civilization. It begins as one hut and a fire, not a finished district.
2. **Research.** Points accrue every few steps, and in a burst when a scholar arrives. Goals advance the era: camp, farm, roads, town, city, skyline. The era decides what may be staked next.
3. **Stake and raise.** A lot is chosen beside a road. A flag marks it. A builder walks there and adds one floor per trip, with people, pets, and things moving in as the floor exists. A crane stays on the roof until the building opens. Entering the city or skyline era promotes an existing block so a tower keeps growing instead of popping in.
4. **Roads and fields.** Pavers extend the frontier one cell at a time. Farmers tend plots; the crop emoji changes as the field ripens, then the grain is carried indoors. A road may cut a field if that is the only way out.
5. **Visits.** Residents walk between buildings and leave a gift. The log records openings, harvests, roads, discoveries, and visits. It does not record every frame.

## 2. Project

Every frame, still free.

1. **Frame.** The camera fits the growing ground and the tallest roofs, then expands the world box to the screen's aspect so the ground plane covers the window. Drag pans. The wheel zooms around the cursor. As the grid grows, the fit eases out so the new edge stays in view.
2. **Paint, back to front.** Sort key is `col + row`. Ground tiles first (roads sunk, fields tilled, wild grass flat), then trees, crops, crews, and vehicles, then buildings.
3. **Emoji first, then the block.** People, pets, gifts, crops, trees, cranes, vehicles, doors, and windows are Xero Emoji (`v1.0.0`), looked up by codepoint with U+FE0F dropped. The only blocks are the ground and the building prism. Name plates are limited to farms, towers, spires, and sites still rising.
4. **Pick.** The hit box is the life glyph's screen rectangle, front-most first. Scenery and crews are not targets.

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
- The renderer does not invent residents. If a life is on a floor, the sim put that emoji there.
- The system emoji font is not the art. If a Xero file is missing, the spot stays empty until it loads. It does not fall back to another set.
