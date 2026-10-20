import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Selected 2026-10-19 against the live Venice catalog. Private only. */
export const WORLD_MODEL = "grok-4-20";
export const EMBED_MODEL = "text-embedding-qwen3-8b";
export const EMBED_DIM = 4096;

/** Hard daily cap for this key. Prices are USD per token from the Venice catalog. */
export const DAILY_BUDGET_USD = 1;
const VOICE_INPUT_USD = 1.42 / 1_000_000;
const VOICE_CACHE_USD = 0.23 / 1_000_000;
const VOICE_OUTPUT_USD = 2.83 / 1_000_000;
const EMBED_USD = 0.0125 / 1_000_000;
/** Leave this for search after the voice has spent the rest. */
const MEMORY_RESERVE_USD = 0.02;
const MAX_STORY_TOKENS = 72;

const CHAT_URL = "https://api.venice.ai/api/v1/chat/completions";
const EMBED_URL = "https://api.venice.ai/api/v1/embeddings";
const KEY_PATH = process.env.VENICE_KEY_PATH || "/workspace/.secrets/venice.key";

const STORY_SYSTEM =
  "Voice of Xero, a living emoji city that people are watching right now. One or two short sentences. No markdown. Match the era you are given: a camp is small and physical, a skyline talks about towers, emoji roads, fields, and the sky. The higher the research and the longer the city has been watched, the more sophisticated the detail.";

const DEVELOP_SYSTEM =
  "You propose the next two buildings for Xero, an emoji city people are watching. Reply with JSON only, no markdown: {\"developments\":[{\"name\":\"Two Words\",\"kind\":\"hut|farmhouse|house|block|tower|skyscraper\",\"emoji\":\"one emoji\",\"note\":\"one sentence\"}]}. More watchers means a more sophisticated building the current era can actually build. Names are unique and concrete.";

type Ledger = { day: string; spentUsd: number; byKey?: Record<string, number> };
type Budget = { spentUsd: number; capUsd: number; remainingUsd: number; day: string };

const storyCache = new Map<string, string>();
const vectorCache = new Map<string, number[]>();
const developCache = new Map<string, Development[]>();
let queue: Promise<unknown> = Promise.resolve();

const KINDS = ["hut", "farmhouse", "house", "block", "tower", "skyscraper"] as const;
type DevKind = (typeof KINDS)[number];
export type Development = { name: string; kind: DevKind; emoji: string; note: string };

function budgetFile() {
  return process.env.VENICE_BUDGET_PATH || "/workspace/.secrets/budget.json";
}

function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function tokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function readLedger(): Ledger {
  const day = dayKey();
  try {
    const parsed = JSON.parse(readFileSync(budgetFile(), "utf8")) as Ledger;
    if (parsed.day === day && Number.isFinite(parsed.spentUsd)) {
      return { day, spentUsd: parsed.spentUsd, byKey: parsed.byKey };
    }
  } catch {
    /* new day or first run */
  }
  return { day, spentUsd: 0 };
}

function writeLedger(ledger: Ledger) {
  const path = budgetFile();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger));
}

function budgetOf(ledger: Ledger): Budget {
  const spentUsd = Math.round(ledger.spentUsd * 1e8) / 1e8;
  return {
    spentUsd,
    capUsd: DAILY_BUDGET_USD,
    remainingUsd: Math.max(0, Math.round((DAILY_BUDGET_USD - spentUsd) * 1e8) / 1e8),
    day: ledger.day,
  };
}

