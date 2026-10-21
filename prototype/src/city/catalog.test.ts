import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_COUNT, DISTINCT_BODIES, FRAME_CAST, SHOWCASE, frameCast, isBody } from "./catalog.ts";

describe("emoji showcase", () => {
  it("draws a short row of large bodies instead of loading the whole set at once", () => {
    for (const [width, height] of [
      [1280, 800],
      [390, 700],
    ] as const) {
      const spots = frameCast(width, height, 0);
      assert.ok(spots.length > 0 && spots.length <= FRAME_CAST);
      assert.ok(spots.length < SHOWCASE.length / 10);
      for (const spot of spots) {
        assert.equal(isBody(spot.emoji), true);
        assert.ok(spot.size >= 26);
        assert.ok(spot.x >= 0 && spot.x <= width);
        assert.ok(spot.y >= 0 && spot.y <= height);
      }
    }
    const later = frameCast(1280, 800, 120 * 5);
    assert.notEqual(later[0]?.emoji, frameCast(1280, 800, 0)[0]?.emoji);
  });

  it("uses whole bodies for the crowd, not busts", () => {
    assert.equal(CATALOG_COUNT, 3963);
    assert.ok(SHOWCASE.length >= Math.ceil(CATALOG_COUNT * 0.15));
    assert.ok(DISTINCT_BODIES.length >= 40);
    for (const emoji of DISTINCT_BODIES) assert.equal(isBody(emoji), true);
    for (const bust of ["👩", "👨", "👧", "👦", "👵", "👴", "👷", "🧑‍🍳"]) assert.equal(isBody(bust), false);
  });
});
