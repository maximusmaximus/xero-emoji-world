import type { CityAction, CityState } from './types.js';

/** Server -> client messages over WebSocket `/ws`. */
export type ServerMessage =
  | { t: 'snapshot'; state: CityState }
  | { t: 'action'; action: CityAction }
  | { t: 'tick'; tick: number; at: string };

/** Client -> server messages. */
export type ClientMessage =
  | { t: 'hello'; wantsStory: boolean }
  | { t: 'story'; on: boolean }
  | { t: 'ping' };

export const API = {
  ws: '/ws',
  sse: '/events',                    // SSE fallback for the life story
  state: '/api/state',
  world: '/api/world',
  entityStory: (id: string) => `/api/entity/${encodeURIComponent(id)}/story`,
  search: '/api/search?q=',          // semantic search over actions
  backupNow: '/api/backup/download', // streams ndjson.gz of the full DB
  backupList: '/api/backup/list',
  backupFile: (name: string) => `/api/backup/file/${encodeURIComponent(name)}`,
} as const;
