/* ============================================================
   views/safety.js — the seizure card and emergency mode
   ------------------------------------------------------------
   Imported by main.js, which also calls showEmergency() from the SOS
   button in the app bar.

   This screen has two readers and they need different things:

     - The STUDENT, calmly, setting it up: editable, organised by role.
     - A TEACHER, panicking, ten seconds in: no navigation, no jargon,
       biggest text in the app, and the two buttons that matter (call
       a parent, call 911) impossible to miss.

   The second reader is why the emergency overlay exists separately
   and why SOS sits in the app bar on every screen. If someone has to
   find the right tab first, the card has already failed.

   NOTE ON ESCAPING: `html` escapes every interpolated value. Anything
   that is already markup — a nested section, an icon, a mapped list —
   must be wrapped in raw() or it renders as visible angle brackets.
   ============================================================ */

import { html, raw, map, esc, telHref, prettyDate, initials } from '../util.js';
import * as store from '../store.js';
import {
  icon, toast, openSheet, closeSheet, confirmSheet, sheetValues, openEmergency,
} from '../ui.js';

let contactDraft = null;

/* ============================================================
   Header
   ============================================================ */

export function title() {
  return 'Safety card';
}

export function subtitle(state) {
  const n = (state.contacts || []).length;
  const updated = state.card.updated;
  return updated
    ? `${n} contacts · updated ${prettyDate(updated)}`
    : `${n} contacts`;
}

function firstName(profile) {
  return (profile.name || '').split(' ')[0];
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  const { card, contacts, profile } = state;

  // Before a name is set there is no grammatical way to say "If <X> has
  // a seizure" — the pronoun fallback produced "If they has a seizure".
  const who = firstName(profile);
  const heading = who ? `If ${who} has a seizure` : 'If a seizure happens';

  return html`
    <div class="safety-hero">
      <h2>${heading}</h2>
      <p>
        This card is written for whoever is standing there — a teacher, a
        coach, a stranger. Tap SOS at the top of any screen to open the
        big version instantly.
      </p>
    </div>

    <button class="btn btn-danger btn-block btn-lg" data-action="open-emergency">
      Open emergency card
    </button>

    ${raw(contactsSection(contacts))}
    ${raw(looksLikeSection(card))}
    ${raw(stepsSection('What to do', card.during, 'during', 'step-ok'))}
    ${raw(stepsSection('What NOT to do', card.doNot, 'doNot', 'step-bad'))}
    ${raw(emsSection(card))}
    ${raw(stepsSection('Afterwards', card.after, 'after', ''))}
    ${raw(rolesSection(card))}

    <div class="disclaimer">
      <strong>Check this with a doctor.</strong>
      The first-aid steps here follow standard public seizure first aid, but
      every person's seizures are different. Confirm this card with your
      neurologist and your school nurse before relying on it. Synara is a
      student project, not a medical device.
    </div>
  `;
}

/* ---------- Contacts ---------- */

/* The whole left side is the edit target, same as the medication list.
   A separate pencil button cost 40px that a narrow phone does not have,
   and squeezed the phone number into a four-line tower. */
function contactRow(c) {
  return `
    <div class="contact-row">
      <button class="contact-main" data-action="contact-open" data-id="${c.id}"
              aria-label="Edit ${esc(c.name)}">
        <span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <span class="contact-body">
          <span class="contact-n">${esc(c.name)}</span>
          <span class="contact-r">${
            c.primary ? '<span class="pill pill-brand">First call</span>' : ''
          }<span class="truncate">${esc(c.relation)} · ${esc(c.phone)}</span></span>
        </span>
      </button>
      <a class="call-btn" href="${telHref(c.phone)}">${icon('phone', 16)} Call</a>
    </div>`;
}

function contactsSection(contacts) {
  const inner = contacts.length
    ? contacts.map(contactRow).join('')
    : `<div class="empty">
         <span class="empty-ico" aria-hidden="true">📇</span>
         <span class="empty-t">No contacts yet</span>
         <span class="empty-s">Add at least one person to call.</span>
       </div>`;

  return html`
    <div class="section">
      <div class="section-head">
        <h2>Who to call</h2>
        <button class="btn btn-sm btn-soft" data-action="contact-open">Add</button>
      </div>
      <div class="card card-flush">
        <div class="rows">${raw(inner)}</div>
      </div>
    </div>
  `;
}

/* ---------- What it looks like ---------- */

function looksLikeSection(card) {
  const body = card.looksLike
    ? `<p style="line-height:var(--lh-body)">${esc(card.looksLike)}</p>`
    : `<p class="ink-3">Describe what happens, so somebody who has never seen
       one knows what they are looking at.</p>`;

  return html`
    <div class="section">
      <div class="section-head">
        <h2>What it looks like</h2>
        <button class="btn btn-sm btn-quiet" data-action="card-edit" data-field="looksLike">
          Edit
        </button>
      </div>
      <div class="card">${raw(body)}</div>
    </div>
  `;
}

