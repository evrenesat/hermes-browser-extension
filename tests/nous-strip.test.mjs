import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (relative) => readFileSync(new URL(`../extension/${relative}`, import.meta.url), 'utf8');
const html = read('sidepanel.html');
const css = read('sidepanel.css');
const document = new JSDOM(html).window.document;
const about = document.getElementById('settingsPane-about');
const home = document.getElementById('settingsCategoryHome');

test('the Nous strip is the supplied three-card artwork, white on transparent, unmodified', () => {
  const file = new URL('../extension/assets/img/nous-boxes.png', import.meta.url);
  assert.ok(existsSync(file), 'nous-boxes.png ships with the extension');
  const png = readFileSync(file);
  assert.equal(png.readUInt32BE(16), 197);
  assert.equal(png.readUInt32BE(20), 78);
  assert.equal(png[25], 6, 'RGBA, so the transparent background can be a mask');
  assert.ok(png.length < 20_000, 'small enough to ship');
  assert.equal(existsSync(new URL('../extension/assets/img/nous-strip-mark.svg', import.meta.url)), false, 'the hand-drawn stand-in is gone');
});

test('Settings no longer carries the Nous strip', () => {
  assert.equal(document.querySelectorAll('.nous-strip').length, 0);
});

test('the strip takes the theme colour like the top-bar wing mark, centred and quiet', () => {
  const rule = css.match(/\.nous-strip\s*\{[^}]*\}/)?.[0] || '';
  assert.match(rule, /background:\s*var\(--hermes-brand-mark,\s*var\(--hermes-fg\)\)/);
  assert.match(rule, /mask:\s*url\("assets\/img\/nous-boxes\.png"\) center/);
  assert.match(rule, /-webkit-mask:\s*url\("assets\/img\/nous-boxes\.png"\)/);
  assert.match(rule, /margin:[^;]*auto/);
  const height = Number(rule.match(/height:\s*(\d+)px/)?.[1]);
  assert.ok(height >= 40 && height <= 56, `strip height ${height}px should stay between 40 and 56`);
  assert.doesNotMatch(css, /nous-strip-mark\.svg/);
});

test('light mode uses its own artwork for the strip, dark mode keeps the original', () => {
  const file = new URL('../extension/assets/img/nous-boxes-light.png', import.meta.url);
  assert.ok(existsSync(file), 'nous-boxes-light.png ships with the extension');
  const png = readFileSync(file);
  assert.equal(png.readUInt32BE(16), 197);
  assert.equal(png[25], 6, 'RGBA, so the transparent background can be a mask');
  assert.ok(png.length < 20_000, 'small enough to ship');
  const light = css.match(/html\[data-hermes-mode="light"\] \.nous-strip\s*\{[^}]*\}/)?.[0] || '';
  assert.match(light, /(?<!-webkit-)mask-image:\s*url\("assets\/img\/nous-boxes-light\.png"\)/);
  assert.match(light, /-webkit-mask-image:\s*url\("assets\/img\/nous-boxes-light\.png"\)/);
  assert.match(css.match(/\.nous-strip\s*\{[^}]*\}/)[0], /nous-boxes\.png/, 'the base rule stays the dark-mode art');
});
