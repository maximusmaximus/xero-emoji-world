import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countdown, dayKey, infraMessage, nextReset, pickPool } from "./pool.ts";

describe("inference pool", () => {
  it("resets at the next Pacific midnight and counts down under a day", () => {
    const now = new Date("2026-10-21T20:00:00.000Z");
    const reset = nextReset(now);
    assert.equal(dayKey(now), dayKey(new Date(reset.getTime() - 1000)));
    assert.notEqual(dayKey(now), dayKey(reset));
    const left = countdown(now);
    assert.ok(left.ms > 0 && left.ms < 24 * 60 * 60 * 1000);
    assert.match(left.label, /\d+h \d+m/);
    assert.equal(left.resetsAt, reset.toISOString());
  });

  it("spends the host key first, then a contributed key", () => {
    const local = { key: "local-key", source: "local" as const, spentUsd: 0.2 };
    const gift = { key: "gift-key", source: "contributed" as const, spentUsd: 0 };
    assert.equal(pickPool([local, gift]).chosen?.key, "local-key");
    assert.equal(pickPool([local, gift]).localCapped, false);
    const capped = pickPool([{ ...local, spentUsd: 1 }, gift]);
    assert.equal(capped.chosen?.key, "gift-key");
    assert.equal(capped.source, "contributed");
    assert.equal(capped.localCapped, true);
    assert.equal(capped.contributedReady, true);
  });

  it("asks for a key and shows the countdown only after the host dollar is gone", () => {
    const open = infraMessage({ localCapped: false, contributedReady: false, label: "3h 1m", live: true });
    assert.equal(open.countdown, "");
    assert.equal(open.prompt, false);
    const paused = infraMessage({ localCapped: true, contributedReady: false, label: "3h 1m", live: false });
    assert.equal(paused.badge, "Venice paused");
    assert.equal(paused.prompt, true);
    assert.match(paused.countdown, /3h 1m/);
    const helped = infraMessage({ localCapped: true, contributedReady: true, label: "3h 1m", live: true });
    assert.equal(helped.badge, "Venice live · contributed");
    assert.equal(helped.prompt, false);
  });
});
