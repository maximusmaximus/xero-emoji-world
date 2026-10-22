import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cityAt, makeMilestone, milestoneReason, recordMilestone, stopIndex, stopsFor, thinMilestones } from "./history.ts";
import { createCity, stepCity, type City } from "./sim.ts";
import { replayMilestones } from "./replay.ts";

function city(patch: Partial<City> = {}): City {
  return {
    version: 2,
    seed: "test",
    tick: 0,
    era: "camp",
    research: 0,
    cols: 8,
    rows: 8,
    roads: [],
    farms: [],
    trees: [],
    crews: [],
    buildings: [],
    beats: [],
    ...patch,
  } as City;
}

describe("time travel", () => {
  it("keeps a founding snapshot and later milestones, and ignores a quiet tick", () => {
    let history = recordMilestone([], city());
    assert.equal(history.length, 1);
    assert.equal(history[0]?.title, "Founding");
    history = recordMilestone(history, city({ tick: 4, buildings: history[0]!.city.buildings }));
    assert.equal(history.length, 1);
    history = recordMilestone(history, city({ tick: 20, era: "farm", buildings: [{ kind: "farmhouse" }] as City["buildings"] }));
    assert.equal(history.map((item) => item.title).join(","), "Founding,Became farm");
    assert.equal(milestoneReason(history[1]!.city, city({ tick: 21, era: "farm" })), null);
  });

  it("rewinds to the snapshot at or before the scrubbed tick", () => {
    const early = makeMilestone(city({ tick: 0, era: "camp" }), "Founding");
    const later = makeMilestone(city({ tick: 80, era: "roads", cols: 12 }), "Became roads");
    assert.equal(cityAt([early, later], 10)?.era, "camp");
    assert.equal(cityAt([early, later], 80)?.era, "roads");
    assert.equal(cityAt([early, later], 200)?.cols, 12);
    assert.equal(cityAt([], 5), null);
  });

  it("thins the log but never drops the founding or an era change", () => {
    const marks = Array.from({ length: 40 }, (_, index) =>
      makeMilestone(city({ tick: index * 10, era: index === 15 ? "town" : "camp" }), index === 0 ? "Founding" : index === 15 ? "Became town" : `Tick ${index * 10}`),
    );
    const thin = thinMilestones(marks, 8);
    assert.ok(thin.length <= 8);
    assert.ok(thin.some((item) => item.title === "Founding"));
    assert.ok(thin.some((item) => item.title === "Became town"));
    assert.equal(thin[0]?.tick, 0);
    assert.equal(thin[thin.length - 1]?.tick, 390);
  });

  it("maps the slider onto snapshots so the left end is not the present", () => {
    const early = makeMilestone(city({ tick: 0, era: "camp" }), "Founding");
    const later = makeMilestone(city({ tick: 80, era: "roads", cols: 14, rows: 10 }), "Became roads");
    const stops = stopsFor([later, early], 240);
    assert.deepEqual(stops.map((stop) => stop.title), ["Founding", "Became roads", "Now"]);
    assert.equal(stopIndex(stops, null), 2);
    assert.equal(stopIndex(stops, 10), 0);
    assert.equal(cityAt([early, later], stops[0]!.tick ?? 0)?.era, "camp");
    assert.notEqual(cityAt([early, later], stops[0]!.tick ?? 0)?.tick, 240);
    assert.equal(stopIndex(stops, 80), 1);
  });

  it("replaying the seed gives the slider an earlier city than the present", () => {
    const marks = replayMilestones("slider-test", 240, 120);
    assert.equal(marks[0]?.title, "Founding");
    assert.equal(marks[0]?.city.tick, 0);
    const present = marks[marks.length - 1]!;
    assert.ok(present.tick > 0);
    const stops = stopsFor(marks, present.tick);
    const shown = cityAt(marks, stops[0]!.tick ?? 0);
    assert.equal(shown?.tick, 0);
    assert.notEqual(shown?.tick, present.tick);
    let walked = createCity("slider-test");
    for (let i = 0; i < 240; i += 1) walked = stepCity(walked);
    assert.ok(walked.buildings.length >= shown!.buildings.length);
  });
});
