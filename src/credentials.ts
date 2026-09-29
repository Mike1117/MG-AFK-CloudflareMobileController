export interface Credentials { workerUrl: string; token: string; rememberToken: boolean }
const URL_KEY = "mg-afk.worker-url";
const LOCAL_TOKEN_KEY = "mg-afk.admin-token";
const SESSION_TOKEN_KEY = "mg-afk.admin-token-session";
const REMEMBER_KEY = "mg-afk.remember-token";

export class CredentialStore {
  constructor(private readonly local: Storage = localStorage, private readonly session: Storage = sessionStorage) {}

  load(defaultUrl: string): Credentials {
    const rememberToken = this.local.getItem(REMEMBER_KEY) === "true";
    return {
      workerUrl: this.local.getItem(URL_KEY) || defaultUrl,
      token: (rememberToken ? this.local.getItem(LOCAL_TOKEN_KEY) : this.session.getItem(SESSION_TOKEN_KEY)) || "",
      rememberToken,
    };
  }

  save(value: Credentials): void {
    this.local.setItem(URL_KEY, value.workerUrl);
    this.local.setItem(REMEMBER_KEY, String(value.rememberToken));
    if (value.rememberToken) {
      this.local.setItem(LOCAL_TOKEN_KEY, value.token);
      this.session.removeItem(SESSION_TOKEN_KEY);
    } else {
      this.session.setItem(SESSION_TOKEN_KEY, value.token);
      this.local.removeItem(LOCAL_TOKEN_KEY);
    }
  }

  clear(): void {
    this.local.removeItem(URL_KEY);
    this.local.removeItem(LOCAL_TOKEN_KEY);
    this.local.removeItem(REMEMBER_KEY);
    this.session.removeItem(SESSION_TOKEN_KEY);
  }
}
