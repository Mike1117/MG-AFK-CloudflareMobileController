import { normalizeConfigShape, type ConfigResponse, type ConfigUpdateResponse, type ShopsResponse, type StatusResponse } from "./types";

export type ApiErrorKind = "unauthorized" | "unreachable" | "timeout" | "unsupported-schema" | "invalid-response" | "request-failed";
export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message: string, readonly status?: number) { super(message); }
}

export function normalizeWorkerUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/, "");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid Worker URL."); }
  if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Enter a valid HTTP or HTTPS Worker URL.");
  }
  return url.toString().replace(/\/$/, "");
}

function schema(value: unknown): number {
  if (!value || typeof value !== "object" || typeof (value as { schemaVersion?: unknown }).schemaVersion !== "number") {
    throw new ApiError("invalid-response", "Backend returned an unsupported response.");
  }
  const version = (value as { schemaVersion: number }).schemaVersion;
  if (version > 1) throw new ApiError("unsupported-schema", "Backend API is newer than this controller.");
  if (version !== 1) throw new ApiError("invalid-response", "Backend returned an unsupported response.");
  return version;
}

export class CloudflareApiClient {
  private baseUrl: string;
  constructor(
    workerUrl: string,
    private token: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 12_000,
  ) { this.baseUrl = normalizeWorkerUrl(workerUrl); }

  configure(workerUrl: string, token: string): void {
    this.baseUrl = normalizeWorkerUrl(workerUrl);
    this.token = token;
  }

  getStatus(signal?: AbortSignal): Promise<StatusResponse> { return this.send("GET", "status", undefined, signal); }
  getConfig(signal?: AbortSignal): Promise<ConfigResponse> {
    return this.send<ConfigResponse>("GET", "config", undefined, signal).then((response) => ({
      ...response, config: normalizeConfigShape(response.config),
    }));
  }
  getShops(signal?: AbortSignal): Promise<ShopsResponse> { return this.send("GET", "shops", undefined, signal); }
  start(signal?: AbortSignal): Promise<StatusResponse> { return this.send("POST", "start", undefined, signal); }
  stop(signal?: AbortSignal): Promise<StatusResponse> { return this.send("POST", "stop", undefined, signal); }
  putConfig(partial: object, signal?: AbortSignal): Promise<ConfigUpdateResponse> {
    return this.send<ConfigUpdateResponse>("PUT", "config", partial, signal).then((response) => ({
      ...response, config: normalizeConfigShape(response.config),
    }));
  }

  private async send<T>(method: string, path: string, body?: object, externalSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    const abort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", abort, { once: true });
    try {
      const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${this.token}` });
      if (body) headers.set("Content-Type", "application/json");
      const response = await this.fetcher(`${this.baseUrl}/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 401) throw new ApiError("unauthorized", "ADMIN_TOKEN rejected.", 401);
      if (!response.ok) throw new ApiError("request-failed", `Worker request failed (HTTP ${response.status}).`, response.status);
      let value: T;
      try { value = await response.json() as T; }
      catch { throw new ApiError("invalid-response", "Backend returned an unsupported response."); }
      schema(value);
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted && !externalSignal?.aborted) throw new ApiError("timeout", "Worker request timed out.");
      if (externalSignal?.aborted) throw error;
      throw new ApiError("unreachable", "Worker unreachable.");
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }
}
