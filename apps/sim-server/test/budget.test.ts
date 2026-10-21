import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialCity, indexCity } from '@xew/shared';
import { DailyBudget, estimateCostUsd } from '../src/budget.js';
import { CityEngine } from '../src/engine.js';
import { HashEmbedder } from '../src/embedder.js';
import { BudgetExceededError, LLMOracle } from '../src/oracle.js';
import { MemoryStore } from '../src/store/memory.js';

const PRICES = { inputPerM: 3, cachedInputPerM: 0.75, outputPerM: 15 };
afterEach(() => vi.unstubAllGlobals());

describe('estimateCostUsd', () => {
  it('prices input, cached input, output and reasoning tokens', () => {
    expect(estimateCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 0 }, PRICES)).toBeCloseTo(3);
    expect(estimateCostUsd({ prompt_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }, PRICES)).toBeCloseTo(0.75);
    expect(estimateCostUsd({ prompt_tokens: 0, completion_tokens: 500_000, completion_tokens_details: { reasoning_tokens: 500_000 } }, PRICES)).toBeCloseTo(15);
  });
  it('falls back to chars/4 when usage is missing', () => {
    expect(estimateCostUsd(undefined, PRICES, { in: 4_000_000, out: 0 })).toBeCloseTo(3);
  });
});

describe('DailyBudget', () => {
  it('caps, rolls over at UTC midnight, and persists across restarts', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'xew-budget-')), 'b.json');
    let now = new Date('2026-10-21T23:59:00Z');
    const b = new DailyBudget(1, PRICES, path, () => now);
    b.record({ prompt_tokens: 200_000, completion_tokens: 0 }); // $0.60
    expect(b.canSpend()).toBe(true);
    const reopened = new DailyBudget(1, PRICES, path, () => now); // "restart"
    expect(reopened.status().spentUsd).toBeCloseTo(0.6);
    reopened.record({ prompt_tokens: 200_000, completion_tokens: 0 });
    expect(reopened.status()).toMatchObject({ capped: true, calls: 2, remainingUsd: 0 });
    expect(JSON.parse(readFileSync(path, 'utf8')).day).toBe('2026-10-21');
    now = new Date('2026-10-22T00:00:01Z');
    expect(reopened.status()).toMatchObject({ day: '2026-10-22', spentUsd: 0, capped: false });
  });
  it('works without a path (memory only) and survives an unwritable path', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(new DailyBudget(1, PRICES).canSpend()).toBe(true);
    const file = join(mkdtempSync(join(tmpdir(), 'xew-budget-')), 'not-a-dir');
    writeFileSync(file, 'x'); // parent of the ledger path is a file -> ENOTDIR
    const b = new DailyBudget(1, PRICES, join(file, 'b.json')); b.record({ prompt_tokens: 10, completion_tokens: 10 });
    expect(b.status().calls).toBe(1);
  });
});

describe('budgeted LLMOracle + engine', () => {
  it('records usage from the response and stops calling once capped', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"prophecy":"Spend wisely."}' } }], usage: { prompt_tokens: 100_000, completion_tokens: 20_000 },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const budget = new DailyBudget(0.5, PRICES); // each call = 0.3 + 0.3 = $0.60
    const oracle = new LLMOracle('https://example.test', 'k', 'grok-test', 1000, budget);
    const s = createInitialCity('xew', '2026-10-20T00:00:00Z'); indexCity(s);
    await oracle.decree(s, []);
    expect(budget.status().spentUsd).toBeCloseTo(0.6);
    await expect(oracle.decree(s, [])).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const engine = new CityEngine(new MemoryStore(new HashEmbedder(32)), oracle);
    await engine.boot(); await engine.consult();
    (engine as unknown as { tick(): void }).tick();
    expect(engine.state.world!.oracle).toBe('local (daily budget reached)');
    expect(engine.state.world!.oracleBudget).toMatchObject({ capped: true, capUsd: 0.5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
