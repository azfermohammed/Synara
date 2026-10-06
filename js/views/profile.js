/* ============================================================
   views/profile.js — care details, settings, and data control
   ------------------------------------------------------------
   Imported by main.js. Its profile-edit action is also used by the
   Safety screen.

   The data section matters more than it looks. This app holds a
   teenager's health record, so the honest answers to "where does this
   live", "how do I get it out", "how do I get it back", and "how do I
   delete it" belong in the product, not in a policy nobody opens.

   Theme is applied by main.js's render loop, not from here — a view
   importing main would be an import cycle.
   ============================================================ */

import { html, raw, esc, dayKey, initials, plural } from '../util.js';
import * as store from '../store.js';
import { seed } from '../seed.js';
import { summary } from '../insights.js';
import * as notify from '../notify.js';
import { icon, toast, openSheet, closeSheet, confirmSheet, sheetValues, poweredByFlux } from '../ui.js';
import * as fluxlink from '../fluxlink.js';
import * as sync from '../sync.js';

/* ============================================================
   Header
   ============================================================ */

export function title() {
  return 'You';
}

export function subtitle(state) {
  return state.profile.school || 'Your details and settings';
}

/* ============================================================
   Render
   ============================================================ */

const CARE_FIELDS = [
  ['name', 'Name', 'Maya Ellison'],
  ['pronouns', 'Pronouns', 'she/her'],
  ['grade', 'Grade', '11th grade'],
  ['school', 'School', 'Rosewood High School'],
  ['seizureType', 'Seizure type', 'Focal impaired awareness'],
  ['diagnosed', 'Diagnosed', '2022'],
  ['neurologist', 'Neurologist', 'Dr. Raghavan'],
  ['neuroPhone', 'Neurologist phone', '(555) 010-4488'],
  ['allergies', 'Allergies', 'Penicillin'],
  ['bloodType', 'Blood type', 'O+'],
];

export function render(state) {
  return html`
    <div class="split-grid">
      <div class="split-main">
        ${raw(headerCard(state))}
        ${raw(careCard(state))}
      </div>
      <div class="split-side">
        ${raw(fluxCard(state))}
        ${raw(remindersCard(state))}
        ${raw(appearanceCard(state))}
        ${raw(dataCard(state))}
        ${raw(aboutCard())}
      </div>
    </div>
  `;
}

function headerCard(state) {
  const { profile } = state;
  const stats = summary(state);
  const meta = [profile.pronouns, profile.grade].filter(Boolean).join(' · ');
  const avatar = initials(profile.name);

  return html`
    <div class="card card-flush">
      <div class="profile-head">
        <span class="avatar avatar-lg" aria-hidden="true">${avatar ? avatar : raw(icon('user', 26))}</span>
        <span class="row-body">
          <span class="profile-n">${profile.name || 'Add your name'}</span>
          <span class="profile-s">${meta || 'Tap edit to fill in your details'}</span>
        </span>
        <button class="icon-btn" data-action="profile-edit" aria-label="Edit your details">
          ${raw(icon('edit'))}
        </button>
      </div>
      <div class="stats stats-inset">
        <div class="stat">
          <span class="stat-n">${stats.adherence == null ? '—' : `${stats.adherence}%`}</span>
          <span class="stat-l">Doses on time</span>
        </div>
        <div class="stat">
          <span class="stat-n">${stats.totalSeizures}</span>
          <span class="stat-l">Seizures logged</span>
        </div>
        <div class="stat">
          <span class="stat-n">${stats.streak}</span>
          <span class="stat-l">Day streak</span>
        </div>
      </div>
    </div>
  `;
}

