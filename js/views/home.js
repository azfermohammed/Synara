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
  html, raw, map, esc, dayKey, timeOf, minutesOf,
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
  return pending
    ? `${plural(pending, 'dose')} left today`
    : 'All doses logged for today';
}

/* ============================================================
   Dose helpers
   ============================================================ */

/** Every dose scheduled today, in time order, with its live status. */
function todaysDoses(state) {
  const today = dayKey();
  const out = [];
  for (const med of store.activeMeds(state)) {
    for (const time of med.times) {
      out.push({
        med,
        time,
        status: store.doseStatus(today, med.id, time, state),
      });
    }
  }
  return out.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}

/**
 * The next dose still to take.
 *
 * Prefers the next one coming up; if everything upcoming is handled
 * but something earlier today was never logged, surface that instead —
 * a forgotten 8am dose is more urgent than a scheduled 8pm one.
 */
function nextDose(state) {
  const doses = todaysDoses(state).filter((d) => d.status === 'pending');
  if (!doses.length) return null;

  const nowMins = minutesOf(timeOf());
  const overdue = doses.filter((d) => minutesOf(d.time) < nowMins);
  if (overdue.length) return { ...overdue[overdue.length - 1], overdue: true };

  const upcoming = doses.filter((d) => minutesOf(d.time) >= nowMins);
  return upcoming.length ? { ...upcoming[0], overdue: false } : null;
}

/* ============================================================
   Render
   ============================================================ */

export function render(state) {
  const meds = store.activeMeds(state);
  const stats = summary(state);
  const insight = topInsight(state);
  const checkedIn = !!store.getCheckin(dayKey(), state);

  return html`
    ${raw(meds.length ? nextDoseCard(state) : noMedsCard())}
    ${raw(statsStrip(stats))}
    ${raw(meds.length ? todayCard(state) : '')}
    ${raw(checkedIn ? '' : checkinPrompt())}
    ${raw(insight ? insightCard(insight) : '')}
    ${raw(quickActions())}
  `;
}

/* ---------- Next dose ---------- */

function nextDoseCard(state) {
  const next = nextDose(state);

  if (!next) {
    return html`
      <div class="card next-dose" data-state="clear">
        <span class="eyebrow">Today</span>
        <div class="next-dose-when">All clear</div>
        <span class="next-dose-what">
          Every dose logged. That is the whole job done for today.
        </span>
      </div>
    `;
  }

  const mins = minutesOf(next.time) - minutesOf(timeOf());
  const when = next.overdue
    ? `${prettyDuration(-mins)} overdue`
    : mins <= 1 ? 'Now' : `in ${prettyDuration(mins)}`;

  return html`
    <div class="card next-dose">
      <span class="eyebrow">${next.overdue ? 'Missed earlier' : 'Next dose'}</span>
      <div class="next-dose-when">${when}</div>
      <span class="next-dose-what">
        ${next.med.name} ${next.med.dose} · ${prettyTime(next.time)}
      </span>
      <div class="next-dose-actions">
        <button class="btn btn-on-brand"
                data-action="dose-quick"
                data-med="${next.med.id}" data-time="${next.time}"
                data-status="${next.overdue ? 'late' : 'taken'}">
          ${next.overdue ? 'Taken late' : 'Mark taken'}
        </button>
        <button class="btn btn-on-brand-ghost"
                data-action="dose-quick"
                data-med="${next.med.id}" data-time="${next.time}"
                data-status="missed">
          Missed
        </button>
      </div>
    </div>
  `;
}

function noMedsCard() {
  return html`
    <div class="card next-dose">
      <span class="eyebrow">Get started</span>
      <div class="next-dose-when" style="font-size:var(--t-xl)">
        Add your first medication
      </div>
      <span class="next-dose-what">
        Name, dose, and what time you take it. Takes about twenty seconds.
      </span>
      <div class="next-dose-actions">
        <button class="btn btn-on-brand" data-action="nav" data-to="meds">
          Add a medication
        </button>
      </div>
    </div>
  `;
}

/* ---------- Stats ---------- */

