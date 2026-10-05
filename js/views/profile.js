/* ============================================================
   views/profile.js — care details, settings, and data control
   ------------------------------------------------------------
   Imported by main.js.

   The data section at the bottom matters more than it looks. This app
   holds a teenager's health record, so the honest answers to "where
   does this live" and "how do I get it out" belong in the product,
   not in a privacy policy nobody opens.

   Note there is no applyTheme() call here. Theme is derived from
   state, so main.js applies it in the render loop — a view reaching
   back into main would be an import cycle.
   ============================================================ */

import { html, raw, esc, dayKey, initials, plural } from '../util.js';
import * as store from '../store.js';
import { seed } from '../seed.js';
import { summary } from '../insights.js';
import * as notify from '../notify.js';
import {
  icon, toast, openSheet, closeSheet, confirmSheet, sheetValues,
} from '../ui.js';

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
  ['name', 'Name'],
  ['pronouns', 'Pronouns'],
  ['grade', 'Grade'],
  ['school', 'School'],
  ['seizureType', 'Seizure type'],
  ['diagnosed', 'Diagnosed'],
  ['neurologist', 'Neurologist'],
  ['neuroPhone', 'Neurologist phone'],
  ['allergies', 'Allergies'],
  ['bloodType', 'Blood type'],
];

export function render(state) {
  return html`
    ${raw(headerCard(state))}
    ${raw(careCard(state))}
    ${raw(remindersCard(state))}
    ${raw(appearanceCard(state))}
    ${raw(dataCard(state))}
    ${raw(aboutCard())}
  `;
}

function headerCard(state) {
  const { profile } = state;
  const stats = summary(state);
  const meta = [profile.pronouns, profile.grade].filter(Boolean).join(' · ');

  return html`
    <div class="card card-flush">
      <div class="profile-head">
        <span class="avatar avatar-lg" aria-hidden="true">${initials(profile.name) || '?'}</span>
        <span class="row-body">
          <span class="profile-n">${profile.name || 'Add your name'}</span>
          <span class="profile-s">${meta || 'Tap edit to fill this in'}</span>
        </span>
        <button class="icon-btn" data-action="profile-edit" aria-label="Edit details">
          ${raw(icon('edit'))}
        </button>
      </div>
      <div class="stats" style="padding:0 var(--s-5) var(--s-5)">
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
      <span class="kv-k">${label}</span>
      <span class="kv-v">${profile[key] ? esc(profile[key]) : '<span class="ink-faint">—</span>'}</span>
    </div>`).join('');

  return html`
    <div class="section">
      <div class="section-head">
        <h2>Care details</h2>
        <button class="btn btn-sm btn-quiet" data-action="profile-edit">Edit</button>
      </div>
      <div class="card card-flush">
        <div class="kv">${raw(rows)}</div>
      </div>
      <p class="hint">
        These appear on the emergency card, so whoever helps you has them
        without having to ask.
      </p>
    </div>
  `;
}

/* ---------- Reminders ---------- */

function remindersCard(state) {
  const { remindersOn } = state.settings;
  const cap = notify.support();
  const perm = notify.permission();

  const blocked = !cap.ok || perm === 'denied';
  const note = !cap.ok
    ? cap.reason
    : perm === 'denied'
      ? 'Notifications are blocked for this site in your browser settings.'
      : remindersOn
        ? 'Scheduled while Synara is open in a tab.'
        : 'Get a nudge at each dose time.';

  const testRow = remindersOn && !blocked ? `
    <button class="list-row" data-action="reminders-test">
      <span class="row-body">
        <span class="row-t">Send a test notification</span>
        <span class="row-s">Check it actually comes through</span>
      </span>
      <span class="chev">${icon('chevron')}</span>
    </button>` : '';

  return html`
    <div class="section">
      <h2>Reminders</h2>
      <div class="card card-flush">
        <div class="rows">
          <div class="list-row">
            <span class="med-dot" data-color="amber" aria-hidden="true">🔔</span>
            <span class="row-body">
              <span class="row-t">Dose reminders</span>
              <span class="row-s">${note}</span>
            </span>
            <button class="switch" data-action="reminders-toggle"
                    role="switch" aria-checked="${remindersOn && !blocked}"
                    aria-label="Dose reminders"
                    ${raw(blocked ? 'disabled style="opacity:.4"' : '')}></button>
          </div>
          ${raw(testRow)}
        </div>
      </div>

      <div class="disclaimer">
        <strong>Be careful trusting this with a real dose.</strong>
        A website can only fire a reminder while it is open in a tab. Close the
        browser or restart the phone and the reminder is gone. Making dose
        reminders genuinely dependable needs a native app — that is the single
        strongest reason to build Synara in React Native rather than leaving it
        on the web. Until then, keep a phone alarm as your real backup.
      </div>
    </div>
  `;
}

