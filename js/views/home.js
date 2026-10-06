/* ============================================================
   views/home.js — the dashboard
   ------------------------------------------------------------
   Imported by main.js. Answers, in order, the three questions a
   student actually opens this app to ask:

     1. What do I need to take, and when?
     2. How am I doing?
     3. Is there anything I should know?

   Everything else lives behind a tab.
   ============================================================ */

import {
  html, raw, esc, dayKey, addDays, timeOf, minutesOf,
  prettyTime, prettyDuration, plural, doseLabel,
} from '../util.js';
import * as store from '../store.js';
import { summary, topInsight } from '../insights.js';
import { icon, toast } from '../ui.js';

/* ============================================================
   Header
   ============================================================ */

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hi';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function title(state) {
  const first = (state.profile.name || '').split(' ')[0];
  return first ? `${greeting()}, ${first}` : greeting();
}

export function subtitle(state) {
  if (!store.activeMeds(state).length) return 'No medications added yet';
  const pending = todaysDoses(state).filter((d) => d.status === 'pending').length;
  return pending ? `${plural(pending, 'dose')} left to log today` : 'Every dose logged for today';
}

/* ============================================================
   Dose helpers
   ============================================================ */

function todaysDoses(state) {
  const today = dayKey();
  return store.dosesOn(today, state).map(({ med, time }) => ({
    med, time, status: store.doseStatus(today, med.id, time, state),
  }));
}

/**
 * What the big card should be about, in priority order:
 *   1. a dose due right now (inside the grace window) — take it now
 *   2. the most recent dose past its window and still unlogged
 *   3. the next one coming up
 * A dose due now beats a stale one from this morning: it is the one
 * that can still be taken on time.
 */
function nextDose(state) {
  const pending = todaysDoses(state).filter((d) => d.status === 'pending');
  if (!pending.length) return null;

  const now = minutesOf(timeOf());
  const lateBy = (d) => now - minutesOf(d.time);

  const dueNow = pending.find((d) => lateBy(d) >= 0 && lateBy(d) <= store.GRACE_MINUTES);
  if (dueNow) return { ...dueNow, mode: 'due', others: pending.length - 1 };

  const overdue = pending.filter((d) => lateBy(d) > store.GRACE_MINUTES);
  if (overdue.length) {
    return { ...overdue[overdue.length - 1], mode: 'overdue', others: pending.length - 1 };
  }

  return { ...pending[0], mode: 'upcoming', others: pending.length - 1 };
}

/** First dose tomorrow, for the all-clear card. */
function firstTomorrow(state) {
  const tomorrow = addDays(dayKey(), 1);
  return store.dosesOn(tomorrow, state)[0] || null;
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  const hasMeds = store.activeMeds(state).length > 0;
  const stats = summary(state);
  const insight = topInsight(state);
  const checkedIn = !!store.getCheckin(dayKey(), state);

  return html`
    <div class="home-grid">
      <div class="home-main">
        ${raw(hasMeds ? nextDoseCard(state) : noMedsCard())}
        ${raw(hasMeds ? todayCard(state) : '')}
      </div>
      <div class="home-side">
        ${raw(purpleDayCard())}
        ${raw(statsStrip(stats))}
        ${raw(checkedIn ? '' : checkinPrompt())}
        ${raw(insight ? insightCard(insight) : '')}
        ${raw(quickActions())}
      </div>
    </div>
  `;
}

/* ---------- Purple Day ----------
   March 26 is Purple Day, the world's day for epilepsy awareness. The
   one day a year it is easiest to ask friends and teachers to learn
   what to do — so on it, Home suggests showing them the safety card.
   Still, like everything here: no animation, nothing that flashes. */

function purpleDayCard() {
  const now = new Date();
  if (now.getMonth() !== 2 || now.getDate() !== 26) return '';
  return html`
    <section class="card purple-day" aria-label="Purple Day">
      <span class="purple-day-ico">${raw(icon('ribbon', 22))}</span>
      <div class="grow">
        <span class="eyebrow">Today is Purple Day</span>
        <p class="purple-day-t">The world's day for epilepsy awareness</p>
        <p class="t-sm ink-2">
          A good day to show friends and teachers your safety card, so they
          know what to do if you have a seizure.
        </p>
        <button class="btn btn-primary mt-3" data-action="nav" data-to="safety">
          ${raw(icon('shield', 16))} Open my safety card
        </button>
      </div>
    </section>
  `;
}

