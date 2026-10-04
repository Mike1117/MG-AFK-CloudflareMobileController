import { MobileController } from "../src/app";
import { CatalogService } from "../src/catalog";
import { CredentialStore } from "../src/credentials";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

describe("purchase history round rendering", () => {
  it("renders both same-item rounds independently, newest first, including legacy records", async () => {
    const credentials = new CredentialStore(new MemoryStorage(), new MemoryStorage());
    credentials.save({ workerUrl: "https://worker.example", token: "test-token", rememberToken: false });
    const config = {
      schemaVersion: 1,
      config: {
        autoHarvest: { enabled: false, intervalMinutes: 10, skipGold: true, protectedCropIds: [] },
        autoBuy: { enabled: false, mode: "one", wishlist: [] },
        autoTrough: { enabled: false, wishlist: [] },
      },
    };
    const status = {
      schemaVersion: 1,
      connected: true,
      state: "connected",
      autoHarvest: { enabled: false, intervalMinutes: 10 },
      dailyCashflow: { date: "2026-10-03", income: 0, expense: 0 },
      autoBuy: {
        enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0,
        purchaseHistory: [
          { itemId: "RainWardShard", itemType: "Tool", shop: "rain", generation: "restock:r2", quantity: 1, lastPurchasedAt: 200 },
          { itemId: "RainWardShard", itemType: "Tool", shop: "rain", generation: "restock:r1", quantity: 3, lastPurchasedAt: 100 },
          { itemId: "OldItem", itemType: "Seed", quantity: 2, lastPurchasedAt: 50 },
        ],
      },
      autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 },
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/config") ? config : status));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new MobileController(root, credentials, new CatalogService(async () => Response.json({})));
    await app.start();

    const history = [...root.querySelectorAll<HTMLElement>(".purchase-history li")];
    expect(history).toHaveLength(3);
    expect(history.map((row) => row.querySelector("strong")?.textContent)).toEqual([
      "Rain Ward Shard × 1", "Rain Ward Shard × 3", "Old Item × 2",
    ]);
    expect(history.every((row) => Boolean(row.querySelector(".muted")?.textContent))).toBe(true);
    expect(root.textContent).not.toContain("restock:r");

    app.dispose();
    root.remove();
    vi.unstubAllGlobals();
  });
});
