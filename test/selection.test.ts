import { categoryCounts, matches, sortCatalog, toggleTrough, troughQuota, withUnknownPlants, withUnknownWishlist, wishlistIdentity } from "../src/selection";
import type { CatalogItem, WishlistEntry } from "../src/types";

const item = (itemId: string, itemType: CatalogItem["itemType"] = "Seed", coinPrice: number | null = null, rarity: string | null = null): CatalogItem =>
  ({ itemId, itemType, name: itemId.replace(/([A-Z])/g, " $1").trim(), sprite: null, rarity, eligibleShops: [], coinPrice });

describe("selection logic", () => {
  it("preserves unknown Protected, Auto Buy, and Auto Trough IDs", () => {
    expect(withUnknownPlants([item("Carrot")], ["Carrot", "LostCrop"]).map((x) => x.itemId)).toEqual(["Carrot", "LostCrop"]);
    const selected: WishlistEntry[] = [{ itemId: "Mystery", itemType: "Tool" }];
    expect(withUnknownWishlist([item("Carrot")], selected).at(-1)).toMatchObject({ itemId: "Mystery", itemType: "Tool" });
  });

  it("uses type plus ID identity and category counts", () => {
    expect(wishlistIdentity("Tool", "Shared")).not.toBe(wishlistIdentity("Seed", "Shared"));
    expect(categoryCounts([{ itemId: "A", itemType: "Seed" }, { itemId: "B", itemType: "Seed" }, { itemId: "C", itemType: "Egg" }]))
      .toEqual({ Seed: 2, Tool: 0, Egg: 1, Decor: 0 });
  });

  it("enforces the 9-item Trough maximum while allowing deselection", () => {
    const nine = Array.from({ length: 9 }, (_, index) => `Crop${index}`);
    expect(toggleTrough(nine, "Tenth")).toEqual({ values: nine, limited: true });
    expect(toggleTrough(nine, "Crop0")).toEqual({ values: nine.slice(1), limited: false });
  });

  it.each([[0, 0], [1, 9], [2, 4], [3, 3], [4, 2], [9, 1]])("floors the Trough quota for %i selections", (count, expected) => {
    expect(troughQuota(count)).toBe(expected);
  });

  it("searches IDs/names and supports every sort mode", () => {
    const values = [item("Zebra", "Seed", 5, "Common"), item("Apple", "Seed", 20, "Rare")];
    expect(values.filter((value) => matches(value, "app"))).toHaveLength(1);
    expect(sortCatalog(values, "price-desc")[0]?.itemId).toBe("Apple");
    expect(sortCatalog(values, "price-asc")[0]?.itemId).toBe("Zebra");
    expect(sortCatalog(values, "rarity-desc")[0]?.itemId).toBe("Apple");
    expect(sortCatalog(values, "name-asc")[0]?.itemId).toBe("Apple");
    expect(sortCatalog(values, "name-desc")[0]?.itemId).toBe("Zebra");
  });
});
