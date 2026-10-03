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

describe("controller security", () => {
  it("does not prefill or render a deployment-specific Worker URL", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const app = new MobileController(root, new CredentialStore(new MemoryStorage(), new MemoryStorage()));
    await app.start();
    expect(root.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("");
    app.dispose();
    root.remove();
  });

  it("never renders the ADMIN_TOKEN into normal page text", async () => {
    const local = new MemoryStorage(); const session = new MemoryStorage();
    const store = new CredentialStore(local, session);
    store.save({ workerUrl: "https://worker.example", token: "never-render-this-token", rememberToken: false });
    const status = { schemaVersion: 1, connected: true, state: "connected", serviceEnabled: true, autoHarvest: { enabled: true, intervalMinutes: 10 }, dailyCashflow: { date: "2026-10-03", income: 123456, expense: 23456 }, autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 }, autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 } };
    const config = { schemaVersion: 1, config: { autoHarvest: { enabled: true, intervalMinutes: 10, skipGold: true, protectedCropIds: [] }, autoBuy: { enabled: false, mode: "one", wishlist: [] }, autoTrough: { enabled: false, wishlist: [] } } };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/config") ? config : status));
    vi.stubGlobal("fetch", fetcher);
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const app = new MobileController(root, store, new CatalogService(async () => Response.json({})));
    await app.start();
    expect(root.textContent).not.toContain("never-render-this-token");
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("never-render-this-token"))).toBe(true);
    [...root.querySelectorAll("button")].find((button) => button.textContent?.includes("Protected"))?.click();
    expect([...root.querySelectorAll<HTMLOptionElement>('select[aria-label="Sort protected crops"] option')]
      .map((option) => [option.value, option.textContent])).toContainEqual(["price-desc", "Price high → low"]);
    app.dispose();
    root.remove();
    vi.unstubAllGlobals();
  });
});
