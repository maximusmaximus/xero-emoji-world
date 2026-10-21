/**
 * Daily spend cap for the Oracle's LLM calls.
 *
 * Spend is ESTIMATED from the `usage` block of each chat-completions response:
 *   cost = (prompt − cached) × inputPrice + cached × cachedInputPrice
 *        + (completion + reasoning) × outputPrice            (prices are USD per 1M tokens)
 * If a response has no usage block, tokens are approximated as characters ÷ 4.
 * The ledger resets at 00:00 UTC and is persisted as a small JSON file, so restarts
 * don't reset the day's spend. Same shape as the Venice ledger in prototype/ ({ day, spentUsd }),
 * but self-contained: that code lives in a separate app and is tied to Venice keys and Pacific days.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TokenPrices { inputPerM: number; cachedInputPerM: number; outputPerM: number }
export interface Usage {
  prompt_tokens?: number; completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}
export interface BudgetStatus { day: string; spentUsd: number; capUsd: number; remainingUsd: number; calls: number; capped: boolean }
interface Ledger { day: string; spentUsd: number; calls: number }

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function estimateCostUsd(usage: Usage | undefined, prices: TokenPrices, fallbackChars = { in: 0, out: 0 }): number {
  const prompt = usage?.prompt_tokens ?? Math.ceil(fallbackChars.in / 4);
  const cached = Math.min(prompt, usage?.prompt_tokens_details?.cached_tokens ?? 0);
  const out = (usage?.completion_tokens ?? Math.ceil(fallbackChars.out / 4)) + (usage?.completion_tokens_details?.reasoning_tokens ?? 0);
  return ((prompt - cached) * prices.inputPerM + cached * prices.cachedInputPerM + out * prices.outputPerM) / 1e6;
}

export class DailyBudget {
  private ledger: Ledger;
  constructor(readonly capUsd: number, readonly prices: TokenPrices, private path?: string, private now: () => Date = () => new Date()) {
    this.ledger = this.load();
  }
  private load(): Ledger {
    const day = utcDay(this.now());
    if (this.path) try {
      const p = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<Ledger>;
      if (p.day === day && Number.isFinite(p.spentUsd)) return { day, spentUsd: p.spentUsd!, calls: p.calls ?? 0 };
    } catch { /* missing or unreadable: start fresh */ }
    return { day, spentUsd: 0, calls: 0 };
  }
  private rollover() { const day = utcDay(this.now()); if (this.ledger.day !== day) this.ledger = { day, spentUsd: 0, calls: 0 }; }
  private save() {
    if (!this.path) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`; writeFileSync(tmp, JSON.stringify(this.ledger)); renameSync(tmp, this.path);
    } catch (e) { console.warn('[budget] could not persist ledger:', (e as Error).message); }
  }
  status(): BudgetStatus {
    this.rollover();
    const { day, spentUsd, calls } = this.ledger;
    return { day, spentUsd: round(spentUsd), capUsd: this.capUsd, remainingUsd: round(Math.max(0, this.capUsd - spentUsd)), calls, capped: spentUsd >= this.capUsd };
  }
  canSpend() { return !this.status().capped; }
  /** Record a completed call; returns its estimated cost. */
  record(usage: Usage | undefined, fallbackChars?: { in: number; out: number }): number {
    this.rollover();
    const cost = estimateCostUsd(usage, this.prices, fallbackChars);
    this.ledger.spentUsd += cost; this.ledger.calls++;
    this.save();
    return cost;
  }
}