function statsStrip(stats) {
  const tone =
    stats.adherence == null ? '' :
    stats.adherence >= 90 ? 'ok' :
    stats.adherence >= 75 ? 'warn' : 'bad';

  return html`
    <div class="stats">
      <div class="stat" data-tone="${tone}">
        <span class="stat-n">${stats.adherence == null ? '—' : `${stats.adherence}%`}</span>
        <span class="stat-l">Doses on time<br/>last 30 days</span>
      </div>
      <div class="stat">
        <span class="stat-n">${stats.daysSince == null ? '—' : stats.daysSince}</span>
        <span class="stat-l">Days since<br/>last seizure</span>
      </div>
      <div class="stat" data-tone="${stats.streak >= 7 ? 'ok' : ''}">
        <span class="stat-n">${stats.streak}</span>
        <span class="stat-l">Day streak<br/>all doses taken</span>
      </div>
    </div>
  `;
}

/* ---------- Today's doses ---------- */

const GLYPH = { taken: '✓', late: '!', missed: '✕', pending: '' };

function todayCard(state) {
  const doses = todaysDoses(state);
  const today = dayKey();

  return html`
    <div class="section">
      <div class="section-head">
        <h2>Today</h2>
        <button class="btn btn-sm btn-quiet" data-action="nav" data-to="meds">
          All meds
        </button>
      </div>
      <div class="card card-flush">
        <div class="rows">
          ${map(doses, (d) => {
            const label = doseLabel(d.status, d.time);
            return `
              <div class="dose-row">
                <span class="med-dot" data-color="${esc(d.med.color)}" aria-hidden="true">💊</span>
                <span class="dose-body">
                  <span class="dose-name">${esc(d.med.name)} ${esc(d.med.dose)}</span>
                  <span class="dose-meta">${prettyTime(d.time)} · ${label}</span>
                </span>
                <button class="tick" data-status="${d.status}"
                        data-action="dose-cycle"
                        data-med="${d.med.id}" data-time="${d.time}" data-day="${today}"
                        aria-label="${esc(d.med.name)} at ${prettyTime(d.time)}: ${label}. Tap to change.">
                  ${GLYPH[d.status]}
                </button>
              </div>`;
          })}
        </div>
      </div>
    </div>
  `;
}

/* ---------- Check-in prompt ---------- */

function checkinPrompt() {
  return html`
    <button class="card card-tap" data-action="checkin-open">
      <span class="row">
        <span class="med-dot" data-color="blue" aria-hidden="true">🌙</span>
        <span class="row-body">
          <span class="row-t">How did you sleep?</span>
          <span class="row-s">
            Ten seconds. Sleep and stress are what the pattern finder needs.
          </span>
        </span>
        <span class="chev">${raw(icon('chevron'))}</span>
      </span>
    </button>
  `;
}

/* ---------- Insight ---------- */

function insightCard(ins) {
  return html`
    <div class="section">
      <div class="section-head">
        <h2>Worth knowing</h2>
        <button class="btn btn-sm btn-quiet" data-action="nav" data-to="track">
          All patterns
        </button>
      </div>
      <div class="insight" data-tone="${ins.tone}">
        <span class="insight-ico" aria-hidden="true">${ins.icon}</span>
        <span class="insight-body">
          <span class="insight-t">${ins.title}</span>
          <span class="insight-d">${ins.detail}</span>
          <span class="insight-e">${ins.evidence}</span>
        </span>
      </div>
    </div>
  `;
}

/* ---------- Quick actions ---------- */

function quickActions() {
  return html`
    <div class="quick-grid">
      <button class="quick" data-action="seizure-open">
        <span class="quick-ico" aria-hidden="true">📝</span>
        <span class="quick-t">Log a seizure</span>
        <span class="quick-s">Takes about ten seconds</span>
      </button>
      <button class="quick" data-action="open-emergency">
        <span class="quick-ico" aria-hidden="true">🆘</span>
        <span class="quick-t">Safety card</span>
        <span class="quick-s">Show someone what to do</span>
      </button>
    </div>
  `;
}

/* ============================================================
   Actions
   ============================================================ */

export const actions = {
  /** The two big buttons on the next-dose card. */
  async 'dose-quick'(node) {
    const { med, time, status } = node.dataset;
    await store.setDoseStatus(dayKey(), med, time, status);
    toast(
      status === 'taken' ? 'Marked taken' :
      status === 'late'  ? 'Marked taken late' : 'Marked missed',
      status === 'missed' ? 'bad' : 'ok'
    );
  },
};
