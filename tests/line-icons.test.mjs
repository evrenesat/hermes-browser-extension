import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_COPIED_ICON, CODE_COPY_ICON } from '../extension/lib/markdown-code-copy.mjs';
import { SUBAGENT_STEER_ICON } from '../extension/lib/subagent-stack.mjs';
import { ONBOARDING_ICONS } from '../extension/lib/onboarding-flow.mjs';

// UI chrome icons are Lucide-style line art: 24 viewBox, 16px, no fill, 1.5 round strokes in currentColor.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const svgsIn = (source) => source.match(/<svg\b[\s\S]*?<\/svg>/g) || [];
const PAGES = ['extension/sidepanel.html', 'extension/voice-dictation.html'];

// Wordmarks (role="img") are brand art, not UI icons.
const pageIcons = PAGES.flatMap((path) => svgsIn(read(path))
  .filter((svg) => !/^<svg[^>]*\brole="img"/.test(svg) && /data-icon=/.test(svg))
  .map((svg) => [path, svg]));
const scriptIcons = [
  ...[...read('extension/sidepanel.js').matchAll(/innerHTML = '(<svg[^']*<\/svg>)'/g)].map((match) => ['extension/sidepanel.js', match[1]]),
  ['SUBAGENT_STEER_ICON', SUBAGENT_STEER_ICON],
  ['CODE_COPY_ICON', CODE_COPY_ICON],
  ['CODE_COPIED_ICON', CODE_COPIED_ICON],
  ...Object.entries(ONBOARDING_ICONS).map(([name, svg]) => [`ONBOARDING_ICONS.${name}`, svg]),
];

test('every UI icon is a 16px Lucide-style line glyph named by data-icon', () => {
  assert.ok(pageIcons.length >= 50, `expected the panel and voice icons, found ${pageIcons.length}`);
  for (const [where, svg] of [...pageIcons, ...scriptIcons]) {
    const head = svg.match(/^<svg[^>]*>/)[0];
    for (const attribute of ['viewBox="0 0 24 24"', 'width="16"', 'height="16"', 'fill="none"', 'stroke="currentColor"', 'stroke-width="1.5"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'aria-hidden="true"']) {
      assert.ok(head.includes(attribute), `${where}: ${head} is missing ${attribute}`);
    }
    assert.match(head, /\bdata-icon="[a-z0-9-]+"/, `${where}: data-icon names the glyph`);
  }
});

test('the top bar uses the line icons for new chat, Hermes Web, settings and the session chevron', () => {
  const html = read('extension/sidepanel.html');
  for (const icon of ['square-pen', 'external-link', 'settings-cog', 'chevron-down']) {
    assert.match(html, new RegExp(`<svg[^>]*data-icon="${icon}"`), icon);
  }
  assert.doesNotMatch(html, /<span aria-hidden="true">⌄<\/span>\s*<\/button>\s*<button id="newSessionButton"/);
});

test('the calm layer owns icon stroking and is linked after the legacy stylesheets', () => {
  const css = read('extension/sidepanel-calm.css');
  assert.match(css, /svg\[data-icon\]\s*\{[^}]*fill:\s*none\s*!important/);
  for (const page of ['extension/sidepanel.html', 'extension/voice-dictation.html', 'extension/request-permissions.html']) {
    const source = read(page);
    assert.match(source, /<link rel="stylesheet" href="lib\/pixel-icons\.css" \/>|<link rel="stylesheet" href="sidepanel-calm\.css" \/>/, page);
  }
  const html = read('extension/sidepanel.html');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.indexOf('sidepanel-calm.css') > links.indexOf('sidepanel.css'), 'the calm layer follows the legacy stylesheet');
  assert.match(links.at(-1), /^(sidepanel-calm|calm-[a-z]+)\.css$/, 'only calm layers are linked after the legacy ones');
});
