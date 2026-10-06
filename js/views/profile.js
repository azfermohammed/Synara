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
    confirmSheet({
      title: 'Load example data?',
      message: 'Everything on this device will be replaced with a made-up student\'s record. ' +
               'Download a backup first if any of what\'s here is real.',
      confirmLabel: 'Load example data',
      async onConfirm() {
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
        await store.wipe();
        try { sessionStorage.removeItem('synara.timer'); } catch { /* blocked */ }
        // Back to the first-run choice, exactly as if newly installed.
        history.replaceState(null, '', location.pathname);
        location.reload();
      },
    });
  },
};
