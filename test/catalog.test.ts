import { CatalogService, humanizeItemId, normalizeCatalog } from "../src/catalog";

const payload = {
  plants: {
    Lychee: { name: "Plant", seed: { name: "Lychee Seed", sprite: "https://img/lychee.png", rarity: "Rare", coinPrice: 50 }, crop: { name: "Lychee Crop" } },
    BlueBerry: { seed: { name: "Seed" }, name: "Blue Berry" },
  },
  items: { WateringCan: { name: "Watering Can", coinPrice: 100 }, NoPrice: { name: "No Price", eligibleShops: ["seed", 2, true, "seed"] } },
  eggs: { BlueEgg: { name: "Blue Egg" } },
  decors: { Lamp: { name: "Lamp Old" } },
  decor: { Lamp: { name: "Lamp" }, FancyBench: { name: "Decor" } },
};

describe("catalog normalization", () => {
  it("matches Windows aggregate categories and plant seed metadata", () => {
    const items = normalizeCatalog(payload);
    expect(items.map((item) => item.itemType)).toEqual(["Seed", "Seed", "Tool", "Tool", "Egg", "Decor", "Decor"]);
    expect(items.find((item) => item.itemId === "Lychee")).toMatchObject({ name: "Lychee Seed", sprite: "https://img/lychee.png", rarity: "Rare" });
    expect(items.find((item) => item.itemId === "WateringCan")).toMatchObject({ itemType: "Tool", name: "Watering Can" });
    expect(items.find((item) => item.itemId === "NoPrice")).toMatchObject({ coinPrice: null, eligibleShops: ["seed", "2", "true"] });
    expect(items.find((item) => item.itemId === "BlueEgg")?.itemType).toBe("Egg");
    expect(items.find((item) => item.itemId === "Lamp")?.name).toBe("Lamp");
  });

  it("unwraps catalog/data response envelopes", () => {
    expect(normalizeCatalog({ data: payload })).toHaveLength(7);
    expect(normalizeCatalog({ catalog: payload })).toHaveLength(7);
  });

  it("uses name fallbacks and humanization", () => {
    expect(normalizeCatalog(payload).find((item) => item.itemId === "BlueBerry")?.name).toBe("Blue Berry");
    expect(normalizeCatalog(payload).find((item) => item.itemId === "FancyBench")?.name).toBe("Fancy Bench");
    expect(humanizeItemId("RainWard_Shard")).toBe("Rain Ward Shard");
  });

  it("shares one in-flight request and retries after failure", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const service = new CatalogService(fetcher);
    const first = service.get(); const second = service.plants();
    expect(fetcher).toHaveBeenCalledOnce();
    resolve(Response.json(payload));
    await expect(first).resolves.toHaveLength(7);
    await expect(second).resolves.toHaveLength(2);

    const retryFetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json(payload));
    const retry = new CatalogService(retryFetch);
    await expect(retry.get()).rejects.toThrow("offline");
    await expect(retry.get()).resolves.toHaveLength(7);
    expect(retryFetch).toHaveBeenCalledTimes(2);
  });
});
