import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';

import {
  MESSAGE_LAYOUT_DEFAULT,
  RESPONSE_STYLE_DEFAULT,
  normalizeMessageLayout,
  normalizeResponseStyle,
  responsePresentationFromSettings,
  responseStyleInstructions,
  shouldShowOnboarding,
  withResponsePresentationUpdate,
} from '../extension/lib/response-presentation.mjs';
import { ONBOARDING_STEPS, createOnboardingFlow, gatewayAddressError, onboardingSteps } from '../extension/lib/onboarding-flow.mjs';

function click(element, window) {
  element.dispatchEvent(new window.Event('click', { bubbles: true }));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountFlow(overrides = {}) {
  const { document, window } = parseHTML('<!doctype html><html><body><section id="host" hidden></section></body></html>');
  const host = document.getElementById('host');
  const state = { connection: { connected: false, status: '', gatewayUrl: 'http://127.0.0.1:8642' } };
  const calls = [];
  const flow = createOnboardingFlow({
    host,
    translate: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key),
    getState: () => state,
    onConnect: (detail) => calls.push(['connect', detail.gatewayUrl]),
    onManualSetup: () => calls.push(['manual']),
    onFinish: (detail) => calls.push(['finish', detail.reason]),
    onReveal: (detail) => calls.push(['reveal', detail.reason]),
    onExited: (detail) => calls.push(['exited', detail.reason]),
    reducedMotion: () => true,
    wait: () => Promise.resolve(),
    ...overrides,
  });
  return { document, window, host, flow, state, calls };
}

test('presentation preferences normalize and keep other settings', () => {
  assert.equal(RESPONSE_STYLE_DEFAULT, 'rich');
  assert.equal(MESSAGE_LAYOUT_DEFAULT, 'bubbles');
  assert.equal(normalizeResponseStyle('VIVID'), 'vivid');
  assert.equal(normalizeResponseStyle('markdown'), 'rich');
  assert.equal(normalizeMessageLayout('user-bubble'), 'user-bubble');
  assert.equal(normalizeMessageLayout('left'), 'bubbles');
  assert.deepEqual(responsePresentationFromSettings({}), { responseStyle: 'rich', messageLayout: 'bubbles' });
  const next = withResponsePresentationUpdate({ appearanceTheme: 'mono', responseStyle: 'rich' }, { responseStyle: 'plain' });
  assert.deepEqual(next, { appearanceTheme: 'mono', responseStyle: 'plain' });
  assert.equal(withResponsePresentationUpdate({}, { messageLayout: '<script>' }).messageLayout, 'bubbles');
});

test('setup shows once for a new user only', () => {
  assert.equal(shouldShowOnboarding({}), true);
  assert.equal(shouldShowOnboarding({ completed: true }), false);
  assert.equal(shouldShowOnboarding({ legacyIntroSeen: true }), false, 'an existing user who used the panel skips it');
  assert.equal(shouldShowOnboarding({ messageCount: 2 }), false);
  assert.equal(shouldShowOnboarding({ completed: true, forced: true }), true, 'Settings can run it again');
});

test('response style system notes: rich and vivid add nothing (Vivid rides in each turn), plain asks for no Markdown', () => {
  assert.equal(responseStyleInstructions('rich'), '');
  assert.equal(responseStyleInstructions('vivid'), '', 'a session prompt saved under Vivid could not follow a later switch');
  assert.match(responseStyleInstructions('plain'), /no Markdown/);
});


test('first run is a welcome and Connect only: no theme, font, style, layout or language step', () => {
  assert.deepEqual(ONBOARDING_STEPS, ['connect']);
  assert.deepEqual(onboardingSteps({ includeConnect: false }), []);
  const { host, flow } = mountFlow();
  flow.open({ welcome: true });
  assert.equal(flow.step, 'welcome');
  assert.ok(host.querySelector('.onboarding-logo'), 'a small app icon');
  assert.equal(host.querySelector('.onboarding-title').textContent, 'onboarding.welcome.title');
  assert.equal(host.querySelectorAll('.onboarding-welcome button').length, 2, 'Connect to Hermes and Skip for now');
  for (const gone of ['[data-onboarding-theme]', '[data-onboarding-font]', '[data-onboarding-style]', '[data-onboarding-layout]', '[data-onboarding-language]', '.onboarding-greeting']) {
    assert.equal(host.querySelector(gone), null, gone);
  }
});

test('the welcome primary goes to Connect, and Skip finishes setup', async () => {
  const a = mountFlow();
  a.flow.open({ welcome: true });
  click(a.host.querySelector('[data-onboarding-start]'), a.window);
  assert.equal(a.flow.step, 'connect');
  assert.ok(a.host.querySelector('[data-onboarding-url]'));
  const b = mountFlow();
  b.flow.open({ welcome: true });
  click(b.host.querySelector('[data-onboarding-skip-setup]'), b.window);
  await settle();
  assert.deepEqual(b.calls.at(0), ['finish', 'skip']);
});

