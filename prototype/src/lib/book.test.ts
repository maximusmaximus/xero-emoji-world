import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money, shopGaps } from "./book.ts";

describe("book shop", () => {
  it("asks for a price and a Stripe key before checkout", () => {
    const shop = shopGaps({});
    assert.equal(shop.ready, false);
    assert.deepEqual(shop.missing, ["BOOK_PRICE_CENTS", "STRIPE_SECRET_KEY"]);
  });

  it("refuses a live Stripe key until live mode is allowed", () => {
    const shop = shopGaps({ STRIPE_SECRET_KEY: "sk_live_example", BOOK_PRICE_CENTS: "12800" });
    assert.equal(shop.ready, false);
    assert.ok(shop.missing.includes("ALLOW_LIVE_STRIPE"));
  });

  it("opens checkout when a test key and a price are set", () => {
    const shop = shopGaps({ STRIPE_SECRET_KEY: "sk_test_example", BOOK_PRICE_CENTS: "12800" });
    assert.equal(shop.ready, true);
    assert.equal(money(shop.priceCents), "$128.00");
  });
});
