/* ============================================================
   views/meds.js — MedMinder
   ------------------------------------------------------------
   Imported by main.js. Owns the medication list, the tap-to-cycle
   dose log, and the adherence calendar.

   The tick cycle (pending → taken → late → missed → pending) is
   deliberately a single control rather than four buttons per dose.
   Logging has to be nearly free or it stops happening, and a student
   marking twelve doses a week will not tolerate a menu each time.
   ============================================================ */

import {
  html, raw, map, esc, dayKey, parseKey,
  prettyTime, prettyDate, plural, dayName, minutesOf, doseLabel,
} from '../util.js';
import * as store from '../store.js';
import { calendarDays } from '../insights.js';
import { icon, toast, openSheet, closeSheet, confirmSheet, sheetValues } from '../ui.js';

const COLORS = ['violet', 'mint', 'amber', 'rose', 'blue'];
const FORMS = ['tablet', 'capsule', 'liquid', 'patch', 'injection', 'other'];

const SWATCH = {
  violet: 'brand', mint: 'ok', amber: 'warn', rose: 'bad', blue: 'info',
};

/* Draft state for the add/edit sheet. Held here rather than in the
   store so an abandoned edit never touches saved data. */
let draft = null;

/* ============================================================
   Header
   ============================================================ */

export function title() {
  return 'Medications';
}

export function subtitle(state) {
  const meds = store.activeMeds(state);
  if (!meds.length) return 'Nothing added yet';
  const doses = meds.reduce((n, m) => n + m.times.length, 0);
  return `${plural(meds.length, 'medication')} · ${plural(doses, 'dose')} a day`;
}

/* ============================================================
   Render
   ============================================================ */

const GLYPH = { taken: '✓', late: '!', missed: '✕', pending: '' };
const STATUS_LABEL = {
  taken: 'Taken', late: 'Taken late', missed: 'Missed', pending: 'Not logged yet',
};

export function render(state) {
  const meds = store.activeMeds(state);

  if (!meds.length) {
    return html`
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">💊</span>
          <span class="empty-t">No medications yet</span>
          <span class="empty-s">
            Add what you take and when. Synara will track every dose and
            build a history you can actually show a doctor.
          </span>
          <button class="btn btn-primary" data-action="med-open">
            Add a medication
          </button>
        </div>
      </div>
    `;
  }

  return html`
    ${raw(todaySection(state, meds))}
    ${raw(calendarSection(state))}
    ${raw(medListSection(meds))}
  `;
}

/* ---------- Today ---------- */

function todaySection(state, meds) {
  const today = dayKey();
  const rows = [];

  for (const med of meds) {
    for (const time of med.times) {
      rows.push({ med, time, status: store.doseStatus(today, med.id, time, state) });
    }
  }
  rows.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));

  return html`
    <div class="section">
      <div class="section-head">
        <h2>Today</h2>
        <span class="t-sm ink-3">${prettyDate(today, { relative: false })}</span>
      </div>
      <div class="card card-flush">
        <div class="rows">
          ${map(rows, (r) => `
            <div class="dose-row">
              <span class="med-dot" data-color="${esc(r.med.color)}" aria-hidden="true">💊</span>
              <span class="dose-body">
                <span class="dose-name">${esc(r.med.name)} ${esc(r.med.dose)}</span>
                <span class="dose-meta">${prettyTime(r.time)} · ${doseLabel(r.status, r.time)}</span>
              </span>
              <button class="tick" data-status="${r.status}"
                      data-action="dose-cycle"
                      data-med="${r.med.id}" data-time="${r.time}" data-day="${today}"
                      aria-label="${esc(r.med.name)} at ${prettyTime(r.time)}: ${doseLabel(r.status, r.time)}. Tap to change.">
                ${GLYPH[r.status]}
              </button>
            </div>`)}
        </div>
      </div>
      <p class="hint">Tap a circle to cycle: taken → late → missed → not logged.</p>
    </div>
  `;
}

/* ---------- Calendar ----------

   Four weeks of adherence with seizure days ringed, so the two things
   the app tracks can be compared by eye on one grid. */

