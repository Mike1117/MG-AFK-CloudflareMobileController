# Agent notes

This is a lightweight, mobile-first management UI for the Cloudflare Worker API. It must never connect directly to Magic Garden or receive `MG_JWT`. `src/app.ts` owns views and interactions, `src/types.ts` mirrors the backend API schema, `src/api.ts` wraps management calls, `src/styles.css` defines the visual system, `test/` covers behavior, and `.github/workflows/deploy-pages.yml` deploys GitHub Pages from `main`.

`PUT /config` is a partial merge: send only changed fields, preserve unrelated values, and retain the existing debounce where used. Keep frontend types aligned with backend config; additive fields and legacy responses must normalize safely. Status polls about every five seconds while visible; do not add unnecessary polls or timers.

Keep `ADMIN_TOKEN` handling local and never place secrets in source or builds. Use existing card/toggle helpers and CSS conventions. Make secondary controls visually subordinate, keep disabled dependent controls understandable, and keep mobile pages compact.

Inspect latest `main` and add tests for behavior changes. Run `npm test`, `npm run typecheck`, and `npm run build` before pushing; use `npm run dev` locally. Pushing `main` triggers the existing GitHub Pages workflow.
