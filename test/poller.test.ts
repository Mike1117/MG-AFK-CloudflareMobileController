import { Poller } from "../src/poller";

describe("Poller", () => {
  it("pauses while hidden and refreshes immediately when visible again", async () => {
    let visible = false; let callback: (() => void) | undefined;
    const task = vi.fn(async () => undefined);
    const poller = new Poller({ task, active: () => true, visible: () => visible,
      schedule: (handler) => (callback = handler, 1 as unknown as ReturnType<typeof setInterval>), cancel: vi.fn() });
    poller.start(true); await Promise.resolve();
    expect(task).not.toHaveBeenCalled();
    callback?.(); await Promise.resolve();
    expect(task).not.toHaveBeenCalled();
    visible = true; poller.refreshIfActive(); await Promise.resolve();
    expect(task).toHaveBeenCalledOnce();
  });

  it("runs shops polling only while Wishlist is active and avoids overlap", async () => {
    let page = "overview"; let callback: (() => void) | undefined; let resolve!: () => void;
    const task = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const poller = new Poller({ task, active: () => page === "wishlist", visible: () => true,
      schedule: (handler) => (callback = handler, 1 as unknown as ReturnType<typeof setInterval>), cancel: vi.fn() });
    poller.start(false); callback?.(); await Promise.resolve(); expect(task).not.toHaveBeenCalled();
    page = "wishlist"; callback?.(); callback?.(); await Promise.resolve(); expect(task).toHaveBeenCalledOnce();
    resolve(); await Promise.resolve(); page = "trough"; callback?.(); await Promise.resolve(); expect(task).toHaveBeenCalledOnce();
  });

  it("contains polling failures and reports them without stopping later ticks", async () => {
    let callback: (() => void) | undefined;
    const onError = vi.fn();
    const task = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const poller = new Poller({ task, onError, active: () => true, visible: () => true,
      schedule: (handler) => (callback = handler, 1 as unknown as ReturnType<typeof setInterval>), cancel: vi.fn() });
    poller.start(false);
    callback?.(); await Promise.resolve(); await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    callback?.(); await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