function careCard(state) {
  const { profile } = state;
  const rows = CARE_FIELDS.map(([key, label]) => `
    <div class="kv-row">
      <dt class="kv-k">${label}</dt>
      <dd class="kv-v">${profile[key] ? esc(profile[key]) : '<span class="ink-faint">—</span>'}</dd>
    </div>`).join('');

  return html`
    <section class="section" aria-labelledby="care-h">
      <div class="section-head">
        <h2 id="care-h">Care details</h2>
        <button class="btn btn-sm btn-quiet" data-action="profile-edit">${raw(icon('edit', 15))} Edit</button>
      </div>
      <div class="card card-flush"><dl class="kv">${raw(rows)}</dl></div>
      <p class="hint">
        These appear on the emergency card and the printed card, so whoever
        helps you has them without having to ask.
      </p>
    </section>
  `;
}

/* ---------- Reminders ---------- */

/* ============================================================
   Flux — only inside Flux (synara.html)
   ------------------------------------------------------------
   Two separate choices, both off until the student turns them on:
   showing dose times in their Flux Planner (fluxlink.js, this device
   only), and syncing across devices through their Flux account
   (sync.js, end-to-end encrypted).
   ============================================================ */

function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const SYNC_ERRORS = {
  'signed-out': 'Sign in to Flux again to keep syncing.',
  offline: 'Offline. It will sync when you’re back online.',
  'not-ready': 'Sync isn’t switched on for Flux yet.',
  'wrong-key': 'This device’s sync key doesn’t open the synced copy.',
  gone: 'Turned off: the synced copy was deleted on another device.',
};

function syncNote() {
  const st = sync.getStatus();
  if (!sync.enabled()) {
    if (st.error === 'gone') return SYNC_ERRORS.gone;
    return st.account
      ? 'Off. Encrypted on this device before it leaves, so Flux can’t read it.'
      : 'Sign in to Flux to keep Synara the same on your phone and computer.';
  }
  if (st.phase === 'syncing') return 'Syncing…';
  if (st.phase === 'conflict') return 'Changed on two devices. Choose which to keep.';
  if (st.phase === 'error') return SYNC_ERRORS[st.error] || 'Couldn’t sync. It will try again.';
  const at = sync.lastSynced();
  return at ? `On · synced ${ago(at)}` : 'On';
}

function fluxCard(state) {
  if (!fluxlink.available()) return '';
  return html`
    <section class="section" aria-labelledby="flux-h">
      <h2 id="flux-h">Flux</h2>
      <div class="card card-flush">
        <div class="list-row list-row-static">
          <span class="med-dot" data-color="violet" aria-hidden="true">${raw(icon('calendar', 20))}</span>
          <span class="row-body">
            <span class="row-t" id="fluxlink-label">Show in my Flux Planner</span>
            <span class="row-s">Dose times on your Flux calendar and a safety-card button in
              School info, on this device. Seizures, contacts and notes stay in Synara.</span>
          </span>
          <button class="switch" data-action="flux-link-toggle" role="switch"
                  aria-checked="${state.settings.fluxLink}" aria-labelledby="fluxlink-label"></button>
        </div>
        <button class="list-row" data-action="sync-open">
          <span class="med-dot" data-color="blue" aria-hidden="true">${raw(icon('sync', 20))}</span>
          <span class="row-body">
            <span class="row-t">Sync across your devices</span>
            <span class="row-s">${syncNote()}</span>
          </span>
          <span class="chev">${raw(icon('chevron'))}</span>
        </button>
      </div>
    </section>
  `;
}

const PRIVACY = html`
  <ul class="sheet-list">
    <li>${raw(icon('lock', 16))}<span>Synara encrypts everything on this device before it leaves. Flux stores
      a locked copy it can’t open — not your medication, seizures or contacts.</span></li>
    <li>${raw(icon('info', 16))}<span>The key stays on your devices. You’ll get a <strong>sync key</strong> to
      enter on your other devices. If you lose every device and the key, the synced copy can’t be
      opened — but each device keeps its own.</span></li>
  </ul>
`;

