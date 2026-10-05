/* ============================================================
   views/meds.js — MedMinder
   ------------------------------------------------------------
   Imported by main.js. Owns the medication list, the tap-to-cycle
   dose log, the adherence calendar, and the add/edit sheet.

   The tick cycle (not logged → taken → late → missed) is a single
   control rather than four buttons per dose. Logging has to be nearly
   free or it stops happening, and a student marking twenty doses a
   week will not tolerate a menu every time.
   ============================================================ */

import {
  html, raw, esc, dayKey, parseKey, prettyTime, prettyDate,
  plural, dayName, doseLabel,
} from '../util.js';
import * as store from '../store.js';
import { calendarDays } from '../insights.js';
import { icon, toast, openSheet, closeSheet, confirmSheet, sheetValues, sheetEl } from '../ui.js';

const COLORS = ['violet', 'mint', 'amber', 'rose', 'blue'];
const COLOR_LABEL = { violet: 'Violet', mint: 'Mint', amber: 'Amber', rose: 'Rose', blue: 'Blue' };
const SWATCH = { violet: 'brand', mint: 'ok', amber: 'warn', rose: 'bad', blue: 'info' };
const FORMS = ['tablet', 'capsule', 'liquid', 'patch', 'injection', 'other'];

const GLYPH = { taken: '✓', late: '!', missed: '✕', pending: '' };
const STATUS_LABEL = {
  taken: 'Taken', late: 'Taken late', missed: 'Missed', pending: 'Not logged',
};

/* Draft for the add/edit sheet. Held here rather than in the store so
   an abandoned edit never touches saved data. */
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
  const doses = meds.reduce((n, m) => n + store.currentTimes(m).length, 0);
  return `${plural(meds.length, 'medication')} · ${plural(doses, 'dose')} a day`;
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  const meds = store.activeMeds(state);
  const stopped = state.meds.filter((m) => !store.isActive(m));

  if (!meds.length) {
    return html`
      <div class="card">
        <div class="empty">
          <span class="empty-ico" aria-hidden="true">${raw(icon('pill', 32))}</span>
          <span class="empty-t">No medications yet</span>
          <span class="empty-s">
            Add what you take and when. Every dose gets tracked from today,
            building a history you can actually show a doctor.
          </span>
          <button class="btn btn-primary" data-action="med-open">
            ${raw(icon('plus', 18))} Add a medication
          </button>
        </div>
      </div>
      ${raw(stopped.length ? stoppedSection(stopped) : '')}
    `;
  }

  return html`
    <div class="split-grid">
      <div class="split-main">
        ${raw(todaySection(state))}
        ${raw(medListSection(meds))}
        ${raw(stopped.length ? stoppedSection(stopped) : '')}
      </div>
      <div class="split-side">
        ${raw(calendarSection(state))}
      </div>
    </div>
  `;
}

/* ---------- Today ---------- */

function doseRow(day, med, time, status, label) {
  return `
    <li class="dose-row">
      <span class="med-dot" data-color="${esc(med.color)}" aria-hidden="true">${icon('pill', 20)}</span>
      <span class="dose-body">
        <span class="dose-name">${esc(med.name)} <span class="dose-amt">${esc(med.dose)}</span></span>
        <span class="dose-meta" data-status="${status}">${prettyTime(time)} · ${esc(label)}</span>
      </span>
      <button class="tick" data-status="${status}" data-action="dose-cycle"
              data-med="${med.id}" data-time="${time}" data-day="${day}"
              aria-label="${esc(med.name)} at ${prettyTime(time)}: ${esc(label)}. Tap to change.">
        ${GLYPH[status]}
      </button>
    </li>`;
}

function todaySection(state) {
  const today = dayKey();
  const rows = store.dosesOn(today, state).map(({ med, time }) => {
    const status = store.doseStatus(today, med.id, time, state);
    return doseRow(today, med, time, status, doseLabel(status, time));
  }).join('');

  return html`
    <section class="section" aria-labelledby="meds-today-h">
      <div class="section-head">
        <h2 id="meds-today-h">Today</h2>
        <span class="t-sm ink-3">${prettyDate(today, { relative: false })}</span>
      </div>
      <div class="card card-flush">
        <ul class="rows">${raw(rows)}</ul>
      </div>
      <p class="hint">Tap a circle to cycle: taken → late → missed → not logged.</p>
    </section>
  `;
}

