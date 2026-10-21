import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { countdown, pickPool, type KeySource } from "../city/pool.ts";

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
  "You assess an emoji city and say what each category should do next. Reply with JSON only, no markdown: {\"focus\":\"hut|farmhouse|house|store|gas|school|hospital|block|tower|skyscraper\",\"notes\":{\"store\":\"one short next step\"},\"developments\":[{\"name\":\"Two Words\",\"kind\":\"same kinds as focus\",\"emoji\":\"one emoji\",\"note\":\"one sentence\"}]}. notes must include every category you were given. focus is the category that is furthest behind. developments build that category. Each call is more specific than the last.";

type Ledger = { day: string; spentUsd: number; byKey?: Record<string, number> };
type Budget = { spentUsd: number; capUsd: number; remainingUsd: number; day: string };

const storyCache = new Map<string, string>();
const vectorCache = new Map<string, number[]>();
const developCache = new Map<string, { developments: Development[]; focus: CityFocus }>();
let queue: Promise<unknown> = Promise.resolve();

const KINDS = ["hut", "farmhouse", "house", "store", "gas", "school", "hospital", "block", "tower", "skyscraper"] as const;
type DevKind = (typeof KINDS)[number];
export type Development = { name: string; kind: DevKind; emoji: string; note: string };
export type CityFocus = { kind: DevKind; note: string; notes: Partial<Record<DevKind, string>> };

const CATEGORY_NEXT: Record<DevKind, string> = {
  hut: "Keep a fire and a bed by the door.",
  farmhouse: "Move the harvest from the field to the kitchen.",
  house: "Put a light in the front room and a chair on the walk.",
  store: "Open the awning and start a line on the sidewalk.",
  gas: "Pull a car off the road and up to the pump.",
  school: "Line the children up and take them in from the yard.",
  hospital: "Keep the ground floor lit and walk patients in from the curb.",
  block: "Fill the ground floor with shops and the rooms above with beds.",
  tower: "Light more offices and bring workers in off the street.",
  skyscraper: "Stack another working floor and keep the lobby moving.",
};

function budgetFile() {
  return process.env.VENICE_BUDGET_PATH || "/workspace/.secrets/budget.json";
}

function budgetPaths() {
  return [...new Set([budgetFile(), "/tmp/xero-venice-budget.json"])];
}

let memoryLedger: Ledger | null = null;
const memoryKeys: string[] = [];
const deadKeys = new Set<string>();

function readLedger(): Ledger {
  const day = dayKey();
  if (memoryLedger?.day === day) return memoryLedger;
  for (const path of budgetPaths()) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
      if (parsed.day === day && Number.isFinite(parsed.spentUsd)) {
        memoryLedger = { day, spentUsd: parsed.spentUsd, byKey: parsed.byKey };
        return memoryLedger;
      }
    } catch {
      /* next store */
    }
  }
  memoryLedger = { day, spentUsd: 0 };
  return memoryLedger;
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

function writeLedger(ledger: Ledger) {
  memoryLedger = ledger;
  for (const path of budgetPaths()) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(ledger));
      return;
    } catch {
      /* read-only prod disk, keep the in-memory ledger */
    }
  }
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

function retireKey(status: number, key: string) {
  if (status === 401 || status === 403 || status === 402) deadKeys.add(keyId(key));
}

function keyId(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function pushKeys(out: string[], raw: string) {
  for (const part of raw.split(/[\s,]+/)) {
    const trimmed = part.trim().replace(/^["']|["']$/g, "");
    if (trimmed.length >= 20 && trimmed.length <= 200 && !out.includes(trimmed)) out.push(trimmed);
  }
}

function readDotEnv() {
  const isolated = process.env.VENICE_ISOLATED === "1";
  const files = (isolated ? [process.env.VENICE_ENV_PATH] : [process.env.VENICE_ENV_PATH, "/workspace/.env", ".env"]).filter(Boolean) as string[];
  const found: string[] = [];
  for (const file of files) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^(?:VENICE_API_KEY|VENICE_INFERENCE_KEY)\s*=\s*(.*)$/);
        if (match?.[1]) found.push(match[1].trim());
      }
    } catch {
      /* no env file on this host */
    }
  }
  return found.join("\n");
}

function keyPaths() {
  if (process.env.VENICE_ISOLATED === "1") {
    return [process.env.VENICE_KEY_PATH].filter(Boolean) as string[];
  }
  return [...new Set([process.env.VENICE_KEY_PATH, KEY_PATH, "/tmp/xero-venice.keys"].filter(Boolean) as string[])];
}

