import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOOK_PRICE_CENTS, BOOK_SKU, bookFrame, clampCart, money, remainingToday, shopGaps } from "./book.ts";

describe("book shop", () => {
  it("prices the hardcover at 185.69", () => {
    const shop = shopGaps({});
    assert.equal(shop.priceCents, BOOK_PRICE_CENTS);
    assert.equal(money(shop.priceCents), "$185.69");
    assert.equal(BOOK_SKU, "BKPH_HCIW_STD_11.750x11.750IN_80C_GL_40_100T_GLS_44");
  });

  it("still needs a Stripe key before a card can be taken", () => {
    assert.deepEqual(shopGaps({}).missing, ["STRIPE_SECRET_KEY"]);
    assert.equal(shopGaps({ STRIPE_SECRET_KEY: "sk_test_example" }).ready, true);
    assert.equal(shopGaps({ STRIPE_SECRET_KEY: "rk_test_example" }).ready, true);
    assert.deepEqual(shopGaps({ STRIPE_SECRET_KEY: "rk_live_example" }).missing, ["ALLOW_LIVE_STRIPE"]);
    assert.equal(shopGaps({ STRIPE_SECRET_KEY: "rk_live_example", ALLOW_LIVE_STRIPE: "true" }).ready, true);
  });

  it("caps the cart at whatever is left of the 50-a-day run", () => {
    assert.equal(clampCart(4, 50), 4);
    assert.equal(clampCart(80, 50), 50);
    assert.equal(clampCart(3, 2), 2);
    assert.equal(clampCart(1, 0), 0);
    const holds = [
      { id: "a", qty: 30, at: 0, paid: true },
      { id: "b", qty: 15, at: 0, paid: true },
    ];
    assert.equal(remainingToday(holds, 1_000, "2026-10-22", "2026-10-22"), 5);
    assert.equal(remainingToday(holds, 1_000, "2026-10-23", "2026-10-22"), 50);
  });

  it("names a frame for phone, tablet, and desk", () => {
    assert.equal(bookFrame(390), "phone");
    assert.equal(bookFrame(768), "tablet");
    assert.equal(bookFrame(1280), "desk");
  });
});
