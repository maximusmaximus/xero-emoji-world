// End-to-end smoke test: boots the built sim-server (memory store) + vite preview,
// checks HTTP/WS APIs, then loads the page in headless Chrome and verifies the
// canvas renders and live actions arrive. Usage: npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 8787, WEB = 4173;
const procs = [];
const fail = (m) => { console.error('SMOKE FAIL:', m); cleanup(1); };
function cleanup(code) { for (const p of procs) try { p.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return r; } catch {} await sleep(250); } throw new Error('timeout ' + url); }
const run = (cmd, args, env = {}) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', (d) => process.stdout.write('[' + args.at(-1) + '] ' + d)); p.stderr.on('data', (d) => process.stderr.write('[' + args.at(-1) + '] ' + d)); procs.push(p); return p; };

try {
  run('node', ['apps/sim-server/dist/index.js'], { STORE: 'memory', PORT: String(PORT), TICK_MS: '200', BACKUP_DIR: '/tmp/xew-smoke-backups', ORACLE: process.env.ORACLE ?? 'local' });
  const h1 = await (await waitFor(`http://localhost:${PORT}/healthz`)).json();
  await sleep(1500);
  const h2 = await (await fetch(`http://localhost:${PORT}/healthz`)).json();
  if (!(h2.tick > h1.tick)) fail('tick not advancing');
  console.log('ok healthz', h1, h2);
  const state = await (await fetch(`http://localhost:${PORT}/api/state`)).json();
  if (!state.districts?.length) fail('no districts');
  console.log('ok state districts=%d pop=%d', state.districts.length, state.stats.population);
  const search = await (await fetch(`http://localhost:${PORT}/api/search?q=moved`)).json();
  if (!Array.isArray(search)) fail('search not array');
  console.log('ok search hits=%d', search.length);
  if (state.world) console.log('ok world era=%s essence=%s', state.world.era, state.world.essence);

  run('npx', ['vite', 'preview', '--port', String(WEB), '--strictPort', 'apps/web']);
  await waitFor(`http://localhost:${WEB}/`);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  let wsActions = 0;
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { if (String(f.payload).includes('"t":"action"')) wsActions++; }));
  await page.goto(`http://localhost:${WEB}/`);
  await page.waitForSelector('#city');
  await sleep(3000);
  const painted = await page.evaluate(() => { const c = document.getElementById('city'); const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { w: c.width, h: c.height, n }; });
  await page.click('#info-btn'); await sleep(800);
  const storyLines = await page.evaluate(() => document.getElementById('story')?.innerText.length ?? 0);
  await page.screenshot({ path: '/tmp/xew-smoke.png' });
  await browser.close();
  console.log('ok browser canvas=%o wsActions=%d storyChars=%d errors=%o', painted, wsActions, storyLines, errors);
  if (errors.length) fail('page errors');
  if (!painted.w || !painted.n) fail('canvas empty');
  if (!wsActions) fail('no live actions over ws');
  console.log('SMOKE PASS'); cleanup(0);
} catch (e) { fail(e.stack); }