function keyId(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function readVeniceKeys(): string[] {
  const out: string[] = [];
  const fromEnv = process.env.VENICE_API_KEY || process.env.VENICE_INFERENCE_KEY || "";
  if (fromEnv.trim()) out.push(fromEnv.trim());
  try {
    for (const line of readFileSync(KEY_PATH, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  } catch {
    /* no file yet */
  }
  return out;
}

function spentFor(ledger: Ledger, key: string) {
  return ledger.byKey?.[keyId(key)] ?? (ledger.byKey ? 0 : ledger.spentUsd);
}

function activeKey(ledger: Ledger): string {
  const keys = readVeniceKeys();
  return keys.find((key) => spentFor(ledger, key) < DAILY_BUDGET_USD) || keys[0] || "";
}

function charge(usd: number) {
  const ledger = readLedger();
  const key = activeKey(ledger);
  const id = key ? keyId(key) : "none";
  const byKey = { ...(ledger.byKey ?? {}) };
  if (!ledger.byKey && ledger.spentUsd > 0 && key) byKey[id] = ledger.spentUsd;
  byKey[id] = (byKey[id] ?? 0) + Math.max(0, usd);
  const spentUsd = Object.values(byKey).reduce((sum, n) => sum + n, 0);
  const next = { day: ledger.day, spentUsd, byKey };
  writeLedger(next);
  return budgetOf({ ...next, spentUsd: byKey[id] ?? 0 });
}

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const MODELS_URL = "https://api.venice.ai/api/v1/models";
let lastInference = { ok: false, detail: "not called yet" };
let probeCache: { at: number; ok: boolean; detail: string } = { at: 0, ok: false, detail: "" };

function noteInference(ok: boolean, detail: string) {
  lastInference = { ok, detail: detail.slice(0, 80) };
}

export async function veniceProbe(force = false): Promise<{ ok: boolean; detail: string }> {
  const key = veniceKey();
  if (!key) return { ok: false, detail: "no key on this host" };
  if (!force && probeCache.at && Date.now() - probeCache.at < 45_000) {
    return { ok: probeCache.ok, detail: probeCache.detail };
  }
  try {
    const res = await fetch(MODELS_URL, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) {
      const text = await res.text();
      probeCache = { at: Date.now(), ok: false, detail: `key rejected ${res.status}` };
      if (text) probeCache.detail = `${probeCache.detail}`;
      return { ok: false, detail: probeCache.detail };
    }
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = new Set((json.data ?? []).map((model) => model.id));
    if (!ids.has(WORLD_MODEL)) {
      probeCache = { at: Date.now(), ok: false, detail: `${WORLD_MODEL} missing` };
      return { ok: false, detail: probeCache.detail };
    }
    probeCache = { at: Date.now(), ok: true, detail: WORLD_MODEL };
    return { ok: true, detail: WORLD_MODEL };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 60) : "network";
    probeCache = { at: Date.now(), ok: false, detail };
    return { ok: false, detail };
  }
}

export function veniceKey(): string {
  return activeKey(readLedger());
}

export function addVeniceKeys(raw: string): { added: number; keyCount: number } {
  const incoming = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20 && part.length <= 200);
  const existing = readVeniceKeys();
  const next = [...existing];
  let added = 0;
  for (const key of incoming) {
    if (next.includes(key)) continue;
    next.push(key);
    added += 1;
  }
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, `${next.join("\n")}\n`, { mode: 0o600 });
  return { added, keyCount: next.length };
}

export async function veniceStatus() {
  const keys = readVeniceKeys();
  const ledger = readLedger();
  const key = activeKey(ledger);
  const spent = key ? spentFor(ledger, key) : 0;
  const probe = await veniceProbe();
  return {
    voice: WORLD_MODEL,
    embed: EMBED_MODEL,
    embedDim: EMBED_DIM,
    privacy: "private" as const,
    keyPresent: keys.length > 0,
    keyCount: keys.length,
    live: probe.ok,
    detail: lastInference.ok ? lastInference.detail : probe.detail,
    budget: budgetOf({ ...ledger, spentUsd: spent }),
  };
}

type NarrateInput = {
  name: string;
  emoji: string;
  role: string;
  place: string;
  facts: string;
  era?: string;
  research?: number;
  tick?: number;
};

function localStory(input: NarrateInput, why: string) {
  const beat = input.facts ? ` ${input.facts}` : "";
  return `${input.name} is at ${input.place}.${beat} ${why}`.replace(/\s+/g, " ").trim();
}

