/* ============================================================
   main.js — boot, routing, and the render loop
   ------------------------------------------------------------
   Loaded by index.html as a module.

   Rendering is deliberately simple: views are pure functions from
   state to an HTML string, and any store change re-renders the current
   screen. At this size that is fast, and it removes the whole class of
   bug where the UI and the data drift apart. The two costs of that
   approach — lost scroll position and lost keyboard focus — are both
   paid back explicitly in render().
   ============================================================ */

import * as store from './store.js';
import { seed } from './seed.js';
import { html, raw, esc, dayKey } from './util.js';
import {
  icon, toast, closeSheet, closeEmergency, isEmergencyOpen,
  openWelcome, closeWelcome, focusKey, refocus, poweredByFlux,
} from './ui.js';
import * as notify from './notify.js';

import * as home     from './views/home.js';
import * as meds     from './views/meds.js';
import * as seizures from './views/seizures.js';
import * as safety   from './views/safety.js';
import * as profile  from './views/profile.js';

/* ============================================================
   Routes
   ============================================================ */

const VIEWS = { home, meds, track: seizures, safety, you: profile };
const ORDER = ['home', 'meds', 'track', 'safety', 'you'];

const TABS = {
  home:   { label: 'Home',     icon: 'home' },
  meds:   { label: 'Meds',     icon: 'pill' },
  track:  { label: 'Seizures', icon: 'chart' },
  safety: { label: 'Safety',   icon: 'shield' },
  you:    { label: 'You',      icon: 'user' },
};

/* #/sos opens the emergency card on top of the Safety tab. It is what
   the home-screen shortcut points at: long-press the app icon, tap
   "Emergency card", and the card is up — no navigation at all. */
const ALIASES = { sos: 'safety' };

let route = 'home';

const el = {
  shell:  document.querySelector('.app-shell'),
  appbar: document.getElementById('appbar'),
  screen: document.getElementById('screen'),
  tabbar: document.getElementById('tabbar'),
};

/* Synara also runs inside Flux (synara.html there), which marks <html>
   with data-host="flux" and supplies its app switcher as a
   [data-flux-hub] node. The switcher keeps its own listeners and
   open/closed state, so it is moved into each freshly rendered app bar
   rather than rebuilt. Standalone, neither exists and nothing changes. */
const HOSTED = document.documentElement.dataset.host === 'flux';
const hostSwitch = document.querySelector('[data-flux-hub]');