test('an already paired panel has nothing but the welcome, and its primary finishes', async () => {
  const { host, flow, calls, window } = mountFlow();
  flow.open({ includeConnect: false, welcome: true });
  assert.equal(flow.step, 'welcome');
  click(host.querySelector('[data-onboarding-start]'), window);
  await settle();
  assert.deepEqual(calls.at(0), ['finish', 'done']);
});

test('gateway address validation: empty means default, bad addresses name the problem', () => {
  assert.equal(gatewayAddressError(''), '');
  assert.equal(gatewayAddressError('127.0.0.1:8642'), '');
  assert.equal(gatewayAddressError('https://hermes.example.com'), '');
  assert.equal(gatewayAddressError('ftp://host'), 'onboarding.connect.url_scheme');
  assert.equal(gatewayAddressError('http://'), 'onboarding.connect.url_invalid');
  assert.equal(gatewayAddressError('not a url'), 'onboarding.connect.url_invalid');
});

test('Connect prefills the saved address, validates inline and only calls out when valid', () => {
  const { host, flow, calls, window } = mountFlow();
  flow.open({ step: 'connect' });
  const input = host.querySelector('[data-onboarding-url]');
  assert.equal(input.value, 'http://127.0.0.1:8642');
  input.value = 'ftp://nope';
  click(host.querySelector('[data-onboarding-connect]'), window);
  assert.deepEqual(calls.filter((call) => call[0] === 'connect'), []);
  assert.equal(host.querySelector('[data-onboarding-url]').getAttribute('aria-invalid'), 'true');
  assert.equal(host.querySelector('.onboarding-field-error').textContent, 'onboarding.connect.url_scheme');
  assert.equal(host.querySelector('[data-onboarding-url]').value, 'ftp://nope', 'the typed text survives the redraw');
  const fixed = host.querySelector('[data-onboarding-url]');
  fixed.value = 'http://10.0.0.5:8642';
  fixed.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(host.querySelector('.onboarding-field-error').hidden, true);
  click(host.querySelector('[data-onboarding-connect]'), window);
  assert.deepEqual(calls.filter((call) => call[0] === 'connect'), [['connect', 'http://10.0.0.5:8642']]);
});

test('connecting shows busy, then connected and lets the user straight in', async () => {
  const { host, flow, calls, state, window } = mountFlow();
  flow.open({ step: 'connect' });
  state.connection = { connected: false, busy: true, busyLabel: 'Connecting...' };
  flow.render();
  assert.ok(host.querySelector('[data-onboarding-connect]').hasAttribute('disabled'));
  state.connection = { connected: true };
  flow.render();
  assert.ok(host.querySelector('.onboarding-connect.is-connected'));
  assert.equal(host.querySelector('[data-onboarding-next]').getAttribute('aria-label'), 'onboarding.start');
  click(host.querySelector('[data-onboarding-next]'), window);
  await settle();
  assert.deepEqual(calls.at(0), ['finish', 'done']);
});

test('Connect later finishes without a connection', async () => {
  const { host, flow, calls, window } = mountFlow();
  flow.open({ step: 'connect' });
  click(host.querySelector('[data-onboarding-next]'), window);
  await settle();
  assert.deepEqual(calls.slice(-3), [['finish', 'later'], ['reveal', 'later'], ['exited', 'later']]);
  assert.equal(host.hidden, true);
});

test('a failed Connect stays on the Connect step: the reason shows inline and Manual setup is one press away', () => {
  const { host, flow, state, calls, window } = mountFlow();
  flow.open({ step: 'connect' });
  assert.ok(!host.querySelector('.onboarding-connect.is-failed'), 'no failure before an attempt');
  state.connection = { connected: false, failed: true, status: 'Hermes API server at http://127.0.0.1:8642 did not answer.' };
  flow.render();
  const connect = host.querySelector('.onboarding-connect');
  assert.ok(connect.classList.contains('is-failed'));
  assert.equal(host.querySelector('.onboarding-connect-status span').textContent, 'Hermes API server at http://127.0.0.1:8642 did not answer.', 'the exact reason, not a generic line');
  assert.equal(flow.step, 'connect', 'setup is still where the person is');
  assert.ok(host.querySelector('[data-onboarding-connect]'), 'Connect is there to try again');
  assert.ok(host.querySelector('[data-onboarding-manual]'), 'Manual setup is there');
  assert.deepEqual(calls.filter((call) => call[0] === 'manual'), [], 'nothing opened Settings on its own');
  click(host.querySelector('[data-onboarding-manual]'), window);
  assert.deepEqual(calls.filter((call) => call[0] === 'manual'), [['manual']], 'only the press opens it');
  state.connection = { connected: false, busy: true, failed: true, status: 'Looking for the server...' };
  flow.render();
  assert.ok(!host.querySelector('.onboarding-connect.is-failed'), 'a new attempt clears the failure look');
  state.connection = { connected: true, failed: true };
  flow.render();
  assert.ok(!host.querySelector('.onboarding-connect.is-failed'), 'a connected panel is never shown as failed');
});

