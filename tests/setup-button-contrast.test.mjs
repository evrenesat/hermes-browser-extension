// Readability of the setup's buttons, computed from each built-in theme's own
// tokens: the primary (Get started, Connect to Hermes) and the quiet secondary
// (Skip setup, Manual setup, Skip). Fails the build below WCAG AA (4.5:1).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { centeringOffsets, withinTolerance } from './helpers/label-centering.mjs';
import { color, contrast, paletteFor, resolveToken, rules } from './helpers/theme-palette.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const sidepanelCss = read('extension/sidepanel.css');
const BUNDLE = [sidepanelCss, read('extension/sidepanel-themes.css'), read('extension/context-menu-editor.css')];
const THEMES = ['nous', 'midnight', 'ember', 'mono', 'cyberpunk', 'slate', 'senter-space', 'aurora', 'solstice', 'everforest', 'classic', 'anti-nous'];

function palette(theme, mode) {
  const tokens = paletteFor(BUNDLE, theme, mode);
  const get = (name) => color(resolveToken(tokens, name));
  const paper = get('--hermes-paper');
  const ink = get('--hermes-ink');
  return {
    paper,
    ink,
    primaryBg: get('--hermes-primary-bg') ?? ink,
    primaryFg: get('--hermes-primary-fg') ?? paper,
    fg: get('--hermes-fg'),
    appBg: get('--hermes-app-bg') ?? paper,
  };
}

// The setup draws on the panel's background in dark modes and on paper in
// light ones; its text colour is --hermes-fg and --hermes-ink respectively.
function secondaryPair(theme, mode) {
  const p = palette(theme, mode);
  return mode === 'light' ? { text: p.ink, ground: p.paper } : { text: p.fg, ground: p.appBg };
}

test('the primary setup button holds 4.5:1 in every built-in theme, light and dark', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      const p = palette(theme, mode);
      assert.ok(p.primaryBg && p.primaryFg, `${theme}/${mode} defines a primary pair`);
      const rest = contrast(p.primaryFg, p.primaryBg);
      assert.ok(rest >= 4.5, `${theme}/${mode}: primary label ${rest.toFixed(2)}:1 is below AA`);
    }
  }
});

test('the quiet secondary setup button holds 4.5:1 in every built-in theme', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      const { text, ground } = secondaryPair(theme, mode);
      assert.ok(text && ground, `${theme}/${mode} defines the setup's text and ground`);
      const rest = contrast(text, ground);
      assert.ok(rest >= 4.5, `${theme}/${mode}: secondary label ${rest.toFixed(2)}:1 is below AA`);
    }
  }
});

const SETUP_BUTTONS = '.onboarding-welcome-start, .onboarding-connect-button, .onboarding-welcome-skip, [data-onboarding-manual], .onboarding-skip';

test('the centering arithmetic: an even label is within a pixel, a high one is not', () => {
  const button = { top: 0, bottom: 44, left: 0, right: 300 };
  assert.ok(withinTolerance(centeringOffsets(button, { top: 14, bottom: 30, left: 100, right: 200 })));
  const high = centeringOffsets(button, { top: 11, bottom: 26, left: 100, right: 200 });
  assert.equal(high.vertical, -7);
  assert.ok(!withinTolerance(high));
});