/* ---------- Step lists ---------- */

function stepsSection(heading, steps, field, stepClass) {
  const body = steps && steps.length
    ? `<div class="steps">${steps.map((s, i) => `
        <div class="step ${stepClass}">
          <span class="step-n">${stepClass === 'step-bad' ? '✕' : i + 1}</span>
          <span>${esc(s)}</span>
        </div>`).join('')}</div>`
    : '<p class="ink-3">Nothing added yet.</p>';

  return html`
    <div class="section">
      <div class="section-head">
        <h2>${heading}</h2>
        <button class="btn btn-sm btn-quiet" data-action="card-edit" data-field="${field}">
          Edit
        </button>
      </div>
      <div class="card">${raw(body)}</div>
    </div>
  `;
}

/* ---------- When to call 911 ---------- */

function emsSection(card) {
  const steps = (card.callEms || []).map((s, i) => `
    <div class="step">
      <span class="step-n">${i + 1}</span>
      <span>${esc(s)}</span>
    </div>`).join('');

  return html`
    <div class="section">
      <div class="section-head">
        <h2>Call 911 if…</h2>
        <button class="btn btn-sm btn-quiet" data-action="card-edit" data-field="callEms">
          Edit
        </button>
      </div>
      <div class="card ems-card">
        <div class="steps">${raw(steps)}</div>
      </div>
    </div>
  `;
}

/* ---------- Role-specific notes ---------- */

const ROLES = [
  { field: 'forTeacher', label: 'For teachers', icon: '🍎' },
  { field: 'forNurse',   label: 'For the school nurse', icon: '🩺' },
  { field: 'forCoach',   label: 'For coaches and PE', icon: '🏃' },
];

function rolesSection(card) {
  const cards = ROLES.map((r) => `
    <div class="card role-card">
      <div class="card-head">
        <h3>${r.icon} ${r.label}</h3>
        <button class="btn btn-sm btn-quiet" data-action="card-edit" data-field="${r.field}">
          Edit
        </button>
      </div>
      <p style="line-height:var(--lh-body)">${
        card[r.field] ? esc(card[r.field]) : '<span class="ink-3">Nothing added yet.</span>'
      }</p>
    </div>`).join('');

  return html`
    <div class="section">
      <h2>Specific instructions</h2>
      <div class="stack stack-3">${raw(cards)}</div>
    </div>
  `;
}

/* ============================================================
   Emergency overlay
   ------------------------------------------------------------
   Called from the SOS button on every screen.
   ============================================================ */

function emBlock(heading, inner, tone = '') {
  return `
    <div class="em-block"${tone ? ` data-tone="${tone}"` : ''}>
      <h3>${heading}</h3>
      ${inner}
    </div>`;
}

function emSteps(list, bad = false) {
  return `<div class="steps">${(list || []).map((s, i) => `
    <div class="step${bad ? ' step-bad' : ''}">
      <span class="step-n">${bad ? '✕' : i + 1}</span>
      <span>${esc(s)}</span>
    </div>`).join('')}</div>`;
}

export function showEmergency(state) {
  const { card, contacts, profile } = state;
  const primary = contacts.find((c) => c.primary) || contacts[0];
  const others = contacts.filter((c) => c !== primary);
  const name = profile.name || 'This student';
  const meta = [profile.grade, profile.school].filter(Boolean).join(' · ');

  const primaryCall = primary ? `
    <a class="em-call" href="${telHref(primary.phone)}">
      ${icon('phone', 22)}
      <span class="em-call-body">
        <span class="em-call-n">Call ${esc(primary.name)}</span>
        <span class="em-call-r">${esc(primary.relation)} · ${esc(primary.phone)}</span>
      </span>
    </a>` : '';

  const othersBlock = others.length
    ? emBlock('Other contacts', `
        <div class="rows">${others.map((c) => `
          <div class="contact-row" style="padding-left:0;padding-right:0">
            <span class="contact-body">
              <span class="contact-n">${esc(c.name)}</span>
              <span class="contact-r">${esc(c.relation)}</span>
            </span>
            <a class="call-btn" href="${telHref(c.phone)}">${icon('phone', 16)} Call</a>
          </div>`).join('')}</div>`)
    : '';

  openEmergency(html`
    <div class="em-bar">
      <span class="em-bar-t">SEIZURE — WHAT TO DO</span>
      <button class="em-close" data-action="close-emergency">Close</button>
    </div>

    <div class="em-body">
      <div class="em-inner">

        <div>
          <span class="em-name">${name}</span>
          ${raw(meta ? `<span class="em-sub">${esc(meta)}</span>` : '')}
        </div>

        ${raw(primaryCall)}

        <a class="em-911" href="tel:911">Call 911</a>

        ${raw(card.callEms && card.callEms.length
          ? emBlock('Call 911 if', emSteps(card.callEms, true).replace(/✕/g, '!'), 'bad')
          : '')}
        ${raw(card.during && card.during.length
          ? emBlock('What to do', emSteps(card.during))
          : '')}
        ${raw(card.doNot && card.doNot.length
          ? emBlock('Do NOT', emSteps(card.doNot, true))
          : '')}

        ${raw(card.looksLike
          ? emBlock('What their seizures look like',
              `<p style="line-height:var(--lh-body)">${esc(card.looksLike)}</p>`)
          : '')}

        ${raw(card.after && card.after.length
          ? emBlock('Afterwards', emSteps(card.after))
          : '')}

        ${raw(othersBlock)}

        ${raw(profile.allergies
          ? emBlock('Allergies', `<p>${esc(profile.allergies)}</p>`)
          : '')}

      </div>
    </div>
  `);
}

