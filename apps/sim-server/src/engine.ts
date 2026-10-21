/**
 * CityEngine: owns the authoritative state and runs the tick loop forever,
 * independent of whether any browser is connected ("it builds while no one looks").
 *
 * Boot sequence:
 *   1. Load snapshot from the vector DB.
 *   2. If none exists this is the FIRST RUN: create the city "as of now" and emit a
 *      `city.event` genesis action. We do not replay or fabricate prior history.
 *   3. Start ticking. Every action is written to the DB and broadcast to listeners.
 */
import { EventEmitter } from 'node:events';
import { createInitialCity, indexCity, step, type CityAction, type CityIndex, type CityState, type StepOptions } from '@xew/shared';
import { config } from './config.js';
import { entityDocs } from './entities.js';
import { LocalOracle, type Oracle } from './oracle.js';
import type { VectorStore } from './store/vector-store.js';

export class CityEngine extends EventEmitter {
  state!: CityState;
  idx!: CityIndex;
  private timer?: NodeJS.Timeout;
  private writeQueue: CityAction[] = [];
  private flushing = false;
  /** Recent story lines fed to the oracle as context. */
  private recent: string[] = [];
  private pendingDecree?: StepOptions['decree'];
  private consulting = false;
  private fallback = new LocalOracle();

  constructor(private store: VectorStore, private oracle: Oracle = new LocalOracle()) { super(); }

  async boot() {
    const snap = await this.store.loadSnapshot();
    if (snap) {
      this.state = snap;
      console.log(`[engine] resumed city at tick ${snap.tick} (${snap.stats.population} people)`);
    } else {
      const now = new Date().toISOString();
      this.state = createInitialCity(config.seed, now);
      console.log('[engine] FIRST RUN — city switched on at', now);
    }
    this.idx = indexCity(this.state);
    if (!snap) {
      const genesis: CityAction = {
        id: `act_${this.state.tick}_genesis`, tick: this.state.tick, at: this.state.startedAt, type: 'city.event', emoji: '✨',
        path: [], text: `✨ Xero Emoji World switched on with ${this.state.districts.length} districts and ${this.state.stats.population} residents.`,
        patch: { op: 'none' },
      };
      await this.store.writeActions([genesis]);
      await this.store.upsertEntities(entityDocs(this.state, this.idx));
      await this.store.saveSnapshot(this.state);
    }
  }

  start() {
    const loop = () => {
      try { this.tick(); } catch (e) { console.error('[engine] tick failed', e); }
      this.timer = setTimeout(loop, config.tickMs);
    };
    loop();
  }

  stop() { clearTimeout(this.timer); }

  private tick() {
    const now = new Date().toISOString();
    const decree = this.pendingDecree; this.pendingDecree = undefined;
    const actions = step(this.state, this.idx, { actionsPerTick: config.actionsPerTick, now, decree });
    for (const a of actions) if (a.type !== 'world.harvest' && a.type !== 'world.crafted') this.recent.push(a.text);
    if (this.recent.length > 40) this.recent.splice(0, this.recent.length - 40);
    if (this.state.tick % config.oracle.everyTicks === 0) void this.consult();
    this.emit('tick', this.state.tick, now);
    for (const a of actions) this.emit('action', a);
    this.writeQueue.push(...actions);
    void this.flush(actions);
    if (this.state.tick % config.snapshotEveryTicks === 0) void this.store.saveSnapshot(this.state).catch((e) => console.error('[engine] snapshot', e));
  }

  /** Ask the oracle for a decree without blocking the tick loop; fall back to the local oracle. */
  async consult() {
    if (this.consulting) return;
    this.consulting = true;
    // Both oracles read state synchronously (the LLM request body is built before the first await), so no clone is needed.
    const snapshot = this.state; const recent = [...this.recent];
    try {
      this.pendingDecree = { decree: await this.oracle.decree(snapshot, recent), source: this.oracle.source, oracle: this.oracle.name };
    } catch (e) {
      console.warn(`[oracle] ${this.oracle.name} failed (${(e as Error).message}); local oracle decides this time`);
      this.pendingDecree = { decree: await this.fallback.decree(snapshot), source: 'local', oracle: 'local (fallback)' };
    } finally { this.consulting = false; }
  }

  /** Persist actions + touched entities. Queue survives transient DB outages. */
  private async flush(latest: CityAction[]) {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.writeQueue.length) {
        const batch = this.writeQueue.slice(0, 500);
        await this.store.writeActions(batch);
        this.writeQueue.splice(0, batch.length);
      }
      const touched = new Set(latest.flatMap((a) => [...a.path, a.actorId ?? '', a.targetId ?? '']).filter(Boolean));
      await this.store.upsertEntities(entityDocs(this.state, this.idx, touched));
    } catch (e) {
      console.error('[engine] DB write failed, will retry next tick:', (e as Error).message);
    } finally { this.flushing = false; }
  }
}