function parseHash() {
  const id = (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  if (ALIASES[id]) return { route: ALIASES[id], sos: id === 'sos' };
  return { route: ORDER.includes(id) ? id : 'home', sos: false };
}

export function go(id) {
  if (!ORDER.includes(id)) return;
  if (location.hash === `#/${id}`) return;
  location.hash = `#/${id}`;
}

/* ============================================================
   Theme
   ============================================================ */

/** Reflect the stored theme choice onto <html> and the browser chrome. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');

  // Keep the status bar / title bar colour in step with an explicit
  // choice; with "system" the two media-scoped tags already do it.
  const dark = theme === 'dark' ||
    (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = theme === 'system'
      ? (meta.media.includes('dark') ? '#121019' : '#f6f5fa')
      : (dark ? '#121019' : '#f6f5fa');
  }
}

/* ============================================================
   Render
   ============================================================ */

function brandMark() {
  return '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<path d="M4 18h5l3-8 5 14 3.5-9H28" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/** Doses scheduled today that still have no logged status. */
function countPendingToday(state) {
  const today = dayKey();
  return store.dosesOn(today, state)
    .filter(({ med, time }) => store.doseStatus(today, med.id, time, state) === 'pending')
    .length;
}

function renderTabs(state) {
  const pending = countPendingToday(state);

  el.tabbar.innerHTML = html`
    <div class="sidebar-brand">
      <div class="brand-mark">${raw(brandMark())}</div>
      <div>
        <div class="brand-name">Synara</div>
        <div class="brand-tag">Epilepsy care for school</div>
      </div>
    </div>
    ${raw(ORDER.map((id) => {
      const tab = TABS[id];
      const current = id === route;
      const dot = id === 'meds' && pending > 0;
      const label = dot
        ? `${tab.label}, ${pending} ${pending === 1 ? 'dose' : 'doses'} not logged today`
        : tab.label;
      return `
        <button class="tab" data-action="nav" data-to="${id}"
                ${current ? 'aria-current="page"' : ''} aria-label="${label}">
          <span class="tab-ico">${icon(tab.icon)}</span>
          <span class="tab-label">${tab.label}</span>
          ${dot ? '<span class="tab-dot" aria-hidden="true"></span>' : ''}
        </button>`;
    }).join(''))}
    <button class="sidebar-sos" data-action="open-emergency">
      ${raw(icon('shield', 18))}
      <span>Open emergency card</span>
    </button>
    ${raw(poweredByFlux('sidebar-powered'))}
  `;
}

function renderAppbar(state) {
  const view = VIEWS[route];
  const title = view.title ? view.title(state) : TABS[route].label;
  const sub = view.subtitle ? view.subtitle(state) : '';

  el.appbar.innerHTML = html`
    <div class="appbar-title">
      <h1 class="appbar-t">${title}</h1>
      ${raw(sub ? `<span class="appbar-s">${esc(sub)}</span>` : '')}
    </div>
    <button class="sos-btn" data-action="open-emergency"
            aria-label="Open the emergency seizure card">
      ${raw(icon('shield', 16))}<span>SOS</span>
    </button>
  `;
  if (hostSwitch) el.appbar.insertBefore(hostSwitch, el.appbar.querySelector('.sos-btn'));
}

function renderScreen(state) {
  el.screen.innerHTML = html`
    <div class="screen-inner" data-route="${route}">${raw(VIEWS[route].render(state))}</div>
  `;
}

function render() {
  const state = store.get();

  // Remember where the user was, so a re-render doesn't throw away
  // their scroll position or keyboard focus.
  const top = el.screen.scrollTop;
  const active = document.activeElement;
  const inSwitch = hostSwitch && hostSwitch.contains(active);
  const key = active && !inSwitch && el.shell.contains(active) ? focusKey(active) : null;

  document.title = `${TABS[route].label} · Synara`;
  applyTheme(state.settings.theme);
  renderTabs(state);
  renderAppbar(state);
  renderScreen(state);

  el.screen.scrollTop = top;
  if (key) refocus(key, el.shell);
  else if (inSwitch) active.focus();
}

/* ============================================================
   First run
   ------------------------------------------------------------
   Asked once, before anything is written to storage. The example data
   is useful for showing the app to someone, but it is somebody else's
   medical history — a real student has to be able to decline it rather
   than find it already filled in.
   ============================================================ */

function showWelcome() {
  openWelcome(html`
    <div class="welcome-inner">
      <div class="brand-mark welcome-mark">${raw(brandMark())}</div>
      <h1 class="welcome-h1">Synara</h1>
      <p class="welcome-sub">
        Your medication, your seizures, and the card someone needs if you
        have one at school — all in one place.
      </p>

      <ul class="welcome-points">
        <li>${raw(icon('pill', 18))}<span>Dose reminders and a history you can show your doctor</span></li>
        <li>${raw(icon('chart', 18))}<span>A seizure log that looks for patterns for you</span></li>
        <li>${raw(icon('shield', 18))}<span>An emergency card anyone can follow, one tap away</span></li>
      </ul>

      <div class="welcome-actions">
        <button class="btn btn-primary btn-lg btn-block" data-action="welcome-empty">
          Set it up for me
        </button>
        <button class="btn btn-outline btn-lg btn-block" data-action="welcome-demo">
          Look around with example data
        </button>
      </div>

      <p class="welcome-note">
        ${raw(icon('lock', 14))}
        <span>Everything stays on this device — nothing is uploaded and there is
        no account. Synara is a student project, not a medical device.</span>
      </p>

      ${raw(poweredByFlux('welcome-powered'))}
    </div>
  `);
}

/* ============================================================
   Action dispatch
   ------------------------------------------------------------
   One delegated listener for the whole app. Views export an `actions`
   map; those are merged with the global ones below. A handler gets
   (element, state) and may be async.
   ============================================================ */

const ACTIONS = {
  nav(node) {
    go(node.dataset.to);
  },

  'close-sheet'() { closeSheet(); },
  'close-emergency'() { closeEmergency(); },

  'open-emergency'() {
    safety.showEmergency(store.get());
  },

  async 'welcome-demo'() {
    await store.reset({ seedFn: seed });
    closeWelcome();
    toast('Loaded example data — clear it any time in You', 'ok');
  },

  async 'welcome-empty'() {
    await store.reset();
    closeWelcome();
    go('meds');
    toast('Start by adding your medication', 'ok');
  },

  reload() {
    location.reload();
  },
};

// Merge each view's actions. A view that needs a name already taken
// should namespace it rather than silently win.
for (const view of Object.values(VIEWS)) {
  if (!view.actions) continue;
  for (const [name, fn] of Object.entries(view.actions)) {
    if (ACTIONS[name]) console.warn(`[synara] duplicate action "${name}"`);
    ACTIONS[name] = fn;
  }
}

function run(name, node) {
  const handler = ACTIONS[name];
  if (!handler) return false;
  Promise.resolve(handler(node, store.get())).catch((err) => {
    console.error('[synara] action failed:', name, err);
    toast(err && err.message === 'save-failed'
      ? 'Could not save — your browser storage may be full or blocked.'
      : 'Something went wrong. Please try that again.', 'bad');
  });
  return true;
}

document.addEventListener('click', (e) => {
  const node = e.target.closest('[data-action]');
  if (!node || node.tagName === 'FORM') return;
  if (run(node.dataset.action, node)) e.preventDefault();
});

/* Enter in a sheet form behaves like its primary button rather than
   reloading the page. */
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  run(form.dataset.action, form);
});

