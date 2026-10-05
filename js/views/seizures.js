/* ============================================================
   views/seizures.js — seizure log, daily check-in, and patterns
   ------------------------------------------------------------
   Imported by main.js, and by views/safety.js (the emergency timer
   hands its measured duration to logSeizure()).

   The logging form is built to be filled in badly. Somebody writing
   this up ten minutes after a seizure is shaken, tired, and half-
   remembering — so everything except the time is optional, common
   answers are one tap, and a half-filled entry saves without
   complaint. A partial record is worth far more than an abandoned one.
   ============================================================ */

import {
  html, raw, esc, dayKey, timeOf, parseStamp, prettyDate, prettySeconds,
  prettyStamp, timeAgo, plural, monthName, clamp,
} from '../util.js';
import * as store from '../store.js';
import { insights, summary, DISCLAIMER } from '../insights.js';
import { icon, toast, openSheet, closeSheet, confirmSheet, sheetValues, sheetEl } from '../ui.js';

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

const STRESS_LABELS = ['', 'Calm', 'Fine', 'Busy', 'Stressed', 'Overwhelmed'];

/* Sub-tab and drafts are view state, not app state — never persisted. */
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
  const { daysSince } = summary(state);
  if (daysSince === 0) return `${entries(n)} · one today`;
  return `${entries(n)} · ${plural(daysSince, 'day')} since the last`;
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  return html`
    <div class="subtabs" role="tablist" aria-label="Seizure views">
      <button class="subtab" role="tab" id="tab-log" aria-controls="panel-sz"
              data-action="sz-tab" data-tab="log" aria-selected="${tab === 'log'}">
        ${raw(icon('note', 18))} Log
      </button>
      <button class="subtab" role="tab" id="tab-patterns" aria-controls="panel-sz"
              data-action="sz-tab" data-tab="patterns" aria-selected="${tab === 'patterns'}">
        ${raw(icon('sparkle', 18))} Patterns
      </button>
    </div>
    <div id="panel-sz" role="tabpanel" aria-labelledby="tab-${tab}" class="stack stack-5">
      ${raw(tab === 'log' ? logTab(state) : patternsTab(state))}
    </div>
  `;
}

/* ---------- Log tab ---------- */

function logRow(s) {
  const d = parseStamp(s.at);
  const meta = [];
  if (s.duration) meta.push(`<span class="pill">${icon('timer', 13)} ${prettySeconds(s.duration)}</span>`);
  if (s.trigger) meta.push(`<span class="pill pill-warn">${esc(s.trigger)}</span>`);
  if (s.place) meta.push(`<span class="pill">${esc(s.place)}</span>`);
  if (s.injury) meta.push('<span class="pill pill-bad">Injury</span>');
  if (s.emsCalled) meta.push('<span class="pill pill-bad">911 called</span>');

  return `
    <li>
      <button class="log-entry" data-action="seizure-open" data-id="${s.id}">
        <span class="log-date" aria-hidden="true">
          <span class="log-mon">${monthName(d.getMonth())}</span>
          <span class="log-day">${d.getDate()}</span>
        </span>
        <span class="log-body">
          <span class="log-t">${esc(s.type || 'Seizure')}</span>
          <span class="row-s">${prettyStamp(s.at)} · ${timeAgo(s.at)}</span>
          ${meta.length ? `<span class="log-meta">${meta.join('')}</span>` : ''}
          ${s.notes ? `<span class="log-note">${esc(s.notes)}</span>` : ''}
        </span>
        <span class="chev">${icon('chevron')}</span>
      </button>
    </li>`;
}

