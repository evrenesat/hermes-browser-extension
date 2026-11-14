import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../extension/sidepanel.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../extension/sidepanel.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../extension/sidepanel.js', import.meta.url), 'utf8');

const button = (html.match(/<button id="testConnectionButton"[\s\S]*?<\/button>/) || [''])[0];

test('the Settings connection test is a labelled signal button', () => {
  assert.ok(button, 'testConnectionButton not found');
  assert.match(button, /data-icon="cellular-signal-3"/);
  // Connections shows it as a labelled button.
  assert.match(button, /class="settings-connection-test-label"/);
  assert.match(button, /title="/);
});

test('the signal glyph shows the live connection state in theme colours', () => {
  assert.match(js, /function renderTestConnectionSignal\(/);
  assert.match(js, /dataset\.signal = /);
  for (const level of ['strong', 'searching', 'lost', 'none']) {
    assert.match(css, new RegExp(`#testConnectionButton\\[data-signal="${level}"\\]`), `${level} needs a style`);
  }
  assert.match(css, /#testConnectionButton\[data-signal="strong"\][^{]*\{[^}]*var\(--hermes-accent/);
  assert.match(css, /#testConnectionButton\[data-signal="lost"\][^{]*\{[^}]*var\(--hermes-danger/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#testConnectionButton/);
});
