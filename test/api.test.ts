import { ApiError, CloudflareApiClient, normalizeWorkerUrl } from "../src/api";

const status = { schemaVersion: 1, connected: true, state: "connected", autoHarvest: { enabled: true, intervalMinutes: 10 }, dailyCashflow: { date: "2026-10-03", income: 123456, expense: 23456 }, connection: { dailyConnectedTime: { date: "2026-10-03", connectedMs: 45_209_000 } }, autoBuy: { enabled: false, mode: "one", wishlistCount: 0, running: false, queueDepth: 0 }, autoTrough: { enabled: false, wishlistCount: 0, capacity: 9, perSpeciesLimit: 0, stateAvailable: true, troughPresent: true, itemCount: 0, running: false, queueDepth: 0 } };
const config = { schemaVersion: 1, config: { autoHarvest: { enabled: true, intervalMinutes: 10, skipGold: true, harvestDawnlitAmberlit: true, smartPotion: { enabled: true, frozenMinExpectedProfit: 0 }, protectedCropIds: [] }, autoBuy: { enabled: false, mode: "one", wishlist: [] }, autoTrough: { enabled: false, wishlist: [] } } };
const shops = { schemaVersion: 1, connected: true, shops: {} };

describe("CloudflareApiClient", () => {
  it("normalizes Worker URLs", () => {
    expect(normalizeWorkerUrl(" https://worker.example/// ")).toBe("https://worker.example");
    expect(() => normalizeWorkerUrl("javascript:alert(1)")).toThrow();
  });

  it("adds Bearer auth without ever putting the token in the URL", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(status));
    await new CloudflareApiClient("https://worker.example", "super-secret", fetcher).getStatus();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://worker.example/status");
    expect(String(url)).not.toContain("super-secret");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer super-secret");
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("parses status, config, and shops", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/status") ? status : String(input).endsWith("/config") ? config : shops));
    const api = new CloudflareApiClient("https://worker.example", "token", fetcher);
    expect((await api.getStatus()).connected).toBe(true);
    expect((await api.getStatus()).dailyCashflow).toEqual({ date: "2026-10-03", income: 123456, expense: 23456 });
    expect((await api.getStatus()).connection?.dailyConnectedTime).toEqual({ date: "2026-10-03", connectedMs: 45_209_000 });
    expect((await api.getConfig()).config.autoHarvest.intervalMinutes).toBe(10);
    expect((await api.getConfig()).config.autoHarvest.harvestDawnlitAmberlit).toBe(true);
    expect((await api.getShops()).shops).toEqual({});
  });

  it("sends POST start/stop and exact partial config bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return Response.json(String(input).endsWith("/config") ? { ...config, status } : status);
    });
    const api = new CloudflareApiClient("https://worker.example", "token", fetcher);
    await api.start(); await api.stop(); await api.harvest(); await api.putConfig({ autoTrough: { wishlist: ["Lychee"] } });
    expect(requests.map((item) => `${item.init?.method} ${new URL(item.url).pathname}`)).toEqual(["POST /start", "POST /stop", "POST /harvest", "PUT /config"]);
    expect(JSON.parse(String(requests[3]!.init?.body))).toEqual({ autoTrough: { wishlist: ["Lychee"] } });
    expect(new Headers(requests[3]!.init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("maps 401, network failures, and timeout", async () => {
    await expect(new CloudflareApiClient("https://worker.example", "bad", async () => new Response(null, { status: 401 })).getStatus())
      .rejects.toMatchObject({ kind: "unauthorized", message: "ADMIN_TOKEN rejected." });
    await expect(new CloudflareApiClient("https://worker.example", "x", async () => { throw new TypeError("network"); }).getStatus())
      .rejects.toMatchObject({ kind: "unreachable" });
    vi.useFakeTimers();
    const pending = new CloudflareApiClient("https://worker.example", "x", (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }), 25).getStatus();
    const timeoutAssertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(25);
    await timeoutAssertion;
    vi.useRealTimers();
  });

  it("validates schemaVersion", async () => {
    await expect(new CloudflareApiClient("https://worker.example", "x", async () => Response.json({ ...status, schemaVersion: 2 })).getStatus())
      .rejects.toMatchObject({ kind: "unsupported-schema", message: "Backend API is newer than this controller." } satisfies Partial<ApiError>);
    await expect(new CloudflareApiClient("https://worker.example", "x", async () => Response.json({ connected: true })).getStatus())
      .rejects.toMatchObject({ kind: "invalid-response", message: "Backend returned an unsupported response." });
  });

  it("safely defaults missing additive autoTrough config", async () => {
    const old = { schemaVersion: 1, config: { autoHarvest: config.config.autoHarvest, autoBuy: config.config.autoBuy } };
    const result = await new CloudflareApiClient("https://worker.example", "x", async () => Response.json(old)).getConfig();
    expect(result.config.autoTrough).toEqual({ enabled: false, wishlist: [] });
  });

  it("defaults legacy refined Color policy off without overriding an explicit value", async () => {
    const old = { ...config, config: { ...config.config, autoHarvest: { enabled: true, intervalMinutes: 10, skipGold: true, protectedCropIds: [] } } };
    const api = new CloudflareApiClient("https://worker.example", "x", async () => Response.json(old));
    expect((await api.getConfig()).config.autoHarvest.harvestDawnlitAmberlit).toBe(false);
    const strict = new CloudflareApiClient("https://worker.example", "x", async () => Response.json({
      ...config, config: { ...config.config, autoHarvest: { ...old.config.autoHarvest, harvestDawnlitAmberlit: false } },
    }));
    expect((await strict.getConfig()).config.autoHarvest.harvestDawnlitAmberlit).toBe(false);
  });
});