/* ============================================================
   Editing
   ============================================================ */

/* Which card fields are lists rather than paragraphs. */
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

export const actions = {
  'card-edit'(node, state) {
    const field = node.dataset.field;
    const isList = LIST_FIELDS.has(field);
    const value = state.card[field];
    const text = isList ? (value || []).join('\n') : (value || '');

    openSheet({
      title: FIELD_LABEL[field] || 'Edit',
      body: html`
        <div class="field">
          <label class="label" for="card-text">
            ${isList ? 'One step per line' : 'Write it the way you would say it out loud'}
          </label>
          <textarea class="textarea" id="card-text" name="text"
                    style="min-height:220px">${text}</textarea>
          <span class="hint">
            ${isList
              ? 'Each line becomes a numbered step on the card.'
              : 'Plain words beat medical terms — a substitute teacher has to follow this.'}
          </span>
        </div>
      `,
      footer: `<button class="btn btn-primary" data-action="card-save" data-field="${field}">Save</button>`,
    });
  },

  async 'card-save'(node) {
    const field = node.dataset.field;
    const text = sheetValues().text || '';
    const value = LIST_FIELDS.has(field)
      ? text.split('\n').map((l) => l.trim()).filter(Boolean)
      : text.trim();

    await store.updateCard({ [field]: value });
    closeSheet();
    toast('Safety card updated', 'ok');
  },

  'contact-open'(node, state) {
    const id = node.dataset.id;
    const existing = id ? state.contacts.find((c) => c.id === id) : null;
    contactDraft = existing
      ? { ...existing }
      : { id: null, name: '', relation: '', phone: '', primary: false };

    openSheet({
      title: existing ? 'Edit contact' : 'Add contact',
      body: html`
        <div class="stack stack-5">
          <div class="field">
            <label class="label" for="c-name">Name</label>
            <input class="input" id="c-name" name="name" value="${contactDraft.name}"
                   placeholder="Dana Ellison" autocomplete="off" />
          </div>
          <div class="field">
            <label class="label" for="c-rel">Relationship</label>
            <input class="input" id="c-rel" name="relation" value="${contactDraft.relation}"
                   placeholder="Mom" autocomplete="off" />
          </div>
          <div class="field">
            <label class="label" for="c-phone">Phone</label>
            <input class="input" id="c-phone" name="phone" type="tel" value="${contactDraft.phone}"
                   placeholder="(555) 014-2007" autocomplete="off" />
          </div>
          <div class="card card-tight">
            <label class="row-between" style="cursor:pointer">
              <span class="row-body">
                <span class="row-t">Call this person first</span>
                <span class="row-s">Shown as the big button on the emergency card</span>
              </span>
              <input type="checkbox" name="primary" ${contactDraft.primary ? 'checked' : ''}
                     style="width:22px;height:22px;accent-color:var(--brand)" />
            </label>
          </div>
        </div>
      `,
      footer: `
        ${existing
          ? `<button class="btn btn-danger-soft" data-action="contact-delete" data-id="${existing.id}">Delete</button>`
          : ''}
        <button class="btn btn-primary" data-action="contact-save">Save</button>
      `,
      onClose() { contactDraft = null; },
    });
  },

  async 'contact-save'() {
    const v = sheetValues();
    if (!v.name || !v.name.trim()) {
      toast('A name is needed', 'bad');
      return;
    }
    if (!v.phone || !v.phone.trim()) {
      toast('A phone number is needed', 'bad');
      return;
    }

    const payload = {
      name: v.name, relation: v.relation || '', phone: v.phone, primary: !!v.primary,
    };
    const editing = !!contactDraft.id;

    if (editing) await store.updateContact(contactDraft.id, payload);
    else await store.addContact(payload);

    closeSheet();
    toast(editing ? 'Contact updated' : 'Contact added', 'ok');
  },

  'contact-delete'(node) {
    const id = node.dataset.id;
    closeSheet();
    setTimeout(() => {
      confirmSheet({
        title: 'Delete this contact?',
        message: 'They will be removed from the safety card and the emergency screen.',
        async onConfirm() {
          await store.removeContact(id);
          toast('Contact deleted');
        },
      });
    }, 320);
  },
};
