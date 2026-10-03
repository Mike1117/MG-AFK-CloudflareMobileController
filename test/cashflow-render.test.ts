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

describe("Overview cash flow card", () => {
  it("renders only compact Income and Expense below Service using status data", async () => {
    const credentials = new CredentialStore(new MemoryStorage(), new MemoryStorage());
    credentials.save({ workerUrl: "https://worker.example", token: "test-token", rememberToken: false });
    const status = {
      schemaVersion: 1,
      connected: true,
      state: "connected",
      serviceEnabled: true,
      autoHarvest: { enabled: false, intervalMinutes: 10 },
      dailyCashflow: { date: "2026-10-03", income: 123456, expense: 23456 },
      autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 },
      autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 },
    };
    const config = {
      schemaVersion: 1,
      config: {
        autoHarvest: { enabled: false, intervalMinutes: 10, skipGold: true, protectedCropIds: [] },
        autoBuy: { enabled: false, mode: "one", wishlist: [] },
        autoTrough: { enabled: false, wishlist: [] },
      },
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/config") ? config : status));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new MobileController(root, credentials, new CatalogService(async () => Response.json({})));
    await app.start();

    const cards = [...root.querySelectorAll<HTMLElement>(".overview-grid > .card")];
    expect(cards[0]?.querySelector("h2")?.textContent).toBe("Service");
    expect(cards[1]?.querySelector("h2")?.textContent).toBe("Today's Cash Flow");
    expect(cards[1]?.querySelector(".cashflow-grid")?.textContent).toContain("Income+123.46K");
    expect(cards[1]?.querySelector(".cashflow-grid")?.textContent).toContain("Expense-23.46K");
    expect(cards[1]?.textContent).not.toMatch(/net|GMT\+8|midnight|2026-10-03|reset/i);
    expect(root.querySelectorAll(".cashflow-grid dd")).toHaveLength(2);

    app.dispose();
    root.remove();
    vi.unstubAllGlobals();
  });
});