async function openSyncSheet() {
  const who = await sync.refreshAccount();

  if (!sync.enabled() && !who) {
    openSheet({
      title: 'Sync across your devices',
      body: html`
        <p class="sheet-message">Sign in to your Flux account, then come back here to keep Synara the
          same on your phone and computer.</p>
        ${raw(PRIVACY)}
      `,
      footer: `
        <button class="btn btn-quiet" data-action="close-sheet">Not now</button>
        <a class="btn btn-primary" href="index.html">Sign in to Flux</a>
      `,
    });
    return;
  }

  if (!sync.enabled()) {
    openSheet({
      title: 'Sync across your devices',
      body: html`
        <p class="sheet-message">Signed in to Flux as <strong>${who.email || 'your account'}</strong>.</p>
        ${raw(PRIVACY)}
        <div class="stack stack-3 mt-3">
          <button class="btn btn-primary btn-block" data-action="sync-start-new">
            Start syncing from this device
          </button>
          <form class="stack stack-2" data-action="sync-join-check">
            <label class="label" for="sync-key">Already syncing on another device? Enter its sync key.</label>
            <input class="input mono" id="sync-key" name="key" autocomplete="off" autocapitalize="characters"
                   spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" />
            <button class="btn btn-outline btn-block" type="submit">Connect this device</button>
          </form>
        </div>
      `,
    });
    return;
  }

  const st = sync.getStatus();
  openSheet({
    title: 'Sync is on',
    body: html`
      <p class="sheet-message">${syncNote()}${raw(st.account ? ` · ${esc(st.account.email)}` : '')}</p>
      <div class="sync-key">
        <span class="label">Your sync key</span>
        <code class="mono">${sync.keyText()}</code>
        <span class="t-sm ink-3">Enter it on your other devices in You → Flux → Sync. Keep it private:
          anyone with it and your Flux sign-in could read your synced copy.</span>
      </div>
      <div class="stack stack-2 mt-3">
        <button class="btn btn-outline btn-block" data-action="sync-copy-key">Copy sync key</button>
        <button class="btn btn-outline btn-block" data-action="sync-now">Sync now</button>
        <button class="btn btn-quiet btn-block" data-action="sync-stop">Turn off on this device</button>
        <button class="btn btn-quiet btn-block text-bad" data-action="sync-stop-delete">Turn off and delete the synced copy</button>
      </div>
    `,
  });
}

/** Both copies changed since they last met: the student chooses. Exported
    so main.js can ask the moment a sync finds it. */
export function showConflict() {
  openSheet({
    title: 'Which copy should Synara keep?',
    body: html`
      <p class="sheet-message">Synara changed on this device and on another one since they last
        synced. Pick the copy to keep; the other will be replaced.</p>
    `,
    footer: `
      <button class="btn btn-outline" data-action="sync-resolve" data-choice="cloud">Use the other device’s</button>
      <button class="btn btn-primary" data-action="sync-resolve" data-choice="device">Keep this device’s</button>
    `,
  });
}

const LEADS = [[0, 'On time'], [10, '10 min early'], [15, '15 min early'], [30, '30 min early']];

