# DEVLOG

## 2026-11-12 — fork and calm UI revamp, night 1

- Hard-forked upstream at 10e87ba2 to evrenesat/hermes-browser-extension (public).
- Removed upstream funding and scope-check workflow; added a plain CI workflow.
- Baseline: 5730/5731 unit tests pass (1 skipped) before any UI change.

### Phase 1: calm foundation

- Added `extension/sidepanel-calm.css` (linked last on panel, preview, voice and permission pages): calm tokens (dark/light), mapping onto `--hermes-*` for the `calm` theme and unthemed pages, base type/buttons/inputs/scrollbars/focus, artwork off for calm, 40px flat top bar.
- `calm` is the default theme (color mode `system`, font profile `system-sans`). Other themes stay as palettes on the same structure.
- Legacy stylesheets no longer set uppercase, letter-spacing or display/mono faces on UI chrome (mono kept for code and IDs); 6-10px text raised to 11px.
- All `data-icon` svgs are now 1.5px stroke Lucide-style line icons (HTML and JS-injected); `tests/line-icons.test.mjs` replaces the pixelarticons tests.
- Deleted tests that only guarded the old look (caps/tracking/display-font, RTL tracking twins, pixel icons, connection-window headings); `tests/review-queue.test.mjs` "simultaneous processes" is flaky and unrelated.
