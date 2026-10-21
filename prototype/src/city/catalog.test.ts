import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_COUNT, DISTINCT_BODIES, SHOWCASE, isBody, showcaseSpots } from "./catalog.ts";

describe("emoji showcase", () => {
  it("keeps at least the top 15% of the collection on screen", () => {
    assert.equal(CATALOG_COUNT, 3963);
    assert.ok(SHOWCASE.length >= Math.ceil(CATALOG_COUNT * 0.15));
    for (const [width, height] of [
      [1280, 800],
      [390, 700],
    ] as const) {
      const spots = showcaseSpots(width, height);
      assert.equal(spots.length, SHOWCASE.length);
      const seen = new Set(spots.map((spot) => spot.emoji));
      assert.equal(seen.size, SHOWCASE.length);
      for (const spot of spots) {
        assert.ok(spot.x >= 0 && spot.x <= width, `${spot.emoji} x ${spot.x}`);
        assert.ok(spot.y >= 0 && spot.y <= height, `${spot.emoji} y ${spot.y}`);
      }
    }
  });

  it("uses whole bodies for the crowd, not busts", () => {
    assert.ok(DISTINCT_BODIES.length >= 40);
    for (const emoji of DISTINCT_BODIES) assert.equal(isBody(emoji), true);
    for (const bust of ["👩", "👨", "👧", "👦", "👵", "👴", "👷", "🧑‍🍳"]) assert.equal(isBody(bust), false);
    const heroes = showcaseSpots(1280, 800).filter((spot) => spot.hero);
    assert.ok(heroes.every((spot) => spot.size >= 30));
  });
});
