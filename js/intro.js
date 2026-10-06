/* ============================================================
   intro.js — the first-run intro
   ------------------------------------------------------------
   Four steps on the welcome screen, in the shape of Flux's own
   onboarding (a progress bar, one card per step, Continue / Back):

     1. Welcome      — set it up, or look around with example data
     2. About you    — name, seizure types, when diagnosed, medication
     3. A fun fact   — something true and worth knowing about epilepsy
     4. Your sections — what's left to fill in (setup.js)

   Nothing is written until step 2 is answered, so a student who backs
   out at the welcome leaves no record behind. The answers go straight
   into the real fields (You → details, and the safety card) rather
   than a questionnaire that sits unused.

   The same section list is Home's "Finish setting up" card, so the
   intro hands over to something that stays until it's done.
   ============================================================ */

import { html, raw, esc } from './util.js';
import * as store from './store.js';
import { seed } from './seed.js';
import * as notify from './notify.js';
import { setupProgress, showSetup } from './setup.js';
import {
  icon, toast, openWelcome, setWelcome, closeWelcome, poweredByFlux, brandMark,
} from './ui.js';

/* Plain-language descriptions, so a student who only knows what their
   seizures look like can still pick the right ones. */
const SEIZURE_TYPES = [
  ['Tonic-clonic', 'Stiffening, then jerking; not aware during it'],
  ['Absence', 'Brief blank stares, usually a few seconds'],
  ['Focal aware', 'Awake and aware, with odd feelings or movements'],
  ['Focal impaired awareness', 'Not fully aware; may stare, fumble or wander'],
  ['Myoclonic', 'Sudden, quick jerks'],
  ['Atonic', 'Sudden loss of muscle tone; may drop or fall'],
];
const NOT_SURE = 'Not sure yet';

/* Each one checked against its source. */
const FACTS = [
  {
    text: 'Purple Day was started in 2008 by Cassidy Megan, a 9-year-old in Nova Scotia, Canada, ' +
          'who wanted kids with epilepsy to know they aren’t alone. Now people around the world ' +
          'mark it every March 26.',
    source: 'Purple Day',
  },
  {
    text: 'With the right treatment, up to 70% of people with epilepsy can live without seizures.',
    source: 'World Health Organization',
  },
  {
    text: 'About 50 million people around the world have epilepsy. It’s one of the most common ' +
          'conditions of the brain.',
    source: 'World Health Organization',
  },
  {
    text: 'In the US, about 1 in 26 people will develop epilepsy at some point in their life.',
    source: 'Epilepsy Foundation',
  },
  {
    text: 'Epilepsy is one of the oldest known conditions. Written records of it go back ' +
          'thousands of years.',
    source: 'World Health Organization',
  },
  {
    text: 'Purple is the color of epilepsy awareness. It comes from lavender, a flower linked ' +
          'with solitude: a reminder that no one with epilepsy should feel alone.',
    source: 'Purple Day',
  },
  {
    text: 'Seizure first aid fits in three words: Stay, Safe, Side. Stay with them, keep them ' +
          'safe, and turn them on their side if they aren’t awake.',
    source: 'Epilepsy Foundation',
  },
];

const STEPS = 4;
let step = 0;
let answers = blankAnswers();
let committed = false;
let fact = 0;

function blankAnswers() {
  return { name: '', types: [], diagnosed: '', meds: 'yes', error: '' };
}

/* ============================================================
   Shared with Home
   ============================================================ */

function remindersPossible() {
  return notify.support().ok && notify.permission() !== 'denied';
}

