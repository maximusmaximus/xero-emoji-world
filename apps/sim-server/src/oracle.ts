/**
 * The Oracle: model inference that steers how the emoji world develops.
 *
 * Every ORACLE_EVERY_TICKS the engine sends a compact world summary (era, materials,
 * discovered recipes, wonders, recent events) to an OpenAI-compatible chat endpoint
 * (xAI by default) and asks for a JSON DECREE: era name, prophecy, new emoji recipes,
 * a wonder to build out of emojis, and behaviour multipliers. The decree is sanitised
 * in @xew/shared (unknown emojis dropped, numbers clamped) and injected into the next
 * tick as a normal `world.decree` action, so every client replays it in lockstep.
 *
 * The call is async and never blocks the tick loop. If no key is set, or the call fails
 * or times out, the deterministic LocalOracle decides instead and the world keeps growing.
 */
import { BEHAVIOUR_KEYS, ORACLE_PALETTE, localDecree, ensureWorld, worldSummary, type CityState, type Decree } from '@xew/shared';
import { DailyBudget, type BudgetStatus, type Usage } from './budget.js';
import { config } from './config.js';

export interface Oracle {
  readonly name: string; readonly source: 'oracle' | 'local';
  decree(state: CityState, recent: string[]): Promise<Decree>;
  /** Present on budgeted oracles. */
  budget?: DailyBudget;
}

/** Thrown when the daily cap is reached; the engine then uses the local oracle. */
export class BudgetExceededError extends Error {
  constructor(readonly status: BudgetStatus) { super(`daily budget reached ($${status.spentUsd.toFixed(4)} of $${status.capUsd})`); }
}

export class LocalOracle implements Oracle {
  readonly name = 'local'; readonly source = 'local' as const;
  async decree(state: CityState) { return localDecree(state, ensureWorld(state), state.tick); }
}

export const SYSTEM_PROMPT = `You are the Oracle of Xero Emoji World, a fantastical city that is literally built out of emojis.
Districts harvest element emojis, residents combine two emojis into a new one (alchemy), floors cost bricks, and wonders are raised by pouring emojis into them.
Every decree you issue changes the simulation. Read the world summary and steer the world toward an interesting, ever-more fantastical, compounding future:
invent recipes that turn what the city has in abundance into rarer, more magical emojis; pick a wonder that fits the story so far; and tune behaviour weights to fix bottlenecks (e.g. stalled construction means boost "alchemy" or "build").
Respond with ONLY a JSON object of this shape:
{"eraName": string (<=48 chars, evocative), "essence": emoji, "prophecy": string (<=200 chars, one vivid sentence),
 "recipes": [{"a": emoji, "b": emoji, "out": emoji, "name": string}] (0-3, each a NEW pair not already discovered),
 "wonder": {"emoji": emoji, "name": string, "cost": {emoji: integer}} (optional; costs should use materials the city has or can craft),
 "boosts": {${BEHAVIOUR_KEYS.map((k) => `"${k}"`).join(', ')}: number 0.33-3} (optional)}
Use ONLY emojis from this palette: `;

export class LLMOracle implements Oracle {
  readonly source = 'oracle' as const; readonly name: string;
  constructor(private url: string, private key: string, private model: string, private timeoutMs: number, readonly budget?: DailyBudget) { this.name = `llm:${model}`; }
  async decree(state: CityState, recent: string[]): Promise<Decree> {
    if (this.budget && !this.budget.canSpend()) throw new BudgetExceededError(this.budget.status());
    const system = SYSTEM_PROMPT + ORACLE_PALETTE().join(' '); const user = JSON.stringify(worldSummary(state, recent));
    const res = await fetch(this.url, {
      method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model, temperature: 0.9, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`oracle HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: Usage };
    const content = json.choices?.[0]?.message?.content ?? '';
    // record before parsing: a malformed reply still cost tokens
    this.budget?.record(json.usage, { in: system.length + user.length, out: content.length });
    return parseDecree(content);
  }
}

/** Extract the JSON object from a model reply (tolerates code fences / chatter). */
export function parseDecree(text: string): Decree {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('oracle reply had no JSON object');
  return JSON.parse(text.slice(start, end + 1)) as Decree;
}

export function createOracle(): Oracle {
  const o = config.oracle;
  const useLlm = o.kind === 'llm' || (o.kind === 'auto' && !!o.key);
  return useLlm && o.key ? new LLMOracle(o.url, o.key, o.model, o.timeoutMs, new DailyBudget(o.dailyBudgetUsd, o.prices, o.budgetPath)) : new LocalOracle();
}
