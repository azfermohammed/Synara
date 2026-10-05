/* ============================================================
   views/seizures.js — seizure log, daily check-in, and patterns
   ------------------------------------------------------------
   Imported by main.js.

   The logging form is optimised for being filled in badly. Somebody
   writing this up ten minutes after a seizure is shaken, tired, and
   half-remembering — so every field except the time is optional, the
   common answers are one tap, and a half-filled entry saves without
   complaint. A partial record is worth far more than an abandoned one.
   ============================================================ */

import {
  html, raw, map, esc, dayKey, timeOf, parseStamp,
  prettyDate, prettySeconds, prettyStamp, timeAgo, plural, monthName, clamp,
} from '../util.js';
import * as store from '../store.js';
import { insights, summary, DISCLAIMER } from '../insights.js';
import { icon, toast, openSheet, closeSheet, confirmSheet, sheetValues } from '../ui.js';

const TYPES = [
  'Focal aware', 'Focal impaired awareness', 'Tonic-clonic',
  'Absence', 'Myoclonic', 'Atonic', 'Not sure',
];

const TRIGGERS = [
  'Missed dose', 'Missed sleep', 'Stress', 'Illness or fever',
  'Flashing lights', 'Skipped meal', 'Dehydration', 'Period', 'None known',
];

const PLACES = [
  'Home', 'School — classroom', 'School — hallway', 'School — gym',
  'School — cafeteria', 'Outside', 'In a car', 'Other',
];

/* Sub-tab and drafts live at module scope: they are view state, not
   app state, and should not be persisted. */
let tab = 'log';
let draft = null;
let checkinDraft = null;

const entries = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/* ============================================================
   Header
   ============================================================ */

export function title() {
  return 'Seizures';
}

export function subtitle(state) {
  const n = (state.seizures || []).length;
  if (!n) return 'Nothing logged yet';
  const stats = summary(state);
  return stats.daysSince === 0
    ? `${entries(n)} · one today`
    : `${entries(n)} · ${plural(stats.daysSince, 'day')} since the last`;
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  return html`
    <div class="subtabs" role="tablist">
      <button class="subtab" role="tab" data-action="sz-tab" data-tab="log"
              aria-selected="${tab === 'log'}">Log</button>
      <button class="subtab" role="tab" data-action="sz-tab" data-tab="patterns"
              aria-selected="${tab === 'patterns'}">Patterns</button>
    </div>
    ${raw(tab === 'log' ? logTab(state) : patternsTab(state))}
  `;
}

/* ---------- Log tab ---------- */

function logRow(s) {
  const d = parseStamp(s.at);
  const meta = [];
  if (s.duration) meta.push(`<span class="pill">${prettySeconds(s.duration)}</span>`);
  if (s.trigger) meta.push(`<span class="pill pill-warn">${esc(s.trigger)}</span>`);
  if (s.place) meta.push(`<span class="pill">${esc(s.place)}</span>`);
  if (s.injury) meta.push('<span class="pill pill-bad">Injury</span>');
  if (s.emsCalled) meta.push('<span class="pill pill-bad">911 called</span>');

  return `
    <button class="log-entry" data-action="seizure-open" data-id="${s.id}">
      <span class="log-date">
        <span class="log-mon">${monthName(d.getMonth())}</span>
        <span class="log-day">${d.getDate()}</span>
      </span>
      <span class="log-body">
        <span class="log-t">${esc(s.type || 'Seizure')}</span>
        <span class="row-s">${prettyStamp(s.at)} · ${timeAgo(s.at)}</span>
        ${meta.length ? `<span class="log-meta">${meta.join('')}</span>` : ''}
        ${s.notes ? `<span class="log-note">${esc(s.notes)}</span>` : ''}
      </span>
    </button>`;
}

function checkinCard(checkin) {
  if (!checkin) {
    return html`
      <button class="card card-tap" data-action="checkin-open">
        <span class="row">
          <span class="med-dot" data-color="blue" aria-hidden="true">🌙</span>
          <span class="row-body">
            <span class="row-t">Today's check-in</span>
            <span class="row-s">
              Sleep and stress, ten seconds. This is what the pattern finder
              compares seizures against.
            </span>
          </span>
          <span class="chev">${raw(icon('chevron'))}</span>
        </span>
      </button>
    `;
  }

  return html`
    <button class="card card-tap" data-action="checkin-open">
      <span class="row">
        <span class="med-dot" data-color="mint" aria-hidden="true">✓</span>
        <span class="row-body">
          <span class="row-t">Checked in today</span>
          <span class="row-s">
            ${checkin.sleepHours} hours of sleep · stress ${checkin.stress} of 5
          </span>
        </span>
        <span class="chev">${raw(icon('chevron'))}</span>
      </span>
    </button>
  `;
}