/* ---------- Calendar ----------
   Four weeks of adherence with seizure days ringed, so the two things
   the app tracks can be compared by eye on one grid. */

function calendarSection(state) {
  const days = calendarDays(state, 28);
  const today = dayKey();
  const firstDow = parseKey(days[0].day).getDay();

  const head = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<div class="cal-dow" aria-hidden="true">${dayName(i).slice(0, 2)}</div>`)
    .join('');
  const pad = '<div aria-hidden="true"></div>'.repeat(firstDow);

  const cells = days.map((d) => {
    const n = parseKey(d.day).getDate();
    const what = d.total
      ? `${d.taken} of ${d.total} doses on time`
      : d.day === today ? 'nothing logged yet' : 'no doses scheduled';
    const label = `${prettyDate(d.day, { relative: false })}: ${what}` +
      (d.seizure ? ', seizure logged' : '');
    return `
      <button class="cal-day" data-status="${d.status}" data-today="${d.day === today}"
              data-seizure="${d.seizure}" data-action="cal-day" data-day="${d.day}"
              aria-label="${esc(label)}" title="${esc(label)}">${n}</button>`;
  }).join('');

  return html`
    <section class="section" aria-labelledby="cal-h">
      <div class="section-head">
        <h2 id="cal-h">Last four weeks</h2>
      </div>
      <div class="card">
        <div class="cal">${raw(head)}${raw(pad)}${raw(cells)}</div>
        <div class="cal-legend">
          <span class="cal-key"><span class="cal-swatch" data-k="taken"></span>All on time</span>
          <span class="cal-key"><span class="cal-swatch" data-k="late"></span>Late</span>
          <span class="cal-key"><span class="cal-swatch" data-k="missed"></span>Missed</span>
          <span class="cal-key"><span class="cal-swatch" data-k="seizure"></span>Seizure</span>
        </div>
        <p class="hint cal-hint">Tap a day to see or fix what was logged.</p>
      </div>
    </section>
  `;
}

/* ---------- Med list ---------- */

function medListSection(meds) {
  const rows = meds.map((m) => {
    const times = store.currentTimes(m);
    return `
      <li>
        <button class="list-row" data-action="med-open" data-id="${m.id}">
          <span class="med-dot" data-color="${esc(m.color)}" aria-hidden="true">${icon('pill', 20)}</span>
          <span class="row-body">
            <span class="row-t">${esc(m.name)} <span class="dose-amt">${esc(m.dose)}</span></span>
            <span class="row-s">${times.length ? times.map(prettyTime).join(' · ') : 'No times set'}</span>
            ${m.notes ? `<span class="row-note">${esc(m.notes)}</span>` : ''}
          </span>
          <span class="chev">${icon('chevron')}</span>
        </button>
      </li>`;
  }).join('');

  return html`
    <section class="section" aria-labelledby="meds-list-h">
      <div class="section-head">
        <h2 id="meds-list-h">Your medications</h2>
        <button class="btn btn-sm btn-soft" data-action="med-open">${raw(icon('plus', 16))} Add</button>
      </div>
      <div class="card card-flush">
        <ul class="rows">${raw(rows)}</ul>
      </div>
    </section>
  `;
}

function stoppedSection(stopped) {
  const rows = stopped.map((m) => `
    <li class="list-row list-row-static">
      <span class="med-dot" data-color="${esc(m.color)}" data-muted="true" aria-hidden="true">${icon('archive', 18)}</span>
      <span class="row-body">
        <span class="row-t">${esc(m.name)} <span class="dose-amt">${esc(m.dose)}</span></span>
        <span class="row-s">Stopped ${prettyDate(m.ended, { relative: false })} · history kept</span>
      </span>
      <button class="btn btn-sm btn-quiet" data-action="med-restart" data-id="${m.id}">Restart</button>
    </li>`).join('');

  return html`
    <details class="stopped">
      <summary>
        <span>Stopped medications</span>
        <span class="pill">${stopped.length}</span>
      </summary>
      <div class="card card-flush">
        <ul class="rows">${raw(rows)}</ul>
      </div>
      <p class="hint">
        Their doses still count for the days they were being taken — stopping a
        medication shouldn't rewrite the record a neurologist will ask about.
      </p>
    </details>
  `;
}

/* ============================================================
   Add / edit sheet
   ============================================================ */

function medForm() {
  const times = draft.times.map((t, i) => `
    <div class="input-row">
      <input class="input" type="time" value="${esc(t)}" data-time-index="${i}"
             aria-label="Dose time ${i + 1}" required />
      ${draft.times.length > 1
        ? `<button type="button" class="icon-btn" data-action="med-time-remove" data-index="${i}"
                   aria-label="Remove time ${i + 1}">${icon('trash', 20)}</button>`
        : ''}
    </div>`).join('');

  const colors = COLORS.map((c) => `
    <button type="button" class="chip chip-color" data-action="med-color" data-value="${c}"
            aria-pressed="${c === draft.color}">
      <span class="cal-swatch" style="background:var(--${SWATCH[c]})"></span>${COLOR_LABEL[c]}
    </button>`).join('');

  const forms = FORMS.map((f) =>
    `<option value="${f}" ${f === draft.form ? 'selected' : ''}>${f[0].toUpperCase()}${f.slice(1)}</option>`
  ).join('');

  return html`
    <form class="stack stack-5" data-action="med-save" novalidate>
      <div class="field">
        <label class="label" for="med-name">Name</label>
        <input class="input" id="med-name" name="name" value="${draft.name}"
               placeholder="e.g. Levetiracetam" autocomplete="off" required maxlength="120" />
      </div>

      <div class="input-row">
        <div class="field grow">
          <label class="label" for="med-dose">Dose</label>
          <input class="input" id="med-dose" name="dose" value="${draft.dose}"
                 placeholder="500 mg" autocomplete="off" maxlength="60" />
        </div>
        <div class="field grow">
          <label class="label" for="med-form">Form</label>
          <select class="select" id="med-form" name="form">${raw(forms)}</select>
        </div>
      </div>

      <div class="field">
        <span class="label" id="times-label">Times each day</span>
        <div class="stack stack-2" role="group" aria-labelledby="times-label">${raw(times)}</div>
        <button type="button" class="btn btn-sm btn-quiet self-start" data-action="med-time-add">
          ${raw(icon('plus', 16))} Add another time
        </button>
        ${raw(draft.id
          ? '<span class="hint">Changing times applies from today. Earlier days keep the schedule they actually had.</span>'
          : '')}
      </div>

      <div class="field">
        <span class="label" id="color-label">Colour</span>
        <div class="chips" role="group" aria-labelledby="color-label">${raw(colors)}</div>
      </div>

      <div class="field">
        <label class="label" for="med-notes">Notes <span class="ink-faint">(optional)</span></label>
        <textarea class="textarea" id="med-notes" name="notes" maxlength="600"
                  placeholder="Take with food">${draft.notes}</textarea>
      </div>
    </form>
  `;
}

/** Pull whatever is typed into the draft so a re-render keeps it. */
function readDraft() {
  if (!draft) return;
  const v = sheetValues();
  for (const k of ['name', 'dose', 'form', 'notes']) {
    if (v[k] !== undefined) draft[k] = v[k];
  }
  sheetEl().querySelectorAll('[data-time-index]').forEach((input) => {
    draft.times[Number(input.dataset.timeIndex)] = input.value;
  });
}

function refreshSheet(focusSelector) {
  readDraft();
  const body = sheetEl().querySelector('.sheet-body');
  if (body) body.innerHTML = medForm();
  if (focusSelector) {
    const target = sheetEl().querySelector(focusSelector);
    if (target) target.focus();
  }
}

function openMedSheet(med) {
  draft = med
    ? { id: med.id, name: med.name, dose: med.dose, form: med.form,
        notes: med.notes, color: med.color, times: [...store.currentTimes(med)] }
    : { id: null, name: '', dose: '', form: 'tablet', times: ['08:00'], notes: '', color: 'violet' };
  if (!draft.times.length) draft.times = ['08:00'];

  openSheet({
    title: med ? 'Edit medication' : 'Add medication',
    body: medForm(),
    footer: `
      ${med ? `<button class="btn btn-danger-soft" data-action="med-stop" data-id="${med.id}">Stop taking</button>` : ''}
      <button class="btn btn-primary" data-action="med-save">${med ? 'Save' : 'Add medication'}</button>
    `,
    onClose() { draft = null; },
  });
}

/* ============================================================
   Actions
   ============================================================ */

const CYCLE = { pending: 'taken', taken: 'late', late: 'missed', missed: 'pending' };

/** Back-fill sheet for one day — opened fresh, or refreshed in place. */
function dayDetail(day, state, inPlace) {
  const doses = store.dosesOn(day, state);
  const seizures = (state.seizures || []).filter((s) => s.at.startsWith(day));
  const isPast = day < dayKey();

  const rows = doses.map(({ med, time }) => {
    const logged = store.doseStatus(day, med.id, time, state);
    const label = logged !== 'pending'
      ? STATUS_LABEL[logged]
      : isPast ? 'Not logged — counts as missed' : doseLabel('pending', time);
    return doseRow(day, med, time, logged, label);
  }).join('');

  const body = html`
    <div class="stack stack-4">
      ${raw(seizures.length ? `
        <div class="insight" data-tone="alert">
          <span class="insight-ico" aria-hidden="true">${icon('bolt', 20)}</span>
          <span class="insight-body">
            <span class="insight-t">${plural(seizures.length, 'seizure')} logged this day</span>
          </span>
        </div>` : '')}
      ${raw(doses.length
        ? `<div class="card card-flush"><ul class="rows">${rows}</ul></div>`
        : '<p class="ink-3">No doses were scheduled on this day.</p>')}
      <p class="hint">
        Back-filling is fine — an honest record a day late beats a blank one.
      </p>
    </div>
  `;

  if (inPlace) {
    const target = sheetEl().querySelector('.sheet-body');
    if (target) target.innerHTML = body;
    return;
  }
  openSheet({ title: prettyDate(day, { relative: false }), body });
}

export const actions = {
  /** Tap-to-cycle on a dose tick, on any screen or in the day sheet. */
  async 'dose-cycle'(node) {
    const { med, time, day } = node.dataset;
    const current = store.doseStatus(day, med, time);
    const inSheet = !!node.closest('#sheet');
    await store.setDoseStatus(day, med, time, CYCLE[current]);
    if (inSheet) {
      dayDetail(day, store.get(), true);
      sheetEl().querySelector(`[data-action="dose-cycle"][data-med="${med}"][data-time="${time}"]`)?.focus();
    }
  },

  'cal-day'(node, state) {
    dayDetail(node.dataset.day, state, false);
  },

  'med-open'(node, state) {
    const id = node.dataset.id;
    openMedSheet(id ? state.meds.find((m) => m.id === id) : null);
  },

  'med-time-add'() {
    readDraft();
    const last = draft.times[draft.times.length - 1] || '08:00';
    // Suggest twelve hours after the last time — the common twice-daily case.
    const [h, m] = last.split(':').map(Number);
    draft.times.push(`${String(((h || 0) + 12) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`);
    refreshSheet(`[data-time-index="${draft.times.length - 1}"]`);
  },

  'med-time-remove'(node) {
    readDraft();
    draft.times.splice(Number(node.dataset.index), 1);
    refreshSheet('[data-action="med-time-add"]');
  },

  'med-color'(node) {
    readDraft();
    draft.color = node.dataset.value;
    refreshSheet(`[data-action="med-color"][data-value="${node.dataset.value}"]`);
  },

  async 'med-save'() {
    readDraft();

    if (!draft.name.trim()) {
      toast('Give the medication a name', 'bad');
      sheetEl().querySelector('#med-name')?.focus();
      return;
    }
    const times = store.normTimes(draft.times);
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
    toast(editing ? 'Medication updated' : 'Added — tracking starts today', 'ok');
  },

  'med-stop'(node, state) {
    const id = node.dataset.id;
    const med = state.meds.find((m) => m.id === id);
    const addedToday = med && med.added >= dayKey();
    confirmSheet({
      title: addedToday ? 'Remove this medication?' : `Stop taking ${med ? med.name : 'this'}?`,
      message: addedToday
        ? 'It was only added today, so there is no history to keep. It will be removed completely.'
        : 'It will stop appearing in today\'s doses and reminders. Every dose already logged stays ' +
          'in your history and statistics, and you can restart it later. Never stop an epilepsy ' +
          'medication without talking to your neurologist first.',
      confirmLabel: addedToday ? 'Remove' : 'Stop taking',
      async onConfirm() {
        await store.removeMed(id);
        toast(addedToday ? 'Medication removed' : 'Stopped — history kept');
      },
    });
  },

  /** Reopen a stopped med from today. The days it was stopped stay a gap. */
  async 'med-restart'(node, state) {
    const med = state.meds.find((m) => m.id === node.dataset.id);
    if (!med) return;
    await store.restartMed(med.id);
    toast(`${med.name} restarted from today`, 'ok');
  },
};
