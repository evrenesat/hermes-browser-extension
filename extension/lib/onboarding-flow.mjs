// First-run setup: a welcome screen (not a step: no count, no Back), then
// Connect to Hermes. Language follows the browser, and theme, font, response
// style and layout live in Settings > Appearance. The flow fills the side
// panel as a quiet centred card; Connect shows the pairing status and, while a
// gateway approval is pending, the approval page.
// DOM only through the host and document passed in; no storage here.

import { escapeHtml } from './common.mjs';

export const ONBOARDING_STEPS = Object.freeze(['connect']);

// Inline check of the address typed in the Connect step. Returns '' when it
// is usable (empty means "use the default"), else the i18n key of the error.
export function gatewayAddressError(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`); } catch { return 'onboarding.connect.url_invalid'; }
  if (!/^https?:$/.test(url.protocol)) return 'onboarding.connect.url_scheme';
  return url.hostname ? '' : 'onboarding.connect.url_invalid';
}

export function onboardingSteps({ includeConnect = true } = {}) {
  return includeConnect ? [...ONBOARDING_STEPS] : [];
}

// Unmodified pixelarticons glyphs (tests/pixel-icons.test.mjs checks them).
export const ONBOARDING_ICONS = Object.freeze({
  light: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  dark: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  system: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="monitor"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
  connect: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="plug"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="arrow-left"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  connected: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="check"><path d="M20 6 9 17l-5-5"/></svg>',
});


const CONNECTED_FINISH_MS = 1400;
const EXIT_MS = 140;

export function createOnboardingFlow({
  host,
  translate = (key) => key,
  getState = () => ({}),
  onConnect = () => {},
  onManualSetup = () => {},
  onFinish = () => {},
  onReveal = () => {},
  onExited = () => {},
  reducedMotion = () => Boolean(host?.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  wait = (ms) => new Promise((resolve) => (host?.ownerDocument?.defaultView || globalThis).setTimeout(resolve, ms)),
} = {}) {
  const doc = host?.ownerDocument;
  let steps = onboardingSteps();
  let stepIndex = 0;
  let open = false;
  let exiting = false;
  // The welcome before the first step. It is not one of `steps`: no count, and
  // Back never returns to it.
  let welcoming = false;
  let parts = null;
  let wasConnected = false;
  let connectedTimer = 0;
  // The pairing approval page, shown in the Connect step while it waits. One
  // element for the whole approval: rebuilding the step would reload it.
  let approvalNode = null;
  // The address being typed survives the redraws a status update causes.
  let typedUrl = null;
  let urlError = '';
  const t = (key, values) => translate(key, values);
  const view = () => doc?.defaultView || globalThis;

  function shellHtml() {
    return `
      <div class="onboarding-card">
        <div class="onboarding-stage" role="group" aria-labelledby="onboardingStepTitle"></div>
        <nav class="onboarding-nav" aria-label="${escapeHtml(t('onboarding.aria'))}">
          <button type="button" class="onboarding-nav-button ghost" data-onboarding-next></button>
        </nav>
      </div>
      <p class="onboarding-announce sr-only" aria-live="polite"></p>`;
  }

  function welcomeView(state) {
    const copy = state.welcome?.copy || {};
    const locale = copy.locale || state.language?.selected || 'en';
    return {
      lang: locale,
      dir: state.welcome?.direction === 'rtl' ? 'rtl' : 'ltr',
      title: copy.title || t('onboarding.welcome.title'),
      body: copy.body || t('onboarding.welcome.body'),
      start: copy.start || t('onboarding.welcome.start'),
      skip: copy.skip || t('onboarding.welcome.skip'),
    };
  }

  function welcomeHtml(state) {
    const v = welcomeView(state);
    const attrs = `lang="${escapeHtml(v.lang)}" dir="${v.dir}"`;
    return `
      <div class="onboarding-welcome">
        <span class="onboarding-logo" role="img" aria-label="${escapeHtml(t('manifest.extension_name'))}"></span>
        <h2 class="onboarding-title" id="onboardingStepTitle" tabindex="-1" ${attrs}>${escapeHtml(v.title)}</h2>
        <p class="onboarding-body" ${attrs}>${escapeHtml(v.body)}</p>
        <div class="onboarding-welcome-actions">
          <button type="button" class="onboarding-welcome-start" data-onboarding-start ${attrs}>${escapeHtml(v.start)}</button>
          <button type="button" class="ghost onboarding-welcome-skip" data-onboarding-skip-setup ${attrs}>${escapeHtml(v.skip)}</button>
        </div>
      </div>`;
  }

  // A failed attempt stays on the Connect step: the reason is the status line
  // and Manual setup is the way on. Nothing here opens Settings by itself.
  function connectFailed(connection) {
    return Boolean(connection.failed) && !connection.connected && !connection.busy;
  }

  function connectHtml(state) {
    const connection = state.connection || {};
    const connected = Boolean(connection.connected);
    const status = connected ? t('onboarding.connect.connected') : (connection.status || t('onboarding.connect.not_paired'));
    return `
      <h2 class="onboarding-title" id="onboardingStepTitle" tabindex="-1">${escapeHtml(t('onboarding.connect.title'))}</h2>
      <p class="onboarding-body">${escapeHtml(t('onboarding.connect.body'))}</p>
      <div class="onboarding-connect${connected ? ' is-connected' : ''}${connection.busy ? ' is-busy' : ''}${connectFailed(connection) ? ' is-failed' : ''}${approvalNode ? ' is-approving' : ''}">
        <div class="onboarding-field"${connected ? ' hidden' : ''}>
          <label for="onboardingGatewayUrl">${escapeHtml(t('onboarding.connect.url_label'))}</label>
          <input id="onboardingGatewayUrl" type="text" inputmode="url" autocomplete="off" spellcheck="false" data-onboarding-url value="${escapeHtml(typedUrl ?? connection.gatewayUrl ?? '')}" placeholder="http://127.0.0.1:8642" aria-describedby="onboardingUrlError"${urlError ? ' aria-invalid="true"' : ''}>
          <p class="onboarding-field-error" id="onboardingUrlError" role="alert"${urlError ? '' : ' hidden'}>${escapeHtml(urlError ? t(urlError) : '')}</p>
        </div>
        ${approvalNode ? '<div class="onboarding-approval-slot"></div>' : ''}
        <div class="onboarding-connect-actions"${connected ? ' hidden' : ''}>
          <button type="button" class="onboarding-connect-button" data-onboarding-connect${connection.busy ? ' disabled' : ''}>${escapeHtml(connection.busy ? (connection.busyLabel || t('ui.connect.to.hermes')) : t('ui.connect.to.hermes'))}</button>
          <button type="button" class="secondary" data-onboarding-manual>${escapeHtml(t('ui.manual.setup'))}</button>
        </div>
        <p class="onboarding-connect-status" role="status" tabindex="-1">${connected ? ONBOARDING_ICONS.connected : ''}<span>${escapeHtml(status)}</span></p>
        <p class="onboarding-connect-other">${escapeHtml(t('onboarding.connect.other_hint'))}</p>
      </div>`;
  }

  function renderNav(step, state) {
    // The welcome has its own buttons; the footer belongs to the Connect step.
    parts.nav.hidden = welcoming || !steps.length;
    if (parts.nav.hidden) return;
    const connected = Boolean(state.connection?.connected);
    const label = connected ? t('onboarding.start') : t('onboarding.connect.later');
    parts.next.textContent = label;
    parts.next.setAttribute('aria-label', label);
  }

  // While the approval page is up, a status update changes the words and the
  // buttons in place; replacing the step would reload the page being read.
  function patchConnectStage(state) {
    const connection = state.connection || {};
    const connected = Boolean(connection.connected);
    const root = parts.stage.querySelector('.onboarding-connect');
    root.classList.toggle('is-connected', connected);
    root.classList.toggle('is-busy', Boolean(connection.busy));
    root.classList.toggle('is-failed', connectFailed(connection));
    const label = parts.stage.querySelector('.onboarding-connect-status span');
    if (label) label.textContent = connected ? t('onboarding.connect.connected') : (connection.status || t('onboarding.connect.not_paired'));
    const actions = parts.stage.querySelector('.onboarding-connect-actions');
    if (actions) actions.hidden = connected;
    const field = parts.stage.querySelector('.onboarding-field');
    if (field) field.hidden = connected;
    const button = parts.stage.querySelector('[data-onboarding-connect]');
    if (button) button.disabled = Boolean(connection.busy);
  }

  function renderStage(step, state) {
    if (welcoming) {
      parts.stage.dataset.step = 'welcome';
      parts.stage.innerHTML = welcomeHtml(state);
      return;
    }
    if (step === 'connect' && approvalNode && parts.stage.dataset.step === 'connect' && parts.stage.contains(approvalNode)) {
      patchConnectStage(state);
      return;
    }
    parts.stage.dataset.step = step || '';
    parts.stage.innerHTML = step === 'connect' ? connectHtml(state) : '';
    if (step === 'connect' && approvalNode) parts.stage.querySelector('.onboarding-approval-slot')?.append(approvalNode);
  }

  function focusKey() {
    const active = doc?.activeElement;
    if (!active || !host.contains(active)) return null;
    // The status line holds the keyboard while Connect works; keep it there when the step is drawn again.
    if (active.classList?.contains('onboarding-connect-status')) return { selector: '.onboarding-connect-status' };
    for (const attribute of ['data-onboarding-url', 'data-onboarding-next', 'data-onboarding-connect', 'data-onboarding-manual', 'data-onboarding-start', 'data-onboarding-skip-setup']) {
      if (active.hasAttribute?.(attribute)) return { attribute };
    }
    return null;
  }

  function restoreFocus(key) {
    if (!key) return;
    const target = host.querySelector(key.selector || `[${key.attribute}]`);
    if (target && !target.disabled && !target.closest?.('[hidden]')) {
      target.focus?.({ preventScroll: true });
      return;
    }
    // The control that had the keyboard went away or was disabled (Connect while
    // it works, the buttons once connected). The keyboard moves to the status
    // line, still inside this dialog.
    (host.querySelector('.onboarding-connect-status') || host.querySelector('.onboarding-title'))?.focus?.({ preventScroll: true });
  }

  function syncConnection(state) {
    const connected = Boolean(state.connection?.connected);
    const onConnectStep = steps[stepIndex] === 'connect';
    if (connected && !wasConnected && onConnectStep && open && !exiting) {
      view().clearTimeout?.(connectedTimer);
      connectedTimer = view().setTimeout?.(() => { if (open && !exiting && steps[stepIndex] === 'connect') finish('connected'); }, CONNECTED_FINISH_MS);
    }
    wasConnected = connected;
  }

  function render() {
    if (!host) return;
    if (!open) {
      if (!exiting) {
        host.hidden = true;
        host.innerHTML = '';
        parts = null;
      }
      return;
    }
    host.hidden = false;
    const state = getState() || {};
    const keep = focusKey();
    if (!parts) {
      host.innerHTML = shellHtml();
      parts = {
        stage: host.querySelector('.onboarding-stage'),
        nav: host.querySelector('.onboarding-nav'),
        next: host.querySelector('[data-onboarding-next]'),
        announce: host.querySelector('.onboarding-announce'),
      };
    }
    const step = steps[stepIndex];
    host.dataset.step = welcoming ? 'welcome' : (step || '');
    host.classList.toggle('is-approving', Boolean(approvalNode) && step === 'connect');
    renderStage(step, state);
    renderNav(step, state);
    restoreFocus(keep);
    syncConnection(state);
  }

  function announce() {
    if (!parts) return;
    parts.announce.textContent = welcoming ? welcomeView(getState() || {}).title : t(`onboarding.${steps[stepIndex]}.title`);
  }

  function focusTitle() {
    // The welcome puts the keyboard on its one primary action.
    if (welcoming) {
      host?.querySelector('[data-onboarding-start]')?.focus({ preventScroll: true });
      return;
    }
    host?.querySelector('.onboarding-title')?.focus({ preventScroll: true });
  }

  // Welcome to Connect. A panel that is already paired has no step left, so
  // the welcome's primary button finishes setup there.
  function startFromWelcome() {
    if (!welcoming) return;
    if (!steps.length) return void finish('done');
    welcoming = false;
    render();
    announce();
    focusTitle();
  }

  // The way out: setup closes and the panel's own chrome comes in (onReveal).
  async function finish(reason) {
    if (!open || exiting) return;
    view().clearTimeout?.(connectedTimer);
    welcoming = false;
    open = false;
    exiting = true;
    host.classList.add('is-exiting');
    onFinish({ reason });
    onReveal({ reason });
    await wait(reducedMotion() ? 0 : EXIT_MS);
    exiting = false;
    host.classList.remove('is-exiting');
    render();
    onExited({ reason });
  }

  function next() {
    if (welcoming) return startFromWelcome();
    void finish(steps[stepIndex] === 'connect' && !getState()?.connection?.connected ? 'later' : 'done');
  }

  function connectNow() {
    const input = host.querySelector('[data-onboarding-url]');
    const value = input ? input.value : '';
    urlError = gatewayAddressError(value);
    typedUrl = value;
    if (urlError) {
      render();
      host.querySelector('[data-onboarding-url]')?.focus?.({ preventScroll: true });
      return undefined;
    }
    return onConnect({ gatewayUrl: String(value || '').trim() });
  }

  host?.addEventListener('input', (event) => {
    if (!event.target?.hasAttribute?.('data-onboarding-url')) return;
    typedUrl = event.target.value;
    if (urlError) {
      urlError = '';
      const note = host.querySelector('.onboarding-field-error');
      if (note) note.hidden = true;
      event.target.removeAttribute('aria-invalid');
    }
  });

  host?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && open && !exiting && event.target?.hasAttribute?.('data-onboarding-url')) {
      event.preventDefault();
      connectNow();
    }
  });

  host?.addEventListener('click', (event) => {
    const target = event.target?.closest?.('button');
    if (!open || exiting || !target || !host.contains(target)) return;
    if (target.hasAttribute('data-onboarding-start')) return startFromWelcome();
    if (target.hasAttribute('data-onboarding-skip-setup')) return void finish('skip');
    if (target.hasAttribute('data-onboarding-connect')) return connectNow();
    if (target.hasAttribute('data-onboarding-manual')) return onManualSetup();
    if (target.hasAttribute('data-onboarding-next')) return next();
    return undefined;
  });

  // Tab stays inside the screen while it is up.
  host?.addEventListener('keydown', (event) => {
    if (!open || exiting) return;
    if (event.key !== 'Tab') return;
    const target = event.target;
    const focusable = [...host.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((node) => node.tabIndex >= 0 && !node.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (target === first || !host.contains(target))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && target === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return {
    get isOpen() { return open; },
    get isExiting() { return exiting; },
    get step() { return welcoming ? 'welcome' : steps[stepIndex]; },
    get welcoming() { return welcoming; },
    get steps() { return [...steps]; },
    open({ step = 'connect', includeConnect = true, welcome = false } = {}) {
      steps = onboardingSteps({ includeConnect });
      stepIndex = Math.max(0, steps.indexOf(step));
      typedUrl = null;
      urlError = '';
      welcoming = Boolean(welcome) || !steps.length;
      open = true;
      exiting = false;
      wasConnected = Boolean(getState()?.connection?.connected);
      render();
      announce();
      focusTitle();
    },
    close() {
      view().clearTimeout?.(connectedTimer);
      open = false;
      exiting = false;
      render();
    },
    // Show the pairing approval page in the Connect step (a node), or take it
    // away (null). Returns whether the step is on screen to hold it.
    setApproval(node = null) {
      approvalNode = node || null;
      if (!open || !parts) return false;
      if (!approvalNode && parts.stage.dataset.step === 'connect') parts.stage.dataset.step = '';
      render();
      return Boolean(approvalNode) && steps[stepIndex] === 'connect' && parts.stage.contains(approvalNode);
    },
    finish,
    render,
  };
}
