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

### Phase 2: menus and sessions drawer (`extension/calm-menus.css`)

- Attach menu: Lucide line icons (locale strings lost their glyph prefixes), grouped with separators. Quick commands: preview card removed, rows are `/cmd` + truncated description. Slash menu uses the same rows and gains an ↑/↓/Enter/Esc highlight driven from the composer.
- Model picker: provider chips wrap, Recent section (last 3 picks, `hermesRecentModelPicks` in localStorage, shown when the catalog has 5+ models), selected row with check, Thinking/Fast switches and effort slider as one compact block, ghost footer buttons.
- Sessions drawer: segmented Recents/Projects, 32px live filter, Today/Yesterday/Earlier labels (source headers only when more than one source), 30px rows with relative time, accent dot for running sessions, ID/Rename/Move behind a hover `⋯` menu (ArrowRight from a row focuses it).
- `wireMenuKeyboard` gives attach, quick commands, profile switcher, model picker and sessions drawer ↑/↓/Home/End, Esc back to the trigger, and type-to-filter where a search box exists.
- Tests rewritten to the new contract: commands.test (preview card), session-drawer-row.test, i18n-runtime-panel-controls (group settings now an item in the row menu), common.test (refresh label).
### Phase 2: onboarding, startup/error screens, dialogs (`extension/calm-onboarding.css`)

- First run is welcome (small icon, "Hermes Browser", one muted line, Connect to Hermes / Skip for now) then Connect only. Theme, font, style, layout and language steps are gone; the panel follows the browser language until one is chosen in Settings. "Run first-time setup again" removed from Settings > Appearance.
- Connect step has an inline gateway address field with validation (`gatewayAddressError`); token/mode stay in Manual setup (Settings > Connections).
- Startup/error screen is one compact card with a status icon, heading, detail and the fixing action (Retry / Connect to Hermes / settings); no CRT, dither or artwork.
- Dialogs, toast, Hermes control dialog, new-group/bot-mode panels, voice dictation, microphone permission and the Hermes Web hand-off page are compact calm cards. Deleted the dither-hover module and its tests.

### Phase 3: polish and coherence

- Page context line: favicon + truncated tab title (or "This page can't be read"), a small Page/Selection pill, and a "This tab only" / "Follow active tab" scope button; the preview opens as "What Hermes will see with your next message".
- New chats show "New chat" (display only; stored default title unchanged). Thinking is a quiet pulsing "Thinking…"; kaomoji faces are the opt-in setting `classicThinkingFaces` (Settings > Sessions & context).
- Jump-to-latest moved to the right edge plus bottom thread padding; toast sits above the dock; three-button dialogs stack; gateway error card shows one summary line, a Details disclosure, "Connection settings" and "Retry"; startup progress lines are plain language.
- One 32x18 pill switch everywhere (`.toggle-switch`, `.settings-switch`); Settings effort is compact chips; Hermes Control light is muted when off and green when on; mic permission page follows the colour mode; tab scope menu restyled flat; diagnostics Source/Checked lines show on hover.
- Sentence case and "…" across English copy (caps kickers, Title Case labels, "Refresh", "Edit models…"). New English-only fallbacks were copied into the other locale packs.
- Esc closes menus, scope menu, preview, settings and returns focus to the composer, which is focused when the panel is ready. Tooltips on attach, commands, model, mic, send.
- Harness: `temp/harness/p3.mjs` (running state, keyboard checks, light/dark mic and voice pages), fake gateway `slowChat` flag. Shots: `temp/shots/p3f` (full), `p3e`, `p3s`.
