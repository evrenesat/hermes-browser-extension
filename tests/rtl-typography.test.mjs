// Right-to-left (Arabic): nothing in the panel spaces letters apart or forces
// capitals, and the first-screen intro banner is mirrored with the real artwork's
// right-aligned variant, with nothing overlapping.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseHTML } from 'linkedom';

import { RTL_BLOCK_END, RTL_BLOCK_START, RTL_DECLARATIONS, rtlSelector, trackedSelectors } from './helpers/rtl-tracking.mjs';
import { PANEL_STYLESHEETS, expectedBlock, withoutRtlBlock } from './helpers/write-rtl-tracking.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const css = read('extension/sidepanel.css');
const html = read('extension/sidepanel.html');

test('the right-aligned wordmark is the same artwork with only the shorter line moved', () => {
  const left = read('extension/assets/img/hermes-browser-logo-left.svg');
  const right = read('extension/assets/img/hermes-browser-logo-right.svg');
  const paths = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(paths(right).length, 14);
  assert.deepEqual(paths(right), paths(left), 'not one path was redrawn');
  assert.match(left, /<g id="HERMES">/);
  assert.match(right, /<g id="HERMES" transform="translate\(323\.87 0\)">/);
  assert.match(right, /<g id="BROWSER">/);
  assert.match(right, /viewBox="0 0 2918\.77 1206\.98"/);
  assert.match(right, /<svg id="Layer_1"/, 'the same #Layer_1 convention');
  assert.doesNotMatch(right, /fill=/, 'no fixed fill: the theme tints it through currentColor');
  // 2918.77 (BROWSER) - 2594.90 (HERMES) = 323.87: both lines end flush on the right.
  assert.equal((2918.77 - 2594.90).toFixed(2), '323.87');
});

test('the banner carries both wordmarks and shows the right one for the direction', () => {
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('.release-sidecar'), null, 'Settings no longer shows the wordmark hero');
  // Scoped so it outranks the later `.release-sidecar-wordmark { display: block; }`,
  // which otherwise showed both logos in Settings.
  assert.match(css, /\.hero-card \.hero-wordmark-rtl,\s*\.release-sidecar \.release-sidecar-wordmark-rtl \{ display: none; \}/);
  assert.match(css, /html\[dir="rtl"\] \.hero-wordmark-ltr,\s*html\[dir="rtl"\] \.release-sidecar-wordmark-ltr \{ display: none; \}/);
  assert.match(css, /html\[dir="rtl"\] \.hero-wordmark-rtl,\s*html\[dir="rtl"\] \.release-sidecar-wordmark-rtl \{ display: block; \}/);
});

test('the banner is laid out with logical properties: picture and dismiss on the end side, copy clear of them', () => {
  assert.match(css, /\.hero-dismiss \{[^}]*inset-inline-end: 8px;/s);
  assert.doesNotMatch(css.match(/\.hero-dismiss \{[^}]*\}/s)[0], /\bright:/);
  assert.match(css, /\.hero-badge \{[^}]*inset-inline-end: 10px;/s);
  assert.doesNotMatch(css.match(/\.hero-badge \{[^}]*\}/s)[0], /\bright:/);
  assert.match(css, /\.release-sidecar-badge \{[^}]*inset-inline-end: 10px;/s);
  assert.match(css, /\.hero-copy \{[^}]*max-width: 100%; margin-inline-end: 56px;/s);
  assert.match(css, /\.release-sidecar-copy \{[^}]*max-width: 100%; margin-inline-end: 52px;/s);
  assert.match(css, /\.hero-wordmark \{[^}]*width: min\(205px, 100%\);/s);
  assert.match(css, /linear-gradient\(var\(--hero-fade-dir, 90deg\)/);
  assert.match(css, /html\[dir="rtl"\] \.hero-card,\s*html\[dir="rtl"\] \.release-sidecar \{ --hero-fade-dir: 270deg; \}/, 'the fade runs the other way');
  assert.match(css, /html\[dir="rtl"\] \.hero-copy \.eyebrow,\s*html\[dir="rtl"\] \.release-sidecar-copy \.eyebrow \{ white-space: normal; \}/, 'a longer translated eyebrow wraps instead of being clipped');
});
