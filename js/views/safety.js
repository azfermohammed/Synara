/* ============================================================
   views/safety.js — the seizure card, emergency mode, printing
   ------------------------------------------------------------
   Imported by main.js, which also calls showEmergency() from the SOS
   button on every screen and from the #/sos shortcut.

   This screen has two readers who need different things:

     - The STUDENT, calmly, setting it up: editable, organised by role.
     - A TEACHER, panicking, ten seconds in: no navigation, no jargon,
       the biggest text in the app, a timer, and the two buttons that
       matter — call a parent, call 911 — impossible to miss.

   And a third, offline: the front office or a coach with a printed
   copy and no access to the student's phone at all.

   ESCAPING: `html` escapes every interpolated value. Anything that is
   already markup must be wrapped in raw(), and anything built in a
   plain template string must esc() its user data by hand.
   ============================================================ */

import {
  html, raw, esc, telHref, dialable, prettyDate, prettyTime, initials, timeOf, dayKey, stamp,
} from '../util.js';
import * as store from '../store.js';
import {
  icon, toast, openSheet, closeSheet, confirmSheet, sheetValues,
  openEmergency, closeEmergency, emergencyEl,
} from '../ui.js';
import { logSeizure } from './seizures.js';

/* ============================================================
   Header
   ============================================================ */

export function title() {
  return 'Safety card';
}

export function subtitle(state) {
  const n = (state.contacts || []).length;
  const contacts = `${n} ${n === 1 ? 'contact' : 'contacts'}`;
  return state.card.updated
    ? `${contacts} · updated ${prettyDate(state.card.updated)}`
    : contacts;
}

const firstName = (profile) => (profile.name || '').trim().split(/\s+/)[0] || '';

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  const { card, contacts, profile } = state;

  // Before a name is set there is no grammatical "If <X> has a seizure"
  // — a pronoun fallback produced "If they has a seizure".
  const who = firstName(profile);
  const heading = who ? `If ${who} has a seizure` : 'If a seizure happens';

  return html`
    <div class="safety-hero">
      <div class="safety-hero-ico" aria-hidden="true">${raw(icon('shield', 26))}</div>
      <h2>${heading}</h2>
      <p>
        Written for whoever is standing there — a teacher, a coach, a stranger.
        The SOS button at the top of every screen opens the big version, with
        a seizure timer.
      </p>
      <div class="safety-hero-actions">
        <button class="btn btn-on-danger" data-action="open-emergency">
          ${raw(icon('shield', 18))} Open emergency card
        </button>
        <button class="btn btn-on-danger-ghost" data-action="print-card">
          ${raw(icon('print', 18))} Print for school
        </button>
      </div>
    </div>

    ${raw(completeness(state))}

    <div class="split-grid">
      <div class="split-main">
        ${raw(contactsSection(contacts))}
        ${raw(looksLikeSection(card))}
        ${raw(stepsSection('What to do', card.during, 'during', 'ok'))}
        ${raw(stepsSection('What NOT to do', card.doNot, 'doNot', 'bad'))}
        ${raw(emsSection(card))}
        ${raw(stepsSection('Afterwards', card.after, 'after', ''))}
      </div>
      <div class="split-side">
        ${raw(medicalSection(state))}
        ${raw(rolesSection(card))}
      </div>
    </div>

    <div class="disclaimer">
      ${raw(icon('info', 16))}
      <span>
        <strong>Check this with a doctor.</strong> The first-aid steps follow
        standard public seizure first aid, but every person's seizures are
        different. Confirm this card with your neurologist and school nurse
        before relying on it. Synara is a student project, not a medical device.
      </span>
    </div>
  `;
}

/* ---------- What's still missing ----------
   The card ships with standard first aid filled in, but the parts that
   make it *this* student's card start blank. Say so plainly rather than
   letting a half-empty card look finished. */