function logTab(state) {
  const list = state.seizures || [];
  const checkin = store.getCheckin(dayKey(), state);

  return html`
    <button class="btn btn-primary btn-block" data-action="seizure-open">
      ${raw(icon('plus', 18))} Log a seizure
    </button>

    ${raw(checkinCard(checkin))}

    ${raw(list.length ? `
      <div class="section">
        <h2>History</h2>
        <div class="card card-flush">
          <div class="rows">${list.map(logRow).join('')}</div>
        </div>
      </div>` : `
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">📋</span>
          <span class="empty-t">No seizures logged</span>
          <span class="empty-s">
            That is a good thing. When one happens, logging it here is what
            lets Synara find patterns later.
          </span>
        </div>
      </div>`)}
  `;
}

/* ---------- Patterns tab ---------- */

function disclaimerBlock() {
  return html`
    <div class="disclaimer">
      <strong>About these patterns.</strong> ${DISCLAIMER}
    </div>
  `;
}

function patternsTab(state) {
  const found = insights(state);
  const stats = summary(state);
  const n = (state.seizures || []).length;

  if (!found.length) {
    return html`
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">🔍</span>
          <span class="empty-t">Not enough logged yet</span>
          <span class="empty-s">
            ${n < 2
              ? 'Synara needs at least a couple of seizures logged before it will say anything about patterns.'
              : 'Nothing here clears the bar yet. Synara would rather show you nothing than a coincidence dressed up as a finding.'}
          </span>
        </div>
      </div>
      ${raw(disclaimerBlock())}
    `;
  }

  return html`
    <div class="stats">
      <div class="stat">
        <span class="stat-n">${stats.totalSeizures}</span>
        <span class="stat-l">Logged<br/>in total</span>
      </div>
      <div class="stat">
        <span class="stat-n">${stats.seizuresLast30}</span>
        <span class="stat-l">In the<br/>last 30 days</span>
      </div>
      <div class="stat">
        <span class="stat-n">${stats.avgDuration ?? '—'}</span>
        <span class="stat-l">Average<br/>length (sec)</span>
      </div>
    </div>

    <div class="section">
      <h2>What your log shows</h2>
      <div class="stack stack-3">
        ${map(found, (i) => `
          <div class="insight" data-tone="${i.tone}">
            <span class="insight-ico" aria-hidden="true">${i.icon}</span>
            <span class="insight-body">
              <span class="insight-t">${esc(i.title)}</span>
              <span class="insight-d">${esc(i.detail)}</span>
              <span class="insight-e">${esc(i.evidence)}</span>
            </span>
          </div>`)}
      </div>
    </div>

    ${raw(disclaimerBlock())}
  `;
}

/* ============================================================
   Seizure form
   ============================================================ */

