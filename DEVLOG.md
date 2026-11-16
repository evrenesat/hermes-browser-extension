# DEVLOG

## 2026-11-16 — feat/capture: capture chunk-pull for long pages

- Problem: pages longer than the full-depth page-text cap were cut before leaving the extension, and the agent had no way to read the rest. Fix goal: the agent pages through the full capture on demand, so it never answers with missing page data.
- Design (plan in temp/chunk-pull-plan.md, ogent-reviewed go-with-changes; all five material findings processed): extractor returns the full processed page text (same normalize+redact pipeline, 512k-char bound) as captureText; the envelope carries a bounded capture block {id, totalChars, deliveredChars, chunkChars} (hash-excluded so reference turns stay cached); the delivered page text is derived as the exact head of the capture text so chunk offsets align by construction; captureText never serializes.
- Plugin: new POST /api/plugins/hermes-browser-extension/capture route (byte-bounded, session header, plugin-issued 32-hex capture id, pending TTL 300s); adoption/rebinding fenced by principal+session on every turn naming the id (adopted TTL 1800s); browser_get_capture_chunk reads bounded 4k-64k chunks through the trusted pre_tool_call lease (one-shot per capture_id:offset:chunk_chars, repeatable reads); notice appends a byte-stable chunking instruction when a capture is bound. Config: capture_enabled / capture_ttl_seconds / capture_max_chars.
- Extension: full-depth truncated pages upload the capture before the final consent read (the consent gate forbids awaits between its read and the send; upload is awaited earlier), reuse the plugin-issued id while the capture-text fingerprint is unchanged, and degrade to today's behavior on any failure or an older plugin (route listed in the plugin status payload is the version gate).
- ogent round-1 resolutions honored: session-level fence (not turn tuple), lease-flow handler invariant, capture block outside the payload hash, upload in the main full-turn send path with plugin-issued ids, one shared text pipeline with prefix-exact delivery.
- Tests: 12 new python cases (store, fence, TTLs, bounds, lease flow, notice, envelope adoption); JS protocol suite extended (capture block, hash exclusion, no-leak); client + wiring suites extended (upload bounds, plan gating, consent-gate placement). Suite: 5651 JS pass, 12 python pass. Known pre-existing failures unrelated to this work: review-queue race test (flaky, A/B-verified both sides), origin/main base-retains-records regression test (not wired into CI, fails on stashed tree too).

## 2026-11-16 — fix/context: page-text budget and visible truncation

- Symptom: on long pages (Reddit comment threads) the full-depth snapshot stopped at 30,000 chars with a bare " [truncated]" marker, and source_receipt.truncation reported a clean turn because extractor-level clamping happened before the envelope budget state existed.
- Root cause: the extractor clamps page text at TEXT_LIMITS.full = 30_000 (content.js + sidepanel.js scripting fallback), the envelope capped pageTextChars at the same 30,000, and the 48,000-char turn budget sat ~12K underused; the extractor's originalChars count was dropped when collectPageContext flattened extraction metadata.
- Fix: full-depth page text now 40,000 chars end to end (content.js, sidepanel.js, contextCharLimit full, pageTextChars); originalChars survives into the envelope; extractor truncation is recorded in source_receipt.truncation.sources["browser.page_text_extractor"] and shown as "Page text truncated: N chars omitted" in the What Hermes saw receipt; browserContextPayloadHash page-text clamp now tracks contextCharLimit(depth) so a 40K delivered page can no longer collide into a stale reference delivery.
- Tests: two new regression tests in tests/browser-context-protocol.test.mjs (budget use + receipt visibility); suite 5643 pass / 0 fail, check:js, check:contexts, check:content-runtime all green. The review-queue "simultaneous processes" test remains flaky both with and without this change (interleaved A/B confirmed; already noted as unrelated above).

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

### Phase 2: conversation and composer (`extension/calm-chat.css`)

- Assistant replies have no bubble or role label; user messages are compact right-aligned bubbles; markdown uses the UI font with compact code blocks (language header, copy on hover) and tables; tool activity is one muted expandable line; message actions show on hover.
- Composer is one rounded box: autogrowing textarea plus one tool row (attach, `/` commands, model chip, context ring, mic, send/stop). The separate "Ask Hermes" row is gone; suggestion chips fill the empty state; Esc stops a run, ↑ on an empty composer edits the last message.

### Phase 2: settings (`extension/calm-settings.css`)

- Settings home is a searchable list: the search indexes every pane's DOM ("Pane › Setting", ↑/↓/Enter, jumps to and highlights the row, opens collapsed groups). Hero card and Nous strips removed; version and updates live in About.
- Sticky footer Save (enabled only with unsaved changes); "Test connection" moved into Connections; per-pane collapsed "Advanced" groups; long hints clamp to one line with "Learn more"; switches instead of bordered checkbox cards; appearance order is theme, response style, layout, zoom, language, font.

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

### Integration (coordinator)

- Merged the four phase-2 branches; resolved the onboarding/settings overlap (setup re-run row removed, startup and settings test-button labels both kept).
- Fixed a duplicated `ui.explain.selection` key that broke `web-ext lint` (JSON_DUPLICATE_KEY in every locale) and restored translations that the casing pass had replaced with English; product names and German nouns keep their capitals; dropped two dead hero-card keys.
- Startup step label "Gateway transport" is now "Hermes connection".
- One-time `migrateToCalmAppearance` (lib/appearance-themes.mjs) moves existing installs to Calm + system font; `tests/calm-migration.test.mjs`.
- Final state: 5645/5645 unit tests, `check:js` and i18n checks pass, `web-ext lint` on `dist/firefox` 0 errors. Screenshots: `temp/shots/final1` (Chromium harness; Firefox visual QA is issue #8).

### How to test (owner)

- `git checkout ui/tame-revamp && npm ci && npm run build:firefox`, then load `dist/firefox/manifest.json` from about:debugging → This Firefox → Load Temporary Add-on.
- Existing settings carry over. A one-time migration (`calmUiMigration`, persisted through the packed settings writer) switches an existing install to the Calm theme and replaces the Hermes signature/legacy display font with the system font; colour mode and other choices stay.