function completeness(state) {
  const missing = [];
  if (!state.contacts.length) missing.push(['contact-open', '', 'Add someone to call']);
  if (!state.profile.name) missing.push(['profile-edit', '', 'Add your name']);
  if (!state.card.looksLike) missing.push(['card-edit', 'looksLike', 'Describe what your seizures look like']);
  if (!state.card.forTeacher) missing.push(['card-edit', 'forTeacher', 'Add a note for teachers']);
  if (!missing.length) return '';

  const items = missing.map(([action, field, label]) => `
    <li>
      <button class="todo-row" data-action="${action}"${field ? ` data-field="${field}"` : ''}>
        <span class="todo-dot" aria-hidden="true"></span>
        <span class="grow">${label}</span>
        <span class="chev">${icon('chevron', 16)}</span>
      </button>
    </li>`).join('');

  return html`
    <section class="card todo-card" aria-labelledby="todo-h">
      <h2 id="todo-h" class="todo-h">${raw(icon('sparkle', 18))} Finish your card</h2>
      <p class="t-sm ink-2">
        ${missing.length === 1 ? 'One thing' : `${missing.length} things`} would make this
        card much more useful to whoever has to use it.
      </p>
      <ul class="todo-list">${raw(items)}</ul>
    </section>
  `;
}

/* ---------- Contacts ---------- */

function contactRow(c) {
  return `
    <li class="contact-row">
      <button class="contact-main" data-action="contact-open" data-id="${c.id}"
              aria-label="Edit ${esc(c.name)}">
        <span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <span class="contact-body">
          <span class="contact-n">${esc(c.name)}</span>
          <span class="contact-r">${c.primary ? '<span class="pill pill-brand">First call</span>' : ''}<span class="truncate">${esc(c.relation)}${c.relation ? ' · ' : ''}${esc(c.phone)}</span></span>
        </span>
      </button>
      ${callButton(c)}
    </li>`;
}

function callButton(c) {
  return dialable(c.phone)
    ? `<a class="call-btn" href="${telHref(c.phone)}" aria-label="Call ${esc(c.name)}">${icon('phone', 16)} Call</a>`
    : '<span class="pill pill-warn">No number</span>';
}

function contactsSection(contacts) {
  const inner = contacts.length
    ? `<ul class="rows">${contacts.map(contactRow).join('')}</ul>`
    : `<div class="empty empty-sm">
         <span class="empty-t">No one to call yet</span>
         <span class="empty-s">The emergency card's biggest button calls whoever you put first.</span>
         <button class="btn btn-sm btn-primary" data-action="contact-open">${icon('plus', 16)} Add a contact</button>
       </div>`;

  return html`
    <section class="section" aria-labelledby="contacts-h">
      <div class="section-head">
        <h2 id="contacts-h">Who to call</h2>
        ${raw(contacts.length ? `<button class="btn btn-sm btn-soft" data-action="contact-open">${icon('plus', 16)} Add</button>` : '')}
      </div>
      <div class="card card-flush">${raw(inner)}</div>
    </section>
  `;
}

/* ---------- Sections ---------- */

function editButton(field, label) {
  return `<button class="btn btn-sm btn-quiet" data-action="card-edit" data-field="${field}"
                  aria-label="Edit ${esc(label)}">${icon('edit', 15)} Edit</button>`;
}

function looksLikeSection(card) {
  const body = card.looksLike
    ? `<p class="prose">${esc(card.looksLike)}</p>`
    : '<p class="ink-3">Describe what happens, so somebody who has never seen one knows what they\'re looking at.</p>';

  return html`
    <section class="section" aria-labelledby="looks-h">
      <div class="section-head">
        <h2 id="looks-h">What it looks like</h2>
        ${raw(editButton('looksLike', 'what it looks like'))}
      </div>
      <div class="card">${raw(body)}</div>
    </section>
  `;
}

function stepsList(steps, tone) {
  return `<ol class="steps">${steps.map((s, i) => `
    <li class="step" data-tone="${tone}">
      <span class="step-n" aria-hidden="true">${tone === 'bad' ? '✕' : tone === 'ems' ? '!' : i + 1}</span>
      <span>${esc(s)}</span>
    </li>`).join('')}</ol>`;
}

function stepsSection(heading, steps, field, tone) {
  const id = `sec-${field}`;
  const body = steps && steps.length ? stepsList(steps, tone) : '<p class="ink-3">Nothing added yet.</p>';
  return html`
    <section class="section" aria-labelledby="${id}">
      <div class="section-head">
        <h2 id="${id}">${heading}</h2>
        ${raw(editButton(field, heading))}
      </div>
      <div class="card">${raw(body)}</div>
    </section>
  `;
}