function calendarSection(state) {
  const days = calendarDays(state, 28);
  const today = dayKey();

  // Pad the front so the first column is always Sunday.
  const firstDow = parseKey(days[0].day).getDay();
  const pad = Array.from({ length: firstDow }, () => null);

  return html`
    <div class="section">
      <h2>Last four weeks</h2>
      <div class="card">
        <div class="cal">
          ${map([0, 1, 2, 3, 4, 5, 6], (i) =>
            `<div class="cal-dow">${dayName(i).slice(0, 1)}</div>`)}
          ${map(pad, () => '<div></div>')}
          ${map(days, (d) => {
            const n = parseKey(d.day).getDate();
            const label = `${prettyDate(d.day, { relative: false })}: ` +
              (d.total ? `${d.taken} of ${d.total} doses on time` : 'nothing logged') +
              (d.seizure ? ', seizure logged' : '');
            return `
              <button class="cal-day"
                      data-status="${d.status}"
                      data-today="${d.day === today}"
                      data-seizure="${d.seizure}"
                      data-action="cal-day" data-day="${d.day}"
                      title="${esc(label)}" aria-label="${esc(label)}">
                ${n}
              </button>`;
          })}
        </div>
        <div class="cal-legend">
          <span class="cal-key"><span class="cal-swatch" style="background:var(--ok)"></span>All on time</span>
          <span class="cal-key"><span class="cal-swatch" style="background:var(--warn)"></span>Late</span>
          <span class="cal-key"><span class="cal-swatch" style="background:var(--bad)"></span>Missed</span>
          <span class="cal-key"><span class="cal-swatch" style="border:2px solid var(--v-500)"></span>Seizure</span>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Med list ---------- */

function medListSection(meds) {
  return html`
    <div class="section">
      <div class="section-head">
        <h2>Your medications</h2>
        <button class="btn btn-sm btn-soft" data-action="med-open">Add</button>
      </div>
      <div class="card card-flush">
        <div class="rows">
          ${map(meds, (m) => `
            <button class="list-row" data-action="med-open" data-id="${m.id}">
              <span class="med-dot" data-color="${esc(m.color)}" aria-hidden="true">💊</span>
              <span class="row-body">
                <span class="row-t">${esc(m.name)} ${esc(m.dose)}</span>
                <span class="row-s">${m.times.map(prettyTime).join(' · ')}${
                  m.notes ? ` — ${esc(m.notes)}` : ''}</span>
              </span>
              <span class="chev">${icon('chevron')}</span>
            </button>`)}
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   Add / edit sheet
   ============================================================ */

function medForm() {
  return html`
    <div class="stack stack-5">
      <div class="field">
        <label class="label" for="med-name">Name</label>
        <input class="input" id="med-name" name="name" value="${draft.name}"
               placeholder="Levetiracetam" autocomplete="off" />
      </div>

      <div class="field">
        <label class="label" for="med-dose">Dose</label>
        <input class="input" id="med-dose" name="dose" value="${draft.dose}"
               placeholder="500 mg" autocomplete="off" />
      </div>

      <div class="field">
        <label class="label" for="med-form">Form</label>
        <select class="select" id="med-form" name="form">
          ${map(FORMS, (f) =>
            `<option value="${f}" ${f === draft.form ? 'selected' : ''}>${
              f[0].toUpperCase() + f.slice(1)}</option>`)}
        </select>
      </div>

      <div class="field">
        <span class="label">Times each day</span>
        <div class="stack stack-2">
          ${map(draft.times, (t, i) => `
            <div class="input-row">
              <input class="input" type="time" value="${t}" data-time-index="${i}"
                     aria-label="Dose time ${i + 1}" />
              ${draft.times.length > 1
                ? `<button class="icon-btn" data-action="med-time-remove" data-index="${i}"
                           aria-label="Remove this time">${icon('trash')}</button>`
                : ''}
            </div>`)}
        </div>
        <button class="btn btn-sm btn-quiet" data-action="med-time-add"
                style="align-self:flex-start">
          ${raw(icon('plus', 16))} Add another time
        </button>
      </div>

      <div class="field">
        <span class="label">Colour</span>
        <div class="chips">
          ${map(COLORS, (c) => `
            <button class="chip" data-action="med-color" data-color="${c}"
                    aria-pressed="${c === draft.color}">
              <span class="cal-swatch" style="background:var(--${SWATCH[c]});margin-right:6px"></span>${
                c[0].toUpperCase() + c.slice(1)}
            </button>`)}
        </div>
      </div>

      <div class="field">
        <label class="label" for="med-notes">Notes <span class="ink-faint">(optional)</span></label>
        <textarea class="textarea" id="med-notes" name="notes"
                  placeholder="Take with food">${draft.notes}</textarea>
      </div>
    </div>
  `;
}

/** Pull whatever is currently typed into the draft, so a re-render
    doesn't discard half-finished input. */
function readDraftFromSheet() {
  if (!draft) return;
  const v = sheetValues();
  if (v.name !== undefined) draft.name = v.name;
  if (v.dose !== undefined) draft.dose = v.dose;
  if (v.form !== undefined) draft.form = v.form;
  if (v.notes !== undefined) draft.notes = v.notes;

  document.querySelectorAll('[data-time-index]').forEach((input) => {
    draft.times[Number(input.dataset.timeIndex)] = input.value;
  });
}

/** Re-render just the sheet body, keeping the draft in sync first. */
function refreshSheet() {
  readDraftFromSheet();
  const body = document.querySelector('.sheet-body');
  if (body) body.innerHTML = medForm();
}

function openMedSheet(med) {
  draft = med
    ? { ...med, times: [...med.times] }
    : { id: null, name: '', dose: '', form: 'tablet', times: ['08:00'], notes: '', color: 'violet' };

  openSheet({
    title: med ? 'Edit medication' : 'Add medication',
    body: medForm(),
    footer: `
      ${med ? `<button class="btn btn-danger-soft" data-action="med-delete" data-id="${med.id}">Delete</button>` : ''}
      <button class="btn btn-primary" data-action="med-save">Save</button>
    `,
    onClose() { draft = null; },
  });
}

/* ============================================================
   Actions
   ============================================================ */

const CYCLE = { pending: 'taken', taken: 'late', late: 'missed', missed: 'pending' };

export const actions = {
  /** Tap-to-cycle on a dose tick. Shared with the home screen. */
  async 'dose-cycle'(node) {
    const { med, time, day } = node.dataset;
    const current = store.doseStatus(day, med, time);
    await store.setDoseStatus(day, med, time, CYCLE[current]);
  },

  /** Tapping a calendar day opens that day's doses for back-filling. */
  'cal-day'(node, state) {
    const day = node.dataset.day;
    const rows = [];
    for (const m of store.activeMeds(state)) {
      for (const t of m.times) {
        rows.push({ med: m, time: t, status: store.effectiveStatus(day, m.id, t, state) });
      }
    }
    rows.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));

    const seizures = (state.seizures || []).filter((s) => s.at.startsWith(day));

    openSheet({
      title: prettyDate(day, { relative: false }),
      body: html`
        <div class="stack stack-4">
          ${raw(seizures.length ? `
            <div class="insight" data-tone="alert">
              <span class="insight-ico" aria-hidden="true">⚡</span>
              <span class="insight-body">
                <span class="insight-t">${plural(seizures.length, 'seizure')} logged this day</span>
              </span>
            </div>` : '')}
          <div class="card card-flush">
            <div class="rows">
              ${map(rows, (r) => `
                <div class="dose-row">
                  <span class="dose-body">
                    <span class="dose-name">${esc(r.med.name)} ${esc(r.med.dose)}</span>
                    <span class="dose-meta">${prettyTime(r.time)} · ${STATUS_LABEL[r.status]}</span>
                  </span>
                  <button class="tick" data-status="${r.status}"
                          data-action="dose-cycle"
                          data-med="${r.med.id}" data-time="${r.time}" data-day="${day}"
                          aria-label="${esc(r.med.name)}: ${STATUS_LABEL[r.status]}. Tap to change.">
                    ${GLYPH[r.status]}
                  </button>
                </div>`)}
            </div>
          </div>
          <p class="hint">
            Back-filling is fine — an honest record a day late beats a blank one.
          </p>
        </div>
      `,
    });
  },

  'med-open'(node, state) {
    const id = node.dataset.id;
    openMedSheet(id ? state.meds.find((m) => m.id === id) : null);
  },

  'med-time-add'() {
    readDraftFromSheet();
    draft.times.push('20:00');
    refreshSheet();
  },

  'med-time-remove'(node) {
    readDraftFromSheet();
    draft.times.splice(Number(node.dataset.index), 1);
    refreshSheet();
  },

  'med-color'(node) {
    readDraftFromSheet();
    draft.color = node.dataset.color;
    refreshSheet();
  },

  async 'med-save'() {
    readDraftFromSheet();

    if (!draft.name.trim()) {
      toast('Give the medication a name', 'bad');
      return;
    }

    const times = [...new Set(draft.times.filter(Boolean))].sort();
    if (!times.length) {
      toast('Add at least one time', 'bad');
      return;
    }

    const payload = {
      name: draft.name, dose: draft.dose, form: draft.form,
      times, notes: draft.notes, color: draft.color,
    };
    const editing = !!draft.id;

    if (editing) await store.updateMed(draft.id, payload);
    else await store.addMed(payload);

    closeSheet();
    toast(editing ? 'Medication updated' : 'Medication added', 'ok');
  },

  'med-delete'(node) {
    const id = node.dataset.id;
    closeSheet();
    // Let the first sheet finish closing before the confirm opens,
    // otherwise the second animates in behind a dying backdrop.
    setTimeout(() => {
      confirmSheet({
        title: 'Delete this medication?',
        message: 'Your dose history for it stays in the record — deleting the ' +
                 'medication should not rewrite the past. Only future doses stop ' +
                 'being tracked.',
        confirmLabel: 'Delete',
        async onConfirm() {
          await store.removeMed(id);
          toast('Medication deleted');
        },
      });
    }, 320);
  },
};