function seizureForm() {
  const mins = Math.floor(draft.duration / 60);
  const secs = draft.duration % 60;

  return html`
    <div class="stack stack-5">
      <div class="input-row">
        <div class="field grow">
          <label class="label" for="sz-date">Date</label>
          <input class="input" type="date" id="sz-date" name="date" value="${draft.date}" />
        </div>
        <div class="field grow">
          <label class="label" for="sz-time">Time</label>
          <input class="input" type="time" id="sz-time" name="time" value="${draft.time}" />
        </div>
      </div>

      <div class="field">
        <span class="label">How long did it last?</span>
        <div class="input-row">
          <input class="input" type="number" name="mins" min="0" max="120"
                 value="${mins}" aria-label="Minutes" />
          <span class="row shrink-0 ink-3 t-sm">min</span>
          <input class="input" type="number" name="secs" min="0" max="59"
                 value="${secs}" aria-label="Seconds" />
          <span class="row shrink-0 ink-3 t-sm">sec</span>
        </div>
        <span class="hint">An estimate is fine. Leave it at zero if you don't know.</span>
      </div>

      <div class="field">
        <span class="label">Type</span>
        <div class="chips">
          ${map(TYPES, (t) => `
            <button class="chip" data-action="sz-chip" data-field="type" data-value="${esc(t)}"
                    aria-pressed="${t === draft.type}">${esc(t)}</button>`)}
        </div>
      </div>

      <div class="field">
        <span class="label">Possible trigger</span>
        <div class="chips">
          ${map(TRIGGERS, (t) => `
            <button class="chip" data-action="sz-chip" data-field="trigger" data-value="${esc(t)}"
                    aria-pressed="${t === draft.trigger}">${esc(t)}</button>`)}
        </div>
      </div>

      <div class="field">
        <span class="label">Where were you?</span>
        <div class="chips">
          ${map(PLACES, (p) => `
            <button class="chip" data-action="sz-chip" data-field="place" data-value="${esc(p)}"
                    aria-pressed="${p === draft.place}">${esc(p)}</button>`)}
        </div>
      </div>

      <div class="field">
        <label class="label" for="sz-aura">Warning signs beforehand</label>
        <input class="input" id="sz-aura" name="aura" value="${draft.aura}"
               placeholder="Metallic taste, dizziness…" autocomplete="off" />
      </div>

      <div class="card card-tight">
        <label class="row-between" style="cursor:pointer">
          <span class="row-body">
            <span class="row-t">Were you injured?</span>
            <span class="row-s">Even a bitten cheek counts</span>
          </span>
          <input type="checkbox" name="injury" ${draft.injury ? 'checked' : ''}
                 style="width:22px;height:22px;accent-color:var(--brand)" />
        </label>
      </div>

      <div class="card card-tight">
        <label class="row-between" style="cursor:pointer">
          <span class="row-body">
            <span class="row-t">Was 911 called?</span>
            <span class="row-s">Worth recording either way</span>
          </span>
          <input type="checkbox" name="emsCalled" ${draft.emsCalled ? 'checked' : ''}
                 style="width:22px;height:22px;accent-color:var(--brand)" />
        </label>
      </div>

      <div class="field">
        <label class="label" for="sz-notes">Anything else</label>
        <textarea class="textarea" id="sz-notes" name="notes"
                  placeholder="What happened, who was there, how you felt afterwards…">${draft.notes}</textarea>
      </div>
    </div>
  `;
}

function readSeizureDraft() {
  if (!draft) return;
  const v = sheetValues();
  if (v.date !== undefined) draft.date = v.date;
  if (v.time !== undefined) draft.time = v.time;
  if (v.aura !== undefined) draft.aura = v.aura;
  if (v.notes !== undefined) draft.notes = v.notes;
  if (v.injury !== undefined) draft.injury = v.injury;
  if (v.emsCalled !== undefined) draft.emsCalled = v.emsCalled;

  const mins = Number(v.mins) || 0;
  const secs = Number(v.secs) || 0;
  draft.duration = clamp(mins * 60 + secs, 0, 7200);
}

function refreshSeizureSheet() {
  readSeizureDraft();
  const body = document.querySelector('.sheet-body');
  if (body) body.innerHTML = seizureForm();
}

function openSeizureSheet(existing) {
  if (existing) {
    const [date, time] = existing.at.split('T');
    draft = { ...existing, date, time };
  } else {
    draft = {
      id: null, date: dayKey(), time: timeOf(), duration: 0,
      type: '', trigger: '', place: '', aura: '',
      injury: false, emsCalled: false, notes: '',
    };
  }

  openSheet({
    title: existing ? 'Edit entry' : 'Log a seizure',
    body: seizureForm(),
    footer: `
      ${existing
        ? `<button class="btn btn-danger-soft" data-action="seizure-delete" data-id="${existing.id}">Delete</button>`
        : ''}
      <button class="btn btn-primary" data-action="seizure-save">Save</button>
    `,
    onClose() { draft = null; },
  });
}

/* ============================================================
   Check-in form
   ============================================================ */

const STRESS_LABELS = ['', 'Calm', 'Fine', 'Busy', 'Stressed', 'Overwhelmed'];

function checkinForm() {
  return html`
    <div class="stack stack-6">
      <div class="field">
        <span class="label">How many hours did you sleep?</span>
        <div class="stepper">
          <button class="stepper-btn" data-action="checkin-sleep" data-delta="-0.5"
                  aria-label="Less sleep">−</button>
          <span class="sleep-n">${checkinDraft.sleepHours}</span>
          <button class="stepper-btn" data-action="checkin-sleep" data-delta="0.5"
                  aria-label="More sleep">+</button>
        </div>
        <span class="hint text-center">
          Rough is fine. Short sleep is one of the most common seizure triggers,
          which is why it is the first thing asked.
        </span>
      </div>

      <div class="field">
        <span class="label">How stressed do you feel?</span>
        <div class="segments">
          ${map([1, 2, 3, 4, 5], (n) => `
            <button class="segment" data-action="checkin-stress" data-value="${n}"
                    aria-pressed="${checkinDraft.stress === n}">${n}</button>`)}
        </div>
        <span class="hint text-center">${STRESS_LABELS[checkinDraft.stress] || ''}</span>
      </div>

      <div class="field">
        <label class="label" for="ci-notes">Anything worth noting</label>
        <textarea class="textarea" id="ci-notes" name="notes"
                  placeholder="Sick, travelling, exams…">${checkinDraft.notes}</textarea>
      </div>
    </div>
  `;
}