/* ---------- Next dose ---------- */

function nextDoseCard(state) {
  const next = nextDose(state);

  if (!next) {
    const tomorrow = firstTomorrow(state);
    return html`
      <section class="card next-dose" data-state="clear" aria-label="Today's doses">
        <span class="eyebrow">Today</span>
        <div class="next-dose-when">All done</div>
        <span class="next-dose-what">
          Every dose today is logged.${raw(tomorrow
            ? ` First one tomorrow: ${esc(tomorrow.med.name)} at ${prettyTime(tomorrow.time)}.`
            : '')}
        </span>
      </section>
    `;
  }

  const delta = minutesOf(next.time) - minutesOf(timeOf());
  const when =
    next.mode === 'overdue' ? `${prettyDuration(-delta)} overdue` :
    next.mode === 'due' ? 'Due now' :
    delta <= 1 ? 'Due now' : `in ${prettyDuration(delta)}`;

  const eyebrow =
    next.mode === 'overdue' ? 'Not logged yet' :
    next.mode === 'due' ? 'Take it now' : 'Next dose';

  const buttons = next.mode === 'overdue'
    ? `<button class="btn btn-on-brand" data-action="dose-quick"
               data-med="${next.med.id}" data-time="${next.time}" data-status="late">
         ${icon('check', 18)} Took it late
       </button>
       <button class="btn btn-on-brand-ghost" data-action="dose-quick"
               data-med="${next.med.id}" data-time="${next.time}" data-status="missed">
         Missed it
       </button>`
    : `<button class="btn btn-on-brand" data-action="dose-quick"
               data-med="${next.med.id}" data-time="${next.time}" data-status="taken">
         ${icon('check', 18)} Mark taken
       </button>
       ${next.mode === 'due'
         ? `<button class="btn btn-on-brand-ghost" data-action="dose-quick"
                    data-med="${next.med.id}" data-time="${next.time}" data-status="missed">
              Skip
            </button>`
         : ''}`;

  return html`
    <section class="card next-dose" data-state="${next.mode}" aria-label="Next dose">
      <span class="eyebrow">${eyebrow}</span>
      <div class="next-dose-when">${when}</div>
      <span class="next-dose-what">
        ${next.med.name}${next.med.dose ? ` ${next.med.dose}` : ''} · ${prettyTime(next.time)}
      </span>
      <div class="next-dose-actions">${raw(buttons)}</div>
      ${raw(next.others > 0
        // "Not logged" for doses that aren't due yet reads like a failure,
        // so upcoming ones are just "later today".
        ? `<button class="next-dose-more" data-action="nav" data-to="meds">
             ${next.others} more ${next.mode === 'upcoming' ? 'later today' : 'to log today'} ${icon('chevron', 14)}
           </button>`
        : '')}
    </section>
  `;
}

function noMedsCard() {
  return html`
    <section class="card next-dose" data-state="empty" aria-label="Get started">
      <span class="eyebrow">Get started</span>
      <div class="next-dose-when next-dose-when-sm">Add your first medication</div>
      <span class="next-dose-what">
        Name, dose, and the times you take it. About twenty seconds — then
        every dose gets tracked from today on.
      </span>
      <div class="next-dose-actions">
        <button class="btn btn-on-brand" data-action="med-open">
          ${raw(icon('plus', 18))} Add a medication
        </button>
      </div>
    </section>
  `;
}

/* ---------- Stats ---------- */

function statsStrip(stats) {
  const tone =
    stats.adherence == null ? '' :
    stats.adherence >= 90 ? 'ok' :
    stats.adherence >= 75 ? 'warn' : 'bad';

  return html`
    <div class="stats" role="list" aria-label="Your numbers">
      <div class="stat" data-tone="${tone}" role="listitem">
        <span class="stat-n">${stats.adherence == null ? '—' : `${stats.adherence}%`}</span>
        <span class="stat-l">${stats.adherence == null ? 'Doses on time — from tomorrow' : 'Doses on time, last 30 days'}</span>
      </div>
      <div class="stat" role="listitem">
        <span class="stat-n">${stats.daysSince == null ? '—' : stats.daysSince}</span>
        <span class="stat-l">Days since last seizure</span>
      </div>
      <div class="stat" data-tone="${stats.streak >= 7 ? 'ok' : ''}" role="listitem">
        <span class="stat-n">${stats.streak}</span>
        <span class="stat-l">Day streak, every dose on time</span>
      </div>
    </div>
  `;
}

