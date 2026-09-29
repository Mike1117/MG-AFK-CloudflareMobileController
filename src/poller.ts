export interface PollerOptions {
  task: () => Promise<void>;
  onError?: (error: unknown) => void;
  active: () => boolean;
  visible: () => boolean;
  intervalMs?: number;
  schedule?: (handler: () => void, interval: number) => ReturnType<typeof setInterval>;
  cancel?: (handle: ReturnType<typeof setInterval>) => void;
}

export class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(private readonly options: PollerOptions) {}

  start(immediate = true): void {
    this.stop();
    if (immediate) void this.tick();
    const schedule = this.options.schedule ?? ((handler: () => void, timeout: number) => setInterval(handler, timeout));
    this.timer = schedule(() => void this.tick(), this.options.intervalMs ?? 5_000);
  }

  refreshIfActive(): void { if (this.options.visible() && this.options.active()) void this.tick(); }
  stop(): void {
    if (this.timer !== null) {
      const cancel = this.options.cancel ?? ((handle) => clearInterval(handle));
      cancel(this.timer);
    }
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running || !this.options.visible() || !this.options.active()) return;
    this.running = true;
    try { await this.options.task(); }
    catch (error) { this.options.onError?.(error); }
    finally { this.running = false; }
  }
}
