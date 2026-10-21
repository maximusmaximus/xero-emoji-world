import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialCity, indexCity } from '@xew/shared';
import { CityEngine } from '../src/engine.js';
import { LLMOracle, LocalOracle, parseDecree, SYSTEM_PROMPT, type Oracle } from '../src/oracle.js';
import { MemoryStore } from '../src/store/memory.js';
import { HashEmbedder } from '../src/embedder.js';

const NOW = '2026-10-20T00:00:00.000Z';
afterEach(() => vi.unstubAllGlobals());

describe('parseDecree', () => {
  it('extracts JSON from fenced / chatty replies', () => {
    expect(parseDecree('Sure!\n```json\n{"eraName":"Age of Foam"}\n```')).toEqual({ eraName: 'Age of Foam' });
    expect(() => parseDecree('no json here')).toThrow();
  });
});

describe('LLMOracle', () => {
  it('sends the world summary + palette and returns the model decree', async () => {
    const calls: { url: string; body: { model: string; messages: { role: string; content: string }[] }; auth: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization! });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"eraName":"Age of Steam","prophecy":"Hiss."}' } }] }));
    }));
    const s = createInitialCity('xew', NOW); indexCity(s);
    const d = await new LLMOracle('https://example.test/v1/chat/completions', 'k', 'grok-test', 1000).decree(s, ['🧱 a floor was built']);
    expect(d).toEqual({ eraName: 'Age of Steam', prophecy: 'Hiss.' });
    expect(calls[0]!.auth).toBe('Bearer k');
    expect(calls[0]!.body.model).toBe('grok-test');
    expect(calls[0]!.body.messages[0]!.content.startsWith(SYSTEM_PROMPT)).toBe(true);
    const summary = JSON.parse(calls[0]!.body.messages[1]!.content);
    expect(summary.recentEvents).toEqual(['🧱 a floor was built']);
    expect(summary.materials['🧱']).toBeGreaterThan(0);
  });
});

async function bootEngine(oracle: Oracle) {
  const engine = new CityEngine(new MemoryStore(new HashEmbedder(32)), oracle);
  await engine.boot();
  return engine;
}

describe('CityEngine + oracle', () => {
  it('injects an LLM decree into the next tick', async () => {
    const oracle: Oracle = { name: 'llm:fake', source: 'oracle', decree: async () => ({ eraName: 'Age of Glass', prophecy: 'All is clear.' }) };
    const engine = await bootEngine(oracle);
    await engine.consult();
    const seen: string[] = []; engine.on('action', (a) => seen.push(a.type));
    (engine as unknown as { tick(): void }).tick();
    expect(seen[0]).toBe('world.decree');
    expect(engine.state.world!.oracle).toBe('llm:fake');
    expect(engine.state.world!.chronicle.some((l) => l.includes('All is clear.'))).toBe(true);
  });
  it('falls back to the local oracle when inference fails', async () => {
    const oracle: Oracle = { name: 'llm:down', source: 'oracle', decree: async () => { throw new Error('503'); } };
    const engine = await bootEngine(oracle);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.consult();
    (engine as unknown as { tick(): void }).tick();
    expect(engine.state.world!.oracle).toBe('local (fallback)');
  });
  it('local oracle always produces a sane decree', async () => {
    const s = createInitialCity('xew', NOW); indexCity(s);
    const d = await new LocalOracle().decree(s);
    expect(d.prophecy).toBeTruthy(); expect(d.wonder?.emoji).toBeTruthy();
  });
});
