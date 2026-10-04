import { describe, expect, it } from "vitest";
import { normalizePurchaseHistory, previousConnectionTimestamps } from "../src/app";

describe("persisted connection history presentation", () => {
  it("excludes the active connection and keeps newest-first previous connections", () => {
    expect(previousConnectionTimestamps([100, 500, 400, 300, 200, 100], 500)).toEqual([400, 300, 200, 100]);
  });

  it("shows at most five unique successful timestamps", () => {
    expect(previousConnectionTimestamps([9, 8, 7, 6, 5, 4, 3], null)).toEqual([9, 8, 7, 6, 5]);
  });

  it("handles missing history and ignores generic diagnostic events", () => {
    expect(previousConnectionTimestamps(undefined, undefined)).toEqual([]);
    expect(previousConnectionTimestamps([{ type: "connected", at: 10 }, { type: "disconnected", at: 20 }], null)).toEqual([]);
  });
});

describe("purchase history presentation", () => {
  it("keeps newest-first entries, caps at ten, and excludes WateringCan", () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({ itemId: `Item${index}`, itemType: "Tool" as const, quantity: index + 1, lastPurchasedAt: index + 1 }));
    expect(normalizePurchaseHistory([{ itemId: "WateringCan", itemType: "Tool", quantity: 2, lastPurchasedAt: 99 }, ...entries])).toHaveLength(10);
  });

  it("preserves duplicate-looking same-item rounds without merging quantities", () => {
    const entries = normalizePurchaseHistory([
      { itemId: "RainWardShard", itemType: "Tool", shop: "rain", generation: "restock:r2", quantity: 1, lastPurchasedAt: 20 },
      { itemId: "RainWardShard", itemType: "Tool", shop: "rain", generation: "restock:r1", quantity: 3, lastPurchasedAt: 10 },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.map(({ quantity }) => quantity)).toEqual([1, 3]);
    expect(entries.map(({ generation }) => generation)).toEqual(["restock:r2", "restock:r1"]);
  });

  it("keeps legacy entries without round identity visible", () => {
    expect(normalizePurchaseHistory([
      { itemId: "RainWardShard", itemType: "Tool", quantity: 2, lastPurchasedAt: 10 },
    ])).toEqual([
      { itemId: "RainWardShard", itemType: "Tool", quantity: 2, lastPurchasedAt: 10 },
    ]);
  });

  it("handles missing or malformed history", () => {
    expect(normalizePurchaseHistory(undefined)).toEqual([]);
    expect(normalizePurchaseHistory([{ itemId: "Bad", itemType: "Invalid", quantity: 1, lastPurchasedAt: 1 }])).toEqual([]);
  });
});
