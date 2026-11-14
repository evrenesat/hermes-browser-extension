# Calm UI revamp

Status: night 1 (2026-11-12). Owner tests in the morning, then we iterate.

## Problem (from baseline screenshots, `temp/shots/baseline/`)

The panel is built for big touchscreens with a retro-cyberpunk skin. At a
360–460 px desktop sidebar it is hard to use:

- Saturated ink blue everywhere plus background artwork behind text.
- Four competing typefaces: compressed display caps for headings, Courier/mono
  for labels and descriptions, letter-spaced uppercase eyebrows, a variable
  grotesk for body. Markdown `h1/h2` render as huge condensed display type.
- Boxes inside boxes: every message, setting, option and hint has a 1 px
  border; square corners; pixel-art icons.
- Touch-sized controls everywhere; the composer has a context bar
  (`Restricted · N/A | PREVIEW | ATTACHED TAB`), a textarea box with its own
  tool row, then a second row with an icon and a separate `ASK HERMES` button.
- Settings opens on a giant `HERMES BROWSER` hero card and an update panel;
  categories are big cards; each toggle is a bordered card with mono text.
- Session rows show `ID` and `RENAME` pills on every row.
- Quick commands show a large preview card that duplicates the list.

## Principles

1. Content first. Chrome is quiet, neutral and flat; the conversation is the
   only thing with visual weight.
2. Desktop density. Built for a mouse in a narrow sidebar. Touch sizes only
   under `@media (pointer: coarse)`.
3. One typeface for UI (system sans), one for code (system mono). Sentence
   case. No letter-spaced caps, no display fonts in the UI.
4. Borders only where they separate; prefer spacing and subtle surfaces.
5. Progressive disclosure: secondary actions on hover or behind `⋯`,
   explanations as one muted line, not paragraphs.
6. Keep every existing feature reachable. Taming is about presentation,
   hierarchy and defaults, not removing capability.

## Scope (owner, 2026-11-12)

A real redesign, not a reskin: a sane app that respects screen real estate,
usability and discoverability. Structural changes to markup, JS and
information architecture are in scope wherever they help: fewer and merged
controls, maximal vertical space for the conversation, keyboard navigation
everywhere, tooltips that name shortcuts, searchable settings, an "Advanced"
group per settings pane, and errors that offer the one action that fixes them.

## Design tokens (`extension/sidepanel-calm.css`, loaded after all other CSS)

Map these onto the existing `--hermes-*` variables so legacy rules inherit
them, then restyle components directly.

| Token | Dark | Light |
| --- | --- | --- |
| `--calm-bg` | `#1b1b1e` | `#ffffff` |
| `--calm-surface` | `#232327` | `#f6f6f8` |
| `--calm-surface-2` | `#2c2c31` | `#ececf0` |
| `--calm-border` | `#36363c` | `#e1e1e6` |
| `--calm-border-strong` | `#4a4a52` | `#c9c9d1` |
| `--calm-text` | `#e7e7ea` | `#1c1c21` |
| `--calm-muted` | `#9b9ba4` | `#6a6a75` |
| `--calm-accent` | `#7c93ff` | `#3a5ad9` |
| `--calm-accent-fg` | `#0f1020` | `#ffffff` |
| `--calm-accent-soft` | `rgba(124,147,255,.16)` | `rgba(58,90,217,.10)` |
| `--calm-danger` | `#f07b7e` | `#c7353a` |
| `--calm-ok` | `#62c08f` | `#1f8a55` |
| `--calm-warn` | `#e5b45f` | `#a86b00` |