/** The section rows. Each opens the same editor as its button elsewhere. */
export function setupList(state) {
  const { items } = setupProgress(state, { reminders: remindersPossible() });
  return items.map((it) => {
    const data = Object.entries(it.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `
      <li>
        <button type="button" class="setup-row" data-action="setup-go" data-target="${it.action}"${data}
                data-done="${it.done}">
          <span class="setup-ico" aria-hidden="true">${icon(it.done ? 'check' : it.icon, 18)}</span>
          <span class="row-body">
            <span class="row-t">${esc(it.title)}</span>
            <span class="row-s">${it.done ? 'Done' : esc(it.todo)}</span>
          </span>
          <span class="chev" aria-hidden="true">${icon('chevron')}</span>
        </button>
      </li>`;
  }).join('');
}

/** Home's card, while there's something left to fill in. */
export function setupCard(state) {
  const opts = { reminders: remindersPossible() };
  if (!showSetup(state, opts)) return '';
  const { done, total } = setupProgress(state, opts);
  return html`
    <section class="card setup-card" aria-labelledby="setup-h">
      <div class="setup-head">
        <div class="grow">
          <span class="eyebrow">Finish setting up</span>
          <h2 class="setup-h" id="setup-h">${done} of ${total} sections done</h2>
        </div>
        <button class="icon-btn" data-action="setup-hide" aria-label="Hide this list">${raw(icon('x'))}</button>
      </div>
      <progress class="setup-bar" max="${total}" value="${done}" aria-label="Setup progress"></progress>
      <ul class="setup-list">${raw(setupList(state))}</ul>
    </section>
  `;
}

/* ============================================================
   Steps
   ============================================================ */

function dots() {
  const marks = Array.from({ length: STEPS }, (_, i) =>
    `<span class="intro-dot" data-state="${i < step ? 'done' : i === step ? 'on' : 'next'}"></span>`).join('');
  return `<div class="intro-dots" aria-hidden="true">${marks}</div>
          <span class="sr-only">Step ${step + 1} of ${STEPS}</span>`;
}

function welcomeStep() {
  return html`
    <div class="welcome-inner intro-step">
      ${raw(dots())}
      <div class="brand-mark welcome-mark">${raw(brandMark())}</div>
      <h1 class="welcome-h1" tabindex="-1" data-intro-focus>Synara</h1>
      <p class="welcome-sub">
        Your medication, your seizures, and the card someone needs if you
        have one at school — all in one place.
      </p>

      <ul class="welcome-points">
        <li>${raw(icon('pill', 18))}<span>Dose reminders and a history you can show your doctor</span></li>
        <li>${raw(icon('chart', 18))}<span>A seizure log that looks for patterns for you</span></li>
        <li>${raw(icon('shield', 18))}<span>An emergency card anyone can follow, one tap away</span></li>
      </ul>

      <div class="welcome-actions">
        <button class="btn btn-primary btn-lg btn-block" data-action="intro-next">
          Set it up for me
        </button>
        <button class="btn btn-outline btn-lg btn-block" data-action="welcome-demo">
          Look around with example data
        </button>
      </div>

      <p class="welcome-note">
        ${raw(icon('lock', 14))}
        <span>Everything stays on this device — nothing is uploaded and there is
        no account. Synara is a student project, not a medical device.</span>
      </p>

      ${raw(poweredByFlux('welcome-powered'))}
    </div>
  `;
}

function aboutStep() {
  const types = [...SEIZURE_TYPES, [NOT_SURE, 'That’s fine — you can add it later']].map(([name, says]) => {
    const on = answers.types.includes(name);
    return `
      <button type="button" class="intro-choice" data-action="intro-type" data-value="${esc(name)}"
              aria-pressed="${on}">
        <span class="intro-choice-body">
          <span class="intro-choice-t">${esc(name)}</span>
          <span class="intro-choice-s">${esc(says)}</span>
        </span>
        <span class="intro-tick" aria-hidden="true">${icon('check', 16)}</span>
      </button>`;
  }).join('');
  const meds = [['yes', 'Yes'], ['no', 'Not right now']].map(([v, label]) =>
    `<button type="button" class="segment" data-action="intro-meds" data-value="${v}"
             aria-pressed="${answers.meds === v}">${label}</button>`).join('');

  return html`
    <form class="intro intro-step" data-action="intro-answers" novalidate>
      ${raw(dots())}
      <span class="intro-ico" aria-hidden="true">${raw(icon('user', 26))}</span>
      <h1 class="intro-h" tabindex="-1" data-intro-focus>First, a little about you</h1>
      <p class="intro-sub">It fills in your details and your safety card. Everything is optional,
        and you can change it any time in You.</p>

      <div class="field">
        <label class="label" for="intro-name">What should we call you?</label>
        <input class="input" id="intro-name" name="name" value="${answers.name}" placeholder="Your first name"
               autocomplete="given-name" maxlength="60" />
      </div>

      <fieldset class="intro-fieldset">
        <legend class="label">What kind of seizures do you have? <span class="ink-3">Pick any</span></legend>
        <div class="intro-choices">${raw(types)}</div>
      </fieldset>

      <div class="field">
        <label class="label" for="intro-diagnosed">What year were you diagnosed?</label>
        <input class="input intro-year" id="intro-diagnosed" name="diagnosed" value="${answers.diagnosed}"
               inputmode="numeric" maxlength="4" placeholder="e.g. 2021" autocomplete="off"
               aria-describedby="intro-year-error" />
        <span class="hint text-bad" id="intro-year-error" role="alert">${answers.error}</span>
      </div>

      <div class="field">
        <span class="label" id="intro-meds-l">Do you take medication for your seizures?</span>
        <div class="segments" role="group" aria-labelledby="intro-meds-l">${raw(meds)}</div>
      </div>

      <div class="intro-actions">
        <button class="btn btn-primary btn-lg btn-block" type="submit">Continue</button>
        <button class="btn btn-quiet btn-block" type="button" data-action="intro-back">Back</button>
      </div>
    </form>
  `;
}

function factStep() {
  const f = FACTS[fact];
  const first = answers.name.trim().split(' ')[0];
  return html`
    <div class="intro intro-step">
      ${raw(dots())}
      <span class="intro-ico" aria-hidden="true">${raw(icon('sparkle', 26))}</span>
      <h1 class="intro-h" tabindex="-1" data-intro-focus>You’re not alone${first ? `, ${first}` : ''}</h1>
      <p class="intro-sub">Here’s something worth knowing about epilepsy.</p>

      <figure class="intro-fact" aria-live="polite">
        <span class="eyebrow">Did you know?</span>
        <blockquote class="intro-fact-t">${f.text}</blockquote>
        <figcaption class="t-sm ink-3">Source: ${f.source}</figcaption>
      </figure>
      <button class="btn btn-quiet" type="button" data-action="intro-fact">
        ${raw(icon('sparkle', 16))} Another fact
      </button>

      <div class="intro-actions">
        <button class="btn btn-primary btn-lg btn-block" data-action="intro-next">Continue</button>
        <button class="btn btn-quiet btn-block" type="button" data-action="intro-back">Back</button>
      </div>
    </div>
  `;
}

function sectionsStep() {
  const state = store.get();
  const { done, total } = setupProgress(state, { reminders: remindersPossible() });
  return html`
    <div class="intro intro-step">
      ${raw(dots())}
      <span class="intro-ico" aria-hidden="true">${raw(icon('shield', 26))}</span>
      <h1 class="intro-h" tabindex="-1" data-intro-focus>Now, fill in your sections</h1>
      <p class="intro-sub">These are what make your safety card useful when someone needs it.
        Tap one to start. This list stays on Home until it’s done.</p>
      <p class="t-sm ink-3 intro-count">${done} of ${total} done</p>

      <ul class="setup-list intro-sections">${raw(setupList(state))}</ul>

      <div class="intro-actions">
        <button class="btn btn-primary btn-lg btn-block" data-action="intro-finish">Go to Synara</button>
        <button class="btn btn-quiet btn-block" type="button" data-action="intro-back">Back</button>
      </div>
    </div>
  `;
}

const RENDER = [welcomeStep, aboutStep, factStep, sectionsStep];

function goTo(n) {
  step = Math.max(0, Math.min(STEPS - 1, n));
  setWelcome(RENDER[step]());
}

/** First run: start at the welcome. */
export function show() {
  step = 0;
  answers = blankAnswers();
  committed = false;
  fact = Math.floor(Math.random() * FACTS.length);
  openWelcome(RENDER[0]());
}

/* ============================================================
   Actions
   ============================================================ */

/** Keep what's typed when moving between steps. */
function readTyped() {
  const form = document.querySelector('#welcome form.intro');
  if (!form) return;
  answers.name = form.elements.name.value.trim();
  answers.diagnosed = form.elements.diagnosed.value.trim();
}

function yearProblem(text) {
  if (!text) return '';
  const year = Number(text);
  const now = new Date().getFullYear();
  return /^\d{4}$/.test(text) && year >= 1900 && year <= now
    ? '' : `Enter a year like ${now - 2}, or leave it blank.`;
}

export const actions = {
  'intro-next'() {
    readTyped();
    goTo(step + 1);
  },

  'intro-back'() {
    readTyped();
    goTo(step - 1);
  },

  'intro-type'(node) {
    const value = node.dataset.value;
    const has = answers.types.includes(value);
    if (value === NOT_SURE) answers.types = has ? [] : [NOT_SURE];
    else {
      answers.types = answers.types.filter((t) => t !== NOT_SURE && t !== value);
      if (!has) answers.types.push(value);
    }
    // In place, not a re-render: that would lose what's typed and the focus.
    node.closest('.intro-choices').querySelectorAll('.intro-choice').forEach((b) => {
      b.setAttribute('aria-pressed', String(answers.types.includes(b.dataset.value)));
    });
  },

  'intro-meds'(node) {
    answers.meds = node.dataset.value;
    node.parentElement.querySelectorAll('.segment').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === node));
    });
  },

  async 'intro-answers'() {
    readTyped();
    answers.error = yearProblem(answers.diagnosed);
    if (answers.error) {
      const msg = document.getElementById('intro-year-error');
      if (msg) msg.textContent = answers.error;
      document.getElementById('intro-diagnosed')?.focus();
      return;
    }
    // The record starts here, and only once: going back and changing an
    // answer updates it rather than starting over.
    if (!committed) {
      await store.reset();
      committed = true;
    }
    await store.updateProfile({
      name: answers.name,
      seizureType: answers.types.filter((t) => t !== NOT_SURE).join(', '),
      diagnosed: answers.diagnosed,
    });
    await store.updateSettings({ noMeds: answers.meds === 'no' });
    goTo(2);
  },

  'intro-fact'() {
    fact = (fact + 1) % FACTS.length;
    goTo(step);
  },

  'intro-finish'() {
    closeWelcome();
    const { complete } = setupProgress(store.get(), { reminders: remindersPossible() });
    toast(complete ? 'You’re all set' : 'Your sections are on Home whenever you’re ready', 'ok');
  },

  async 'welcome-demo'() {
    await store.reset({ seedFn: seed });
    closeWelcome();
    toast('Loaded example data — clear it any time in You', 'ok');
  },

  async 'setup-hide'() {
    await store.updateSettings({ setupHidden: true });
    toast('Hidden. Everything on it is in You and Safety.', 'ok');
  },
};
