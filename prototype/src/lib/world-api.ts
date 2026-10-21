import { createServerFn } from "@tanstack/react-start";

function clientKeys(input: { keys?: string } | undefined) {
  return String(input?.keys ?? "").slice(0, 4000);
}

export const veniceStatus = createServerFn({ method: "POST" })
  .validator((input: { keys?: string } | undefined) => ({ keys: clientKeys(input) }))
  .handler(async ({ data }) => {
    const { veniceStatus: status, noteClientKeys } = await import("./venice.server");
    noteClientKeys(data.keys);
    return status();
  });

export const narrateLife = createServerFn({ method: "POST" })
  .validator((input: { name: string; emoji: string; role: string; place: string; facts: string; era?: string; research?: number; tick?: number; keys?: string }) => ({
    name: String(input?.name ?? "").slice(0, 80),
    emoji: String(input?.emoji ?? "").slice(0, 16),
    role: String(input?.role ?? "resident").slice(0, 24),
    place: String(input?.place ?? "the city").slice(0, 80),
    facts: String(input?.facts ?? "").slice(0, 700),
    era: String(input?.era ?? "").slice(0, 24),
    research: Math.max(0, Math.min(1_000_000, Number(input?.research) || 0)),
    tick: Math.max(0, Math.min(1_000_000_000, Number(input?.tick) || 0)),
    keys: clientKeys(input),
  }))
  .handler(async ({ data }) => {
    const { narrate, noteClientKeys } = await import("./venice.server");
    noteClientKeys(data.keys);
    return narrate(data);
  });

export const pulseWatch = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 48) }))
  .handler(async ({ data }) => {
    const { pulseWatcher } = await import("./watchers.server");
    return pulseWatcher(data.id);
  });

export const developCity = createServerFn({ method: "POST" })
  .validator((input: { era: string; watchers: number; have: string[]; keys?: string }) => ({
    era: String(input?.era ?? "camp").slice(0, 24),
    watchers: Math.max(1, Math.min(12, Number(input?.watchers) || 1)),
    have: (Array.isArray(input?.have) ? input.have : []).slice(0, 12).map((kind) => String(kind).slice(0, 16)),
    keys: clientKeys(input),
  }))
  .handler(async ({ data }) => {
    const { developCity: develop, noteClientKeys } = await import("./venice.server");
    noteClientKeys(data.keys);
    return develop(data);
  });
  export const loadWorld = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async () => {
    const { loadPersistedCity } = await import("./world-store.server");
    return (await loadPersistedCity()) ?? { city: null, updatedAt: "" };
  });

export const saveWorld = createServerFn({ method: "POST" })
  .validator((input: { city: unknown; kind?: string; summary?: string; source?: string }) => ({
    city: input?.city,
    kind: String(input?.kind ?? "snapshot").slice(0, 24),
    summary: String(input?.summary ?? "").slice(0, 240),
    source: String(input?.source ?? "sim").slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const { persistCity } = await import("./world-store.server");
    const city = data.city as import("../city/sim").City;
    if (!city || !Array.isArray(city.buildings)) return { ok: false as const, at: "", repo: { committed: false, pushed: false, detail: "no city" } };
    return persistCity(city, data);
  });

export const addVeniceKeys = createServerFn({ method: "POST" })
  .validator((input: { keys: string }) => ({ keys: String(input?.keys ?? "").slice(0, 4000) }))
  .handler(async ({ data }) => {
    const { addVeniceKeys: add } = await import("./venice.server");
    return add(data.keys);
  });

export const searchLife = createServerFn({ method: "POST" })
  .validator((input: { query: string; beats: { id: string; text: string }[]; keys?: string }) => ({
    query: String(input?.query ?? "").slice(0, 160),
    beats: (Array.isArray(input?.beats) ? input.beats : []).slice(0, 16).map((b) => ({
      id: String(b?.id ?? "").slice(0, 40),
      text: String(b?.text ?? "").slice(0, 280),
    })),
    keys: clientKeys(input),
  }))
  .handler(async ({ data }) => {
    const { searchLife: search, noteClientKeys } = await import("./venice.server");
    noteClientKeys(data.keys);
    return search(data.query, data.beats);
  });