- Font UI: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif`.
- Font mono: `ui-monospace, "SF Mono", Menlo, "JetBrains Mono", Consolas, monospace`.
- Sizes: base 13px / 1.5; small 12px; tiny label 11px (600, muted, sentence
  case); title 15px/600. Markdown: h1 17px, h2 15px, h3 14px, all 600,
  margin-top 1em. Code 12px.
- Radius: 6px controls, 8px cards/inputs/popovers, 12px composer, 999px pills.
- Spacing: 4 / 8 / 12 / 16. Panel gutter 12px.
- Controls (pointer: fine): button 28px, icon button 28×28 with 16px icon,
  input 32px, menu row 28–30px. Coarse pointer: 36/40px.
- Shadow only on popovers/dialogs: `0 8px 28px rgba(0,0,0,.28)` dark,
  `0 8px 24px rgba(20,20,40,.12)` light.
- Focus: `outline: 2px solid var(--calm-accent); outline-offset: 1px` on
  `:focus-visible` only.
- Motion: 120ms ease for hover/background; respect reduced motion.

Buttons: primary = accent bg; secondary = surface-2 bg, no border; ghost =
transparent, hover surface-2. Toggles are real switches (32×18). Checkboxes and
radios use `accent-color`.

## Defaults

- Theme `calm` is the new default (add to `appearance-themes.mjs`), color mode
  `system`, font profile `system-sans`, background artwork off. Other themes
  remain as accent palettes on the same calm structure.
- First run: welcome → Connect. Theme, font, response style and layout picks
  leave onboarding (they stay in Settings → Appearance). Language follows the
  browser and stays changeable in Settings.

## Surfaces

### Top bar (40px)
Session title as a ghost button with chevron on the left (opens sessions),
icon buttons on the right: new chat, open Hermes Web, bot mode (only when
available), settings. No brand logo in the bar. Lucide-style 1.5px line icons
replace pixel icons in UI chrome.

### Conversation
- User message: right-aligned bubble, surface bg, radius 12 (4 on the
  bottom-right), max 85%, no role label. "What Hermes saw" is a small muted
  disclosure under it.
- Assistant message: no bubble, full width, no `HERMES` eyebrow (bot name only
  in group chats, as a small label).
- Markdown in UI font; code blocks surface bg, radius 8, header row with
  language + copy on hover; tables compact (6px 8px cells, header surface).
- Tool activity: one muted line (`› Used 2 tools · 1s`) expanding inline.
- Day dividers: small muted centered text, no rules. Jump-to-latest: small
  round floating button with an arrow.
- Message actions (copy/edit/retry) appear on hover.

### Composer
One rounded container (radius 12, surface bg, border, focus ring on
`:focus-within`): autogrowing textarea (1–8 rows), then a 28px tool row:
`[+] [model ▾]` … `[context ring] [mic] [send]`. Send is a 28px round accent
icon button that becomes Stop during a run. Remove the separate bottom row
(the `ASK HERMES` button and the stray icon) — Enter/send already cover it;
keep any unique action from that row reachable from `+` or the tool row.
The page-context line (tab, preview, attached tab) becomes a single slim
muted line above the composer: favicon/title chip, then small text toggles.

### Menus and popovers (model picker, attach, quick commands, sessions)
Surface bg, border, radius 8, shadow, 4px padding, 28px rows, sans font,
hover surface-2, selected = accent-soft + accent text, section labels 11px
muted. Model picker: provider tabs become a compact select or chips that wrap
(no horizontal clipping); options (thinking/fast/effort) as one compact block.
Quick commands: drop the big preview card; list rows `/cmd  description`, the
description muted and truncated. Sessions: 30px rows, title + muted relative
time, ID/rename/delete behind a hover `⋯` menu; Recents/Projects as a small
segmented control.

### Settings
Full-panel view: header row `← Settings` / category title, close X; Save as a
sticky footer primary button that is enabled only when there are unsaved
changes (live settings stay live). Category home: a plain list (icon, title,
one-line muted description, chevron). Remove the hero card; extension version
and updates live in About. Inside a pane: grouped sections with a 13px/600
heading, rows with label (+ one muted line) on the left and the control on the
right; switches instead of bordered checkbox cards; no mono text outside code
and IDs.

### Dialogs, toasts, startup/error screens
Centered compact card, radius 12, no artwork, plain heading + one line +
primary/secondary buttons. Errors use danger text and a small icon, not
full-screen art.

## Work plan

1. Foundation: tokens, calm theme default, fonts, icons, base controls, top
   bar, test contract updates.
2. In parallel: conversation + composer; menus + sessions; settings;
   onboarding + dialogs + startup/error screens.
3. Review against screenshots at 360/460 in light and dark, fix, repeat.

## Verification

- `npm test`, `npm run check:js`, `npm run lint` pass (intentional contract
  changes update their tests in the same commit).
- `node temp/harness/capture.mjs temp/shots/<name>` and visual review of every
  state at 360 and 460, light and dark.
- Firefox build (`npm run build:firefox`) loads; owner checks on macOS Firefox.
