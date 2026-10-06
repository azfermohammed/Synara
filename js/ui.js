/* ============================================================
   ui.js — icons, overlays, focus, toasts
   ------------------------------------------------------------
   Imported by main.js and every view. Knows nothing about state or
   routing, so there is no import cycle: views mutate the store and
   main.js re-renders on the resulting change.
   ============================================================ */

import { html, raw } from './util.js';

const el = {
  shell:     document.querySelector('.app-shell'),
  backdrop:  document.getElementById('backdrop'),
  sheet:     document.getElementById('sheet'),
  emergency: document.getElementById('emergency'),
  welcome:   document.getElementById('welcome'),
  toast:     document.getElementById('toast'),
};

/* ============================================================
   Icons
   ------------------------------------------------------------
   Inline SVG on a 24px grid, stroke-based, one consistent weight.
   They inherit currentColor, need no network request, and — unlike
   emoji — look the same on every phone a teacher might be holding.
   ============================================================ */

const ICONS = {
  home:       '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8"/>',
  pill:       '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.8 8.8l6.4 6.4"/>',
  chart:      '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15l3.5-4 3 2.5L18 8"/>',
  shield:     '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
  sync:       '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  ribbon:     '<path d="M12 13.5c-2.6-3-4-5.4-4-7.2a4 4 0 0 1 8 0c0 1.8-1.4 4.2-4 7.2Z"/><path d="M12 13.5 7.5 21l-2-1.2 4.4-7.3"/><path d="M12 13.5l4.5 7.5 2-1.2-4.4-7.3"/>',
  user:       '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  x:          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus:       '<path d="M12 5v14"/><path d="M5 12h14"/>',
  chevron:    '<path d="m9 6 6 6-6 6"/>',
  phone:      '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  edit:       '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:      '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.8 14a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1L5 6"/>',
  print:      '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  bell:       '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  moon:       '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  wave:       '<path d="M2 12c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0"/><path d="M2 17c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0" opacity=".5"/>',
  bolt:       '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:        '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  'trend-up':   '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  'trend-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  alert:      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  down:       '<path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/>',
  up:         '<path d="M12 20V8"/><path d="m6 14 6-6 6 6"/><path d="M4 4h16"/>',
  check:      '<path d="M20 6 9 17l-5-5"/>',
  note:       '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  timer:      '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M10 2h4"/><path d="M12 2v3"/>',
  book:       '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  school:     '<path d="M3 10 12 5l9 5-9 5z"/><path d="M7 12v5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-5"/><path d="M21 10v6"/>',
  stethoscope:'<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>',
  run:        '<circle cx="14" cy="4" r="2"/><path d="m8 21 3-6 3 2v5"/><path d="M6 12l3-3 4 1 3 3 3 1"/><path d="m11 15-2-4"/>',
  heart:      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  lock:       '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info:       '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sparkle:    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/>',
  stop:       '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  play:       '<path d="M7 4v16l13-8z"/>',
  archive:    '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
};

