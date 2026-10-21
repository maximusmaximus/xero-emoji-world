// End-to-end smoke test: boots the built sim-server (memory store) + vite preview,
// checks HTTP/WS APIs, then loads the page in headless Chrome and verifies the
// canvas renders and live actions arrive. Usage: npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const PORT = 8787, WEB = 4173;
const procs = [];
const fail = (m) => { console.error('SMOKE FAIL:', m); cleanup(1); };
function cleanup(code) { for (const p of procs) try { p.kill('SIGTERM'); } catch {} setTimeout(() => process.exit(code), 300); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return r; } catch {} await sleep(250); } throw new Error('timeout ' + url); }
const run = (cmd, args, env = {}) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', (d) => process.stdout.write('[' + args.at(-1) + '] ' + d)); p.stderr.on('data', (d) => process.stderr.write('[' + args.at(-1) + '] ' + d)); procs.push(p); return p; };

// A fake OpenAI-compatible inference endpoint, so the LLM oracle path is exercised end to end
// without a real key. Set SMOKE_ORACLE_URL + ORACLE_API_KEY to hit a real model instead.
const MOCK = 8799; let mockCalls = 0;
const mock = createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    mockCalls++; const ok = JSON.parse(body).messages?.length === 2;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ eraName: 'Age of Smoke Tests', essence: '🫧', prophecy: ok ? 'The mock oracle has spoken.' : 'bad request',
      recipes: [{ a: '🪙', b: '🍞', out: '🍯', name: 'golden honey' }], wonder: { emoji: '🏰', name: 'Smoke Keep', cost: { '🪙': 100 } }, boosts: { build: 1.5 } }) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 1000 } }));
  });
}).listen(MOCK);
procs.push({ kill: () => mock.close() });

try {
  const legacy = process.env.SMOKE_LEGACY === '1';
  const oracleEnv = legacy ? {} : process.env.SMOKE_ORACLE_URL
    ? { ORACLE: 'llm', ORACLE_API_URL: process.env.SMOKE_ORACLE_URL }
    : { ORACLE: 'llm', ORACLE_API_URL: `http://localhost:${MOCK}/v1/chat/completions`, ORACLE_API_KEY: 'smoke-test-not-a-key', ORACLE_MODEL: 'mock',
        // each mock call ≈ $0.018 at default prices, so the cap is hit after 2 calls
        ORACLE_DAILY_BUDGET_USD: '0.03', ORACLE_BUDGET_PATH: `/tmp/xew-smoke-budget-${process.pid}.json` };
  run('node', ['apps/sim-server/dist/index.js'], { STORE: 'memory', PORT: String(PORT), TICK_MS: '200', BACKUP_DIR: '/tmp/xew-smoke-backups', ORACLE_EVERY_TICKS: '5', ...oracleEnv });
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
  if (!legacy) {
    await sleep(1500);
    const world = await (await fetch(`http://localhost:${PORT}/api/world`)).json();
    if (!world?.materials || !world.recipes?.length) fail('no world state');
    if (!world.chronicle.some((l) => l.startsWith('🔮'))) fail('no oracle decree applied');
    if (!process.env.SMOKE_ORACLE_URL) {
      if (!(mockCalls > 0 && world.chronicle.some((l) => l.includes('The mock oracle has spoken.')))) fail(`LLM oracle decree not applied (calls=${mockCalls}, oracle=${world.oracle})`);
      await sleep(2500);
      const w2 = await (await fetch(`http://localhost:${PORT}/api/world`)).json();
      if (!w2.oracleBudget?.capped || mockCalls > 2 || !w2.oracle.includes('budget')) fail(`budget cap not enforced (calls=${mockCalls}, oracle=${w2.oracle}, budget=${JSON.stringify(w2.oracleBudget)})`);
      console.log('ok budget cap: calls=%d oracle=%s budget=%o', mockCalls, w2.oracle, w2.oracleBudget);
    }
    const hits = await (await fetch(`http://localhost:${PORT}/api/search?q=oracle`)).json();
    console.log('ok world era=%d %s knowledge=%d oracle=%s wonders=%d decreeSearchHits=%d', world.era, world.eraName, world.knowledge, world.oracle, world.wonders.length, hits.length);
  }

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
  const statsText = await page.evaluate(() => document.querySelector('#story .stats')?.textContent ?? '');
  console.log('stats panel: %s', statsText);
  if (process.env.SMOKE_LEGACY !== '1' && !statsText.includes('🔮')) fail('world stats not shown in ⓘ panel');
  if (!process.env.SMOKE_ORACLE_URL && process.env.SMOKE_LEGACY !== '1' && !statsText.includes('cap reached')) fail('budget cap not shown in ⓘ panel');
  await page.screenshot({ path: '/tmp/xew-smoke.png' });
  await browser.close();
  console.log('ok browser canvas=%o wsActions=%d storyChars=%d errors=%o', painted, wsActions, storyLines, errors);
  if (errors.length) fail('page errors');
  if (!painted.w || !painted.n) fail('canvas empty');
  if (!wsActions) fail('no live actions over ws');
  console.log('SMOKE PASS'); cleanup(0);
} catch (e) { fail(e.stack); }
