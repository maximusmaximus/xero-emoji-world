/** WebSocket client with reconnect + full resync on reconnect. */
import type { CityAction, CityState, ServerMessage } from '@xew/shared';

export const SIM_URL: string = (import.meta.env.VITE_SIM_URL as string | undefined) ?? '';
export const api = (path: string) => `${SIM_URL}${path}`;

export interface NetHandlers { onSnapshot(s: CityState): void; onAction(a: CityAction): void; onTick(tick: number, at: string): void; onStatus(s: 'live' | 'reconnecting'): void; }

export function connect(h: NetHandlers) {
  let retry = 500;
  const open = () => {
    const base = SIM_URL || location.origin;
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    ws.onopen = () => { retry = 500; h.onStatus('live'); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ServerMessage;
      if (m.t === 'snapshot') h.onSnapshot(m.state);
      else if (m.t === 'action') h.onAction(m.action);
      else if (m.t === 'tick') h.onTick(m.tick, m.at);
    };
    ws.onclose = () => { h.onStatus('reconnecting'); setTimeout(open, (retry = Math.min(retry * 2, 15000))); };
  };
  open();
}