function historyByMonth(list) {
  const groups = [];
  for (const s of list) {
    const d = parseStamp(s.at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: `${monthName(d.getMonth())} ${d.getFullYear()}`, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups.map((g) => `
    <div class="month-group">
      <h3 class="eyebrow month-label">${g.label} · ${g.items.length}</h3>
      <div class="card card-flush"><ul class="rows">${g.items.map(logRow).join('')}</ul></div>
    </div>`).join('');
}

function checkinCard(checkin) {
  if (!checkin) {
    return html`
      <button class="card card-tap" data-action="checkin-open">
        <span class="row">
          <span class="med-dot" data-color="blue" aria-hidden="true">${raw(icon('moon', 20))}</span>
          <span class="row-body">
            <span class="row-t">Today's check-in</span>
            <span class="row-s">Sleep and stress, ten seconds. This is what the pattern finder compares seizures against.</span>
          </span>
          <span class="chev">${raw(icon('chevron'))}</span>
        </span>
      </button>
    `;
  }
  const sleep = checkin.sleepHours == null ? '—' : checkin.sleepHours;
  const stress = checkin.stress == null ? '—' : checkin.stress;
  return html`
    <button class="card card-tap" data-action="checkin-open">
      <span class="row">
        <span class="med-dot" data-color="mint" aria-hidden="true">${raw(icon('check', 20))}</span>
        <span class="row-body">
          <span class="row-t">Checked in today</span>
          <span class="row-s">${sleep} hours of sleep · stress ${stress} of 5 · tap to change</span>
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
    <button class="btn btn-primary btn-lg btn-block" data-action="seizure-open">
      ${raw(icon('plus', 20))} Log a seizure
    </button>

    ${raw(checkinCard(checkin))}

    ${raw(list.length ? `
      <section class="section" aria-labelledby="hist-h">
        <h2 id="hist-h">History</h2>
        ${historyByMonth(list)}
      </section>` : `
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">${icon('note', 32)}</span>
          <span class="empty-t">No seizures logged</span>
          <span class="empty-s">
            That's a good thing. When one happens, logging it here — even
            roughly — is what lets Synara spot patterns later.
          </span>
        </div>
      </div>`)}
  `;
}

/* ---------- Patterns tab ---------- */

function disclaimerBlock() {
  return html`
    <div class="disclaimer">
      ${raw(icon('info', 16))}
      <span><strong>About these patterns.</strong> ${DISCLAIMER}</span>
    </div>
  `;
}

function patternsTab(state) {
  const found = insights(state);
  const stats = summary(state);
  const n = (state.seizures || []).length;
  const checkins = Object.keys(state.checkins || {}).length;

  if (!found.length) {
    const needs = [];
    if (n < 3) needs.push(`at least 3 seizures logged (you have ${n})`);
    if (checkins < 13) needs.push(`about two weeks of daily check-ins (you have ${checkins})`);
    return html`
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">${raw(icon('sparkle', 32))}</span>
          <span class="empty-t">Nothing to report yet</span>
          <span class="empty-s">
            Synara would rather show you nothing than a coincidence dressed up
            as a finding.${needs.length
              ? ` Most patterns need ${needs.join(' and ')}.`
              : ' Nothing in your log clears the bar right now — which can be good news.'}
          </span>
        </div>
      </div>
      ${raw(disclaimerBlock())}
    `;
  }

  const cards = found.map((i) => `
    <li class="insight" data-tone="${i.tone}">
      <span class="insight-ico" aria-hidden="true">${icon(i.icon, 20)}</span>
      <span class="insight-body">
        <span class="insight-t">${esc(i.title)}</span>
        <span class="insight-d">${esc(i.detail)}</span>
        <span class="insight-e">${esc(i.evidence)}</span>
      </span>
    </li>`).join('');

  return html`
    <div class="stats">
      <div class="stat">
        <span class="stat-n">${stats.totalSeizures}</span>
        <span class="stat-l">Logged in total</span>
      </div>
      <div class="stat">
        <span class="stat-n">${stats.seizuresLast30}</span>
        <span class="stat-l">In the last 30 days</span>
      </div>
      <div class="stat">
        <span class="stat-n stat-n-sm">${stats.avgDurationLabel || '—'}</span>
        <span class="stat-l">Average length</span>
      </div>
    </div>

    <section class="section" aria-labelledby="patterns-h">
      <h2 id="patterns-h">What your log shows</h2>
      <ul class="stack stack-3">${raw(cards)}</ul>
    </section>

    ${raw(disclaimerBlock())}
  `;
}

/* ============================================================
   Seizure form
   ============================================================ */

function chipGroup(field, options, label) {
  const chips = options.map((o) => `
    <button type="button" class="chip" data-action="sz-chip" data-field="${field}"
            data-value="${esc(o)}" aria-pressed="${o === draft[field]}">${esc(o)}</button>`).join('');
  return `
    <div class="field">
      <span class="label" id="lbl-${field}">${label}</span>
      <div class="chips" role="group" aria-labelledby="lbl-${field}">${chips}</div>
    </div>`;
}

function seizureForm() {
  const mins = Math.floor(draft.duration / 60);
  const secs = draft.duration % 60;
  const today = dayKey();

  return html`
    <form class="stack stack-5" data-action="seizure-save" novalidate>
      ${raw(draft.fromTimer ? `
        <div class="insight" data-tone="good">
          <span class="insight-ico" aria-hidden="true">${icon('timer', 20)}</span>
          <span class="insight-body">
            <span class="insight-t">Timed at ${prettySeconds(draft.duration)}</span>
            <span class="insight-d">Start time and length came from the emergency timer. Everything else is optional.</span>
          </span>
        </div>` : '')}

      <div class="input-row">
        <div class="field grow">
          <label class="label" for="sz-date">Date</label>
          <input class="input" type="date" id="sz-date" name="date" value="${draft.date}" max="${today}" required />
        </div>
        <div class="field grow">
          <label class="label" for="sz-time">Started at</label>
          <input class="input" type="time" id="sz-time" name="time" value="${draft.time}" required />
        </div>
      </div>

      <div class="field">
        <span class="label" id="dur-label">How long did it last?</span>
        <div class="input-row duration-row" role="group" aria-labelledby="dur-label">
          <input class="input" type="number" inputmode="numeric" name="mins" min="0" max="120"
                 value="${mins}" aria-label="Minutes" />
          <span class="unit">min</span>
          <input class="input" type="number" inputmode="numeric" name="secs" min="0" max="59"
                 value="${secs}" aria-label="Seconds" />
          <span class="unit">sec</span>
        </div>
        <span class="hint">A guess is fine. Leave it at zero if nobody knows.</span>
      </div>

      ${raw(chipGroup('type', TYPES, 'Type'))}
      ${raw(chipGroup('trigger', TRIGGERS, 'Possible trigger'))}
      ${raw(chipGroup('place', PLACES, 'Where were you?'))}

      <div class="field">
        <label class="label" for="sz-aura">Warning signs beforehand</label>
        <input class="input" id="sz-aura" name="aura" value="${draft.aura}"
               placeholder="Metallic taste, dizziness, déjà vu…" autocomplete="off" maxlength="300" />
      </div>

      <div class="card card-flush">
        <label class="toggle-row">
          <span class="row-body">
            <span class="row-t">Were you injured?</span>
            <span class="row-s">Even a bitten cheek counts</span>
          </span>
          <input type="checkbox" class="check" name="injury" ${raw(draft.injury ? 'checked' : '')} />
        </label>
        <label class="toggle-row">
          <span class="row-body">
            <span class="row-t">Was 911 called?</span>
            <span class="row-s">Worth recording either way</span>
          </span>
          <input type="checkbox" class="check" name="emsCalled" ${raw(draft.emsCalled ? 'checked' : '')} />
        </label>
      </div>

      <div class="field">
        <label class="label" for="sz-notes">Anything else</label>
        <textarea class="textarea" id="sz-notes" name="notes" maxlength="4000"
                  placeholder="What happened, who was there, how you felt afterwards…">${draft.notes}</textarea>
      </div>
    </form>
  `;
}

function readSeizureDraft() {
  if (!draft) return;
  const v = sheetValues();
  for (const k of ['date', 'time', 'aura', 'notes', 'injury', 'emsCalled']) {
    if (v[k] !== undefined) draft[k] = v[k];
  }
  if (v.mins !== undefined || v.secs !== undefined) {
    const mins = clamp(Number(v.mins) || 0, 0, 120);
    const secs = clamp(Number(v.secs) || 0, 0, 59);
    draft.duration = mins * 60 + secs;
  }
}

function refreshSeizureSheet(focusSelector) {
  readSeizureDraft();
  const body = sheetEl().querySelector('.sheet-body');
  if (!body) return;
  const top = body.scrollTop;
  body.innerHTML = seizureForm();
  body.scrollTop = top;
  if (focusSelector) sheetEl().querySelector(focusSelector)?.focus({ preventScroll: true });
}

/**
 * Open the log form. `existing` edits an entry; `prefill` seeds a new
 * one — the emergency timer passes {at, duration}.
 */
function openSeizureSheet(existing, prefill = {}) {
  if (existing) {
    const [date, time] = existing.at.split('T');
    draft = { ...existing, date, time, fromTimer: false };
  } else {
    const at = prefill.at || `${dayKey()}T${timeOf()}`;
    const [date, time] = at.split('T');
    draft = {
      id: null, date, time, duration: prefill.duration || 0,
      type: '', trigger: '', place: '', aura: '',
      injury: false, emsCalled: false, notes: '',
      fromTimer: !!prefill.duration,
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

/** Entry point for the emergency timer. */
export function logSeizure(prefill) {
  openSeizureSheet(null, prefill);
}

/* ============================================================
   Check-in form
   ============================================================ */

function checkinForm() {
  const segments = [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="segment" data-action="checkin-stress" data-value="${n}"
            aria-pressed="${checkinDraft.stress === n}" aria-label="${n}, ${STRESS_LABELS[n]}">${n}</button>`).join('');

  return html`
    <div class="stack stack-6">
      <div class="field">
        <span class="label" id="sleep-label">How many hours did you sleep last night?</span>
        <div class="stepper" role="group" aria-labelledby="sleep-label">
          <button type="button" class="stepper-btn" data-action="checkin-sleep" data-value="-0.5"
                  aria-label="Half an hour less">−</button>
          <span class="sleep-n" aria-live="polite">${checkinDraft.sleepHours}<small>h</small></span>
          <button type="button" class="stepper-btn" data-action="checkin-sleep" data-value="0.5"
                  aria-label="Half an hour more">+</button>
        </div>
        <span class="hint text-center">
          Rough is fine. Short sleep is one of the most commonly reported
          seizure triggers, which is why it's asked first.
        </span>
      </div>

      <div class="field">
        <span class="label" id="stress-label">How stressed do you feel today?</span>
        <div class="segments" role="group" aria-labelledby="stress-label">${raw(segments)}</div>
        <span class="hint text-center">${STRESS_LABELS[checkinDraft.stress] || ''}</span>
      </div>

      <div class="field">
        <label class="label" for="ci-notes">Anything worth noting</label>
        <textarea class="textarea" id="ci-notes" name="notes" maxlength="600"
                  placeholder="Sick, travelling, exams…">${checkinDraft.notes}</textarea>
      </div>
    </div>
  `;
}

function refreshCheckinSheet(focusSelector) {
  const v = sheetValues();
  if (v.notes !== undefined) checkinDraft.notes = v.notes;
  const body = sheetEl().querySelector('.sheet-body');
  if (body) body.innerHTML = checkinForm();
  if (focusSelector) sheetEl().querySelector(focusSelector)?.focus({ preventScroll: true });
}

/* ============================================================
   Actions
   ============================================================ */

export const actions = {
  'sz-tab'(node) {
    tab = node.dataset.tab;
    store.refresh();
  },

  /** From the home screen's insight card: straight to Patterns. */
  'open-patterns'() {
    tab = 'patterns';
    if (location.hash === '#/track') store.refresh();
    else location.hash = '#/track';
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
    refreshSeizureSheet(`[data-action="sz-chip"][data-field="${field}"][data-value="${CSS.escape(value)}"]`);
  },

  async 'seizure-save'() {
    readSeizureDraft();

    const at = `${draft.date}T${draft.time}`;
    if (!draft.date || !draft.time || !store.isStamp(at)) {
      toast('A date and start time are needed', 'bad');
      return;
    }
    if (parseStamp(at).getTime() > Date.now() + 60000) {
      toast('That time is in the future', 'bad');
      return;
    }

    const payload = {
      at,
      duration: draft.duration,
      type: draft.type,
      trigger: draft.trigger,
      place: draft.place,
      aura: draft.aura,
      injury: !!draft.injury,
      emsCalled: !!draft.emsCalled,
      notes: draft.notes,
    };
    const editing = !!draft.id;

    if (editing) await store.updateSeizure(draft.id, payload);
    else await store.addSeizure(payload);

    closeSheet();
    toast(editing ? 'Entry updated' : 'Logged. Look after yourself today.', 'ok');
  },

  'seizure-delete'(node) {
    const id = node.dataset.id;
    confirmSheet({
      title: 'Delete this entry?',
      message: 'It will be removed from your history and from the pattern calculations. ' +
               'This can\'t be undone.',
      async onConfirm() {
        await store.removeSeizure(id);
        toast('Entry deleted');
      },
    });
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
      footer: '<button class="btn btn-primary" data-action="checkin-save">Save check-in</button>',
      onClose() { checkinDraft = null; },
    });
  },

  'checkin-sleep'(node) {
    const delta = Number(node.dataset.value);
    checkinDraft.sleepHours = clamp(Math.round((checkinDraft.sleepHours + delta) * 2) / 2, 0, 16);
    refreshCheckinSheet(`[data-action="checkin-sleep"][data-value="${node.dataset.value}"]`);
  },

  'checkin-stress'(node) {
    checkinDraft.stress = Number(node.dataset.value);
    refreshCheckinSheet(`[data-action="checkin-stress"][data-value="${node.dataset.value}"]`);
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
      notes: (checkinDraft.notes || '').trim(),
    });

    closeSheet();
    toast('Checked in', 'ok');
  },
};
