import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { laneMismatch, projectPoint, type Shot } from "./signs.ts";

const shots: Shot[] = [
  { yaw: 0, pitch: 0.76, focusC: 7, focusR: 6 },
  { yaw: 0.9, pitch: 0.35, focusC: 4, focusR: 11 },
  { yaw: -1.2, pitch: 1.05, focusC: 12, focusR: 3 },
];

describe("lane signs", () => {
  it("points along the lane at the sign, including far from the camera origin", () => {
    for (const shot of shots) {
      for (const alongCol of [true, false]) {
        for (const [col, row] of [
          [0, 0],
          [8, 2],
          [-4, 15],
          [20, -3],
        ] as const) {
          const miss = laneMismatch(shot, col, row, alongCol);
          assert.ok(miss < 0.02, `sign drifted ${miss.toFixed(3)} rad at ${col},${row} alongCol=${alongCol}`);
        }
      }
    }
  });

  it("does not use the origin heading, which perspective pulls off the local lane", () => {
    const shot = shots[2]!;
    const col = 18;
    const row = -6;
    const origin = projectPoint(0, 0, 0, shot);
    const east = projectPoint(1, 0, 0, shot);
    const here = projectPoint(col, row, 0, shot);
    const next = projectPoint(col + 1, row, 0, shot);
    const originAng = Math.atan2(east.y - origin.y, east.x - origin.x);
    const localAng = Math.atan2(next.y - here.y, next.x - here.x);
    assert.ok(Math.abs(originAng - localAng) > 0.05, "fixture no longer shows the perspective error");
    assert.ok(laneMismatch(shot, col, row, true) < 0.02);
  });
});
