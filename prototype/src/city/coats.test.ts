import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COATS, isCoat, pickCoat } from "./coats.ts";
import { createCity, queuePlans } from "./sim.ts";

describe("building coats", () => {
  it("only accepts the named gradients and otherwise rolls one", () => {
    assert.equal(pickCoat(() => 0, "sage"), "sage");
    assert.equal(isCoat("nope"), false);
    const rolled = pickCoat(() => 0.99);
    assert.ok(rolled in COATS);
    assert.notEqual(pickCoat(() => 0), pickCoat(() => 0.99));
  });

  it("keeps standing buildings unpainted and hands the coat to the next plan", () => {
    const city = queuePlans(createCity("coat-plan"), [
      { name: "Signal House", kind: "house", emoji: "🚦", note: "A lobby, floors, and a crown.", coat: "slate", floors: 4 },
    ]);
    assert.equal(city.buildings[0]?.coat, undefined);
    assert.equal(city.plans?.[0]?.coat, "slate");
    assert.equal(city.plans?.[0]?.floors, 4);
    assert.equal(city.plans?.[0]?.emoji, "🚦");
  });
});