function remindersCard(state) {
  const { remindersOn, reminderLead } = state.settings;
  const cap = notify.support();
  const perm = notify.permission();
  const blocked = !cap.ok || perm === 'denied';
  const on = remindersOn && !blocked;

  const note = !cap.ok
    ? cap.reason
    : perm === 'denied'
      ? 'Notifications are blocked for this site in your browser settings.'
      : on ? 'On — while Synara is open in a tab or installed.' : 'A nudge at each dose time.';

  const leads = LEADS.map(([v, label]) => `
    <button class="segment" data-action="reminder-lead" data-value="${v}"
            aria-pressed="${v === reminderLead}">${label}</button>`).join('');

  return html`
    <section class="section" aria-labelledby="rem-h">
      <h2 id="rem-h">Reminders</h2>
      <div class="card card-flush">
        <div class="list-row list-row-static">
          <span class="med-dot" data-color="amber" aria-hidden="true">${raw(icon('bell', 20))}</span>
          <span class="row-body">
            <span class="row-t" id="rem-label">Dose reminders</span>
            <span class="row-s">${note}</span>
          </span>
          <button class="switch" data-action="reminders-toggle" role="switch"
                  aria-checked="${on}" aria-labelledby="rem-label"
                  ${raw(blocked ? 'disabled' : '')}></button>
        </div>
        ${raw(on ? `
          <div class="list-row list-row-static list-row-stack">
            <span class="row-t">When to remind you</span>
            <div class="segments segments-wrap" role="group" aria-label="Reminder timing">${leads}</div>
          </div>
          <button class="list-row" data-action="reminders-test">
            <span class="row-body">
              <span class="row-t">Send a test notification</span>
              <span class="row-s">Check it actually comes through on this device</span>
            </span>
            <span class="chev">${icon('chevron')}</span>
          </button>` : '')}
      </div>
      <div class="disclaimer">
        ${raw(icon('alert', 16))}
        <span>
          <strong>Keep a phone alarm as your real backup.</strong> A website can only
          remind you while it's running. Close the browser or restart the phone and
          the reminder is gone. Dependable reminders need a native app — the strongest
          reason to build Synara's next version in React Native.
        </span>
      </div>
    </section>
  `;
}

/* ---------- Appearance ---------- */

