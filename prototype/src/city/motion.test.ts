import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorBands, mayMove, motionOf, roomFor, storyCount } from "./motion.ts";

describe("motion language", () => {
  it("lets people, animals, and vehicles move alone", () => {
    for (const emoji of ["🚶", "🐕", "🐄", "🚌", "🚚"]) assert.equal(mayMove(emoji, "self"), true);
  });

  it("keeps objects still unless a person carries them or a vehicle drags them", () => {
    assert.equal(motionOf("🧳"), "carried");
    assert.equal(mayMove("🧳", "self"), false);
    assert.equal(mayMove("🧳", "person"), true);
    assert.equal(mayMove("🍞", "self"), false);
    assert.equal(mayMove("📦", "self"), false);
    assert.equal(mayMove("📦", "vehicle"), true);
    assert.equal(mayMove("🪑", "self"), false);
    assert.equal(mayMove("🪑", "person"), false);
    assert.equal(mayMove("🪑", "vehicle"), false);
  });

  it("gives each floor its own still room and a spacer between floors", () => {
    const bands = floorBands(3, 0.2);
    assert.equal(bands.length, 3);
    assert.ok(bands[0]!.t0 >= 0.2);
    for (let i = 1; i < bands.length; i++) {
      assert.ok(bands[i]!.t0 - bands[i - 1]!.t1 > 0.03, "floors must keep a spacer");
    }
    assert.ok(bands[2]!.t1 <= 0.92);
    assert.equal(storyCount("house", 1), 2);
    assert.equal(storyCount("hut", 1), 1);
    const room = roomFor("home", 0);
    assert.equal(motionOf(room.actor), "self");
    assert.equal(room.carried && mayMove(room.carried, "person"), true);
    for (const item of room.still) assert.equal(mayMove(item.emoji, "self"), false);
  });
});
