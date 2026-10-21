/** Small helpers shared by the core and world behaviours (kept separate to avoid import cycles). */
import type { GenContext } from './generator.js';
import type { CityIndex } from './reducer.js';
import type { Rng } from './rng.js';
import type { ActionType, CityAction, CityState, StatePatch } from './types.js';

export interface SimContext {
  state: CityState; idx: CityIndex; rng: Rng; gen: GenContext; now: string;
  /** residents per home capacity (2 per apartment), 0..1+ */
  pressure: number; emptyLots: number; avgMood: number;
}
export type Behaviour = (c: SimContext) => Omit<CityAction, 'id' | 'tick' | 'at'> | null;
export const clone = <T>(v: T): T => structuredClone(v);
export const act = (type: ActionType, emoji: string, text: string, patch: StatePatch, path: string[] = [], actorId?: string, targetId?: string) =>
  ({ type, emoji, text, patch, path, actorId, targetId });
