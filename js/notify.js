/* ============================================================
   notify.js — dose reminders
   ------------------------------------------------------------
   Imported by main.js (start) and views/profile.js (enable/disable).

   READ THIS BEFORE TRUSTING IT WITH A REAL DOSE.

   A website cannot reliably remind you to take medication. What this
   file does is schedule notifications with setTimeout while the tab
   is alive. That means:

     - Works: app open, or backgrounded in the browser on desktop
       and Android.
     - Does not work: browser fully closed, phone restarted, or iOS
       Safari with the tab evicted from memory — which it will be.

   Making this actually dependable needs a push server firing Web Push
   (Android/desktop, and iOS 16.4+ only once installed to the home
   screen), or a native app with local notifications. That is the
   single strongest argument for React Native + Expo in v2, and the
   UI says so plainly rather than implying a guarantee it cannot keep.
   ============================================================ */

import { dayKey, minutesOf, prettyTime } from './util.js';
import * as store from './store.js';

/** Honest capability string for the settings screen. */
export function support() {
  if (!('Notification' in window)) {
    return { ok: false, reason: 'This browser does not support notifications.' };
  }
  if (location.protocol === 'file:') {
    return { ok: false, reason: 'Notifications need the app served over https.' };
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (iOS && !standalone) {
    return {
      ok: false,
      reason: 'On iPhone, add Synara to your home screen first — Safari only ' +
              'allows notifications for installed apps.',
    };
  }

  return { ok: true, reason: '' };
}

export function permission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Ask the browser for permission. Returns the resulting state. */
export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/* ============================================================
   Scheduling
   ============================================================ */

let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function inQuietHours(settings, date) {
  const q = settings.quietHours;
  if (!q) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = minutesOf(q.from);
  const to = minutesOf(q.to);
  // Quiet hours usually wrap midnight (22:00 → 07:00).
  return from > to ? (now >= from || now < to) : (now >= from && now < to);
}

function fire(med, time) {
  try {
    const n = new Notification('Time for your medication', {
      body: `${med.name} ${med.dose} — ${prettyTime(time)}`,
      tag: `synara-${med.id}-${time}`,   // replaces rather than stacks
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    });
    n.onclick = () => {
      window.focus();
      location.hash = '#/meds';
      n.close();
    };
  } catch (err) {
    console.warn('[synara] could not show notification:', err);
  }
}

/**
 * Schedule every remaining dose for today.
 *
 * Re-run whenever meds or settings change — it clears first, so it is
 * safe to call repeatedly.
 */
export function schedule() {
  clearTimers();

  const state = store.get();
  const { remindersOn, reminderLead } = state.settings;
  if (!remindersOn) return 0;
  if (permission() !== 'granted') return 0;

  const now = new Date();
  const today = dayKey(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let scheduled = 0;

  // dosesOn() only returns what is scheduled today, so a stopped med
  // or yesterday's old time can never fire a reminder.
  for (const { med, time } of store.dosesOn(today, state)) {
    const at = minutesOf(time) - (reminderLead || 0);
    if (at <= nowMins) continue;

    // Already dealt with? Don't nag.
    if (store.doseStatus(today, med.id, time, state) !== 'pending') continue;

    const delayMs = (at - nowMins) * 60000;
    // A same-day delay is always far inside setTimeout's ~24-day limit.
    timers.push(setTimeout(() => {
      const fresh = store.get();
      if (!fresh.settings.remindersOn) return;
      if (inQuietHours(fresh.settings, new Date())) return;
      // Re-check: they may have taken it in the meantime.
      if (store.doseStatus(dayKey(), med.id, time, fresh) !== 'pending') return;
      fire(med, time);
    }, delayMs));

    scheduled++;
  }

  return scheduled;
}

/** Called once at boot. */
export function start() {
  schedule();
  store.subscribe(schedule);

  // Timers do not survive the tab being frozen or the device sleeping,
  // so rebuild the schedule whenever we come back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
}

/** A one-off notification so the student can confirm it actually works. */
export function test() {
  if (permission() !== 'granted') return false;
  try {
    new Notification('Synara reminders are on', {
      body: 'This is what a dose reminder will look like.',
      icon: 'icons/icon-192.png',
      tag: 'synara-test',
    });
    return true;
  } catch {
    return false;
  }
}
