import { createServerFn } from "@tanstack/react-start";

export const veniceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { veniceStatus: status } = await import("./venice.server");
  return status();
});

export const narrateLife = createServerFn({ method: "POST" })
  .validator((input: { name: string; emoji: string; role: string; place: string; facts: string; era?: string; research?: number; tick?: number }) => ({
    name: String(input?.name ?? "").slice(0, 80),
    emoji: String(input?.emoji ?? "").slice(0, 16),
    role: String(input?.role ?? "resident").slice(0, 24),
    place: String(input?.place ?? "the city").slice(0, 80),
    facts: String(input?.facts ?? "").slice(0, 700),
    era: String(input?.era ?? "").slice(0, 24),
    research: Math.max(0, Math.min(1_000_000, Number(input?.research) || 0)),
    tick: Math.max(0, Math.min(1_000_000_000, Number(input?.tick) || 0)),
  }))
  .handler(async ({ data }) => {
    const { narrate } = await import("./venice.server");
    return narrate(data);
  });

export const pulseWatch = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 48) }))
  .handler(async ({ data }) => {
    const { pulseWatcher } = await import("./watchers.server");
    return pulseWatcher(data.id);
  });

export const developCity = createServerFn({ method: "POST" })
  .validator((input: { era: string; watchers: number; have: string[] }) => ({
    era: String(input?.era ?? "camp").slice(0, 24),
    watchers: Math.max(1, Math.min(12, Number(input?.watchers) || 1)),
    have: (Array.isArray(input?.have) ? input.have : []).slice(0, 12).map((kind) => String(kind).slice(0, 16)),
  }))
  .handler(async ({ data }) => {
    const { developCity: develop } = await import("./venice.server");
    return develop(data);
  });
  export const addVeniceKeys = createServerFn({ method: "POST" })
  .validator((input: { keys: string }) => ({ keys: String(input?.keys ?? "").slice(0, 4000) }))
  .handler(async ({ data }) => {
    const { addVeniceKeys: add } = await import("./venice.server");
    return add(data.keys);
  });

export const searchLife = createServerFn({ method: "POST" })
  .validator((input: { query: string; beats: { id: string; text: string }[] }) => ({
    query: String(input?.query ?? "").slice(0, 160),
    beats: (Array.isArray(input?.beats) ? input.beats : []).slice(0, 16).map((b) => ({
      id: String(b?.id ?? "").slice(0, 40),
      text: String(b?.text ?? "").slice(0, 280),
    })),
  }))
  .handler(async ({ data }) => {
    const { searchLife: search } = await import("./venice.server");
    return search(data.query, data.beats);
  });
