export type ShopItemType = "Seed" | "Tool" | "Egg" | "Decor";

export interface AutoHarvestConfig {
  enabled: boolean;
  intervalMinutes: number;
  skipGold: boolean;
  protectedCropIds: string[];
}

export interface WishlistEntry { itemId: string; itemType: ShopItemType }
export interface AutoBuyConfig { enabled: boolean; mode: "one" | "all"; wishlist: WishlistEntry[] }
export interface AutoTroughConfig { enabled: boolean; wishlist: string[] }
export interface SessionConfig {
  autoHarvest: AutoHarvestConfig;
  autoBuy: AutoBuyConfig;
  autoTrough: AutoTroughConfig;
}

export interface HarvestResult {
  completedAt?: number;
  harvested: number;
  sellRuns: number;
  soldCrops: number;
  skippedGold: number;
  failures: Array<{ code: string }>;
}

export interface PurchaseResult { ok: boolean; code: string; itemId?: string; itemType?: string }
export interface TroughResult { ok: boolean; code: string; itemId: string; species: string; timestamp: number }
export interface StatusResponse {
  schemaVersion: number;
  serviceEnabled?: boolean;
  connected: boolean;
  state: string;
  playerId?: string | null;
  connectedAt?: number | null;
  serviceStartedAt?: number | null;
  autoHarvest: { enabled: boolean; intervalMinutes: number };
  nextHarvestAt?: number | null;
  lastHarvest?: HarvestResult | null;
  autoBuy: {
    enabled: boolean; mode: "one" | "all"; wishlistCount: number;
    running: boolean; queueDepth: number; lastResult?: PurchaseResult | null;
  };
  autoTrough: {
    enabled: boolean; wishlistCount: number; capacity: number; perSpeciesLimit: number;
    stateAvailable: boolean; troughPresent: boolean; itemCount: number;
    running: boolean; queueDepth: number; lastResult?: TroughResult | null;
  };
  lastError?: string | null;
  connection?: ConnectionHealth;
}

export interface ConnectionHistoryEntry {
  type: "connecting" | "connected" | "disconnected" | "reconnect_scheduled" | "connect_failed" | "welcome_timeout" | string;
  at: number;
  code?: number;
  label?: string;
  reason?: string;
  attempt?: number;
  delayMs?: number;
  message?: string;
  version?: string | null;
  roomId?: string | null;
}

export interface ConnectionHealth {
  connectedAt?: number | null;
  lastMessageAt?: number | null;
  version?: string | null;
  roomId?: string | null;
  clientConnectionAttempt?: number;
  lastDisconnect?: { code?: number; label?: string; reason?: string; at?: number } | null;
  history?: ConnectionHistoryEntry[];
}

export interface ConfigResponse { schemaVersion: number; config: SessionConfig }
export interface ConfigUpdateResponse extends ConfigResponse { status: StatusResponse }
export interface ShopItem {
  id: string; itemType: ShopItemType; initialStock: number; stock: number;
  purchaseCount: number; currency?: string | null; purchasePrice?: number | null;
}
export interface ShopsResponse {
  schemaVersion: number;
  connected: boolean;
  shops: Record<string, { restockId?: string | null; secondsUntilRestock?: number | null; items: ShopItem[] }>;
}

export interface CatalogItem {
  itemId: string;
  itemType: ShopItemType;
  name: string;
  sprite: string | null;
  rarity: string | null;
  eligibleShops: string[];
  coinPrice: number | null;
}

export const defaultConfig = (): SessionConfig => ({
  autoHarvest: { enabled: false, intervalMinutes: 10, skipGold: true, protectedCropIds: [] },
  autoBuy: { enabled: false, mode: "one", wishlist: [] },
  autoTrough: { enabled: false, wishlist: [] },
});

export function normalizeConfigShape(value: unknown): SessionConfig {
  const root = (value && typeof value === "object" ? value : {}) as Partial<SessionConfig>;
  const fallback = defaultConfig();
  return {
    autoHarvest: {
      ...fallback.autoHarvest,
      ...(root.autoHarvest ?? {}),
      protectedCropIds: Array.isArray(root.autoHarvest?.protectedCropIds) ? root.autoHarvest.protectedCropIds : [],
    },
    autoBuy: {
      ...fallback.autoBuy,
      ...(root.autoBuy ?? {}),
      wishlist: Array.isArray(root.autoBuy?.wishlist) ? root.autoBuy.wishlist : [],
    },
    autoTrough: {
      ...fallback.autoTrough,
      ...(root.autoTrough ?? {}),
      wishlist: Array.isArray(root.autoTrough?.wishlist) ? root.autoTrough.wishlist : [],
    },
  };
}
