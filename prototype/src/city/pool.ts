/** Daily inference pool. The host key and pasted keys each have their own dollar. */

export const DAILY_BUDGET_USD = 1;
export const LOCAL_TZ = "America/Los_Angeles";

export type KeySource = "local" | "contributed";

export type PoolKey = {
  key: string;
  source: KeySource;
  spentUsd: number;
  dead?: boolean;
};

export function dayKey(now = new Date(), timeZone = LOCAL_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The next local midnight, when the host dollar starts again. */
export function nextReset(now = new Date(), timeZone = LOCAL_TZ) {
  const today = dayKey(now, timeZone);
  let lo = now.getTime();
  let hi = lo + 36 * 60 * 60 * 1000;
  while (lo + 1000 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timeZone) === today) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export function countdown(now = new Date(), timeZone = LOCAL_TZ) {
  const resetsAt = nextReset(now, timeZone);
  const ms = Math.max(0, resetsAt.getTime() - now.getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const label = hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return { ms, resetsAt: resetsAt.toISOString(), label };
}

export function pickPool(keys: PoolKey[], cap = DAILY_BUDGET_USD) {
  const usable = (item: PoolKey) => !item.dead && item.spentUsd < cap;
  const local = keys.filter((item) => item.source === "local");
  const contributed = keys.filter((item) => item.source === "contributed");
  const localCapped = local.length > 0 && local.every((item) => !usable(item));
  const chosen = keys.find(usable) ?? null;
  return {
    chosen,
    localCapped,
    contributedReady: contributed.some(usable),
    source: chosen?.source ?? ("none" as const),
  };
}

export function infraMessage(input: { localCapped: boolean; contributedReady: boolean; label: string; live: boolean }) {
  if (!input.localCapped) {
    return { countdown: "", prompt: false, badge: input.live ? "Venice live" : "Venice offline" };
  }
  const countdown = `Local inference returns in ${input.label}`;
  if (input.contributedReady && input.live) {
    return { countdown, prompt: false, badge: "Venice live · contributed" };
  }
  return { countdown, prompt: true, badge: "Venice paused" };
}
