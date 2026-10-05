/* ============================================================
   main.js — boot, routing, and the render loop
   ------------------------------------------------------------
   Loaded by index.html as a module.

   Rendering is deliberately dumb: views are pure functions from state
   to an HTML string, and any store change re-renders the current
   screen. At this size that is fast, and it removes a whole class of
   bug where the UI and the data drift apart.
   ============================================================ */

import * as store from './store.js';
import { seed } from './seed.js';
import { html, raw, esc, dayKey } from './util.js';
import { icon, toast, closeSheet, closeEmergency, isEmergencyOpen } from './ui.js';
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

let route = 'home';

const el = {
  appbar: document.getElementById('appbar'),
  screen: document.getElementById('screen'),
  tabbar: document.getElementById('tabbar'),
  welcome: document.getElementById('welcome'),
};

function routeFromHash() {
  const id = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return ORDER.includes(id) ? id : 'home';
}

export function go(id) {
  if (!ORDER.includes(id)) return;
  location.hash = `#/${id}`;
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
  let n = 0;
  for (const med of store.activeMeds(state)) {
    for (const time of med.times) {
      if (store.doseStatus(today, med.id, time, state) === 'pending') n++;
    }
  }
  return n;
}

function renderTabs(state) {
  const pendingToday = countPendingToday(state);

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
      const dot = id === 'meds' && pendingToday > 0;
      return `
        <button class="tab" data-action="nav" data-to="${id}"
                ${current ? 'aria-current="page"' : ''}>
          <span class="tab-ico">${icon(tab.icon)}</span>
          <span class="tab-label">${tab.label}</span>
          ${dot ? `<span class="tab-dot" aria-label="${pendingToday} doses due"></span>` : ''}
        </button>`;
    }).join(''))}
  `;
}

function renderAppbar(state) {
  const view = VIEWS[route];
  const title = view.title ? view.title(state) : TABS[route].label;
  const sub = view.subtitle ? view.subtitle(state) : '';

  el.appbar.innerHTML = html`
    <div class="appbar-title">
      <span class="appbar-t">${title}</span>
      ${raw(sub ? `<span class="appbar-s">${esc(sub)}</span>` : '')}
    </div>
    <button class="sos-btn" data-action="open-emergency"
            aria-label="Open emergency seizure card">
      SOS
    </button>
  `;
}

function renderScreen(state) {
  // Hold the scroll position across re-renders. Without this, marking
  // a dose taken halfway down the meds list throws you back to the top.
  const top = el.screen.scrollTop;
  el.screen.innerHTML = html`
    <div class="screen-inner">${raw(VIEWS[route].render(state))}</div>
  `;
  el.screen.scrollTop = top;
}

function render() {
  const state = store.get();
  document.title = `${TABS[route].label} · Synara`;
  // Theme is derived from state, so it is applied here rather than
  // imperatively from the settings view — that would be an import cycle.
  applyTheme(state.settings.theme);
  renderTabs(state);
  renderAppbar(state);
  renderScreen(state);
}

/* ============================================================
   First run
   ------------------------------------------------------------
   Asked once, before anything is written to storage. The demo data
   is genuinely useful for showing the app to someone, but it is
   somebody else's medical history — a real student has to be able
   to decline it rather than find it already filled in.
   ============================================================ */

function showWelcome() {
  el.welcome.innerHTML = html`
    <div class="welcome-inner">
      <div class="brand-mark welcome-mark">${raw(brandMark())}</div>
      <h1 class="welcome-h1">Synara</h1>
      <p class="welcome-sub">
        Your medication, your seizures, and the card someone needs if you
        have one at school — all in one place.
      </p>

      <div class="welcome-actions">
        <button class="btn btn-primary btn-lg btn-block" data-action="welcome-empty">
          Set it up for me
        </button>
        <button class="btn btn-outline btn-lg btn-block" data-action="welcome-demo">
          Look around with example data
        </button>
      </div>

      <p class="welcome-note">
        Everything stays on this device — nothing is uploaded and there is no
        account. Synara is a student project, not a medical device.
      </p>
    </div>
  `;
  el.welcome.hidden = false;
  // Force layout so the transition has a start value to animate from.
  // requestAnimationFrame would be the usual trick, but it is throttled
  // in background and headless contexts — and if it never fires, this
  // overlay sits at opacity 0 while still covering the entire screen.
  void el.welcome.offsetHeight;
  el.welcome.dataset.open = 'true';
}

function hideWelcome() {
  delete el.welcome.dataset.open;
  setTimeout(() => {
    el.welcome.hidden = true;
    el.welcome.innerHTML = '';
  }, 250);
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

  'close-sheet': closeSheet,
  'close-emergency': closeEmergency,

  'open-emergency'() {
    safety.showEmergency(store.get());
  },

  async 'welcome-demo'() {
    await store.reset({ seedFn: seed });
    hideWelcome();
    toast('Loaded with example data — clear it any time in You', 'ok');
  },

  async 'welcome-empty'() {
    await store.reset();
    hideWelcome();
    go('meds');
    toast('Start by adding your medication', 'ok');
  },
};

// Merge each view's actions. A view that needs a name already taken
// should namespace it (e.g. "meds:save") rather than silently win.
for (const view of Object.values(VIEWS)) {
  if (!view.actions) continue;
  for (const [name, fn] of Object.entries(view.actions)) {
    if (ACTIONS[name]) {
      console.warn(`[synara] duplicate action "${name}" — check view exports`);
    }
    ACTIONS[name] = fn;
  }
}

document.addEventListener('click', (e) => {
  const node = e.target.closest('[data-action]');
  if (!node) return;

  const handler = ACTIONS[node.dataset.action];
  if (!handler) return;

  e.preventDefault();
  Promise.resolve(handler(node, store.get())).catch((err) => {
    console.error('[synara] action failed:', node.dataset.action, err);
    toast('Something went wrong saving that.', 'bad');
  });
});

/* Submitting a form in a sheet should behave like tapping its primary
   button, not reload the page. */
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const handler = ACTIONS[form.dataset.action];
  if (!handler) return;
  Promise.resolve(handler(form, store.get())).catch((err) => {
    console.error('[synara] submit failed:', err);
    toast('Something went wrong saving that.', 'bad');
  });
});

/* ============================================================
   Boot
   ============================================================ */

/** Reflect the stored theme choice onto <html>. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

/* The home screen shows a live countdown to the next dose, so it has
   to re-render on its own. Once a minute is enough — anything faster
   is wasted work and, on this app specifically, unnecessary motion. */
function startClock() {
  setInterval(() => {
    if (route === 'home' && !isEmergencyOpen()) render();
  }, 60000);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// has no service worker scope; only register over http(s).
  if (location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      // Offline support is a bonus, not a requirement. Never block boot.
      console.warn('[synara] service worker not registered:', err);
    });
  });
}

window.addEventListener('hashchange', () => {
  const next = routeFromHash();
  if (next === route) return;
  route = next;

  // Leaving a screen with an overlay up should close it, or the back
  // button appears to do nothing.
  if (isEmergencyOpen()) closeEmergency();

  el.screen.scrollTop = 0;
  render();
});

async function boot() {
  route = routeFromHash();

  const { firstRun } = await store.init();

  applyTheme(store.get().settings.theme);
  store.subscribe(render);
  render();

  if (firstRun) showWelcome();

  notify.start();
  registerServiceWorker();
  startClock();
}

boot().catch((err) => {
  console.error('[synara] failed to start:', err);
  el.screen.innerHTML = html`
    <div class="screen-inner">
      <div class="empty">
        <span class="empty-ico">😕</span>
        <span class="empty-t">Synara couldn't start</span>
        <span class="empty-s">
          Your browser may be blocking local storage. Try turning off private
          browsing, or reload the page.
        </span>
        <button class="btn btn-primary" data-action="reload">Reload</button>
      </div>
    </div>
  `;
  ACTIONS.reload = () => location.reload();
});