function refreshCheckinSheet() {
  const body = document.querySelector('.sheet-body');
  if (body) body.innerHTML = checkinForm();
}

/* ============================================================
   Actions
   ============================================================ */

export const actions = {
  'sz-tab'(node) {
    tab = node.dataset.tab;
    // Nothing in the store changed, so commit a no-op to drive the
    // subscriber re-render. Cheaper than exporting a render hook.
    store.update(() => {});
  },

  'seizure-open'(node, state) {
    const id = node.dataset.id;
    openSeizureSheet(id ? state.seizures.find((s) => s.id === id) : null);
  },

  'sz-chip'(node) {
    readSeizureDraft();
    const { field, value } = node.dataset;
    // Tapping the selected chip again clears it — these are guesses,
    // and an unsure answer should be easy to take back.
    draft[field] = draft[field] === value ? '' : value;
    refreshSeizureSheet();
  },

  async 'seizure-save'() {
    readSeizureDraft();

    if (!draft.date || !draft.time) {
      toast('A date and time are needed', 'bad');
      return;
    }

    const payload = {
      at: `${draft.date}T${draft.time}`,
      duration: draft.duration,
      type: draft.type,
      trigger: draft.trigger,
      place: draft.place,
      aura: draft.aura,
      injury: draft.injury,
      emsCalled: draft.emsCalled,
      notes: draft.notes,
    };
    const editing = !!draft.id;

    if (editing) await store.updateSeizure(draft.id, payload);
    else await store.addSeizure(payload);

    closeSheet();
    toast(editing ? 'Entry updated' : 'Seizure logged', 'ok');
  },

  'seizure-delete'(node) {
    const id = node.dataset.id;
    closeSheet();
    setTimeout(() => {
      confirmSheet({
        title: 'Delete this entry?',
        message: 'It will be removed from your history and from the pattern ' +
                 'calculations. This cannot be undone.',
        async onConfirm() {
          await store.removeSeizure(id);
          toast('Entry deleted');
        },
      });
    }, 320);
  },

  'checkin-open'(node, state) {
    const today = dayKey();
    const existing = store.getCheckin(today, state);
    checkinDraft = {
      sleepHours: existing && existing.sleepHours != null ? existing.sleepHours : 8,
      stress: existing && existing.stress != null ? existing.stress : 2,
      notes: (existing && existing.notes) || '',
    };

    openSheet({
      title: `Check-in · ${prettyDate(today)}`,
      body: checkinForm(),
      footer: '<button class="btn btn-primary" data-action="checkin-save">Save</button>',
      onClose() { checkinDraft = null; },
    });
  },

  'checkin-sleep'(node) {
    const v = sheetValues();
    if (v.notes !== undefined) checkinDraft.notes = v.notes;
    checkinDraft.sleepHours = clamp(
      Math.round((checkinDraft.sleepHours + Number(node.dataset.delta)) * 2) / 2,
      0, 16
    );
    refreshCheckinSheet();
  },

  'checkin-stress'(node) {
    const v = sheetValues();
    if (v.notes !== undefined) checkinDraft.notes = v.notes;
    checkinDraft.stress = Number(node.dataset.value);
    refreshCheckinSheet();
  },

  async 'checkin-save'() {
    const v = sheetValues();
    if (v.notes !== undefined) checkinDraft.notes = v.notes;

    const hours = checkinDraft.sleepHours;
    await store.setCheckin(dayKey(), {
      sleepHours: hours,
      sleepQuality: hours < 6 ? 'poor' : hours < 7 ? 'ok' : 'good',
      stress: checkinDraft.stress,
      mood: checkinDraft.stress >= 4 ? 'low' : 'ok',
      notes: checkinDraft.notes,
    });

    closeSheet();
    toast('Checked in', 'ok');
  },
};
