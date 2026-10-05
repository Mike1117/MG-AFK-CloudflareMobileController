import { ApiError, CloudflareApiClient, normalizeWorkerUrl } from "./api";
import { CatalogService, humanizeItemId } from "./catalog";
import { CredentialStore, type Credentials } from "./credentials";
import { button, el, field, labeledToggle } from "./dom";
import { Poller } from "./poller";
import { formatCompactNumber, formatDuration } from "./format";
import { categoryCounts, matches, sortCatalog, toggleTrough, troughQuota, wishlistIdentity, withUnknownPlants, withUnknownWishlist, type SortMode } from "./selection";
import { defaultConfig, type CatalogItem, type PurchaseHistoryEntry, type SessionConfig, type ShopsResponse, type ShopItemType, type StatusResponse, type WishlistEntry } from "./types";

type Page = "overview" | "protected" | "wishlist" | "trough" | "settings";
type ProtectedSortMode = "selected" | SortMode;

export function previousConnectionTimestamps(history: unknown, currentConnectedAt?: number | null): number[] {
  return (Array.isArray(history) ? history : [])
    .filter((timestamp): timestamp is number => typeof timestamp === "number" && Number.isFinite(timestamp))
    .sort((a, b) => b - a)
    .filter((timestamp, index, entries) => timestamp !== (currentConnectedAt ?? null) && entries.indexOf(timestamp) === index)
    .slice(0, 5);
}

export function normalizePurchaseHistory(history: unknown): PurchaseHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return history
    .flatMap((value): PurchaseHistoryEntry[] => {
      if (!value || typeof value !== "object") return [];
      const entry = value as Partial<PurchaseHistoryEntry>;
      const itemId = typeof entry.itemId === "string" ? entry.itemId.trim() : "";
      if (!itemId || itemId === "WateringCan" || !["Seed", "Tool", "Egg", "Decor"].includes(entry.itemType as string)) return [];
      if (!Number.isInteger(entry.quantity) || (entry.quantity ?? 0) <= 0 || !Number.isFinite(entry.lastPurchasedAt) || (entry.lastPurchasedAt ?? 0) <= 0) return [];
      return [{
        itemId,
        itemType: entry.itemType as ShopItemType,
        ...(typeof entry.shop === "string" && entry.shop.trim() ? { shop: entry.shop.trim() } : {}),
        ...(typeof entry.generation === "string" && entry.generation.trim() ? { generation: entry.generation.trim() } : {}),
        quantity: entry.quantity!,
        lastPurchasedAt: entry.lastPurchasedAt!,
      }];
    })
    .sort((a, b) => b.lastPurchasedAt - a.lastPurchasedAt)
    .slice(0, 10);
}

