/* ============================================================
   ui.js — overlays: sheets, toasts, the emergency screen
   ------------------------------------------------------------
   Imported by main.js and by every view. Deliberately knows nothing
   about state or routing, so there is no import cycle: views mutate
   the store, main.js re-renders on the resulting change.
   ============================================================ */

import { html, raw } from './util.js';

const el = {
  backdrop:  document.getElementById('backdrop'),
  sheet:     document.getElementById('sheet'),
  emergency: document.getElementById('emergency'),
  toast:     document.getElementById('toast'),
};

/* ============================================================
   Icons
   ------------------------------------------------------------
   Inline SVG so they inherit currentColor and need no network
   request. Stroke-based, 24px grid, consistent weight.
   ============================================================ */

const ICONS = {
  home:   '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8"/>',
  pill:   '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.8 8.8l6.4 6.4"/>',
  chart:  '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15l3.5-4 3 2.5L18 8"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
  user:   '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  x:      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus:   '<path d="M12 5v14"/><path d="M5 12h14"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  phone:  '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  edit:   '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:  '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.8 14a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1L5 6"/>',
  print:  '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  share:  '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
  bell:   '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  moon:   '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  down:   '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>',
  check:  '<path d="M20 6 9 17l-5-5"/>',
};

/** Inline SVG markup for a named icon. */
export function icon(name, size = 24) {
  const path = ICONS[name] || '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
         `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
         `stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ============================================================
   Bottom sheet
   ============================================================ */

let sheetOpen = false;
let lastFocus = null;
let onSheetClose = null;

/**
 * Open the bottom sheet.
 *
 * @param {object} opts
 * @param {string} opts.title    heading text
 * @param {string} opts.body     markup for the scrolling area
 * @param {string} [opts.footer] markup for the pinned footer
 * @param {Function} [opts.onMount] runs once the markup is in the DOM
 * @param {Function} [opts.onClose]
 */
export function openSheet({ title, body, footer = '', onMount, onClose }) {
  lastFocus = document.activeElement;
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
  el.sheet.hidden = false;

  // Force layout so the transition has a start value. Deliberately not
  // requestAnimationFrame: it is throttled in background and headless
  // contexts, and a sheet stuck at translateY(100%) behind a live
  // backdrop is an invisible wall over the whole app.
  void el.sheet.offsetHeight;

  el.backdrop.dataset.open = 'true';
  el.sheet.dataset.open = 'true';
  sheetOpen = true;

  const focusable = el.sheet.querySelector(
    'input, textarea, select, button:not([data-action="close-sheet"])'
  );
  if (focusable) focusable.focus();

  if (onMount) onMount(el.sheet);
}

export function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;

  delete el.backdrop.dataset.open;
  delete el.sheet.dataset.open;

  // Match the CSS transition, but never leave the sheet stuck open if
  // the browser skips it (reduced motion sets the duration to ~0ms).
  setTimeout(() => {
    el.backdrop.hidden = true;
    el.sheet.hidden = true;
    el.sheet.innerHTML = '';
  }, 300);

  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;

  if (onSheetClose) {
    const fn = onSheetClose;
    onSheetClose = null;
    fn();
  }
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
   Used for deletes. Native confirm() blocks the main thread and looks
   like a browser warning rather than part of the app.
   ============================================================ */

export function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true, onConfirm }) {
  openSheet({
    title,
    body: html`<p class="ink-2" style="line-height:var(--lh-body)">${message}</p>`,
    footer: `
      <button class="btn btn-quiet" data-action="close-sheet">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-sheet-confirm>
        ${confirmLabel}
      </button>
    `,
    onMount(sheet) {
      sheet.querySelector('[data-sheet-confirm]').addEventListener('click', () => {
        closeSheet();
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
  const glyph = tone === 'ok' ? '✓ ' : tone === 'bad' ? '⚠ ' : '';
  el.toast.textContent = glyph + message;
  el.toast.dataset.open = 'true';
  toastTimer = setTimeout(() => {
    delete el.toast.dataset.open;
  }, 2600);
}

/* ============================================================
   Emergency screen
   ------------------------------------------------------------
   Rendered by views/safety.js and shown here. Kept separate from the
   sheet because it is not a dialog over the app — for as long as it
   is open, it IS the app.
   ============================================================ */

let emergencyOpen = false;
let wakeLock = null;

/* Progressive enhancement: unsupported on some browsers, and a
   rejected promise here must never surface to the user. */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
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

export function openEmergency(markup) {
  el.emergency.innerHTML = markup;
  el.emergency.hidden = false;
  void el.emergency.offsetHeight;   // see the note in openSheet
  el.emergency.dataset.open = 'true';
  emergencyOpen = true;

  // Keep the screen awake while the card is up. A teacher reading
  // first-aid steps should not have the phone lock on them mid-seizure.
  requestWakeLock();
}

export function closeEmergency() {
  if (!emergencyOpen) return;
  emergencyOpen = false;
  delete el.emergency.dataset.open;
  setTimeout(() => {
    el.emergency.hidden = true;
    el.emergency.innerHTML = '';
  }, 220);
  releaseWakeLock();
}

export function isEmergencyOpen() {
  return emergencyOpen;
}

/* ============================================================
   Global dismiss handling
   ============================================================ */

el.backdrop.addEventListener('click', closeSheet);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (emergencyOpen) closeEmergency();
  else if (sheetOpen) closeSheet();
});
