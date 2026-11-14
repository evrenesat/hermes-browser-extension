# Hermes Browser Extension (evrenesat hard fork)

Hard fork of `abundantbeing/hermes-browser-extension`. Public, MIT. We do not
track upstream compatibility: settings, storage keys, themes and UI may change
freely. Upstream is the `upstream` remote for cherry-picking fixes only.

## Goal of the fork

A calm, desktop-first side panel for daily use with a mouse and keyboard in a
narrow sidebar (Firefox sidebar on macOS is the owner's main target; Chromium
side panel second). Dense, legible, quiet; no retro/cyberpunk chrome.
See `docs/design/ui-revamp.md` for the design system and decisions.

## Layout

- `extension/` MV3 extension source. `sidepanel.html|js|css` is the main UI;
  `sidepanel-calm.css` is the fork's design layer, loaded last.
- `extension/lib/*.mjs` shared modules (gateway transport, themes, onboarding,
  model discovery, browser control).
- `companion-plugin/` optional Hermes gateway plugin (Python).
- `tests/*.test.mjs` node:test unit tests (`npm test` builds Firefox first).
- `temp/` is scratch (git-ignored); `temp/harness/` holds the visual QA harness.

## Working rules

- Build: `npm run build` (Chromium, `dist/`), `npm run build:firefox`.
- Verify: `npm test` and `npm run check:js`. Many tests are source-shape
  tests over CSS/HTML; when a redesign intentionally changes a contract,
  update or delete the test in the same commit and say so in the message.
- Visual check: `node temp/harness/capture.mjs <outdir>` (fake gateway +
  Playwright screenshots). Look at the screenshots before claiming a UI change works.
- Project management lives in Paperclip (personal company, project
  "Hermes Browser Extension"). GitHub issues are the public mirror.
- Commit messages: `<type>/<scope>: <imperative summary>` plus a few bullets.