export class MobileController {
  private credentials: Credentials;
  private api: CloudflareApiClient | null = null;
  private config: SessionConfig = defaultConfig();
  private status: StatusResponse | null = null;
  private shops: ShopsResponse | null = null;
  private catalog: CatalogItem[] | null = null;
  private catalogError = false;
  private catalogLoading = false;
  private workerError: string | null = null;
  private page: Page = "overview";
  private search = { protected: "", wishlist: "", trough: "" };
  private wishlistType: ShopItemType = "Seed";
  private sortMode: SortMode = "price-desc";
  private protectedSortMode: ProtectedSortMode = "selected";
  private readonly debounces = new Map<string, ReturnType<typeof setTimeout>>();
  private statusPoller: Poller | null = null;
  private shopsPoller: Poller | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly credentialsStore = new CredentialStore(),
    private readonly catalogService = new CatalogService(),
  ) { this.credentials = credentialsStore.load(""); }

  async start(): Promise<void> {
    document.addEventListener("visibilitychange", this.onVisibility);
    if (!this.credentials.token) {
      this.page = "settings";
      this.render();
      return;
    }
    await this.connect(false);
  }

  dispose(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.statusPoller?.stop();
    this.shopsPoller?.stop();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    for (const timer of this.debounces.values()) clearTimeout(timer);
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === "visible") {
      this.statusPoller?.refreshIfActive();
      this.shopsPoller?.refreshIfActive();
    }
  };

  private async connect(showSuccess: boolean): Promise<void> {
    this.renderLoading("Connecting to Worker…");
    try {
      this.api = new CloudflareApiClient(this.credentials.workerUrl, this.credentials.token);
      const config = await this.api.getConfig();
      this.config = config.config;
      this.status = await this.api.getStatus();
      this.workerError = null;
      this.page = "overview";
      this.render();
      this.startPolling();
      void this.loadCatalog();
      if (showSuccess) this.toast("Connection successful", "success");
    } catch (error) {
      this.page = "settings";
      this.render();
      this.toast(this.message(error), "error");
    }
  }

  private startPolling(): void {
    this.statusPoller?.stop();
    this.shopsPoller?.stop();
    this.statusPoller = new Poller({
      task: async () => { if (this.api) { this.status = await this.api.getStatus(); this.workerError = null; this.refreshVisibleStatus(); } },
      onError: (error) => { this.workerError = this.message(error); this.refreshVisibleStatus(); },
      active: () => Boolean(this.api), visible: () => document.visibilityState === "visible",
    });
    this.shopsPoller = new Poller({
      task: async () => { if (this.api) { this.shops = await this.api.getShops(); if (this.page === "wishlist") this.updateStockDecorations(); } },
      active: () => this.page === "wishlist", visible: () => document.visibilityState === "visible",
    });
    this.statusPoller.start(false);
    this.shopsPoller.start(false);
    if (!this.countdownTimer) this.countdownTimer = setInterval(() => this.updateCountdown(), 1_000);
  }

  private async loadCatalog(force = false): Promise<void> {
    if (this.catalogLoading) return;
    this.catalogLoading = true;
    this.catalogError = false;
    if (this.page !== "overview" && this.page !== "settings") this.renderPage();
    try { this.catalog = await this.catalogService.get(force); }
    catch { this.catalogError = true; }
    finally { this.catalogLoading = false; if (this.page !== "overview" && this.page !== "settings") this.renderPage(); }
  }

  private renderLoading(message: string): void {
    this.root.replaceChildren(el("main", { className: "center-state" }, el("div", { className: "spinner" }), el("p", { text: message })));
  }

  private render(): void {
    const shell = el("div", { className: "app-shell" });
    shell.append(this.header(), this.sidebar(), el("main", { className: "main", attrs: { id: "main-content" } }), this.bottomNav(), el("div", { className: "toast-region", attrs: { id: "toasts", "aria-live": "polite" } }));
    this.root.replaceChildren(shell);
    this.renderPage();
  }

  private header(): HTMLElement {
    const state = this.workerError ? "Worker unreachable" : this.status?.connected ? "Connected" : this.status?.state ? this.friendlyState() : "Not connected";
    return el("header", { className: "header" },
      el("div", {}, el("strong", { text: "MG AFK" }), el("span", { text: "Cloudflare Manager" })),
      el("div", { className: "header-status" }, el("span", { className: `dot ${this.statusColor()}` }), el("span", { text: state })),
    );
  }

  private navItems(): Array<[Page, string, string]> {
    return [["overview", "Overview", "●"], ["protected", "Protected", "◆"], ["wishlist", "Wishlist", "★"], ["trough", "Trough", "▰"], ["settings", "Settings", "⚙"]];
  }

  private sidebar(): HTMLElement {
    const nav = el("nav", { className: "sidebar", attrs: { "aria-label": "Main navigation" } },
      el("div", { className: "brand" }, el("strong", { text: "MG AFK" }), el("span", { text: "Cloudflare Manager" })),
    );
    for (const [page, label, icon] of this.navItems()) nav.append(this.navButton(page, label, icon));
    return nav;
  }

  private bottomNav(): HTMLElement {
    const nav = el("nav", { className: "bottom-nav", attrs: { "aria-label": "Main navigation" } });
    for (const [page, label, icon] of this.navItems()) nav.append(this.navButton(page, label, icon));
    return nav;
  }

  private navButton(page: Page, label: string, icon: string): HTMLButtonElement {
    const node = button("", () => this.navigate(page), `nav-item${this.page === page ? " active" : ""}`);
    node.setAttribute("aria-current", this.page === page ? "page" : "false");
    node.append(el("span", { className: "nav-icon", text: icon, attrs: { "aria-hidden": "true" } }), el("span", { text: label }));
    return node;
  }

  private navigate(page: Page): void {
    this.page = page;
    this.render();
    if (page === "wishlist") this.shopsPoller?.refreshIfActive();
    if (["protected", "wishlist", "trough"].includes(page) && !this.catalog && !this.catalogLoading) void this.loadCatalog();
  }

  private renderPage(): void {
    const main = document.querySelector<HTMLElement>("#main-content");
    if (!main) return;
    const titles: Record<Page, string> = { overview: "Overview", protected: "Protected Crops", wishlist: "Wishlist", trough: "Feeding Trough", settings: "Settings" };
    main.replaceChildren(el("h1", { className: "page-title", text: titles[this.page] }), this.pageContent());
    this.updateCountdown();
  }

  private pageContent(): HTMLElement {
    if (this.page === "settings") return this.settingsPage();
    if (!this.api || !this.status) return this.settingsPage();
    if (this.page === "protected") return this.protectedPage();
    if (this.page === "wishlist") return this.wishlistPage();
    if (this.page === "trough") return this.troughPage();
    return this.overviewPage();
  }

  private overviewPage(): HTMLElement {
    const status = this.status!;
    const serviceEnabled = status.serviceEnabled ?? status.state !== "stopped";
    const harvest = status.lastHarvest;
    const trough = status.autoTrough;
    const interval = el("input", { attrs: { type: "number", min: "1", max: "1440", inputmode: "numeric", value: String(this.config.autoHarvest.intervalMinutes), "aria-label": "Interval minutes" } });
    const service = this.card("Service", el("div", { className: "service-row" },
      el("div", {}, el("div", { className: "status-title" }, el("span", { className: `dot ${this.statusColor()}` }), el("strong", { text: this.friendlyState() })), el("p", { className: "muted", text: this.statusDetail() })),
      button(serviceEnabled ? "Stop Service" : "Start Service", () => void this.setService(!serviceEnabled), serviceEnabled ? "button danger" : "button primary")),
      this.dataGrid([["Player ID", status.playerId || "—"], ["Connected since", this.date(status.connectedAt)], ["Last error", status.lastError || "None"]]));
    const cashflow = status.dailyCashflow ?? { date: "", income: 0, expense: 0 };
    const cashflowCard = this.card("Today's Cash Flow",
      el("dl", { className: "cashflow-grid" },
        el("dt", { text: "Income" }), el("dd", { className: "cashflow-income", text: `+${formatCompactNumber(cashflow.income)}` }),
        el("dt", { text: "Expense" }), el("dd", { className: "cashflow-expense", text: `-${formatCompactNumber(cashflow.expense)}` })));

    const connectionHealth = this.connectionDiagnostics(status);
    const intervalControls = el("div", { className: "stepper" },
      button("−", () => { interval.value = String(Math.max(1, Number(interval.value) - 1)); }, "icon-button"), interval,
      button("+", () => { interval.value = String(Math.min(1440, Number(interval.value) + 1)); }, "icon-button"),
      button("Save", () => void this.savePartial({ autoHarvest: { intervalMinutes: Math.max(1, Math.min(1440, Number(interval.value))) } }), "button small"));
    const harvestNow = button("Harvest Now", () => void this.harvestNow(harvestNow), "button primary");
    const countdown = el("span", { text: this.countdown(), attrs: { "data-countdown": "true" } });
    const autoHarvest = this.card("Auto Harvest",
      labeledToggle("Enabled", this.config.autoHarvest.enabled, (enabled) => void this.savePartial({ autoHarvest: { enabled } })),
      labeledToggle("Wait for Gold to freeze", this.config.autoHarvest.skipGold, (skipGold) => void this.savePartial({ autoHarvest: { skipGold } })),
      el("div", { className: "dependent-setting" },
        labeledToggle("Harvest Dawnlit / Amberlit Gold", this.config.autoHarvest.harvestDawnlitAmberlit,
          (harvestDawnlitAmberlit) => void this.savePartial({ autoHarvest: { harvestDawnlitAmberlit } }),
          !this.config.autoHarvest.skipGold)),
      el("p", { className: "field-hint gold-policy-hint", text: !this.config.autoHarvest.skipGold
        ? "Gold is harvested normally."
        : this.config.autoHarvest.harvestDawnlitAmberlit
          ? "Frozen is harvested. Dawnlit/Amberlit is also harvested unless Wet or Chilled."
          : "Waits for Frozen Gold." }),
      el("div", { className: "button-row" }, harvestNow),
      field("Interval minutes", intervalControls),
      el("dl", { className: "data-grid" }, el("dt", { text: "Next Harvest" }), el("dd", {}, countdown),
        el("dt", { text: "Interval" }), el("dd", { text: `${this.config.autoHarvest.intervalMinutes} minutes` })));
    const lastHarvest = this.card("Last Harvest", harvest ? this.dataGrid([
      ["Completed", this.date(harvest.completedAt)], ["Harvested", String(harvest.harvested)], ["Sell runs", String(harvest.sellRuns)],
      ["Crops sold", String(harvest.soldCrops)], ["Gold skipped", String(harvest.skippedGold)], ["Failures", String(harvest.failures.length)],
    ]) : el("p", { className: "muted", text: "No harvest has completed yet." }));
    const purchaseHistory = normalizePurchaseHistory(status.autoBuy.purchaseHistory);
    const purchaseHistoryNode = purchaseHistory.length
      ? el("ul", { className: "purchase-history" }, ...purchaseHistory.map((entry) => el("li", {},
        el("strong", { text: `${humanizeItemId(entry.itemId)} × ${entry.quantity}` }),
        el("span", { className: "muted", text: this.date(entry.lastPurchasedAt) }),
      )))
      : el("p", { className: "muted", text: "No purchases recorded yet." });
    const autoBuy = this.card("Auto Buy", this.dataGrid([
      ["State", status.autoBuy.enabled ? "Enabled" : "Disabled"], ["Mode", status.autoBuy.mode === "all" ? "Buy all stock" : "One per restock"],
      ["Wishlist", String(status.autoBuy.wishlistCount)], ["Runtime", status.autoBuy.running ? "Running" : "Idle"],
      ["Queue", String(status.autoBuy.queueDepth)], ["Last result", this.purchaseResult()],
    ]), el("h3", { className: "subheading", text: "Recent purchases" }), purchaseHistoryNode);
    const troughState = !trough.stateAvailable ? "Waiting for live state" : !trough.troughPresent ? "Not available" : `${trough.itemCount} / ${trough.capacity}`;
    const troughCard = this.card("Feeding Trough", this.dataGrid([
      ["State", trough.enabled ? "Enabled" : "Disabled"], ["Wishlist", String(trough.wishlistCount)], ["Trough", troughState],
      ["Per crop", trough.perSpeciesLimit ? String(trough.perSpeciesLimit) : "—"], ["Runtime", trough.running ? "Running" : "Idle"],
      ["Queue", String(trough.queueDepth)], ["Last result", this.troughResult()],
    ]));
    return el("section", { className: "overview-grid" }, service, cashflowCard, connectionHealth, autoHarvest, lastHarvest, autoBuy, troughCard);
  }

  private connectionDiagnostics(status: StatusResponse): HTMLElement {
    const connection = status.connection;
    const currentConnectedAt = connection?.connectedAt ?? status.connectedAt ?? null;
    const previousConnections = previousConnectionTimestamps(connection?.connectedHistory, currentConnectedAt);
    const rows: Array<[string, string]> = [
      ["Service uptime", this.duration(status.serviceStartedAt)],
      ["Connection uptime", status.connected && connection?.connectedAt ? this.duration(connection.connectedAt) : "—"],
      ["Today's connected time", formatDuration(connection?.dailyConnectedTime?.connectedMs)],
      ["Last game activity", this.date(connection?.lastMessageAt)],
      ["Version", connection?.version || "—"],
      ["Reconnect attempt", String(connection?.clientConnectionAttempt ?? 0)],
    ];
    const historyNode = previousConnections.length
      ? el("ul", { className: "connection-history" }, ...previousConnections.map((timestamp) => el("li", {},
        el("strong", { text: "Connected" }),
        el("span", { className: "muted", text: this.date(timestamp) }),
      )))
      : el("p", { className: "muted", text: "No previous connections yet." });
    return this.card("Connection health", this.dataGrid(rows), el("h3", { className: "subheading", text: "Recent history" }), historyNode);
  }

  private protectedPage(): HTMLElement {
    const selected = new Set(this.config.autoHarvest.protectedCropIds);
    const options = el("select", { attrs: { "aria-label": "Sort protected crops" } });
    const sortOptions: Array<[ProtectedSortMode, string]> = [
      ["selected", "Selected first"], ["price-desc", "Price high → low"], ["price-asc", "Price low → high"],
      ["rarity-desc", "Rarity"], ["name-asc", "Name A → Z"], ["name-desc", "Name Z → A"],
    ];
    for (const [value, label] of sortOptions) {
      const option = el("option", { text: label, attrs: { value } });
      option.selected = value === this.protectedSortMode;
      options.append(option);
    }
    options.addEventListener("change", () => { this.protectedSortMode = options.value as ProtectedSortMode; this.renderPage(); });
    const filtered = withUnknownPlants(this.plants(), [...selected]).filter((item) => matches(item, this.search.protected));
    const sorted = this.protectedSortMode === "selected"
      ? filtered.sort((a, b) => Number(selected.has(b.itemId)) - Number(selected.has(a.itemId)) || a.name.localeCompare(b.name))
      : sortCatalog(filtered, this.protectedSortMode);
    const grid = this.itemGrid(sorted, selected, (item) => {
      selected.has(item.itemId) ? selected.delete(item.itemId) : selected.add(item.itemId);
      this.config.autoHarvest.protectedCropIds = [...selected];
      this.renderPage();
      this.debounce("protected", { autoHarvest: { protectedCropIds: [...selected] } });
    });
    return el("section", {},
      el("div", { className: "page-intro" },
        el("p", { text: "Choose crops Auto Harvest must leave untouched. Gold is controlled separately on Overview." }),
        el("strong", { text: `${selected.size} selected` })),
      this.catalogToolbar("protected", options), this.catalogStateOr(grid));
  }

  private wishlistPage(): HTMLElement {
    const selected = new Map(this.config.autoBuy.wishlist.map((item) => [wishlistIdentity(item.itemType, item.itemId), item]));
    const counts = categoryCounts([...selected.values()]);
    const controls = el("div", { className: "card controls-card" },
      labeledToggle("Auto Buy", this.config.autoBuy.enabled, (enabled) => void this.savePartial({ autoBuy: { enabled } })),
      el("div", { className: "segments" },
        this.segment("One per restock", this.config.autoBuy.mode === "one", () => void this.savePartial({ autoBuy: { mode: "one" } })),
        this.segment("Buy all stock", this.config.autoBuy.mode === "all", () => void this.savePartial({ autoBuy: { mode: "all" } }))),
      el("strong", { text: `${selected.size} selected` }));
    const tabs = el("div", { className: "category-tabs" });
    for (const [type, label] of [["Seed", "Seeds"], ["Tool", "Tools"], ["Egg", "Eggs"], ["Decor", "Decors"]] as Array<[ShopItemType, string]>) {
      tabs.append(this.segment(`${label} (${counts[type]})`, this.wishlistType === type, () => { this.wishlistType = type; this.renderPage(); }));
    }
    const options = el("select", { attrs: { "aria-label": "Sort items" } });
    const sortOptions: Array<[SortMode, string]> = [["price-desc", "Price high → low"], ["price-asc", "Price low → high"], ["rarity-desc", "Rarity"], ["name-asc", "Name A → Z"], ["name-desc", "Name Z → A"]];
    for (const [value, label] of sortOptions) {
      const option = el("option", { text: label, attrs: { value } });
      option.selected = value === this.sortMode;
      options.append(option);
    }
    options.addEventListener("change", () => { this.sortMode = options.value as SortMode; this.renderPage(); });
    const all = withUnknownWishlist(this.catalog ?? [], [...selected.values()]).filter((item) => item.itemType === this.wishlistType && matches(item, this.search.wishlist));
    const stock = this.stockMap();
    const grid = this.itemGrid(sortCatalog(all, this.sortMode), selected, (item) => {
      const key = wishlistIdentity(item.itemType, item.itemId);
      selected.has(key) ? selected.delete(key) : selected.set(key, { itemId: item.itemId, itemType: item.itemType });
      this.config.autoBuy.wishlist = [...selected.values()];
      this.renderPage();
      this.debounce("wishlist", { autoBuy: { wishlist: [...selected.values()] } });
    }, stock);
    return el("section", {}, controls, tabs, this.catalogToolbar("wishlist", options), this.catalogStateOr(grid));
  }

  private troughPage(): HTMLElement {
    const selected = new Set(this.config.autoTrough.wishlist);
    const live = this.status!.autoTrough;
    const troughText = !live.stateAvailable ? "Trough: Waiting for live state" : !live.troughPresent ? "Trough: Not available" : `Trough: ${live.itemCount} / 9`;
    const controls = el("div", { className: "card trough-controls" },
      el("p", { text: "Automatically move newly harvested selected crops into the Feeding Trough before Auto Harvest sells remaining produce." }),
      labeledToggle("Auto-fill Feeding Trough", this.config.autoTrough.enabled, (enabled) => void this.savePartial({ autoTrough: { enabled } })),
      this.dataGrid([["Trough", troughText.replace("Trough: ", "")], ["Selected", `${selected.size} / 9`], ["Capacity", "9"], ["Per crop", selected.size ? String(troughQuota(selected.size)) : "—"]]),
      el("p", { className: "muted", text: "Each selected species is capped at floor(9 ÷ selected crops). Existing items are never removed." }));
    const plants = withUnknownPlants(this.plants(), [...selected]);
    const grid = this.itemGrid(plants.filter((item) => matches(item, this.search.trough)).sort((a, b) => Number(selected.has(b.itemId)) - Number(selected.has(a.itemId)) || a.name.localeCompare(b.name)), selected, (item) => {
      const result = toggleTrough([...selected], item.itemId);
      if (result.limited) { this.toast("Maximum 9 crops.", "warning"); return; }
      this.config.autoTrough.wishlist = result.values;
      this.renderPage();
      this.debounce("trough", { autoTrough: { wishlist: result.values } });
    });
    return el("section", {}, controls, this.catalogToolbar("trough"), this.catalogStateOr(grid));
  }

  private settingsPage(): HTMLElement {
    const url = el("input", { attrs: { type: "url", value: this.credentials.workerUrl, placeholder: "https://your-worker.example", autocapitalize: "none", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" } });
    const token = el("input", { attrs: { type: "password", value: this.credentials.token, autocomplete: "current-password", autocapitalize: "none", autocorrect: "off", spellcheck: "false", enterkeyhint: "done" } });
    const remember = el("input", { attrs: { type: "checkbox" } }); remember.checked = this.credentials.rememberToken;
    const show = button("Show token", () => { const showing = token.type === "text"; token.type = showing ? "password" : "text"; show.textContent = showing ? "Show token" : "Hide token"; }, "button small");
    const read = (): Credentials => ({ workerUrl: normalizeWorkerUrl(url.value), token: token.value, rememberToken: remember.checked });
    const actions = el("div", { className: "button-row" },
      button("Test Connection", () => void this.testCredentials(read), "button"),
      button("Save", () => void this.saveCredentials(read), "button primary"),
      button("Clear Credentials", () => { this.credentialsStore.clear(); this.credentials = { workerUrl: "", token: "", rememberToken: false }; this.api = null; this.status = null; this.render(); this.toast("Credentials cleared", "success"); }, "button danger"));
    return el("section", { className: "settings-card card" },
      el("p", { className: "muted", text: "Credentials stay in this browser. The controller never requests or stores MG_JWT." }),
      field("Worker URL", url),
      field("ADMIN_TOKEN", el("div", { className: "token-field" }, token, show), "Session-only by default. Remember stores it in localStorage on this device."),
      el("label", { className: "check-row" }, remember, el("span", { text: "Remember token on this device" })),
      actions,
      this.dataGrid([["Backend schema", this.status ? String(this.status.schemaVersion) : "Not connected"], ["Controller version", "1.0.0"]]));
  }

  private async testCredentials(read: () => Credentials): Promise<void> {
    try { const value = read(); await new CloudflareApiClient(value.workerUrl, value.token).getStatus(); this.toast("Connection successful", "success"); }
    catch (error) { this.toast(this.message(error), "error"); }
  }

  private async saveCredentials(read: () => Credentials): Promise<void> {
    try {
      this.credentials = read();
      if (!this.credentials.token) throw new Error("Enter ADMIN_TOKEN.");
      this.credentialsStore.save(this.credentials);
      await this.connect(true);
    } catch (error) { this.toast(this.message(error), "error"); }
  }

  private async setService(start: boolean): Promise<void> {
    if (!this.api) return;
    try { this.status = start ? await this.api.start() : await this.api.stop(); this.render(); this.toast(start ? "Service started" : "Service stopped", "success"); }
    catch (error) { this.toast(start ? `Start failed: ${this.message(error)}` : `Stop failed: ${this.message(error)}`, "error"); }
  }

  private async harvestNow(control: HTMLButtonElement): Promise<void> {
    if (!this.api || control.disabled) return;
    control.disabled = true;
    control.textContent = "Harvesting…";
    try {
      this.status = await this.api.harvest();
      this.workerError = null;
      this.render();
      this.toast("Harvest finished", "success");
    } catch (error) {
      control.disabled = false;
      control.textContent = "Harvest Now";
      this.toast(`Harvest failed: ${this.message(error)}`, "error");
    }
  }

  private async savePartial(partial: object): Promise<void> {
    if (!this.api) return;
    try {
      const response = await this.api.putConfig(partial);
      this.config = response.config;
      this.status = response.status;
      this.render();
      this.toast("Saved", "success");
    } catch (error) {
      this.toast(this.message(error), "error");
      try { const [config, status] = await Promise.all([this.api.getConfig(), this.api.getStatus()]); this.config = config.config; this.status = status; this.render(); } catch { /* retain usable UI */ }
    }
  }

  private debounce(key: string, partial: object): void {
    const old = this.debounces.get(key); if (old) clearTimeout(old);
    this.debounces.set(key, setTimeout(() => { this.debounces.delete(key); void this.savePartial(partial); }, 500));
  }

  private catalogToolbar(key: "protected" | "wishlist" | "trough", extra?: HTMLElement): HTMLElement {
    const input = el("input", { attrs: { type: "search", placeholder: "Search by name or ID", value: this.search[key], enterkeyhint: "search", "aria-label": "Search catalog" } });
    input.addEventListener("input", () => { this.search[key] = input.value; this.renderPage(); const next = document.querySelector<HTMLInputElement>("input[type=search]"); next?.focus(); next?.setSelectionRange(input.value.length, input.value.length); });
    return el("div", { className: "catalog-toolbar" }, input, extra);
  }

  private catalogStateOr(content: HTMLElement): HTMLElement {
    if (this.catalogLoading || (!this.catalog && !this.catalogError)) return el("div", { className: "catalog-state" }, el("div", { className: "spinner" }), el("p", { text: "Loading catalog…" }));
    if (this.catalogError) return el("div", { className: "catalog-state error-banner" }, el("p", { text: "Catalog could not be loaded." }), button("Retry", () => void this.loadCatalog(true), "button"));
    return content;
  }

  private itemGrid(items: CatalogItem[], selected: Set<string> | Map<string, WishlistEntry>, toggle: (item: CatalogItem) => void, stock?: Map<string, number>): HTMLElement {
    const grid = el("div", { className: "catalog-grid" });
    for (const item of items) {
      const key = wishlistIdentity(item.itemType, item.itemId);
      const active = selected instanceof Map ? selected.has(key) : selected.has(item.itemId);
      const card = button("", () => toggle(item), `item-card${active ? " selected" : ""}`);
      card.setAttribute("aria-pressed", String(active));
      const visual = el("div", { className: "item-visual" }, el("span", { text: item.name.slice(0, 1).toUpperCase() || "?" }));
      if (item.sprite) visual.append(el("img", { attrs: { src: item.sprite, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } }));
      const meta = [item.itemType, item.rarity].filter(Boolean).join(" · ");
      const info = el("div", { className: "item-info" }, el("strong", { text: item.name }), el("span", { className: "muted truncate", text: meta }), el("span", { className: "muted truncate", text: item.itemId }));
      if (item.coinPrice !== null) info.append(el("span", { className: "price", text: `${this.compact(item.coinPrice)} coins` }));
      if (stock) {
        const count = stock.get(key);
        const live = el("span", { className: count !== undefined && count > 0 ? "stock" : "muted", text: count === undefined ? "" : count > 0 ? `In stock · ${count}` : "Out of stock", attrs: { "data-stock-key": key } });
        live.hidden = count === undefined;
        info.append(live);
      }
      card.append(visual, info, el("span", { className: "selection-dot", text: active ? "✓" : "" }));
      grid.append(card);
    }
    if (!items.length) grid.append(el("p", { className: "empty-state", text: "No matching items." }));
    return grid;
  }

  private stockMap(): Map<string, number> {
    const result = new Map<string, number>();
    for (const shop of Object.values(this.shops?.shops ?? {})) for (const item of shop.items) {
      const key = wishlistIdentity(item.itemType, item.id);
      result.set(key, (result.get(key) ?? 0) + item.stock);
    }
    return result;
  }

  private plants(): CatalogItem[] { return (this.catalog ?? []).filter((item) => item.itemType === "Seed"); }
  private card(title: string, ...children: HTMLElement[]): HTMLElement { return el("article", { className: "card" }, el("h2", { text: title }), ...children); }
  private dataGrid(rows: Array<[string, string]>): HTMLElement { return el("dl", { className: "data-grid" }, ...rows.flatMap(([label, value]) => [el("dt", { text: label }), el("dd", { text: value })])); }
  private segment(label: string, active: boolean, action: () => void): HTMLButtonElement { return button(label, action, `segment${active ? " active" : ""}`); }
  private date(value?: number | null): string { return value ? new Date(value).toLocaleString() : "—"; }
  private duration(start?: number | null): string {
    if (!start) return "—";
    let seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const days = Math.floor(seconds / 86400); seconds %= 86400;
    const hours = Math.floor(seconds / 3600); seconds %= 3600;
    const minutes = Math.floor(seconds / 60); seconds %= 60;
    return `${days ? `${days}d ` : ""}${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m ` : ""}${seconds}s`;
  }
  private connectionEventLabel(entry: { type: string; code?: number; label?: string; message?: string }): string {
    if (entry.type === "disconnected") return `Disconnected${entry.code != null ? ` (${entry.code}${entry.label ? ` · ${entry.label}` : ""})` : ""}`;
    if (entry.type === "connect_failed") return `Connect failed${entry.message ? `: ${entry.message}` : ""}`;
    return entry.type.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }
  private compact(value: number): string { return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value); }
  private countdown(): string { if (!this.status?.nextHarvestAt) return "Not scheduled"; const seconds = Math.max(0, Math.floor((this.status.nextHarvestAt - Date.now()) / 1000)); return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
  private updateCountdown(): void { const node = document.querySelector("[data-countdown]"); if (node) node.textContent = this.countdown(); }
  private friendlyState(): string { if (this.workerError) return "Worker unreachable"; const enabled = this.status?.serviceEnabled ?? this.status?.state !== "stopped"; if (!enabled) return "Stopped"; if (this.status?.connected) return "Connected"; return this.status?.state === "error" ? "Error" : "Reconnecting…"; }
  private statusColor(): string { return this.workerError ? "error" : this.status?.connected ? "success" : this.status?.state === "error" ? "error" : this.status?.state === "stopped" ? "muted-dot" : "warning"; }
  private statusDetail(): string { if (this.workerError) return this.workerError; return this.status?.connected ? "Worker reachable · game session online" : this.status?.state === "stopped" ? "Worker reachable · service stopped" : "Worker reachable · restoring game session"; }
  private purchaseResult(): string { const result = this.status?.autoBuy.lastResult; if (!result) return "None"; return result.ok ? `Bought ${humanizeItemId(result.itemId ?? "item")}` : result.code === "purchase_timeout" ? "Purchase timeout" : result.code === "insufficient_funds_local" ? "Insufficient coins" : "Purchase failed"; }
  private troughResult(): string { const result = this.status?.autoTrough.lastResult; if (!result) return "None"; return result.ok ? `Stored ${humanizeItemId(result.species)}` : result.code.replaceAll("_", " "); }
  private refreshVisibleStatus(): void {
    const header = document.querySelector(".header");
    if (!header) return;
    header.replaceWith(this.header());
    if (this.page === "overview") this.renderPage();
  }
  private updateStockDecorations(): void {
    const stock = this.stockMap();
    for (const node of document.querySelectorAll<HTMLElement>("[data-stock-key]")) {
      const count = stock.get(node.dataset.stockKey ?? "");
      node.hidden = count === undefined;
      node.className = count !== undefined && count > 0 ? "stock" : "muted";
      node.textContent = count === undefined ? "" : count > 0 ? `In stock · ${count}` : "Out of stock";
    }
  }
  private message(error: unknown): string { if (error instanceof ApiError || error instanceof Error) return error.message; return "Something went wrong."; }

  private toast(message: string, kind: "success" | "warning" | "error"): void {
    const region = document.querySelector("#toasts") ?? this.root;
    const toast = el("div", { className: `toast ${kind}`, text: message, attrs: { role: kind === "error" ? "alert" : "status" } });
    region.append(toast);
    setTimeout(() => toast.remove(), 3_000);
  }
}