function localKeySet() {
  const out: string[] = [];
  pushKeys(out, process.env.VENICE_API_KEY || "");
  pushKeys(out, process.env.VENICE_INFERENCE_KEY || "");
  pushKeys(out, readDotEnv());
  return new Set(out);
}

function sourceOf(key: string): KeySource {
  return localKeySet().has(key) ? "local" : "contributed";
}

function poolFor(ledger: Ledger) {
  return readVeniceKeys().map((key) => ({
    key,
    source: sourceOf(key),
    spentUsd: spentFor(ledger, key),
    dead: deadKeys.has(keyId(key)),
  }));
}

export function noteClientKeys(raw: string) {
  pushKeys(memoryKeys, raw);
}

export function readVeniceKeys(): string[] {
  const out: string[] = [];
  pushKeys(out, process.env.VENICE_API_KEY || "");
  pushKeys(out, process.env.VENICE_INFERENCE_KEY || "");
  pushKeys(out, readDotEnv());
  for (const path of keyPaths()) {
    try {
      pushKeys(out, readFileSync(path, "utf8"));
    } catch {
      /* missing store */
    }
  }
  for (const key of memoryKeys) pushKeys(out, key);
  return out;
}

function spentFor(ledger: Ledger, key: string) {
  return ledger.byKey?.[keyId(key)] ?? (ledger.byKey ? 0 : ledger.spentUsd);
}

function activeKey(ledger: Ledger): string {
  return pickPool(poolFor(ledger)).chosen?.key || "";
}

export function testingSpend(key: string, usd: number) {
  const ledger = readLedger();
  const byKey = { ...(ledger.byKey ?? {}) };
  byKey[keyId(key)] = usd;
  const spentUsd = Object.values(byKey).reduce((sum, n) => sum + n, 0);
  writeLedger({ day: ledger.day, spentUsd, byKey });
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

async function veniceFetch(url: string, key: string, body?: unknown) {
  return fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}

export async function veniceProbe(force = false): Promise<{ ok: boolean; detail: string }> {
  const key = veniceKey();
  if (!key) return { ok: false, detail: "no key on this host" };
  if (!force && probeCache.ok && Date.now() - probeCache.at < 5 * 60_000) {
    return { ok: true, detail: probeCache.detail };
  }
  try {
    const res = await veniceFetch(MODELS_URL, key);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 402) deadKeys.add(keyId(key));
      const spare = activeKey(readLedger());
      if (spare && spare !== key) return veniceProbe(true);
      const detail = res.status === 401 || res.status === 403 ? "key expired" : `key rejected ${res.status}`;
      probeCache = { at: Date.now(), ok: false, detail };
      noteInference(false, detail);
      return { ok: false, detail };
    }
    probeCache = { at: Date.now(), ok: true, detail: WORLD_MODEL };
    noteInference(true, WORLD_MODEL);
    return { ok: true, detail: WORLD_MODEL };
  } catch (err) {
    const detail = err instanceof Error ? err.message.replace(/^.*Error: /, "").slice(0, 60) : "network";
    probeCache = { at: Date.now(), ok: false, detail };
    noteInference(false, detail);
    return { ok: false, detail };
  }
}

export function veniceKey(): string {
  return activeKey(readLedger());
}