test('patching the Connect step in place (while the approval page is up) follows the failure state too', () => {
  const { host, flow, state } = mountFlow();
  flow.open({ step: 'connect' });
  flow.setApproval(host.ownerDocument.createElement('div'));
  const before = host.querySelector('.onboarding-connect');
  state.connection = { connected: false, failed: true, status: 'Reason one.' };
  flow.render();
  assert.equal(host.querySelector('.onboarding-connect'), before, 'patched in place, the approval page was not rebuilt');
  assert.ok(before.classList.contains('is-failed'));
  assert.equal(before.querySelector('.onboarding-connect-status span').textContent, 'Reason one.');
  state.connection = { connected: false, failed: false, status: 'Waiting.' };
  flow.render();
  assert.ok(!before.classList.contains('is-failed'));
});

function sidepanelFunction(name) {
  const js = fs.readFileSync(new URL('../extension/sidepanel.js', import.meta.url), 'utf8');
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return js.slice(start, js.indexOf('\n}\n', start) + 3);
}

test('the panel never opens Settings over setup after a failed Connect, and opens it on its own everywhere else', async () => {
  const vm = await import('node:vm');
  const run = (flowOpen) => {
    const opened = [];
    const renders = [];
    const context = {
      onboardingConnectFailure: '',
      onboardingFlow: { isOpen: flowOpen, render: () => renders.push('render') },
      openSettingsDialog: (arg) => opened.push(arg),
    };
    vm.createContext(context);
    vm.runInContext(sidepanelFunction('offerManualSetup'), context);
    vm.runInContext("offerManualSetup('The reason.')", context);
    return { opened, renders, failure: vm.runInContext('onboardingConnectFailure', context) };
  };
  const inSetup = run(true);
  assert.deepEqual(inSetup.opened, [], 'setup stays on top');
  assert.equal(inSetup.failure, 'The reason.');
  assert.deepEqual(inSetup.renders, ['render'], 'setup redraws with the reason');
  const outside = run(false);
  assert.deepEqual(JSON.parse(JSON.stringify(outside.opened)), [{ pane: 'connections' }], 'the pop-up path still opens Settings > Connections');
  assert.equal(outside.failure, '');
});

test('connectApiWithPairing routes all three manual-setup exits through offerManualSetup and clears an old failure first', () => {
  const connect = sidepanelFunction('connectApiWithPairing');
  assert.doesNotMatch(connect, /openSettingsDialog\(/, 'no exit opens Settings by itself');
  assert.equal((connect.match(/offerManualSetup\(/g) || []).length, 3);
  assert.match(connect, /^function connectApiWithPairing\(\) \{\n {2}onboardingConnectFailure = '';/, 'a new attempt starts without the old reason');
  assert.match(connect, /offerManualSetup\(message\);/, 'the loopback refusal');
  assert.match(connect, /offerManualSetup\(els\.connectStatus\.textContent\);/, 'automatic pairing unavailable');
  assert.match(connect, /offerManualSetup\(currentConnectionTroubleshooting\(\) \|\| diagnostic\.detail\);/, 'the same reason the pop-up shows');
});

test("setup's Connect step is told about a failure and shows the reason, but never for a connected panel", async () => {
  const vm = await import('node:vm');
  const read = (patch) => {
    const context = {
      settings: {},
      els: { connectButton: { disabled: false, textContent: 'Connect to Hermes' }, connectStatus: { textContent: 'The pop-up line.' } },
      onboardingConnectFailure: '',
      ...patch,
      isConnected: () => Boolean(patch.connected),
    };
    vm.createContext(context);
    vm.runInContext(sidepanelFunction('onboardingState'), context);
    return vm.runInContext('onboardingState().connection', context);
  };
  assert.deepEqual({ ...read({}) }, { connected: false, busy: false, busyLabel: 'Connect to Hermes', gatewayUrl: '', status: 'The pop-up line.', failed: false });
  assert.deepEqual({ ...read({ onboardingConnectFailure: 'Why it failed.' }) }, { connected: false, busy: false, busyLabel: 'Connect to Hermes', gatewayUrl: '', status: 'Why it failed.', failed: true });
  assert.equal(read({ onboardingConnectFailure: 'Why it failed.', connected: true }).failed, false);
});
