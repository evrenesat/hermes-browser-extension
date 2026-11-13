import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { CALM_UI_MIGRATION_VERSION, migrateToCalmAppearance } from '../extension/lib/appearance-themes.mjs';

test('an existing install with the old theme and display font moves to calm once', () => {
  const { settings, changed } = migrateToCalmAppearance({ appearanceTheme: 'nous', fontProfile: 'signature', colorMode: 'dark' });
  assert.equal(changed, true);
  assert.equal(settings.appearanceTheme, 'calm');
  assert.equal(settings.fontProfile, 'system-sans');
  assert.equal(settings.colorMode, 'dark', 'the colour mode is the user\'s choice and stays');
  assert.equal(settings.calmUiMigration, CALM_UI_MIGRATION_VERSION);
});

test('a deliberate font choice survives and a migrated install is left alone', () => {
  const first = migrateToCalmAppearance({ appearanceTheme: 'ember', fontProfile: 'georgia' });
  assert.equal(first.settings.fontProfile, 'georgia');
  const again = migrateToCalmAppearance({ ...first.settings, appearanceTheme: 'midnight' });
  assert.equal(again.changed, false);
  assert.equal(again.settings.appearanceTheme, 'midnight');
});

test('the side panel applies the migration before reading stored settings and persists it', () => {
  const source = readFileSync(new URL('../extension/sidepanel.js', import.meta.url), 'utf8');
  const at = source.indexOf('migrateToCalmAppearance(stored.hermesBrowserSettings);');
  assert.ok(at > 0);
  assert.ok(at < source.indexOf('migrateConnectionSettings(stored.hermesBrowserSettings'), 'runs before settings are normalized');
  assert.match(source, /if \(migrateConnectionSchema \|\| migrateCalmAppearance \|\|[^\n]*\{\n\s*await setPackedBrowserSettings\(settings\);/, 'persists through the packed settings writer');
});
