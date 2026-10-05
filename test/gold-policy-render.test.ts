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

const status = {
  schemaVersion: 1, connected: true, state: "connected", serviceEnabled: true,
  autoHarvest: { enabled: true, intervalMinutes: 10 }, dailyCashflow: { date: "2026-10-05", income: 0, expense: 0 },
  autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 },
  autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0,
    stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 },
};

async function mount(skipGold: boolean, harvestDawnlitAmberlit: boolean) {
  const credentials = new CredentialStore(new MemoryStorage(), new MemoryStorage());
  credentials.save({ workerUrl: "https://worker.example", token: "test-token", rememberToken: false });
  const config = {
    autoHarvest: { enabled: true, intervalMinutes: 10, skipGold, harvestDawnlitAmberlit, protectedCropIds: [] },
    autoBuy: { enabled: false, mode: "one", wishlist: [] }, autoTrough: { enabled: false, wishlist: [] },
  };
  const partials: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const partial = JSON.parse(String(init.body));
      partials.push(partial);
      Object.assign(config.autoHarvest, partial.autoHarvest ?? {});
      return Response.json({ schemaVersion: 1, config, status });
    }
    return Response.json(String(input).endsWith("/config") ? { schemaVersion: 1, config } : status);
  });
  const root = document.createElement("div");
  document.body.append(root);
  const app = new MobileController(root, credentials, new CatalogService(async () => Response.json({})));
  await app.start();
  return { root, app, partials, cleanup: () => { app.dispose(); root.remove(); vi.unstubAllGlobals(); } };
}

describe("Wait-for-Gold secondary control", () => {
  it.each([
    [false, true, true, "Gold is harvested normally."],
    [true, false, false, "Waits for Frozen Gold."],
    [true, true, false, "Frozen is harvested. Dawnlit/Amberlit is also harvested unless Wet or Chilled."],
  ] as const)("renders dependent control and accurate hint for primary=%s secondary=%s", async (primary, secondary, disabled, hint) => {
    const view = await mount(primary, secondary);
    try {
      const first = view.root.querySelector<HTMLInputElement>('input[aria-label="Wait for Gold to freeze"]')!;
      const second = view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')!;
      expect(Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(second.closest(".dependent-setting")).not.toBeNull();
      expect(second.disabled).toBe(disabled);
      expect(second.checked).toBe(secondary);
      expect(view.root.querySelector(".gold-policy-hint")?.textContent).toBe(hint);
    } finally { view.cleanup(); }
  });

  it("saves only the secondary field and keeps it when primary is turned off and back on", async () => {
    const view = await mount(true, false);
    try {
      const secondary = view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')!;
      secondary.click();
      await vi.waitFor(() => expect(view.partials).toHaveLength(1));
      expect(view.partials[0]).toEqual({ autoHarvest: { harvestDawnlitAmberlit: true } });

      view.root.querySelector<HTMLInputElement>('input[aria-label="Wait for Gold to freeze"]')!.click();
      await vi.waitFor(() => expect(view.partials).toHaveLength(2));
      expect(view.partials[1]).toEqual({ autoHarvest: { skipGold: false } });
      await vi.waitFor(() => expect(view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')?.disabled).toBe(true));
      expect(view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')?.checked).toBe(true);

      view.root.querySelector<HTMLInputElement>('input[aria-label="Wait for Gold to freeze"]')!.click();
      await vi.waitFor(() => expect(view.partials).toHaveLength(3));
      await vi.waitFor(() => expect(view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')?.disabled).toBe(false));
      expect(view.root.querySelector<HTMLInputElement>('input[aria-label="Harvest Dawnlit / Amberlit Gold"]')?.checked).toBe(true);
    } finally { view.cleanup(); }
  });
});
