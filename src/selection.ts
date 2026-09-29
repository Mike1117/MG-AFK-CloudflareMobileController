import { humanizeItemId } from "./catalog";
import type { CatalogItem, ShopItemType, WishlistEntry } from "./types";

export const wishlistIdentity = (itemType: ShopItemType, itemId: string): string => `${itemType}|${itemId}`;
export const troughQuota = (count: number): number => count > 0 ? Math.floor(9 / count) : 0;

export function withUnknownPlants(catalog: CatalogItem[], selected: string[]): CatalogItem[] {
  const known = new Set(catalog.map((item) => item.itemId));
  return [...catalog, ...selected.filter((id) => !known.has(id)).map((itemId): CatalogItem => ({
    itemId, itemType: "Seed", name: humanizeItemId(itemId), sprite: null,
    rarity: "Unknown catalog item", eligibleShops: [], coinPrice: null,
  }))];
}

export function withUnknownWishlist(catalog: CatalogItem[], selected: WishlistEntry[]): CatalogItem[] {
  const known = new Set(catalog.map((item) => wishlistIdentity(item.itemType, item.itemId)));
  return [...catalog, ...selected.filter((item) => !known.has(wishlistIdentity(item.itemType, item.itemId))).map((item): CatalogItem => ({
    itemId: item.itemId, itemType: item.itemType, name: humanizeItemId(item.itemId), sprite: null,
    rarity: "Unknown catalog item", eligibleShops: [], coinPrice: null,
  }))];
}

export function toggleTrough(selected: string[], itemId: string): { values: string[]; limited: boolean } {
  if (selected.includes(itemId)) return { values: selected.filter((id) => id !== itemId), limited: false };
  if (selected.length >= 9) return { values: selected, limited: true };
  return { values: [...selected, itemId], limited: false };
}

export function matches(item: CatalogItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || item.name.toLocaleLowerCase().includes(needle) || item.itemId.toLocaleLowerCase().includes(needle) ||
    humanizeItemId(item.itemId).toLocaleLowerCase().includes(needle);
}

const rarity: Record<string, number> = { common: 1, uncommon: 2, rare: 3, legendary: 4, mythic: 5, mythical: 5, divine: 6, celestial: 7 };
export type SortMode = "price-desc" | "price-asc" | "rarity-desc" | "name-asc" | "name-desc";
export function sortCatalog(items: CatalogItem[], mode: SortMode): CatalogItem[] {
  const result = [...items];
  const name = (a: CatalogItem, b: CatalogItem) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return result.sort((a, b) => {
    if (mode === "name-asc") return name(a, b);
    if (mode === "name-desc") return -name(a, b);
    if (mode === "rarity-desc") return (rarity[b.rarity?.toLowerCase() ?? ""] ?? 0) - (rarity[a.rarity?.toLowerCase() ?? ""] ?? 0) ||
      (b.coinPrice ?? Number.NEGATIVE_INFINITY) - (a.coinPrice ?? Number.NEGATIVE_INFINITY) || name(a, b);
    const ap = a.coinPrice ?? (mode === "price-asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bp = b.coinPrice ?? (mode === "price-asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return (mode === "price-asc" ? ap - bp : bp - ap) || name(a, b);
  });
}

export function categoryCounts(selected: WishlistEntry[]): Record<ShopItemType, number> {
  const counts: Record<ShopItemType, number> = { Seed: 0, Tool: 0, Egg: 0, Decor: 0 };
  for (const item of selected) counts[item.itemType] += 1;
  return counts;
}