/* ---------- Today's doses ---------- */

const GLYPH = { taken: '✓', late: '!', missed: '✕', pending: '' };

function todayCard(state) {
  const doses = todaysDoses(state);
  const today = dayKey();

  const rows = doses.map((d) => {
    const label = doseLabel(d.status, d.time);
    return `
      <li class="dose-row">
        <span class="med-dot" data-color="${esc(d.med.color)}" aria-hidden="true">${icon('pill', 20)}</span>
        <span class="dose-body">
          <span class="dose-name">${esc(d.med.name)} <span class="dose-amt">${esc(d.med.dose)}</span></span>
          <span class="dose-meta" data-status="${d.status}">${prettyTime(d.time)} · ${label}</span>
        </span>
        <button class="tick" data-status="${d.status}" data-action="dose-cycle"
                data-med="${d.med.id}" data-time="${d.time}" data-day="${today}"
                aria-label="${esc(d.med.name)} at ${prettyTime(d.time)}: ${label}. Tap to change.">
          ${GLYPH[d.status]}
        </button>
      </li>`;
  }).join('');

  return html`
    <section class="section" aria-labelledby="today-h">
      <div class="section-head">
        <h2 id="today-h">Today</h2>
        <button class="btn btn-sm btn-quiet" data-action="nav" data-to="meds">All meds</button>
      </div>
      <div class="card card-flush">
        <ul class="rows">${raw(rows)}</ul>
      </div>
      <p class="hint">Tap a circle to cycle: taken → late → missed → not logged.</p>
    </section>
  `;
}

/* ---------- Check-in prompt ---------- */

function checkinPrompt() {
  return html`
    <button class="card card-tap checkin-cta" data-action="checkin-open">
      <span class="row">
        <span class="med-dot" data-color="blue" aria-hidden="true">${raw(icon('moon', 20))}</span>
        <span class="row-body">
          <span class="row-t">How did you sleep?</span>
          <span class="row-s">Ten-second check-in. Sleep and stress are what the pattern finder compares against.</span>
        </span>
        <span class="chev">${raw(icon('chevron'))}</span>
      </span>
    </button>
  `;
}

/* ---------- Insight ---------- */

function insightCard(ins) {
  return html`
    <section class="section" aria-labelledby="insight-h">
      <div class="section-head">
        <h2 id="insight-h">Worth knowing</h2>
        <button class="btn btn-sm btn-quiet" data-action="open-patterns">All patterns</button>
      </div>
      <div class="insight" data-tone="${ins.tone}">
        <span class="insight-ico" aria-hidden="true">${raw(icon(ins.icon, 20))}</span>
        <span class="insight-body">
          <span class="insight-t">${ins.title}</span>
          <span class="insight-d">${ins.detail}</span>
          <span class="insight-e">${ins.evidence}</span>
        </span>
      </div>
    </section>
  `;
}

/* ---------- Quick actions ---------- */

function quickActions() {
  return html`
    <div class="quick-grid">
      <button class="quick" data-action="seizure-open">
        <span class="quick-ico" data-tone="violet" aria-hidden="true">${raw(icon('note', 20))}</span>
        <span class="quick-t">Log a seizure</span>
        <span class="quick-s">Half-filled is fine</span>
      </button>
      <button class="quick" data-action="open-emergency">
        <span class="quick-ico" data-tone="rose" aria-hidden="true">${raw(icon('shield', 20))}</span>
        <span class="quick-t">Emergency card</span>
        <span class="quick-s">With a seizure timer</span>
      </button>
    </div>
  `;
}

/* ============================================================
   Actions
   ============================================================ */

export const actions = {
  /** The buttons on the next-dose card. */
  async 'dose-quick'(node) {
    const { med, time, status } = node.dataset;
    await store.setDoseStatus(dayKey(), med, time, status);
    toast(
      status === 'taken' ? 'Marked taken' :
      status === 'late'  ? 'Marked taken late' : 'Marked missed',
      status === 'missed' ? 'default' : 'ok'
    );
  },
};
