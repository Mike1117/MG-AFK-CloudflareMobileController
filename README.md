# MG AFK Cloudflare Mobile Controller

A lightweight, mobile-first static controller for [MG-AFK-Cloudflare](https://github.com/Mike1117/MG-AFK-Cloudflare). It manages the existing Cloudflare service; it does not connect to Magic Garden directly and closing the page does not stop the service.

Production site: <https://mike1117.github.io/MG-AFK-CloudflareMobileController/>

## Security model

- `MG_JWT` never enters this app. It remains a Cloudflare Worker secret.
- `ADMIN_TOKEN` is entered locally by the user and sent only as a Bearer authorization header to the configured Worker.
- By default the token is kept in `sessionStorage` and disappears when the browser session ends.
- “Remember token on this device” stores it in `localStorage`. Browser local storage is convenient, not equivalent to an OS keychain or DPAPI.
- The Worker URL is not a secret and is stored in `localStorage`.
- The repository and static build contain no user token, analytics, telemetry, or third-party runtime JavaScript.

Use the controller only on a trusted device. Clear saved credentials from Settings when the device is shared.

## Features

- **Overview** — service state and Start/Stop, session details, Auto Harvest controls and countdown, last harvest, Auto Buy, and Feeding Trough summaries.
- **Protected Crops** — searchable visual plant selection with debounced partial config saves and preservation of unknown configured IDs.
- **Wishlist** — Auto Buy toggle, one/all mode, category counts, search, sorting, live shop stock, and identity by item type plus ID.
- **Feeding Trough** — enable/disable, capacity and per-crop quota, plant search, and a maximum of nine selected species.
- **Settings** — user-supplied Worker URL, session-only or remembered token, connection test, save, and credential clearing. No deployment URL is built into the application.

Status is polled every five seconds only while the page is visible. Shop stock is polled only while Wishlist is active and visible. The shared Magic Garden catalog is loaded once per page session from `https://mg-api.ariedam.fr/data`.

## Local development

Requires Node.js 22 or another version supported by Vite 7.

```sh
npm install
npm run dev
```

Vite serves the development app at `http://localhost:5173` by default. The deployed Worker explicitly allows that origin, `127.0.0.1`, Vite preview, and the GitHub Pages origin.

## Test and build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The production build is written to `dist/` and uses the project-site base path `/MG-AFK-CloudflareMobileController/`.

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` tests, type-checks, builds, and deploys `dist/` on pushes to `main` or a manual dispatch. Repository Pages must use **GitHub Actions** as its source. No Worker secret or token is needed by the build.