/** Inline SVG markup for a named icon. */
export function icon(name, size = 24) {
  const path = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
         'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
         `stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

/* ============================================================
   Focus
   ------------------------------------------------------------
   Every store change re-renders the screen from scratch, which
   replaces the button that was just pressed. Without this, a keyboard
   or switch-access user who marks a dose taken lands back at the top
   of the page — every single time. So focus is remembered by what the
   element *does* (its data attributes), and restored to the new
   element that does the same thing.
   ============================================================ */

const KEY_ATTRS = ['action', 'id', 'med', 'time', 'day', 'tab', 'to', 'field', 'value', 'theme'];

/** A selector that finds "the same control" after a re-render, or null. */
export function focusKey(node) {
  if (!node || !node.dataset || !node.dataset.action) return null;
  return KEY_ATTRS
    .filter((k) => node.dataset[k] != null)
    .map((k) => `[data-${k}="${CSS.escape(node.dataset[k])}"]`)
    .join('');
}

export function refocus(key, root = document) {
  if (!key) return false;
  const next = root.querySelector(key);
  if (next) {
    next.focus({ preventScroll: true });
    return true;
  }
  return false;
}

/* ============================================================
   Overlay bookkeeping
   ------------------------------------------------------------
   While any overlay is open the app behind it is `inert`: no focus,
   no clicks, hidden from screen readers. aria-modal alone does not
   stop Tab from walking out of a dialog into the page beneath it.
   ============================================================ */

const open = new Set();

export function setShellInert(on) {
  if (!el.shell) return;
  if (on) el.shell.setAttribute('inert', '');
  else el.shell.removeAttribute('inert');
}

function overlayOpened(name) {
  open.add(name);
  setShellInert(true);
}

function overlayClosed(name) {
  open.delete(name);
  if (!open.size) setShellInert(false);
}

/**
 * Show an element with its CSS transition. Forces layout first instead
 * of using requestAnimationFrame: rAF is throttled in background and
 * headless contexts, and if it never fires the overlay sits at
 * opacity 0 while still covering — and blocking — the whole screen.
 */
function reveal(node) {
  node.hidden = false;
  void node.offsetHeight;
  node.dataset.open = 'true';
}

function conceal(node, after = 300) {
  delete node.dataset.open;
  return new Promise((resolve) => {
    setTimeout(() => {
      // Only hide if nothing re-opened it during the transition.
      if (node.dataset.open !== 'true') {
        node.hidden = true;
        node.innerHTML = '';
      }
      resolve();
    }, after);
  });
}

/* ============================================================
   Bottom sheet
   ============================================================ */

let sheetOpen = false;
let returnFocusKey = null;
let returnFocusNode = null;
let onSheetClose = null;

/**
 * Open the bottom sheet.
 *
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   opts.body      markup for the scrolling area
 * @param {string}   [opts.footer]  markup for the pinned footer
 * @param {Function} [opts.onMount] runs once the markup is in the DOM
 * @param {Function} [opts.onClose]
 */
export function openSheet({ title, body, footer = '', onMount, onClose }) {
  if (!sheetOpen) {
    returnFocusNode = document.activeElement;
    returnFocusKey = focusKey(returnFocusNode);
  }
  onSheetClose = onClose || null;

  el.sheet.innerHTML = html`
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheet-title">${title}</h2>
      <button class="icon-btn" data-action="close-sheet" aria-label="Close">
        ${raw(icon('x'))}
      </button>
    </div>
    <div class="sheet-body">${raw(body)}</div>
    ${raw(footer ? `<div class="sheet-foot">${footer}</div>` : '')}
  `;

  el.backdrop.hidden = false;
  void el.backdrop.offsetHeight;
  el.backdrop.dataset.open = 'true';
  reveal(el.sheet);
  sheetOpen = true;
  overlayOpened('sheet');

  const first = el.sheet.querySelector(
    '.sheet-body input:not([type="hidden"]), .sheet-body textarea, .sheet-body select, ' +
    '.sheet-body button, .sheet-foot button'
  );
  (first || el.sheet.querySelector('[data-action="close-sheet"]')).focus({ preventScroll: true });

  if (onMount) onMount(el.sheet);
}

export function closeSheet() {
  if (!sheetOpen) return Promise.resolve();
  sheetOpen = false;

  const done = conceal(el.sheet);
  conceal(el.backdrop).then(() => { el.backdrop.hidden = true; });
  overlayClosed('sheet');

  // The control that opened the sheet has usually been re-rendered
  // away by the save it triggered, so fall back to finding its twin.
  if (returnFocusNode && returnFocusNode.isConnected) {
    returnFocusNode.focus({ preventScroll: true });
  } else {
    refocus(returnFocusKey);
  }
  returnFocusNode = null;
  returnFocusKey = null;

  if (onSheetClose) {
    const fn = onSheetClose;
    onSheetClose = null;
    fn();
  }
  return done;
}

export function isSheetOpen() {
  return sheetOpen;
}

/** The live sheet element, for reading form values. */
export function sheetEl() {
  return el.sheet;
}

/** Collect named inputs inside the sheet into a plain object. */
export function sheetValues() {
  const out = {};
  el.sheet.querySelectorAll('[name]').forEach((node) => {
    if (node.type === 'checkbox') out[node.name] = node.checked;
    else out[node.name] = node.value;
  });
  return out;
}

/* ============================================================
   Confirm — a sheet, not window.confirm()
   ------------------------------------------------------------
   Native confirm() blocks the main thread and looks like a browser
   warning rather than part of the app.
   ============================================================ */

export async function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true, onConfirm }) {
  // If a sheet is already up (e.g. "Stop taking" inside the edit
  // sheet), let it finish leaving before the confirmation arrives.
  if (sheetOpen) await closeSheet();

  openSheet({
    title,
    body: html`<p class="sheet-message">${message}</p>`,
    footer: `
      <button class="btn btn-quiet" data-action="close-sheet">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-sheet-confirm>${confirmLabel}</button>
    `,
    onMount(sheet) {
      sheet.querySelector('[data-sheet-confirm]').addEventListener('click', async () => {
        await closeSheet();
        onConfirm();
      });
    },
  });
}

/* ============================================================
   Toast
   ============================================================ */

let toastTimer = null;

export function toast(message, tone = 'default') {
  clearTimeout(toastTimer);
  const glyph = tone === 'ok' ? '✓ ' : tone === 'bad' ? '! ' : '';
  el.toast.textContent = glyph + message;
  el.toast.dataset.tone = tone;
  el.toast.dataset.open = 'true';
  toastTimer = setTimeout(() => {
    delete el.toast.dataset.open;
  }, 2800);
}

/* ============================================================
   Emergency screen
   ------------------------------------------------------------
   Not a dialog over the app — for as long as it is open, it IS the
   app. Rendered by views/safety.js and shown here.
   ============================================================ */

let emergencyOpen = false;
let onEmergencyClose = null;
let wakeLock = null;

/* Progressive enhancement: unsupported in some browsers, and a
   rejected promise here must never surface to the user. */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    if (wakeLock) wakeLock.release();
  } catch {
    /* already gone */
  }
  wakeLock = null;
}

// The browser drops a wake lock whenever the page is hidden. If the
// card is still up when someone comes back to it, take it again.
document.addEventListener('visibilitychange', () => {
  if (emergencyOpen && document.visibilityState === 'visible') requestWakeLock();
});

export function openEmergency(markup, { onClose, onMount } = {}) {
  if (sheetOpen) closeSheet();
  onEmergencyClose = onClose || null;
  el.emergency.innerHTML = markup;
  reveal(el.emergency);
  emergencyOpen = true;
  overlayOpened('emergency');

  const target = el.emergency.querySelector('[data-autofocus]') ||
                 el.emergency.querySelector('button, a');
  if (target) target.focus({ preventScroll: true });

  // Keep the screen on while the card is up. A teacher reading the
  // steps must not have the phone lock on them mid-seizure.
  requestWakeLock();
  if (onMount) onMount(el.emergency);
}

export function closeEmergency() {
  if (!emergencyOpen) return;
  emergencyOpen = false;
  conceal(el.emergency, 220);
  overlayClosed('emergency');
  releaseWakeLock();
  if (onEmergencyClose) {
    const fn = onEmergencyClose;
    onEmergencyClose = null;
    fn();
  }
}

export function isEmergencyOpen() {
  return emergencyOpen;
}

export function emergencyEl() {
  return el.emergency;
}

/* ============================================================
   Welcome (first run)
   ============================================================ */

export function openWelcome(markup) {
  el.welcome.innerHTML = markup;
  reveal(el.welcome);
  overlayOpened('welcome');
  const first = el.welcome.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

export function closeWelcome() {
  conceal(el.welcome, 250);
  overlayClosed('welcome');
}

/** The intro's next step, in place: the overlay stays open. Focus goes to
    the step's heading so a screen reader starts reading from the top. */
export function setWelcome(markup) {
  el.welcome.innerHTML = markup;
  el.welcome.scrollTop = 0;
  const first = el.welcome.querySelector('[data-intro-focus]') || el.welcome.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

export function isWelcomeOpen() {
  return open.has('welcome');
}

/** Synara's pulse, as on its icon. */
export function brandMark() {
  return '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<path d="M4 18h5l3-8 5 14 3.5-9H28" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/* ============================================================
   Powered by Flux
   ------------------------------------------------------------
   Synara is built and hosted by Flux, and says so: on the welcome
   screen, at the foot of the desktop sidebar, and in You → About.
   Never on the emergency card — that screen has one job.
   Inside Flux, Synara's files live under public/synara/.
   ============================================================ */

const FLUX_URL = 'https://fluxplanner.github.io/Flux/landing.html';

export function poweredByFlux(extraClass = '') {
  const logo = document.documentElement.dataset.host === 'flux'
    ? 'public/synara/icons/flux-logo.png'
    : 'icons/flux-logo.png';
  return `<a class="powered-by ${extraClass}" href="${FLUX_URL}" target="_blank" rel="noopener">` +
    '<span class="powered-by-t">Powered by</span>' +
    `<img class="powered-by-logo" src="${logo}" alt="" width="18" height="18" />` +
    '<span class="powered-by-name">Flux</span></a>';
}

/* ============================================================
   Global dismiss handling
   ============================================================ */

el.backdrop.addEventListener('click', () => { closeSheet(); });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (sheetOpen) closeSheet();
  else if (emergencyOpen) closeEmergency();
});