/* ---------- Appearance ---------- */

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

function appearanceCard(state) {
  const current = state.settings.theme || 'system';
  const segments = THEMES.map(([value, label]) => `
    <button class="segment" data-action="theme-set" data-theme="${value}"
            aria-pressed="${value === current}">${label}</button>`).join('');

  return html`
    <div class="section">
      <h2>Appearance</h2>
      <div class="card">
        <div class="segments">${raw(segments)}</div>
        <p class="hint" style="margin-top:var(--s-3)">
          Dark mode is here for a reason: this app gets opened at 3am to log a
          seizure that just woke you, and a full-white screen at that moment is
          genuinely unpleasant. Nothing in Synara flashes or strobes.
        </p>
      </div>
    </div>
  `;
}

/* ---------- Data ---------- */

function dataCard(state) {
  const seizures = (state.seizures || []).length;
  const days = Object.keys(state.doses || {}).length;
  const checkins = Object.keys(state.checkins || {}).length;

  return html`
    <div class="section">
      <h2>Your data</h2>
      <div class="card card-flush">
        <div class="rows">
          <div class="list-row">
            <span class="row-body">
              <span class="row-t">Stored on this device only</span>
              <span class="row-s">
                ${plural(days, 'day')} of doses · ${plural(seizures, 'seizure')} ·
                ${checkins} check-ins
              </span>
            </span>
          </div>
          <button class="list-row" data-action="data-export">
            <span class="row-body">
              <span class="row-t">Export as a file</span>
              <span class="row-s">Everything as JSON — for a doctor, or a backup</span>
            </span>
            <span class="chev">${raw(icon('down'))}</span>
          </button>
          <button class="list-row" data-action="data-reset">
            <span class="row-body">
              <span class="row-t" style="color:var(--bad-ink)">Reset to example data</span>
              <span class="row-s">Wipes everything and reloads the demo</span>
            </span>
            <span class="chev">${raw(icon('chevron'))}</span>
          </button>
        </div>
      </div>

      <div class="disclaimer">
        <strong>Nothing leaves this device.</strong>
        Your meds, seizures, and safety card live in this browser's storage and
        are never uploaded. That also means clearing your browser data deletes
        them, and they do not follow you to another phone — so export a copy
        now and then. Cloud sync is deliberately not built yet: the moment
        health data syncs to a server or a parent's phone, HIPAA, COPPA, and
        school-district rules all apply, and that is a real conversation to
        have before writing the code rather than after.
      </div>
    </div>
  `;
}

function aboutCard() {
  return html`
    <div class="section">
      <h2>About</h2>
      <div class="card">
        <p style="line-height:var(--lh-body)">
          <strong>Synara</strong> puts medication reminders, seizure tracking,
          and an emergency card in one place, built around school life rather
          than a clinic.
        </p>
        <hr class="hr" />
        <p class="t-sm ink-3" style="line-height:var(--lh-body)">
          Version 2 · a student project, not a medical device. Nothing here is
          medical advice. Always confirm your care plan with your neurologist.
        </p>
      </div>
    </div>
  `;
}

/* ============================================================
   Actions
   ============================================================ */

export const actions = {
  'profile-edit'(node, state) {
    const p = state.profile;
    const fields = CARE_FIELDS.map(([key, label]) => `
      <div class="field">
        <label class="label" for="p-${key}">${label}</label>
        <input class="input" id="p-${key}" name="${key}"
               value="${esc(p[key] || '')}" autocomplete="off" />
      </div>`).join('');

    openSheet({
      title: 'Your details',
      body: html`<div class="stack stack-4">${raw(fields)}</div>`,
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
        toast('Notification permission was not granted', 'bad');
        return;
      }
    }

    await store.updateSettings({ remindersOn: turningOn });
    toast(turningOn ? 'Reminders on' : 'Reminders off', turningOn ? 'ok' : 'default');
  },

  'reminders-test'() {
    toast(notify.test() ? 'Test sent' : 'Could not send a test', 'ok');
  },

  /** main.js applies the theme on the resulting re-render. */
  async 'theme-set'(node) {
    await store.updateSettings({ theme: node.dataset.theme });
  },

  /** Download the whole state as a file. */
  'data-export'(node, state) {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const who = (state.profile.name || 'export').replace(/\s+/g, '-').toLowerCase();
    a.href = url;
    a.download = `synara-${who}-${dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on a later tick so the download has definitely started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported', 'ok');
  },

  'data-reset'() {
    confirmSheet({
      title: 'Reset to example data?',
      message: 'Everything you have logged will be deleted and replaced with ' +
               'the demo record. This cannot be undone — export a copy first ' +
               'if any of it is real.',
      confirmLabel: 'Reset everything',
      async onConfirm() {
        await store.reset({ seedFn: seed });
        toast('Reset to example data', 'ok');
      },
    });
  },
};
