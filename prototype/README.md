# Live Grok world

This is the source that is actually running. `apps/web` and `apps/sim-server` are the earlier Docker layout. The behaviors in [docs/CIVILIZATION.md](../docs/CIVILIZATION.md) are implemented here.

```
src/city/sim.ts           eras, crews, roads, farms, watcher speed, Venice building plans
src/city/draw.ts          isometric canvas, emoji roads, sky, growth, hit testing
src/city/save.ts          browser persistence (localStorage)
src/city/xero-emoji.ts    glyphs from https://github.com/maximusmaximus/xeroemoji
src/lib/venice.server.ts  grok-4-20 voice, embeddings, daily dollar, extra keys, development plans
src/lib/watchers.server.ts  live watcher count
src/lib/world-api.ts      server functions the canvas calls
src/routes/index.tsx      canvas, one-finger rotate, two-finger pan and pinch, watcher chip, key paste
```

These files sit inside the Grok app shell (TanStack Start). They are not the `npm run dev:web` Vite app.

Keys stay on the host. `VENICE_KEY_PATH` points at a secret file (default `/workspace/.secrets/venice.key`). That file is gitignored. Do not commit it. Each key has its own dollar per Pacific day. Click the Venice badge in the canvas to paste another one.
