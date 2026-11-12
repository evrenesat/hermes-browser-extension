import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsSaveHarness } from './helpers/settings-save-harness.mjs';

const css = readFileSync(new URL('../extension/sidepanel.css', import.meta.url), 'utf8');

// The real renderSessionMenu with the real drawer markup; only what feeds it sessions is stubbed.
async function drawer(sessions, { canMove = true } = {}) {
  const h = await createSettingsSaveHarness({ settings: { sessionId: 'a1' } });
  const scope = h.scope;
  scope.availableSessions = sessions;
  scope.liveDiscoveredSessions = [];
  scope.liveSessionRows = new Map();
  scope.liveSessionRosterScope = '';
  scope.liveAttach = null;
  scope.localSessionStream = null;
  scope.activeRunControl = null;
  scope.activeGroupProjection = null;
  scope.getLocale = () => 'en';
  scope.sessionRowMenuState = null;
  scope.openSessionGroups = new Set(['Recent']);
  scope.closedSessionGroups = new Set();
  scope.scheduleLiveSessionPoll = () => {};
  scope.syncSessionMenuChrome = () => {};
  scope.projectsTabActive = () => false;
  scope.sessionMenuGroups = () => [{ label: 'Recent', source: 'hermes_api', sessions }];
  scope.shouldAutoOpenSessionGroup = () => false;
  scope.getProjectsController = () => ({ availability: () => ({ available: canMove }) });
  scope.currentSubagentItems = () => [];
  scope.liveSessionScopeKey = () => 'scope';
  scope.isSessionRenameEditorTarget = () => false;
  scope.mergeLiveSignals = () => ({ state: 'idle', live: false, label: '' });
  scope.translateUiText = (text) => text;
  scope.t = (key, params = {}) => (key === 'session.row_model' ? `Model: ${params.model}` : key === 'ui.messages' ? 'Messages' : key);
  scope.friendlyModelName = (id) => `friendly(${id})`;
  scope.safeActiveProfile = () => '';
  h.fn('renderSessionMenu')('');
  return h;
}

const rows = (h) => [...h.els.sessionMenuList.querySelectorAll('.session-option-row')];

test('a drawer row has the title and one actions trigger, and no model column', async () => {
  const h = await drawer([
    { id: 'a1', title: 'Fix the login bug', rawModelId: 'claude-haiku-4-5', messageCount: 12, selected: false },
    { id: 'b2', title: 'Plan the launch', model: 'gpt-5', selected: false },
  ]);
  const [first, second] = rows(h);
  for (const row of [first, second]) {
    const button = row.querySelector('.session-option');
    assert.equal(button.querySelector('.session-option-name').textContent.length > 0, true);
    assert.equal(row.querySelectorAll('.session-action-button').length, 0, 'ID, Rename and Move are behind the trigger, not on the row');
    assert.equal(row.querySelectorAll('.session-actions-trigger').length, 1);
  }
  assert.ok(!first.textContent.includes('friendly('), 'the model name is not drawn in the row');
});

test('the actions trigger opens a menu with ID, Rename and Move', async () => {
  const h = await drawer([{ id: 'a1', title: 'Fix the login bug', selected: false }]);
  const [row] = rows(h);
  const trigger = row.querySelector('.session-actions-trigger');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'menu');
  trigger.click();
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  const items = [...h.document.querySelectorAll('.session-row-menu [role="menuitem"]')].map((node) => node.textContent);
  assert.deepEqual(items, ['Copy session ID', 'Rename', 'projects.move.action']);
});

test('Move only appears where the gateway offers it', async () => {
  const h = await drawer([{ id: 'a1', title: 'Fix the login bug', selected: true }], { canMove: false });
  h.document.querySelector('.session-actions-trigger').click();
  const items = [...h.document.querySelectorAll('.session-row-menu [role="menuitem"]')].map((node) => node.textContent);
  assert.deepEqual(items, ['Copy session ID', 'Rename']);
});

test('the model and message count are in the row tooltip instead', async () => {
  const h = await drawer([
    { id: 'a1', title: 'Fix the login bug', rawModelId: 'claude-haiku-4-5', messageCount: 12, selected: false },
    { id: 'b2', title: 'Plan the launch', selected: false },
  ]);
  const [first, second] = rows(h);
  assert.equal(first.querySelector('.session-option').title, 'Fix the login bug\nModel: friendly(claude-haiku-4-5)\nMessages: 12');
  assert.equal(second.querySelector('.session-option').title, 'Plan the launch');
});

test('rows are grouped under Today, Yesterday and Earlier with a muted relative time', async () => {
  const now = Math.floor(Date.now() / 1000);
  const h = await drawer([
    { id: 'a1', title: 'Just now', lastActive: now - 600, selected: false },
    { id: 'b2', title: 'Long ago', lastActive: now - 10 * 86400, selected: false },
  ]);
  const labels = [...h.els.sessionMenuList.querySelectorAll('.session-date-label')].map((node) => node.textContent);
  assert.equal(labels[0], 'Today');
  assert.equal(labels.at(-1), 'Earlier');
  assert.equal(rows(h)[0].querySelector('.session-option-meta').textContent, '10m');
});

test('long titles ellipsize and the row keeps one 30px line', () => {
  const calm = readFileSync(new URL('../extension/calm-menus.css', import.meta.url), 'utf8');
  assert.match(css, /\.session-option-name \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  assert.match(calm, /\.session-option-name \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  const row = calm.match(/\.session-menu-list \.session-option-row:not\(\.renaming\) \{([^}]*)\}/)?.[1] || '';
  assert.match(row, /flex-wrap: nowrap;/);
  assert.match(row, /min-height: 30px;/);
});
