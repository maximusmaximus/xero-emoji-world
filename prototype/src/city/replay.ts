import { makeMilestone, mergeMilestones, type Milestone } from "./history.ts";
import { createCity, stepCity, type City } from "./sim.ts";

/** Walk the seed forward and keep the cities a slider can actually show. */
export function replayMilestones(seed: string, until: number, every = 120): Milestone[] {
  let city = createCity(seed);
  const out: Milestone[] = [makeMilestone(city, "Founding")];
  const steps = Math.max(0, Math.min(4000, Math.floor(until)));
  for (let i = 0; i < steps; i += 1) {
    const era = city.era;
    city = stepCity(city);
    if (city.era !== era) out.push(makeMilestone(city, `Became ${city.era}`));
    else if (city.tick > 0 && city.tick % every === 0) out.push(makeMilestone(city, `Tick ${city.tick}`));
  }
  return mergeMilestones([out]);
}

export function needsReplay(history: Milestone[], live: City): boolean {
  const earliest = history[0]?.tick;
  return earliest == null || earliest > 40 || history.length < 2 && live.tick > 80;
}