function emsSection(card) {
  const steps = card.callEms || [];
  return html`
    <section class="section" aria-labelledby="sec-ems">
      <div class="section-head">
        <h2 id="sec-ems">Call 911 if…</h2>
        ${raw(editButton('callEms', 'when to call 911'))}
      </div>
      <div class="card ems-card">${raw(steps.length ? stepsList(steps, 'ems') : '<p class="ink-3">Nothing added yet.</p>')}</div>
    </section>
  `;
}

function medicalSection(state) {
  const { profile } = state;
  const meds = store.activeMeds(state);
  const rows = [
    ['Seizure type', profile.seizureType],
    ['Allergies', profile.allergies],
    ['Blood type', profile.bloodType],
    ['Neurologist', [profile.neurologist, profile.neuroPhone].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v);

  const medList = meds.length
    ? meds.map((m) => `${esc(m.name)}${m.dose ? ` ${esc(m.dose)}` : ''}`).join(', ')
    : '<span class="ink-faint">None added</span>';

  const rowMarkup = rows
    .map(([k, v]) => `<div class="kv-row"><dt class="kv-k">${k}</dt><dd class="kv-v">${esc(v)}</dd></div>`)
    .join('');

  return html`
    <section class="section" aria-labelledby="medical-h">
      <div class="section-head">
        <h2 id="medical-h">Medical details</h2>
        <button class="btn btn-sm btn-quiet" data-action="profile-edit">${raw(icon('edit', 15))} Edit</button>
      </div>
      <div class="card card-flush">
        <dl class="kv">
          ${raw(rowMarkup)}
          <div class="kv-row"><dt class="kv-k">Current meds</dt><dd class="kv-v">${raw(medList)}</dd></div>
        </dl>
      </div>
      <p class="hint">Shown on the emergency card and the printed copy — it's what paramedics ask for.</p>
    </section>
  `;
}

const ROLES = [
  { field: 'forTeacher', label: 'For teachers', icon: 'school' },
  { field: 'forNurse',   label: 'For the school nurse', icon: 'stethoscope' },
  { field: 'forCoach',   label: 'For coaches and PE', icon: 'run' },
];

function rolesSection(card) {
  const cards = ROLES.map((r) => `
    <div class="card role-card">
      <div class="card-head">
        <h3>${icon(r.icon, 18)} ${r.label}</h3>
        ${editButton(r.field, r.label)}
      </div>
      ${card[r.field]
        ? `<p class="prose">${esc(card[r.field])}</p>`
        : '<p class="ink-3 t-sm">Nothing added yet — what should this person know that isn\'t in the steps?</p>'}
    </div>`).join('');

  return html`
    <section class="section" aria-labelledby="roles-h">
      <h2 id="roles-h">Specific instructions</h2>
      <div class="stack stack-3">${raw(cards)}</div>
    </section>
  `;
}

/* ============================================================
   Emergency overlay + seizure timer
   ------------------------------------------------------------
   The card's first instruction is "start timing", and the 5-minute
   mark is the line for calling 911 — so the card has a timer.

   PHOTOSENSITIVITY: the only thing that changes every second is the
   digits. At five minutes the block switches ONCE to a solid red state.
   Nothing blinks, pulses, or flashes, ever.

   The start time lives in sessionStorage, so closing the card by
   accident or reloading mid-seizure doesn't lose the count.
   ============================================================ */

const TIMER_KEY = 'synara.timer';
const EMS_SECONDS = 5 * 60;

let tick = null;
let stoppedAfter = null;   // seconds, once "It stopped" is pressed
let startedStamp = null;   // "YYYY-MM-DDTHH:mm" the timer started

function readStart() {
  try {
    const v = JSON.parse(sessionStorage.getItem(TIMER_KEY) || 'null');
    // Ignore anything stale — a timer left over from hours ago is not
    // this seizure.
    if (v && typeof v.ms === 'number' && Date.now() - v.ms < 3 * 60 * 60 * 1000) return v;
  } catch { /* storage blocked: the timer still works, just not across reloads */ }
  return null;
}

function writeStart(v) {
  try {
    if (v) sessionStorage.setItem(TIMER_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(TIMER_KEY);
  } catch { /* see above */ }
}

const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function timerMarkup() {
  return `
    <section class="em-timer" data-state="idle" aria-labelledby="em-timer-h">
      <div class="em-timer-top">
        <h3 id="em-timer-h" class="em-timer-h">${icon('timer', 18)} Seizure timer</h3>
        <span class="em-timer-hint" data-timer-hint>Start it the moment the seizure begins</span>
      </div>
      <div class="em-timer-clock" data-timer-clock aria-hidden="true">0:00</div>
      <div class="sr-only" aria-live="assertive" data-timer-live></div>
      <div class="em-timer-actions" data-timer-actions>
        <button class="btn btn-lg btn-primary btn-block" data-action="timer-start" data-autofocus>
          ${icon('play', 20)} Start timer
        </button>
      </div>
    </section>`;
}

function setTimerView(root, mode, secs) {
  const box = root.querySelector('.em-timer');
  if (!box) return;
  const clockEl = box.querySelector('[data-timer-clock]');
  const hint = box.querySelector('[data-timer-hint]');
  const actionsEl = box.querySelector('[data-timer-actions]');
  const changed = box.dataset.state !== mode;

  box.dataset.state = mode;
  clockEl.textContent = clock(secs);

  if (mode === 'running' || mode === 'over') {
    const over = mode === 'over';
    hint.textContent = over
      ? 'Over 5 minutes — call 911 now'
      : `Call 911 if it reaches 5:00 · ${clock(Math.max(0, EMS_SECONDS - secs))} to go`;
    // Only rebuild the buttons when the state changes, or a button
    // being pressed would be swapped out from under the finger.
    if (changed) {
      actionsEl.innerHTML = `
        ${over ? `<a class="btn btn-lg btn-block btn-emergency" href="tel:911">${icon('phone', 20)} Call 911 now</a>` : ''}
        <button class="btn btn-lg btn-block ${over ? 'btn-on-danger-ghost' : 'btn-outline'}" data-action="timer-stop">
          ${icon('stop', 18)} It stopped
        </button>`;
    }
  } else if (mode === 'stopped') {
    hint.textContent = `It lasted ${clock(secs)}`;
    actionsEl.innerHTML = `
      <button class="btn btn-lg btn-block btn-primary" data-action="timer-log">${icon('note', 18)} Log this seizure</button>
      <button class="btn btn-block btn-quiet" data-action="timer-reset">Reset timer</button>`;
  }
}

function startTicking(root) {
  clearInterval(tick);
  const live = root.querySelector('[data-timer-live]');
  let lastMinute = -1;
  let announcedOver = false;

  const update = () => {
    const start = readStart();
    if (!start) return;
    const secs = Math.max(0, Math.floor((Date.now() - start.ms) / 1000));
    const over = secs >= EMS_SECONDS;
    setTimerView(root, over ? 'over' : 'running', secs);

    // Screen readers hear each whole minute, and the 5-minute line once.
    const minute = Math.floor(secs / 60);
    if (live && minute !== lastMinute && minute > 0) {
      live.textContent = over && !announcedOver
        ? 'Five minutes. Call 911 now.'
        : `${minute} ${minute === 1 ? 'minute' : 'minutes'}`;
      if (over) announcedOver = true;
    }
    lastMinute = minute;
  };

  update();
  tick = setInterval(update, 1000);
}

function stopTicking() {
  clearInterval(tick);
  tick = null;
}

/* ---------- The overlay ---------- */

function emBlock(heading, inner, tone = '') {
  return `
    <section class="em-block"${tone ? ` data-tone="${tone}"` : ''}>
      <h3>${heading}</h3>
      ${inner}
    </section>`;
}

export function showEmergency(state) {
  const { card, contacts, profile } = state;
  // The big green button must ring someone. If the first-call contact
  // has no usable number, fall to the first one who does.
  const reachable = contacts.filter((c) => dialable(c.phone));
  const primary = reachable.find((c) => c.primary) || reachable[0];
  const others = contacts.filter((c) => c !== primary);
  const meds = store.activeMeds(state);
  const name = profile.name || 'This student';
  const meta = [profile.grade, profile.school].filter(Boolean).join(' · ');

  const callPrimary = primary ? `
    <a class="em-call" href="${telHref(primary.phone)}">
      <span class="em-call-ico" aria-hidden="true">${icon('phone', 22)}</span>
      <span class="em-call-body">
        <span class="em-call-n">Call ${esc(primary.name)}</span>
        <span class="em-call-r">${esc(primary.relation)}${primary.relation ? ' · ' : ''}${esc(primary.phone)}</span>
      </span>
    </a>` : '';

  const otherContacts = others.length ? emBlock('Other contacts', `
    <ul class="rows">${others.map((c) => `
      <li class="contact-row contact-row-flat">
        <span class="contact-body">
          <span class="contact-n">${esc(c.name)}</span>
          <span class="contact-r"><span class="truncate">${esc(c.relation)}</span></span>
        </span>
        ${callButton(c)}
      </li>`).join('')}</ul>`) : '';

  const medical = [
    profile.seizureType && `<div class="kv-row"><dt class="kv-k">Seizure type</dt><dd class="kv-v">${esc(profile.seizureType)}</dd></div>`,
    profile.allergies && `<div class="kv-row"><dt class="kv-k">Allergies</dt><dd class="kv-v">${esc(profile.allergies)}</dd></div>`,
    meds.length && `<div class="kv-row"><dt class="kv-k">Medications</dt><dd class="kv-v">${meds.map((m) => `${esc(m.name)} ${esc(m.dose)}`).join(', ')}</dd></div>`,
    profile.neurologist && `<div class="kv-row"><dt class="kv-k">Neurologist</dt><dd class="kv-v">${esc(profile.neurologist)}${profile.neuroPhone ? ` · ${esc(profile.neuroPhone)}` : ''}</dd></div>`,
  ].filter(Boolean).join('');

  const steps = (list, tone) => (list && list.length ? stepsList(list, tone) : '');

  const markup = html`
    <div class="em-bar">
      <span class="em-bar-t">${raw(icon('shield', 20))} Seizure — what to do</span>
      <button class="em-close" data-action="close-emergency">Close</button>
    </div>

    <div class="em-body">
      <div class="em-inner">
        <header class="em-who">
          <h2 class="em-name">${name}</h2>
          ${raw(meta ? `<span class="em-sub">${esc(meta)}</span>` : '')}
        </header>

        ${raw(timerMarkup())}

        <div class="em-calls">
          ${raw(callPrimary)}
          <a class="em-911" href="tel:911">${raw(icon('phone', 22))} Call 911</a>
        </div>

        ${raw(card.during && card.during.length ? emBlock('What to do right now', steps(card.during, 'ok')) : '')}
        ${raw(card.callEms && card.callEms.length ? emBlock('Call 911 if', steps(card.callEms, 'ems'), 'bad') : '')}
        ${raw(card.doNot && card.doNot.length ? emBlock('Do NOT', steps(card.doNot, 'bad')) : '')}
        ${raw(card.looksLike ? emBlock('What their seizures look like', `<p class="prose">${esc(card.looksLike)}</p>`) : '')}
        ${raw(card.after && card.after.length ? emBlock('Afterwards', steps(card.after, '')) : '')}
        ${raw(medical ? emBlock('Medical details', `<dl class="kv kv-flat">${medical}</dl>`) : '')}
        ${raw(otherContacts)}

        <p class="em-foot">Standard seizure first aid. If in doubt, call 911.</p>
      </div>
    </div>
  `;

  openEmergency(markup, {
    onMount(root) {
      if (readStart()) {
        startTicking(root);
        root.querySelector('[data-action="timer-stop"]')?.focus({ preventScroll: true });
      } else if (stoppedAfter != null) {
        setTimerView(root, 'stopped', stoppedAfter);
      }
    },
    onClose: stopTicking,
  });
}

/* ============================================================
   Printable card
   ------------------------------------------------------------
   A printed copy taped inside a locker, or in the front office's
   binder, is how most schools actually handle this. It has to come out
   as a clean one-page document, not a screenshot of an app.
   ============================================================ */

function printMarkup(state) {
  const { card, contacts, profile } = state;
  const meds = store.activeMeds(state);
  const list = (items, cls = '') =>
    items && items.length ? `<ol class="${cls}">${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '';

  const facts = [
    ['Grade / school', [profile.grade, profile.school].filter(Boolean).join(', ')],
    ['Seizure type', profile.seizureType],
    ['Allergies', profile.allergies],
    ['Medications', meds.map((m) =>
      `${m.name} ${m.dose} (${store.currentTimes(m).map(prettyTime).join(', ')})`).join('; ')],
    ['Neurologist', [profile.neurologist, profile.neuroPhone].filter(Boolean).join(' — ')],
  ].filter(([, v]) => v);

  const roles = [
    ['forTeacher', 'Teachers'], ['forNurse', 'School nurse'], ['forCoach', 'Coaches and PE'],
  ].filter(([k]) => card[k]);

  return `
    <article class="pc">
      <header class="pc-head">
        <div>
          <p class="pc-kicker">Seizure action card</p>
          <h1 class="pc-name">${esc(profile.name || 'Student name')}</h1>
        </div>
        <div class="pc-911">In an emergency<strong>Call 911</strong></div>
      </header>

      ${facts.length ? `<dl class="pc-facts">${facts.map(([k, v]) =>
        `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}

      ${card.looksLike ? `<section><h2>What their seizures look like</h2><p>${esc(card.looksLike)}</p></section>` : ''}

      <div class="pc-cols">
        <section><h2>What to do</h2>${list(card.during)}</section>
        <section><h2>Do NOT</h2>${list(card.doNot, 'pc-not')}</section>
      </div>

      <section class="pc-ems"><h2>Call 911 if</h2>${list(card.callEms)}</section>

      <div class="pc-cols">
        <section><h2>Afterwards</h2>${list(card.after)}</section>
        <section>
          <h2>Who to call</h2>
          ${contacts.length ? `<table class="pc-contacts"><tbody>${contacts.map((c) => `
            <tr><td><strong>${esc(c.name)}</strong>${c.primary ? ' (call first)' : ''}<br>${esc(c.relation)}</td><td>${esc(c.phone)}</td></tr>`).join('')}
          </tbody></table>` : '<p>No contacts added.</p>'}
        </section>
      </div>

      ${roles.length ? `<section class="pc-roles">${roles.map(([k, label]) =>
        `<div><h3>${label}</h3><p>${esc(card[k])}</p></div>`).join('')}</section>` : ''}

      <footer class="pc-foot">
        Printed ${prettyDate(dayKey(), { relative: false })}${card.updated ? ` · card last updated ${prettyDate(card.updated, { relative: false })}` : ''}.
        Standard seizure first aid — confirm with the student's neurologist. Made with Synara.
      </footer>
    </article>`;
}

/* ============================================================
   Editing
   ============================================================ */

const LIST_FIELDS = new Set(['during', 'doNot', 'after', 'callEms']);

const FIELD_LABEL = {
  looksLike: 'What their seizures look like',
  during: 'What to do',
  doNot: 'What NOT to do',
  after: 'Afterwards',
  callEms: 'Call 911 if…',
  forTeacher: 'For teachers',
  forNurse: 'For the school nurse',
  forCoach: 'For coaches and PE',
};

const FIELD_HINT = {
  looksLike: 'Plain words beat medical terms — a substitute teacher has to recognise this.',
  forTeacher: 'What should happen in class? Who do they send for? Anything in a 504 plan?',
  forNurse: 'Rescue medication, who to call first, where they like to recover.',
  forCoach: 'Activity limits, water rules, whether they can return to play the same day.',
};

export const actions = {
  'card-edit'(node, state) {
    const field = node.dataset.field;
    if (!FIELD_LABEL[field]) return;
    const isList = LIST_FIELDS.has(field);
    const value = state.card[field];
    const text = isList ? (value || []).join('\n') : (value || '');

    openSheet({
      title: FIELD_LABEL[field],
      body: html`
        <div class="field">
          <label class="label" for="card-text">
            ${isList ? 'One step per line' : 'Write it the way you would say it out loud'}
          </label>
          <textarea class="textarea textarea-tall" id="card-text" name="text" maxlength="4000">${text}</textarea>
          <span class="hint">
            ${isList ? 'Each line becomes a numbered step on the card.' : (FIELD_HINT[field] || '')}
          </span>
        </div>
      `,
      footer: `<button class="btn btn-primary" data-action="card-save" data-field="${field}">Save</button>`,
    });
  },

  async 'card-save'(node) {
    const field = node.dataset.field;
    if (!FIELD_LABEL[field]) return;
    const text = sheetValues().text || '';
    const value = LIST_FIELDS.has(field)
      // People paste numbered lists; the card numbers them itself.
      ? text.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean)
      : text.trim();

    await store.updateCard({ [field]: value });
    closeSheet();
    toast('Safety card updated', 'ok');
  },

  'contact-open'(node, state) {
    const id = node.dataset.id;
    const existing = id ? state.contacts.find((c) => c.id === id) : null;
    const c = existing || { name: '', relation: '', phone: '', primary: !state.contacts.length };
    const idAttr = existing ? ` data-id="${existing.id}"` : '';

    openSheet({
      title: existing ? 'Edit contact' : 'Add contact',
      body: html`
        <form class="stack stack-5" data-action="contact-save"${raw(idAttr)} novalidate>
          <div class="field">
            <label class="label" for="c-name">Name</label>
            <input class="input" id="c-name" name="name" value="${c.name}"
                   placeholder="Dana Ellison" autocomplete="off" maxlength="120" required />
          </div>
          <div class="field">
            <label class="label" for="c-rel">Relationship</label>
            <input class="input" id="c-rel" name="relation" value="${c.relation}"
                   placeholder="Mom, school nurse, coach…" autocomplete="off" maxlength="80" />
          </div>
          <div class="field">
            <label class="label" for="c-phone">Phone</label>
            <input class="input" id="c-phone" name="phone" type="tel" inputmode="tel" value="${c.phone}"
                   placeholder="(555) 014-2007" autocomplete="off" maxlength="40" required />
          </div>
          <div class="card card-flush">
            <label class="toggle-row">
              <span class="row-body">
                <span class="row-t">Call this person first</span>
                <span class="row-s">They become the big green button on the emergency card</span>
              </span>
              <input type="checkbox" class="check" name="primary" ${raw(c.primary ? 'checked' : '')} />
            </label>
          </div>
        </form>
      `,
      footer: `
        ${existing ? `<button class="btn btn-danger-soft" data-action="contact-delete" data-id="${existing.id}">Delete</button>` : ''}
        <button class="btn btn-primary" data-action="contact-save"${idAttr}>Save</button>
      `,
    });
  },

  async 'contact-save'(node) {
    const id = node.dataset.id || null;
    const v = sheetValues();
    if (!v.name || !v.name.trim()) {
      toast('A name is needed', 'bad');
      return;
    }
    // A number nobody can dial is worse than none on an emergency card.
    if ((String(v.phone || '').match(/\d/g) || []).length < 3) {
      toast('That phone number doesn\'t look complete', 'bad');
      return;
    }

    const payload = { name: v.name, relation: v.relation || '', phone: v.phone, primary: !!v.primary };
    if (id) await store.updateContact(id, payload);
    else await store.addContact(payload);

    closeSheet();
    toast(id ? 'Contact updated' : 'Contact added', 'ok');
  },

  'contact-delete'(node) {
    const id = node.dataset.id;
    confirmSheet({
      title: 'Delete this contact?',
      message: 'They will be removed from the safety card, the emergency screen, and the printed card.',
      async onConfirm() {
        await store.removeContact(id);
        toast('Contact deleted');
      },
    });
  },

  /* ---- Timer ---- */

  'timer-start'() {
    stoppedAfter = null;
    startedStamp = stamp();
    writeStart({ ms: Date.now(), at: startedStamp });
    startTicking(emergencyEl());
    emergencyEl().querySelector('[data-action="timer-stop"]')?.focus({ preventScroll: true });
  },

  'timer-stop'() {
    const start = readStart();
    stopTicking();
    if (!start) return;
    stoppedAfter = Math.max(1, Math.floor((Date.now() - start.ms) / 1000));
    startedStamp = start.at;
    writeStart(null);
    setTimerView(emergencyEl(), 'stopped', stoppedAfter);
    emergencyEl().querySelector('[data-action="timer-log"]')?.focus({ preventScroll: true });
  },

  'timer-reset'() {
    stoppedAfter = null;
    startedStamp = null;
    writeStart(null);
    stopTicking();
    const box = emergencyEl().querySelector('.em-timer');
    if (box) box.outerHTML = timerMarkup();
    emergencyEl().querySelector('[data-action="timer-start"]')?.focus({ preventScroll: true });
  },

  'timer-log'() {
    const duration = stoppedAfter || 0;
    const at = startedStamp || `${dayKey()}T${timeOf()}`;
    stoppedAfter = null;
    startedStamp = null;
    closeEmergency();
    logSeizure({ at, duration });
  },

  /* ---- Print ---- */

  'print-card'(node, state) {
    const target = document.getElementById('print-card');
    if (!target) return;
    target.innerHTML = printMarkup(state);
    window.print();
  },
};
