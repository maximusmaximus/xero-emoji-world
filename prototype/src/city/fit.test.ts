import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doorOpening, fitted } from "./fit.ts";

describe("zoom fit", () => {
  it("keeps a tall wall from turning the door into a shaft", () => {
    const door = doorOpening(180, 900);
    assert.ok(door.t <= 0.2);
    assert.ok(door.t * 900 <= 1.7 * (door.u1 - door.u0) * 180 + 1);
  });

  it("grows emoji with the surface instead of freezing them", () => {
    assert.equal(fitted(40, 0.8), 32);
    assert.equal(fitted(400, 0.8), 320);
  });
});
