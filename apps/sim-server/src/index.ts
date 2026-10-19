/**
 * HTTP + WebSocket server.
 *   GET  /api/state                 full CityState (initial render)
 *   WS   /ws                        snapshot, then every action/tick in lockstep
 *   GET  /events                    SSE stream of actions (fallback / embeds)
 *   GET  /api/entity/:id/story      life story of one entity from the vector DB
 *   GET  /api/search?q=             semantic search over all actions
 *   GET  /api/backup/download       live export of the whole DB (ndjson.gz)
 *   GET  /api/backup/list           scheduled snapshots on disk
 *   GET  /api/backup/file/:name     download a scheduled snapshot
 *   GET  /healthz
 */
import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CityAction, ClientMessage, ServerMessage } from '@xew/shared';
import { backupName, backupStream, listBackups, scheduleBackups } from './backup.js';
import { config } from './config.js';
import { createEmbedder } from './embedder.js';
import { CityEngine } from './engine.js';
import { MemoryStore } from './store/memory.js';
import { QdrantStore } from './store/qdrant.js';

const embedder = createEmbedder();
const store = process.env.STORE === 'memory' ? new MemoryStore(embedder) : new QdrantStore(embedder);
await store.init();
const engine = new CityEngine(store);
await engine.boot();
engine.start();
scheduleBackups(store, () => engine.state.tick);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body));
};

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (p === '/healthz') return json(res, { ok: true, tick: engine.state.tick });
  if (p === '/api/state') return json(res, engine.state);
  if (p === '/api/search') return json(res, await store.search(url.searchParams.get('q') ?? '', 25));
  const story = p.match(/^\/api\/entity\/([^/]+)\/story$/);
  if (story) return json(res, await store.storyFor(decodeURIComponent(story[1]!), 50));
  if (p === '/api/backup/download') {
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${backupName(engine.state.tick)}"`, ...cors });
    return backupStream(store, { tick: engine.state.tick, seed: engine.state.seed }).pipe(res);
  }
  if (p === '/api/backup/list') return json(res, await listBackups());
  const file = p.match(/^\/api\/backup\/file\/(.+)$/);
  if (file) {
    const name = basename(decodeURIComponent(file[1]!)); // no path traversal
    if (!(await listBackups()).some((b) => b.name === name)) return json(res, { error: 'not found' }, 404);
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${name}"`, ...cors });
    return createReadStream(join(config.backup.dir, name)).pipe(res);
  }
  if (p === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...cors });
    const onAction = (a: CityAction) => res.write(`event: action\ndata: ${JSON.stringify(a)}\n\n`);
    engine.on('action', onAction);
    req.on('close', () => engine.off('action', onAction));
    return;
  }
  json(res, { error: 'not found' }, 404);
}

const server = createServer((req, res) => { route(req, res).catch((e) => json(res, { error: String(e) }, 500)); });
const wss = new WebSocketServer({ server, path: '/ws' });
const send = (ws: WebSocket, m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

wss.on('connection', (ws) => {
  // Every client receives actions (patches keep the canvas in lockstep);
  // `story` only controls whether the client shows the text feed.
  send(ws, { t: 'snapshot', state: engine.state });
  const onAction = (action: CityAction) => send(ws, { t: 'action', action });
  const onTick = (tick: number, at: string) => send(ws, { t: 'tick', tick, at });
  engine.on('action', onAction); engine.on('tick', onTick);
  ws.on('message', (raw) => { try { const m = JSON.parse(String(raw)) as ClientMessage; if (m.t === 'ping') ws.send('{"t":"pong"}'); } catch { /* ignore */ } });
  ws.on('close', () => { engine.off('action', onAction); engine.off('tick', onTick); });
});

server.listen(config.port, () => console.log(`[xew] sim-server on :${config.port} (store=${process.env.STORE ?? 'qdrant'}, embedder=${embedder.name})`));
const shutdown = async () => { engine.stop(); await store.saveSnapshot(engine.state); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
