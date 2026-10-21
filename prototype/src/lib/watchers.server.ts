const TTL_MS = 12_000;
const seen = new Map<string, number>();

export function pulseWatcher(id: string) {
  const now = Date.now();
  const key = id.trim().slice(0, 48);
  if (key) seen.set(key, now);
  for (const [name, at] of seen) {
    if (now - at > TTL_MS) seen.delete(name);
  }
  return { watchers: Math.max(1, seen.size) };
}
