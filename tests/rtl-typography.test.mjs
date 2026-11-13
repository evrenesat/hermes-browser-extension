// Right-to-left (Arabic): nothing in the panel spaces letters apart or forces
// capitals.

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

test('the intro banner is laid out with logical properties: picture and dismiss on the end side, copy clear of them', () => {
  assert.match(css, /\.hero-dismiss \{[^}]*inset-inline-end: 8px;/s);
  assert.doesNotMatch(css.match(/\.hero-dismiss \{[^}]*\}/s)[0], /\bright:/);
  assert.match(css, /\.hero-badge \{[^}]*inset-inline-end: 10px;/s);
  assert.doesNotMatch(css.match(/\.hero-badge \{[^}]*\}/s)[0], /\bright:/);
  assert.match(css, /\.hero-copy \{[^}]*max-width: 100%; margin-inline-end: 56px;/s);
  assert.match(css, /\.hero-wordmark \{[^}]*width: min\(205px, 100%\);/s);
  assert.match(css, /linear-gradient\(var\(--hero-fade-dir, 90deg\)/);
});