export async function narrate(input: NarrateInput): Promise<{
  text: string;
  model: string;
  live: boolean;
  cached: boolean;
  budget: Budget;
}> {
  const cacheKey = `${input.name}|${input.place}|${input.facts}`;
  const hit = storyCache.get(cacheKey);
  if (hit) {
    return { text: hit, model: WORLD_MODEL, live: true, cached: true, budget: budgetOf(readLedger()) };
  }
  const key = veniceKey();
  if (!key) {
    noteInference(false, "no key on this host");
    return {
      text: localStory(input, "Venice is not configured on this server."),
      model: WORLD_MODEL,
      live: false,
      cached: false,
      budget: budgetOf(readLedger()),
    };
  }
  const user = `${input.emoji} ${input.name} (${input.role}) at ${input.place}. Era ${input.era || "camp"}, research ${input.research || 0}, watched for ${input.tick || 0} ticks. People are watching, so speak at that level of sophistication. ${input.facts || "Just arrived."}`;
  const estimate = tokens(STORY_SYSTEM + user) * VOICE_INPUT_USD + MAX_STORY_TOKENS * VOICE_OUTPUT_USD;
  return serialized(async () => {
    const ledger = readLedger();
    const liveKey = activeKey(ledger);
    if (!liveKey || spentFor(ledger, liveKey) + estimate > DAILY_BUDGET_USD - MEMORY_RESERVE_USD) {
      noteInference(false, "voice budget held");
      return {
        text: localStory(input, "The day's voice budget is saved for tomorrow."),
        model: WORLD_MODEL,
        live: false,
        cached: false,
        budget: budgetOf(ledger),
      };
    }
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${liveKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: WORLD_MODEL,
        temperature: 0.7,
        max_tokens: MAX_STORY_TOKENS,
        reasoning_effort: "none",
        venice_parameters: { include_venice_system_prompt: false },
        messages: [
          { role: "system", content: STORY_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      noteInference(false, `voice ${res.status}`);
      const detail = await res.text();
      throw new Error(`Venice voice ${res.status}: ${detail.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Venice voice returned an empty story");
    const prompt = json.usage?.prompt_tokens ?? tokens(STORY_SYSTEM + user);
    const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const completion = json.usage?.completion_tokens ?? tokens(text);
    const spent =
      Math.max(0, prompt - cachedTokens) * VOICE_INPUT_USD +
      cachedTokens * VOICE_CACHE_USD +
      completion * VOICE_OUTPUT_USD;
    storyCache.set(cacheKey, text);
    noteInference(true, WORLD_MODEL);
    return { text, model: WORLD_MODEL, live: true, cached: false, budget: charge(spent) };
  });
}

type BeatIn = { id: string; text: string };

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function keywordScore(query: string, text: string): number {
  const q = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hay = text.toLowerCase();
  if (q.length === 0) return 0;
  return q.filter((w) => hay.includes(w)).length / q.length;
}

function keywordHits(query: string, beats: BeatIn[]) {
  return beats
    .map((b) => ({ id: b.id, text: b.text, score: keywordScore(query, b.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export async function searchLife(query: string, beats: BeatIn[]): Promise<{
  model: string;
  live: boolean;
  cached: boolean;
  budget: Budget;
  hits: { id: string; score: number; text: string }[];
}> {
  const clipped = beats.slice(0, 16).filter((b) => b.text && b.id);
  const key = veniceKey();
  const empty = {
    model: EMBED_MODEL,
    live: false,
    cached: false,
    budget: budgetOf(readLedger()),
    hits: keywordHits(query, clipped),
  };
  if (!key || clipped.length === 0) return empty;
  const missing = [query, ...clipped.map((b) => b.text)].filter((t) => !vectorCache.has(t));
  const estimate = missing.reduce((sum, t) => sum + tokens(t), 0) * EMBED_USD;
  if (missing.length === 0) {
    const qv = vectorCache.get(query) ?? [];
    return {
      model: EMBED_MODEL,
      live: true,
      cached: true,
      budget: budgetOf(readLedger()),
      hits: clipped
        .map((b) => ({ id: b.id, text: b.text, score: cosine(qv, vectorCache.get(b.text) ?? []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    };
  }
  return serialized(async () => {
    const ledger = readLedger();
    const liveKey = activeKey(ledger);
    if (!liveKey || spentFor(ledger, liveKey) + estimate > DAILY_BUDGET_USD) {
      return { ...empty, budget: budgetOf(ledger) };
    }
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${liveKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, encoding_format: "float", input: missing }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Venice memory ${res.status}: ${detail.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      data?: { embedding: number[]; index: number }[];
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const vectors = (json.data ?? []).slice().sort((a, b) => a.index - b.index);
    missing.forEach((text, i) => {
      const embedding = vectors[i]?.embedding;
      if (embedding) vectorCache.set(text, embedding);
    });
    const spent = json.usage?.total_tokens
      ? json.usage.total_tokens * EMBED_USD
      : missing.reduce((sum, t) => sum + tokens(t), 0) * EMBED_USD;
    const qv = vectorCache.get(query) ?? [];
    return {
      model: EMBED_MODEL,
      live: true,
      cached: false,
      budget: charge(spent),
      hits: clipped
        .map((b) => ({ id: b.id, text: b.text, score: cosine(qv, vectorCache.get(b.text) ?? []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    };
  });
}

function localDevelopments(era: string, watchers: number): Development[] {
  const rich = watchers >= 3;
  const table: Record<string, Development[]> = {
    camp: [
      { name: "Fire Ring Camp", kind: "hut", emoji: "🔥", note: "Seats around the first fire, close enough to talk." },
      { name: "Kindling Shelter", kind: "hut", emoji: "🪵", note: "A second hut so the night watch can sleep in turns." },
    ],
    farm: [
      { name: "Orchard Barn", kind: "farmhouse", emoji: "🍎", note: "A barn for the first real harvest." },
      { name: "Bee Yard Farm", kind: "farmhouse", emoji: "🐝", note: "Hives at the edge of the tilled ground." },
    ],
    roads: [
      { name: "Signal House", kind: "house", emoji: "🚦", note: "A house at the crossing that watches the carts." },
      { name: "Cartwright House", kind: "house", emoji: "🛞", note: "Where the wheels are mended." },
    ],
    town: [
      { name: "Market Block", kind: "block", emoji: "🏪", note: "A block of shops under one roof." },
      { name: "Lantern Court", kind: rich ? "block" : "house", emoji: "🏮", note: "Courts lit after the roads go quiet." },
    ],
    city: [
      { name: "Archive Tower", kind: "tower", emoji: "📚", note: "A tower that keeps the city's notes." },
      { name: "Harbor Tower", kind: "tower", emoji: "⚓", note: "A tower aimed at the road that leaves town." },
    ],
    skyline: [
      { name: "Observatory Spire", kind: "skyscraper", emoji: "🔭", note: "A spire tall enough to see the planets they have been watching." },
      { name: "Crown Spire", kind: "skyscraper", emoji: "🏙️", note: "The next spire, raised because more people are looking." },
    ],
  };
  return table[era] ?? table.camp!;
}

export async function developCity(input: { era: string; watchers: number; have: string[] }): Promise<{
  developments: Development[];
  model: string;
  live: boolean;
  cached: boolean;
  budget: Budget;
}> {
  const era = input.era || "camp";
  const watchers = Math.max(1, Math.min(12, input.watchers || 1));
  const have = input.have.slice(0, 8).join(",");
  const cacheKey = `${era}|${watchers}|${have}`;
  const cached = developCache.get(cacheKey);
  if (cached) {
    return { developments: cached, model: WORLD_MODEL, live: true, cached: true, budget: budgetOf(readLedger()) };
  }
  const fallback = () => ({
    developments: localDevelopments(era, watchers),
    model: WORLD_MODEL,
    live: false,
    cached: false,
    budget: budgetOf(readLedger()),
  });
  if (!veniceKey()) {
    noteInference(false, "no key on this host");
    return fallback();
  }
  const user = `Era ${era}. ${watchers} people are watching right now. Buildings already standing: ${have || "none"}. Propose two new ones. The more watchers, the more sophisticated the next building should be.`;
  const estimate = tokens(DEVELOP_SYSTEM + user) * VOICE_INPUT_USD + 140 * VOICE_OUTPUT_USD;
  return serialized(async () => {
    const ledger = readLedger();
    const liveKey = activeKey(ledger);
    if (!liveKey || spentFor(ledger, liveKey) + estimate > DAILY_BUDGET_USD - MEMORY_RESERVE_USD) {
      noteInference(false, "voice budget held");
      return fallback();
    }
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${liveKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: WORLD_MODEL,
        temperature: 0.4,
        max_tokens: 140,
        reasoning_effort: "none",
        venice_parameters: { include_venice_system_prompt: false },
        messages: [
          { role: "system", content: DEVELOP_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      noteInference(false, `voice ${res.status}`);
      return fallback();
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const text = json.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseDevelopments(text);
    const developments = parsed.length ? parsed : localDevelopments(era, watchers);
    const prompt = json.usage?.prompt_tokens ?? tokens(DEVELOP_SYSTEM + user);
    const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const completion = json.usage?.completion_tokens ?? tokens(text);
    const spent =
      Math.max(0, prompt - cachedTokens) * VOICE_INPUT_USD + cachedTokens * VOICE_CACHE_USD + completion * VOICE_OUTPUT_USD;
    if (parsed.length) developCache.set(cacheKey, developments);
    noteInference(parsed.length > 0, parsed.length > 0 ? WORLD_MODEL : "plan unreadable");
    return { developments, model: WORLD_MODEL, live: parsed.length > 0, cached: false, budget: charge(spent) };
  });
}

function parseDevelopments(text: string): Development[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as { developments?: unknown };
    if (!Array.isArray(json.developments)) return [];
    return json.developments.slice(0, 2).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { name?: unknown; kind?: unknown; emoji?: unknown; note?: unknown };
      const kind = String(row.kind || "");
      if (!KINDS.includes(kind as DevKind)) return [];
      const name = String(row.name || "").replace(/\s+/g, " ").trim().slice(0, 32);
      const note = String(row.note || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const emoji = Array.from(String(row.emoji || "🏗️")).slice(0, 2).join("") || "🏗️";
      if (!name || !note) return [];
      return [{ name, kind: kind as DevKind, emoji, note }];
    });
  } catch {
    return [];
  }
}