export function addVeniceKeys(raw: string): { added: number; keyCount: number; persisted: boolean } {
  const existing = readVeniceKeys();
  const incoming: string[] = [];
  pushKeys(incoming, raw);
  const next = [...existing];
  let added = 0;
  for (const key of incoming) {
    if (next.includes(key)) continue;
    next.push(key);
    added += 1;
    deadKeys.delete(keyId(key));
  }
  noteClientKeys(next.join("\n"));
  let persisted = false;
  for (const path of keyPaths()) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${next.join("\n")}\n`, { mode: 0o600 });
      persisted = true;
      break;
    } catch {
      /* production disk is often read-only */
    }
  }
  probeCache = { at: 0, ok: false, detail: "" };
  return { added, keyCount: readVeniceKeys().length, persisted };
}

export async function veniceStatus() {
  const ledger = readLedger();
  const pool = pickPool(poolFor(ledger));
  const key = pool.chosen?.key || "";
  const spent = key ? spentFor(ledger, key) : 0;
  const probe = await veniceProbe();
  const reset = countdown();
  const needsKey = !pool.chosen || probe.detail === "key expired";
  return {
    voice: WORLD_MODEL,
    embed: EMBED_MODEL,
    embedDim: EMBED_DIM,
    privacy: "private" as const,
    keyPresent: readVeniceKeys().length > 0,
    keyCount: readVeniceKeys().length,
    live: probe.ok,
    needsKey,
    detail: needsKey && probe.detail === "key expired" ? "key expired" : lastInference.ok ? lastInference.detail : probe.detail,
    budget: budgetOf({ ...ledger, spentUsd: spent }),
    infra: {
      localCapped: pool.localCapped,
      contributedReady: pool.contributedReady,
      source: pool.source,
      resetsAt: reset.resetsAt,
      countdown: pool.localCapped ? reset.label : "",
    },
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
  source: KeySource | "none";
}> {
  const cacheKey = `${input.name}|${input.place}|${input.facts}`;
  const hit = storyCache.get(cacheKey);
  if (hit) {
    return { text: hit, model: WORLD_MODEL, live: true, cached: true, budget: budgetOf(readLedger()), source: pickPool(poolFor(readLedger())).source };
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
      source: "none" as const,
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
        source: "none" as const,
      };
    }
    const res = await veniceFetch(CHAT_URL, liveKey, {
        model: WORLD_MODEL,
        temperature: 0.7,
        max_tokens: MAX_STORY_TOKENS,
        reasoning_effort: "none",
        venice_parameters: { include_venice_system_prompt: false },
        messages: [
          { role: "system", content: STORY_SYSTEM },
          { role: "user", content: user },
        ],
    });
    if (!res.ok) {
      retireKey(res.status, liveKey);
      noteInference(false, res.status === 401 || res.status === 403 ? "key expired" : `voice ${res.status}`);
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
    return { text, model: WORLD_MODEL, live: true, cached: false, budget: charge(spent), source: sourceOf(liveKey) };
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
    const res = await veniceFetch(EMBED_URL, liveKey, { model: EMBED_MODEL, encoding_format: "float", input: missing });
    if (!res.ok) {
      retireKey(res.status, liveKey);
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
      { name: "North Fuel", kind: "gas", emoji: "⛽", note: "A two-pump station where the road leaves the fields." },
    ],
    town: [
      { name: "Corner Market", kind: "store", emoji: "🏪", note: "A shop with a full glass front and an awning over the walk." },
      { name: "River School", kind: "school", emoji: "🏫", note: "Classrooms above a yard where the children already stand in the windows." },
    ],
    city: [
      { name: "Mercy Hospital", kind: "hospital", emoji: "🏥", note: "Wards stacked over an emergency door, lit all night." },
      { name: "Harbor Market", kind: "store", emoji: "🛒", note: "A market block that took the place of an empty lot." },
    ],
    skyline: [
      { name: "Observatory Spire", kind: "skyscraper", emoji: "🔭", note: "A spire tall enough to see the moon they have been watching." },
      { name: "Civic Hospital", kind: rich ? "hospital" : "school", emoji: "🏥", note: "The next civic building, larger because more people are looking." },
    ],
  };
  return table[era] ?? table.camp!;
}

function localFocus(have: string[]): CityFocus {
  const counts = new Map<DevKind, number>();
  for (const item of have) {
    const [raw, n] = item.split(":");
    const kind = KINDS.find((entry) => entry === raw);
    if (kind) counts.set(kind, Number(n) || 0);
  }
  const behind = [...KINDS].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0] ?? "store";
  const notes: Partial<Record<DevKind, string>> = {};
  for (const kind of KINDS) if (counts.has(kind) || kind === behind) notes[kind] = CATEGORY_NEXT[kind];
  return { kind: behind, note: CATEGORY_NEXT[behind], notes };
}

export async function developCity(input: { era: string; watchers: number; have: string[] }): Promise<{
  developments: Development[];
  focus: CityFocus;
  model: string;
  live: boolean;
  cached: boolean;
  budget: Budget;
  source: KeySource | "none";
}> {
  const era = input.era || "camp";
  const watchers = Math.max(1, Math.min(12, input.watchers || 1));
  const have = input.have.slice(0, 12);
  const cacheKey = `${era}|${watchers}|${have.join(",")}`;
  const cached = developCache.get(cacheKey);
  if (cached) {
    return { developments: cached.developments, focus: cached.focus, model: WORLD_MODEL, live: true, cached: true, budget: budgetOf(readLedger()), source: pickPool(poolFor(readLedger())).source };
  }
  const fallback = () => ({
    developments: localDevelopments(era, watchers),
    focus: localFocus(have),
    model: WORLD_MODEL,
    live: false,
    cached: false,
    budget: budgetOf(readLedger()),
    source: "none" as const,
  });
  if (!veniceKey()) {
    noteInference(false, "no key on this host");
    return fallback();
  }
  const census = have.length ? have.join(", ") : "none yet";
  const user = `Era ${era}. ${watchers} watching. Category counts: ${census}. For each category, say the next real-world thing it should progress in. Then propose two buildings for the category that is furthest behind.`;
  const estimate = tokens(DEVELOP_SYSTEM + user) * VOICE_INPUT_USD + 220 * VOICE_OUTPUT_USD;
  return serialized(async () => {
    const ledger = readLedger();
    const liveKey = activeKey(ledger);
    if (!liveKey || spentFor(ledger, liveKey) + estimate > DAILY_BUDGET_USD - MEMORY_RESERVE_USD) {
      noteInference(false, "voice budget held");
      return fallback();
    }
    const res = await veniceFetch(CHAT_URL, liveKey, {
        model: WORLD_MODEL,
        temperature: 0.4,
        max_tokens: 220,
        reasoning_effort: "none",
        venice_parameters: { include_venice_system_prompt: false },
        messages: [
          { role: "system", content: DEVELOP_SYSTEM },
          { role: "user", content: user },
        ],
    });
    if (!res.ok) {
      retireKey(res.status, liveKey);
      noteInference(false, res.status === 401 || res.status === 403 ? "key expired" : `voice ${res.status}`);
      return fallback();
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const text = json.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parsePlan(text);
    const developments = parsed.developments.length ? parsed.developments : localDevelopments(era, watchers);
    const focus = parsed.focus ?? localFocus(have);
    const prompt = json.usage?.prompt_tokens ?? tokens(DEVELOP_SYSTEM + user);
    const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const completion = json.usage?.completion_tokens ?? tokens(text);
    const spent =
      Math.max(0, prompt - cachedTokens) * VOICE_INPUT_USD + cachedTokens * VOICE_CACHE_USD + completion * VOICE_OUTPUT_USD;
    if (parsed.developments.length) developCache.set(cacheKey, { developments, focus });
    noteInference(parsed.developments.length > 0, parsed.developments.length > 0 ? WORLD_MODEL : "plan unreadable");
    return { developments, focus, model: WORLD_MODEL, live: parsed.developments.length > 0, cached: false, budget: charge(spent), source: sourceOf(liveKey) };
  });
}

function parsePlan(text: string): { developments: Development[]; focus?: CityFocus } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { developments: [] };
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as unknown;
    const row = json && typeof json === "object" ? (json as { developments?: unknown; focus?: unknown; notes?: unknown }) : {};
    const list = Array.isArray(json)
      ? json
      : Array.isArray(row.developments)
        ? row.developments
        : json && typeof json === "object" && "name" in (json as object)
          ? [json]
          : [];
    const developments = list.slice(0, 2).flatMap((item) => oneDevelopment(item));
    const notes: Partial<Record<DevKind, string>> = {};
    if (row.notes && typeof row.notes === "object") {
      for (const [key, value] of Object.entries(row.notes as Record<string, unknown>)) {
        const kind = asKind(key);
        const note = String(value || "").replace(/\s+/g, " ").trim().slice(0, 140);
        if (kind && note) notes[kind] = note;
      }
    }
    const focusKind = asKind(String(row.focus || "")) || developments[0]?.kind;
    const focus = focusKind
      ? { kind: focusKind, note: notes[focusKind] || developments[0]?.note || CATEGORY_NEXT[focusKind], notes }
      : undefined;
    return { developments, focus };
  } catch {
    return { developments: [] };
  }
}

function asKind(raw: string): DevKind | null {
  const value = raw.toLowerCase();
  if (KINDS.includes(value as DevKind)) return value as DevKind;
  if (value.includes("gas") || value.includes("fuel")) return "gas";
  if (value.includes("school") || value.includes("library")) return "school";
  if (value.includes("hospital") || value.includes("clinic")) return "hospital";
  if (value.includes("store") || value.includes("shop") || value.includes("market")) return "store";
  if (value.includes("sky") || value.includes("spire")) return "skyscraper";
  if (value.includes("tower")) return "tower";
  if (value.includes("farm") || value.includes("barn")) return "farmhouse";
  if (value.includes("block")) return "block";
  if (value.includes("house")) return "house";
  if (value.includes("hut") || value.includes("camp")) return "hut";
  return null;
}

function oneDevelopment(item: unknown): Development[] {
  if (!item || typeof item !== "object") return [];
  const row = item as { name?: unknown; kind?: unknown; emoji?: unknown; note?: unknown };
  const kind = asKind(String(row.kind || "")) ?? "house";
  const name = String(row.name || "").replace(/\s+/g, " ").trim().slice(0, 32);
  const note = String(row.note || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const emoji = Array.from(String(row.emoji || "🏗️")).slice(0, 2).join("") || "🏗️";
  if (!name) return [];
  return [{ name, kind, emoji, note: note || `${name} goes up while people are watching.` }];
}

function parseDevelopments(text: string): Development[] {
  return parsePlan(text).developments;
}
