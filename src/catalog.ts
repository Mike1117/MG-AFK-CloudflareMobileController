import type { CatalogItem, ShopItemType } from "./types";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const list = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.map((entry) => {
    if (typeof entry === "string") return entry.trim();
    if (typeof entry === "number" || typeof entry === "boolean") return String(entry).trim();
    return "";
  }).filter(Boolean))]
  : [];
const price = (value: unknown): number | null => {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const generic = new Set(["seed", "seeds", "plant", "plants", "crop", "crops", "tool", "tools", "egg", "eggs", "decor", "decors", "item", "items"]);

export function humanizeItemId(value: string): string {
  const spaced = value.trim().replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return spaced.replace(/\s+/g, " ").trim() || "Unknown item";
}

function name(itemId: string, ...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value && !generic.has(value.toLowerCase())) return value;
  }
  return humanizeItemId(itemId);
}

function addCategory(target: CatalogItem[], entries: unknown, itemType: ShopItemType, plants = false): void {
  for (const [rawId, rawValue] of Object.entries(record(entries) ?? {})) {
    const itemId = rawId.trim();
    if (!itemId) continue;
    const raw = record(rawValue) ?? {};
    const display = plants ? record(raw.seed) ?? {} : raw;
    const crop = record(raw.crop) ?? {};
    target.push({
      itemId,
      itemType,
      name: name(itemId, display.name, raw.name, crop.name),
      sprite: text(display.sprite),
      rarity: text(display.rarity),
      eligibleShops: list(display.eligibleShops),
      coinPrice: price(display.coinPrice),
    });
  }
}

export function normalizeCatalog(value: unknown): CatalogItem[] {
  const envelope = record(value) ?? {};
  // Keep the client tolerant of the catalog API's occasional response
  // envelope without changing the normalized item shape used by the UI.
  const root = record(envelope.data) ?? record(envelope.catalog) ?? envelope;
  const result: CatalogItem[] = [];
  addCategory(result, root.plants, "Seed", true);
  addCategory(result, root.items, "Tool");
  addCategory(result, root.eggs, "Egg");
  const mergedDecor = { ...(record(root.decors) ?? {}), ...(record(root.decor) ?? {}) };
  addCategory(result, mergedDecor, "Decor");
  return result;
}

export class CatalogService {
  private catalog: CatalogItem[] | null = null;
  private inflight: Promise<CatalogItem[]> | null = null;
  constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

  get(force = false): Promise<CatalogItem[]> {
    if (force) { this.catalog = null; this.inflight = null; }
    if (this.catalog) return Promise.resolve(this.catalog);
    if (this.inflight) return this.inflight;
    this.inflight = this.load().then((catalog) => (this.catalog = catalog)).catch((error) => {
      this.inflight = null;
      throw error;
    });
    return this.inflight;
  }

  async plants(force = false): Promise<CatalogItem[]> { return (await this.get(force)).filter((item) => item.itemType === "Seed"); }

  private async load(): Promise<CatalogItem[]> {
    const response = await this.fetcher("https://mg-api.ariedam.fr/data", {
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Catalog could not be loaded.");
    const catalog = normalizeCatalog(await response.json());
    if (!catalog.length) throw new Error("Catalog returned no items.");
    return catalog;
  }
}