const THEMES = [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']];

function appearanceCard(state) {
  const current = state.settings.theme || 'system';
  const segments = THEMES.map(([value, label]) => `
    <button class="segment" data-action="theme-set" data-theme="${value}"
            aria-pressed="${value === current}">${label}</button>`).join('');

  return html`
    <section class="section" aria-labelledby="look-h">
      <h2 id="look-h">Appearance</h2>
      <div class="card">
        <div class="segments" role="group" aria-label="Theme">${raw(segments)}</div>
        <p class="hint mt-3">
          Dark mode is here for a reason: this app gets opened at 3am to log a
          seizure that just woke you. Nothing in Synara ever flashes or strobes.
        </p>
      </div>
    </section>
  `;
}

/* ---------- Data ---------- */

function dataCard(state) {
  const seizures = (state.seizures || []).length;
  const days = Object.keys(state.doses || {}).length;
  const checkins = Object.keys(state.checkins || {}).length;

  return html`
    <section class="section" aria-labelledby="data-h">
      <h2 id="data-h">Your data</h2>
      <div class="card card-flush">
        <ul class="rows">
          <li class="list-row list-row-static">
            <span class="med-dot" data-color="mint" aria-hidden="true">${raw(icon('lock', 20))}</span>
            <span class="row-body">
              <span class="row-t">Stored on this device only</span>
              <span class="row-s">${plural(days, 'day')} of doses · ${plural(seizures, 'seizure')} · ${plural(checkins, 'check-in')}</span>
            </span>
          </li>
          <li>
            <button class="list-row" data-action="data-export">
              <span class="med-dot" data-color="violet" aria-hidden="true">${raw(icon('down', 20))}</span>
              <span class="row-body">
                <span class="row-t">Download a backup</span>
                <span class="row-s">Everything in one file — keep it, or give it to your doctor</span>
              </span>
              <span class="chev">${raw(icon('chevron'))}</span>
            </button>
          </li>
          <li>
            <label class="list-row file-row">
              <span class="med-dot" data-color="blue" aria-hidden="true">${raw(icon('up', 20))}</span>
              <span class="row-body">
                <span class="row-t">Restore from a backup</span>
                <span class="row-s">Moving to a new phone? Load the file here</span>
              </span>
              <span class="chev">${raw(icon('chevron'))}</span>
              <input type="file" accept="application/json,.json" class="sr-only" data-change="data-import" />
            </label>
          </li>
          <li>
            <button class="list-row" data-action="data-demo">
              <span class="med-dot" data-color="amber" aria-hidden="true">${raw(icon('sparkle', 20))}</span>
              <span class="row-body">
                <span class="row-t">Load example data</span>
                <span class="row-s">Replaces everything with a demo record, to show someone the app</span>
              </span>
              <span class="chev">${raw(icon('chevron'))}</span>
            </button>
          </li>
          <li>
            <button class="list-row" data-action="data-wipe">
              <span class="med-dot" data-color="rose" aria-hidden="true">${raw(icon('trash', 20))}</span>
              <span class="row-body">
                <span class="row-t text-bad">Delete everything</span>
                <span class="row-s">Removes all of your data from this device</span>
              </span>
              <span class="chev">${raw(icon('chevron'))}</span>
            </button>
          </li>
        </ul>
      </div>
      <div class="disclaimer">
        ${raw(icon('info', 16))}
        <span>
          <strong>Nothing leaves this device.</strong> No account, no server, no
          analytics. That also means clearing your browser's data deletes it, and it
          won't follow you to a new phone on its own — download a backup now and then.
          Cloud sync is deliberately not built yet: once health data syncs to a server
          or a parent's phone, HIPAA, COPPA, and school-district rules all apply, and
          that conversation comes before the code.
        </span>
      </div>
    </section>
  `;
}

function aboutCard() {
  return html`
    <section class="section" aria-labelledby="about-h">
      <h2 id="about-h">About</h2>
      <div class="card">
        <p class="prose">
          <strong>Synara</strong> puts medication reminders, seizure tracking, and an
          emergency card in one place, built around school life rather than a clinic.
        </p>
        <hr class="hr" />
        <p class="t-sm ink-3 prose">
          Version 2.2 · a student project, not a medical device. Nothing here is
          medical advice — always confirm your care plan with your neurologist.
        </p>
        <hr class="hr" />
        <div class="about-flux">
          ${raw(poweredByFlux())}
          <span class="t-sm ink-3">Built and hosted by Flux, the free planner for school.</span>
        </div>
      </div>
    </section>
  `;
}

/* ============================================================
   Actions
   ============================================================ */

/** What's in a backup file, in words, before anything is replaced. */
function describeBackup(parsed) {
  const meds = Array.isArray(parsed.meds) ? parsed.meds.length : 0;
  const sz = Array.isArray(parsed.seizures) ? parsed.seizures.length : 0;
  const days = parsed.doses && typeof parsed.doses === 'object' ? Object.keys(parsed.doses).length : 0;
  const name = parsed.profile && typeof parsed.profile.name === 'string' && parsed.profile.name.trim();
  return `${name ? `${name.slice(0, 80)}'s record: ` : ''}${plural(meds, 'medication')}, ` +
         `${plural(days, 'day')} of doses, ${plural(sz, 'seizure')}.`;
}

export const actions = {
  'profile-edit'(node, state) {
    const p = state.profile;
    const fields = CARE_FIELDS.map(([key, label, ph]) => `
      <div class="field">
        <label class="label" for="p-${key}">${label}</label>
        <input class="input" id="p-${key}" name="${key}" value="${esc(p[key] || '')}"
               placeholder="${esc(ph)}" autocomplete="off" maxlength="200" />
      </div>`).join('');

    openSheet({
      title: 'Your details',
      body: html`<form class="stack stack-4" data-action="profile-save" novalidate>${raw(fields)}</form>`,
      footer: '<button class="btn btn-primary" data-action="profile-save">Save</button>',
    });
  },

  async 'profile-save'() {
    await store.updateProfile(sheetValues());
    closeSheet();
    toast('Details saved', 'ok');
  },

  async 'reminders-toggle'(node, state) {
    const turningOn = !state.settings.remindersOn;
    if (turningOn) {
      const cap = notify.support();
      if (!cap.ok) {
        toast(cap.reason, 'bad');
        return;
      }
      const perm = await notify.requestPermission();
      if (perm !== 'granted') {
        toast('Notifications weren\'t allowed', 'bad');
        return;
      }
    }
    await store.updateSettings({ remindersOn: turningOn });
    toast(turningOn ? 'Reminders on' : 'Reminders off', turningOn ? 'ok' : 'default');
  },

  async 'reminder-lead'(node) {
    await store.updateSettings({ reminderLead: Number(node.dataset.value) || 0 });
  },

  'reminders-test'() {
    const sent = notify.test();
    toast(sent ? 'Test sent — check your notifications' : 'Couldn\'t send a test', sent ? 'ok' : 'bad');
  },

  async 'theme-set'(node) {
    await store.updateSettings({ theme: node.dataset.theme });
  },

  'data-export'(node, state) {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const who = (state.profile.name || 'backup').replace(/[^\w-]+/g, '-').toLowerCase();
    a.href = url;
    a.download = `synara-${who}-${dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on a later tick so the download has definitely started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded', 'ok');
  },

  async 'data-import'(input) {
    const file = input.files && input.files[0];
    input.value = '';   // so choosing the same file again still fires
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('That file is too large to be a Synara backup', 'bad');
      return;
    }

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast('That file isn\'t a Synara backup', 'bad');
      return;
    }

    confirmSheet({
      title: 'Replace everything with this backup?',
      message: `${describeBackup(parsed)} Everything currently on this device will be replaced. ` +
               'Download a backup of what\'s here first if you might need it.',
      confirmLabel: 'Restore backup',
      danger: false,
      async onConfirm() {
        try {
          await store.importJSON(text);
          toast('Backup restored', 'ok');
        } catch (err) {
          toast(err.message === 'not-synara'
            ? 'That file isn\'t a Synara backup'
            : 'Couldn\'t read that backup', 'bad');
        }
      },
    });
  },

  'data-demo'() {
    const syncing = sync.enabled();
    confirmSheet({
      title: 'Load example data?',
      message: 'Everything on this device will be replaced with a made-up student\'s record. ' +
               'Download a backup first if any of what\'s here is real.' +
               (syncing ? ' Sync turns off on this device first, so the example never reaches your other devices.' : ''),
      confirmLabel: 'Load example data',
      async onConfirm() {
        // Otherwise the example would sync over the real record everywhere.
        if (syncing) await sync.stop();
        await store.reset({ seedFn: seed });
        toast('Example data loaded', 'ok');
      },
    });
  },

  'data-wipe'() {
    confirmSheet({
      title: 'Delete everything?',
      message: 'Every medication, dose, seizure, check-in, contact, and your safety card will be ' +
               'removed from this device. This can\'t be undone.',
      confirmLabel: 'Delete everything',
      async onConfirm() {
        // Stop syncing here first, or the empty record would sync over every
        // other device. The synced copy itself is left alone.
        await sync.stop();
        await store.wipe();
        try { sessionStorage.removeItem('synara.timer'); } catch { /* blocked */ }
        // Back to the first-run choice, exactly as if newly installed.
        history.replaceState(null, '', location.pathname);
        location.reload();
      },
    });
  },

  /* ---- Flux ---- */

  async 'flux-link-toggle'(node, state) {
    const on = !state.settings.fluxLink;
    await store.updateSettings({ fluxLink: on });
    toast(on ? 'Your dose times now show in your Flux Planner' : 'Removed from your Flux Planner', 'ok');
  },

  'sync-open'() {
    return openSyncSheet();
  },

  async 'sync-start-new'() {
    try {
      await sync.startNew();
      await closeSheet();
      toast('Sync is on', 'ok');
      openSyncSheet(); // straight to the sync key, which the next device needs
    } catch (e) {
      if (e.code === 'has-copy') offerFreshStart();
      else toast(syncError(e), 'bad');
    }
  },

  async 'sync-join-check'() {
    const { key } = sheetValues();
    let info;
    try {
      info = await sync.inspect(key);
    } catch (e) {
      toast(syncError(e), 'bad');
      return;
    }
    confirmSheet({
      title: 'Use your synced copy here?',
      message: `Your synced copy, updated ${ago(info.updatedAt)}, has ${plural(info.meds, 'medication')} and ` +
               `${plural(info.seizures, 'logged seizure')}${info.name ? ` for ${info.name}` : ''}. ` +
               'It will replace what is on this device now.',
      confirmLabel: 'Use synced copy',
      danger: false,
      async onConfirm() {
        try {
          await sync.join(info.key);
          toast('This device is synced', 'ok');
        } catch (e) {
          toast(syncError(e), 'bad');
        }
      },
    });
  },

  async 'sync-copy-key'() {
    try {
      await navigator.clipboard.writeText(sync.keyText());
      toast('Sync key copied', 'ok');
    } catch {
      toast('Couldn’t copy. Select the key and copy it instead.', 'bad');
    }
  },

  async 'sync-now'() {
    await closeSheet();
    const result = await sync.syncNow();
    if (result === 'error') toast(syncError(sync.getStatus()), 'bad');
    else if (result !== 'conflict') toast('Synced', 'ok');
  },

  'sync-stop'() {
    confirmSheet({
      title: 'Turn off sync on this device?',
      message: 'This device keeps everything it has. Your synced copy and your other devices are not changed.',
      confirmLabel: 'Turn off',
      danger: false,
      async onConfirm() {
        await sync.stop();
        toast('Sync is off on this device', 'ok');
      },
    });
  },

  'sync-stop-delete'() {
    confirmSheet({
      title: 'Delete the synced copy?',
      message: 'The encrypted copy in your Flux account is deleted and sync stops on every device. ' +
               'Each device keeps its own record.',
      confirmLabel: 'Delete synced copy',
      async onConfirm() {
        try {
          await sync.stop({ deleteCopy: true });
          toast('Synced copy deleted', 'ok');
        } catch (e) {
          toast(syncError(e), 'bad');
        }
      },
    });
  },

  async 'sync-resolve'(node) {
    await closeSheet();
    try {
      await sync.resolve(node.dataset.choice);
      toast('Synced', 'ok');
    } catch (e) {
      toast(syncError(e), 'bad');
    }
  },

  'sync-fresh'() {
    confirmSheet({
      title: 'Delete the old synced copy?',
      message: 'Only do this if you no longer have the device or the sync key it was made with. ' +
               'The old copy is deleted and this device becomes the new one to sync from.',
      confirmLabel: 'Delete and start fresh',
      async onConfirm() {
        try {
          await sync.stop({ deleteCopy: true });
          await sync.startNew();
          toast('Sync is on', 'ok');
          openSyncSheet();
        } catch (e) {
          toast(syncError(e), 'bad');
        }
      },
    });
  },
};

function syncError(e) {
  const code = (e && (e.code || e.error || e.message)) || '';
  if (code === 'bad-key') return 'That isn’t a sync key. It’s 26 letters and numbers.';
  if (code === 'no-copy') return 'There’s no synced copy in this Flux account yet. Turn sync on from your other device first.';
  if (code === 'wrong-key') return 'That key doesn’t open your synced copy. Check it on your other device.';
  return SYNC_ERRORS[code] || 'Couldn’t sync. Please try again.';
}

/** This Flux account already has a synced copy, made on another device. */
function offerFreshStart() {
  openSheet({
    title: 'You already have a synced copy',
    body: html`
      <p class="sheet-message">Your Flux account already has a synced copy of Synara. To use it here,
        enter the sync key from the device where you turned sync on (You → Flux → Sync).</p>
      <p class="sheet-message">Lost that device and its key? You can delete the old copy and start
        again from this one.</p>
    `,
    footer: `
      <button class="btn btn-quiet" data-action="sync-open">Enter a sync key</button>
      <button class="btn btn-danger" data-action="sync-fresh">Start fresh</button>
    `,
  });
}
