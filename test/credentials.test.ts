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

describe("CredentialStore", () => {
  it("stores tokens in session by default and local only when remembered", () => {
    const local = new MemoryStorage(); const session = new MemoryStorage(); const store = new CredentialStore(local, session);
    store.save({ workerUrl: "https://worker", token: "session-token", rememberToken: false });
    expect([...Array(local.length)].map((_, i) => local.key(i)).some((key) => key !== null && local.getItem(key)?.includes("session-token") === true)).toBe(false);
    expect(store.load("default").token).toBe("session-token");
    store.save({ workerUrl: "https://worker", token: "local-token", rememberToken: true });
    expect(store.load("default")).toMatchObject({ token: "local-token", rememberToken: true });
    expect(session.length).toBe(0);
  });

  it("clears URL and both token locations", () => {
    const local = new MemoryStorage(); const session = new MemoryStorage(); const store = new CredentialStore(local, session);
    store.save({ workerUrl: "https://worker", token: "token", rememberToken: true });
    store.clear();
    expect(local.length).toBe(0); expect(session.length).toBe(0);
    expect(store.load("https://default")).toEqual({ workerUrl: "https://default", token: "", rememberToken: false });
  });
});
