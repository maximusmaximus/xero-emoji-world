# Handoff → Grok build agent

The code is written but has **never been installed, compiled or run**. Start here.

## 1. Bring-up checklist
1. `npm install` at the root (npm workspaces).
2. `npm test` runs the determinism and lockstep tests in `packages/shared/test`. Fix anything that breaks before touching other code.
3. `npm run typecheck`. Expect a few strictness fixes. `noUncheckedIndexedAccess` is on.
4. `docker compose up -d qdrant`, then `npm run dev:server`. Check that `/healthz` shows the tick going up, and that `xew_actions` grows in the Qdrant dashboard (http://localhost:6333/dashboard).
5. `npm run dev:web`. Vite proxies `/api`, `/ws` and `/events` to :8787.
6. Make the shared package resolvable in dev. Either build it first (`npm run build -w @xew/shared`) or add a Vite/tsx alias from `@xew/shared` to `packages/shared/src/index.ts`. **The alias is recommended.**

## 2. Known gaps / TODO (priority order)
- [ ] **State growth.** `CityState` is sent whole on connect. Once the city passes about 50 districts, switch to per-district chunks (`/api/district/:id`) and have the client fetch only districts in view.
- [ ] Relayout is a full `computeLayout` (throttled to 4/s). Make it incremental per building using `action.path`.
- [ ] The engine's write queue is in memory. Add a disk WAL if DB outages longer than the process lifetime matter.
- [ ] People who move out are deleted. Consider an "emigrated" archive so their stories stay linked.
- [ ] Add more behaviours to `BEHAVIOURS` in `shared/simulation.ts`: weddings (`person.married` is typed but not emitted), schools, fires 🚒, festivals 🎆, a day/night cycle that ties lights to a clock.
- [ ] Extend the emoji catalog. The target is **every** RGI emoji. Generate rows from `unicode.org/Public/emoji/latest/emoji-test.txt` with a script, then hand-assign roles.
- [ ] Emoji version values are approximate. Verify them against emoji-test.txt during that import.
- [ ] Auth/rate limiting on `/api/backup/download`. Full exports are expensive.
- [ ] Optional: let users switch to a Xero Emoji sprite atlas instead of system emoji fonts, so output looks the same on every platform.

## 3. Mobile caveats
- Pinch zoom is blocked with the viewport meta, `touch-action: pan-x pan-y`, `gesture*` preventDefault, and multi-touch `touchmove` preventDefault.
- Browsers only allow fullscreen from a user gesture. After 30 s the app tries right away, then retries on the next tap or keypress (`mobile.ts`).
- **iPhone Safari has no element Fullscreen API.** The fallbacks are `scrollTo(0,1)` and the PWA manifest (`display: fullscreen`) via "Add to Home Screen". iPadOS supports `webkitRequestFullscreen`.

## 4. Invariants (don't break)
- Only patches mutate state, and the client and server use the same reducer.
- `step()` randomness comes only from `Rng.at(seed, 'tick', tick)`. No `Math.random` in `packages/shared`.
- Every `emoji` field must exist in `EMOJI_CATALOG` (there's a test for this).
- First boot creates the city at the current time and logs genesis. Prior history is never backfilled.
