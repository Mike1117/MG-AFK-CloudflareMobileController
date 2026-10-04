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

const config = {
  schemaVersion: 1,
  config: {
    autoHarvest: { enabled: false, intervalMinutes: 10, skipGold: true, protectedCropIds: [] },
    autoBuy: { enabled: false, mode: "one", wishlist: [] },
    autoTrough: { enabled: false, wishlist: [] },
  },
};

async function render(status: Record<string, any>): Promise<{ root: HTMLElement; app: MobileController }> {
  const credentials = new CredentialStore(new MemoryStorage(), new MemoryStorage());
  credentials.save({ workerUrl: "https://worker.example", token: "test-token", rememberToken: false });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/config") ? config : status));
  const root = document.createElement("div");
  document.body.append(root);
  const app = new MobileController(root, credentials, new CatalogService(async () => Response.json({})));
  await app.start();
  return { root, app };
}

describe("daily connected time row", () => {
  it("renders directly after Connection uptime using status milliseconds", async () => {
    const { root, app } = await render({
      schemaVersion: 1,
      connected: true,
      state: "connected",
      autoHarvest: { enabled: false, intervalMinutes: 10 },
      dailyCashflow: { date: "2026-10-03", income: 0, expense: 0 },
      connection: { connectedAt: Date.now(), dailyConnectedTime: { date: "2026-10-03", connectedMs: 45_209_000 } },
      autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 },
      autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 },
    });
    const card = [...root.querySelectorAll<HTMLElement>(".card")]
      .find((element) => element.querySelector("h2")?.textContent === "Connection health")!;
    const labels = [...card.querySelectorAll("dt")].map((node) => node.textContent);
    const uptimeIndex = labels.indexOf("Connection uptime");
    expect(labels[uptimeIndex + 1]).toBe("Today's connected time");
    expect(card.querySelectorAll("dt")[uptimeIndex + 1]?.nextElementSibling?.textContent).toBe("12h 33m 29s");
    expect(labels).not.toContain("GMT+8");

    app.dispose();
    root.remove();
    vi.unstubAllGlobals();
  });

  it("shows the compatibility placeholder when the backend field is missing", async () => {
    const { root, app } = await render({
      schemaVersion: 1,
      connected: false,
      state: "disconnected",
      autoHarvest: { enabled: false, intervalMinutes: 10 },
      dailyCashflow: { date: "2026-10-03", income: 0, expense: 0 },
      autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 },
      autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: false, troughPresent: false, itemCount: 0, running: false, queueDepth: 0 },
    });
    const card = [...root.querySelectorAll<HTMLElement>(".card")]
      .find((element) => element.querySelector("h2")?.textContent === "Connection health")!;
    const row = [...card.querySelectorAll("dt")].find((node) => node.textContent === "Today's connected time");
    expect(row?.nextElementSibling?.textContent).toBe("—");

    app.dispose();
    root.remove();
    vi.unstubAllGlobals();
  });
});
