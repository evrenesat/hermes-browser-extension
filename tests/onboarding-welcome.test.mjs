import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../extension/sidepanel.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../extension/calm-onboarding.css', import.meta.url), 'utf8');

test('the panel opens first-run setup on the welcome and follows the browser language until one is chosen', () => {
  const start = js.indexOf('function openOnboarding(');
  const body = js.slice(start, js.indexOf('\n}\n', start));
  assert.match(body, /flow\.open\(\{ includeConnect, welcome: true \}\)/);
  assert.match(body, /!explicitLocaleStored/);
  assert.match(body, /browserLanguageSuggestion\(\)/);
});

test('the welcome is a small icon, a plain heading and two buttons, with no art', () => {
  assert.match(css, /\.onboarding-logo \{[^}]*icon-48\.png/);
  assert.match(css, /\.onboarding-title \{[^}]*font-size: 17px;[^}]*font-weight: 600;/);
  assert.doesNotMatch(css, /greek|dither/i);
});