/* File inputs (import) fire `change`, not `click`. */
document.addEventListener('change', (e) => {
  const node = e.target.closest('[data-change]');
  if (node) run(node.dataset.change, node);
});

/* ============================================================
   Boot
   ============================================================ */

function onHashChange() {
  const next = parseHash();
  if (next.route !== route) {
    route = next.route;
    if (isEmergencyOpen() && !next.sos) closeEmergency();
    closeSheet();
    el.screen.scrollTop = 0;
    render();
  }
  if (next.sos) {
    safety.showEmergency(store.get());
    // Drop the alias so closing the card and pressing back behave normally.
    history.replaceState(null, '', '#/safety');
  }
}

/* The home screen shows a live countdown, and every screen has a
   notion of "today". Once a minute is enough — anything faster is
   wasted work and, in this app specifically, unnecessary motion. */
function startClock() {
  let lastDay = dayKey();
  setInterval(() => {
    if (isEmergencyOpen()) return;
    const today = dayKey();
    if (route === 'home' || today !== lastDay) render();
    lastDay = today;
  }, 60000);
}

function registerServiceWorker() {
  // Inside Flux, Flux's own service worker already covers this page.
  if (HOSTED) return;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      // Offline support is a bonus, never a reason to fail to start.
      console.warn('[synara] service worker not registered:', err);
    });
  });
}

async function boot() {
  const first = parseHash();
  route = first.route;

  const { firstRun } = await store.init();

  store.subscribe(render);
  render();

  if (firstRun) showWelcome();
  else if (first.sos) onHashChange();

  window.addEventListener('hashchange', onHashChange);
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyTheme(store.get().settings.theme));

  notify.start();
  registerServiceWorker();
  startClock();
}

boot().catch((err) => {
  console.error('[synara] failed to start:', err);
  el.screen.innerHTML = html`
    <div class="screen-inner">
      <div class="empty">
        <span class="empty-ico">${raw(icon('alert', 32))}</span>
        <span class="empty-t">Synara couldn't start</span>
        <span class="empty-s">
          Your browser may be blocking local storage. Try turning off private
          browsing, or reload the page.
        </span>
        <button class="btn btn-primary" data-action="reload">Reload</button>
      </div>
    </div>
  `;
});
