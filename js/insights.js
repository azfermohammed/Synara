/* ============================================================
   insights.js — the pattern engine
   ------------------------------------------------------------
   Imported by views/seizures.js (the Patterns tab) and views/home.js
   (which surfaces the single strongest insight).

   This is the part of the app most likely to be believed, so it is
   the part most obliged to be careful. Three rules:

   1. NEVER INVENT A PATTERN. Every function here returns null when
      the data behind it is too thin. An empty Patterns screen is a
      correct answer; a confident-sounding coincidence is not.

   2. REPORT THE EVIDENCE, NOT JUST THE CONCLUSION. Every insight
      carries the counts it was computed from, and the UI shows them.
      "3 of 4 seizures" is checkable. "You often have seizures after
      missed doses" is not.

   3. SAY "ASSOCIATED WITH", NEVER "CAUSED BY". Four seizures is not
      a study. The wording throughout is deliberately hedged, and
      DISCLAIMER below is rendered at the bottom of the screen.
   ============================================================ */

import {
  dayKey, addDays, parseStamp, daysBetween, lastNDays,
  tally, plural, prettySeconds,
} from './util.js';
import { effectiveStatus, doseStatus, activeMeds } from './store.js';

export const DISCLAIMER =
  'These are associations in your own log, not medical conclusions. ' +
  'Patterns can appear by chance, especially with few entries. ' +
  'Bring them to your neurologist rather than acting on them alone.';

/** Below this many seizures, correlation output is noise. */
const MIN_SEIZURES = 3;

const avg = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

/**
 * Compute every insight worth showing, strongest first.
 * Returns [] rather than placeholder text when there is nothing real.
 */
export function insights(state) {
  const sz = state.seizures || [];
  if (sz.length < 2) return [];

  return [
    doseProximity(state, sz),
    sleepPattern(state, sz),
    stressPattern(state, sz),
    triggerPattern(sz),
    timeOfDayPattern(sz),
    placePattern(sz),
    adherenceTrend(state),
    frequencyTrend(sz),
  ]
    .filter(Boolean)
    .sort((a, b) => b.strength - a.strength);
}

/** The single most useful thing to surface on the home screen. */
export function topInsight(state) {
  return insights(state)[0] || null;
}

/* ============================================================
   1. Seizures following a missed or late dose
   ------------------------------------------------------------
   The correlation the brief asked for first, and the most actionable
   one: unlike sleep or stress, a missed dose is something the app
   can directly help prevent.
   ============================================================ */

function doseProximity(state, sz) {
  if (sz.length < MIN_SEIZURES) return null;

  const meds = activeMeds(state);
  if (!meds.length) return null;

  let followed = 0;

  for (const s of sz) {
    const day = s.at.split('T')[0];
    let hit = false;

    // Look at the seizure day and the two days before it — a missed
    // antiepileptic dose affects blood levels for well over 24h.
    for (const offset of [0, -1, -2]) {
      const checkDay = addDays(day, offset);
      for (const med of meds) {
        for (const time of med.times) {
          const status = effectiveStatus(checkDay, med.id, time, state);
          if (status === 'missed' || status === 'late') { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    }

    if (hit) followed++;
  }

  if (followed < 2) return null;

  const pct = Math.round((followed / sz.length) * 100);
  // Only worth saying if it is most of them. At 50% it is a coin flip.
  if (pct < 60) return null;

  return {
    id: 'dose-proximity',
    tone: 'alert',
    icon: '💊',
    title: `${followed} of your ${sz.length} seizures followed a missed or late dose`,
    detail:
      `Within 48 hours of each of those ${plural(followed, 'seizure')}, at least one ` +
      `scheduled dose was marked missed or late. This is the pattern most worth ` +
      `mentioning at your next appointment.`,
    evidence: `${followed}/${sz.length} seizures · ${pct}%`,
    strength: 100 + pct,
  };
}

/* ============================================================
   2. Sleep
   ============================================================ */

function sleepPattern(state, sz) {
  const checkins = state.checkins || {};
  const seizureDays = new Set(sz.map((s) => s.at.split('T')[0]));

  const onSeizureDays = [];
  const onOtherDays = [];

  for (const [day, c] of Object.entries(checkins)) {
    if (typeof c.sleepHours !== 'number') continue;
    (seizureDays.has(day) ? onSeizureDays : onOtherDays).push(c.sleepHours);
  }

  // Need enough of both groups for the comparison to mean anything.
  if (onSeizureDays.length < MIN_SEIZURES || onOtherDays.length < 10) return null;

  const withSeizure = avg(onSeizureDays);
  const without = avg(onOtherDays);
  const gap = without - withSeizure;

  // Under 45 minutes is inside the noise of self-reported sleep.
  if (gap < 0.75) return null;

  return {
    id: 'sleep',
    tone: 'alert',
    icon: '🌙',
    title: `You slept ${gap.toFixed(1)} hours less before seizure days`,
    detail:
      `On the nights before a seizure you logged an average of ${withSeizure.toFixed(1)} ` +
      `hours, against ${without.toFixed(1)} hours on every other night. Short sleep is one ` +
      `of the most commonly reported seizure triggers.`,
    evidence: `${onSeizureDays.length} seizure nights vs ${onOtherDays.length} others`,
    strength: 90 + Math.min(20, gap * 10),
  };
}

/* ============================================================
   3. Stress
   ============================================================ */

function stressPattern(state, sz) {
  const checkins = state.checkins || {};
  const seizureDays = new Set(sz.map((s) => s.at.split('T')[0]));

  const onSeizureDays = [];
  const onOtherDays = [];

  for (const [day, c] of Object.entries(checkins)) {
    if (typeof c.stress !== 'number') continue;
    (seizureDays.has(day) ? onSeizureDays : onOtherDays).push(c.stress);
  }

  if (onSeizureDays.length < MIN_SEIZURES || onOtherDays.length < 10) return null;

  const withSeizure = avg(onSeizureDays);
  const without = avg(onOtherDays);
  const gap = withSeizure - without;

  if (gap < 0.8) return null;   // on a 1–5 scale

  return {
    id: 'stress',
    tone: 'watch',
    icon: '🌊',
    title: 'Seizure days were higher-stress days',
    detail:
      `You rated stress ${withSeizure.toFixed(1)} out of 5 on seizure days, against ` +
      `${without.toFixed(1)} otherwise. Stress alone rarely triggers a seizure, but it ` +
      `often travels with the things that do — less sleep, skipped meals, broken routine.`,
    evidence: `${onSeizureDays.length} seizure days vs ${onOtherDays.length} others`,
    strength: 70 + gap * 10,
  };
}

/* ============================================================
   4. Most common trigger
   ============================================================ */

function triggerPattern(sz) {
  if (sz.length < MIN_SEIZURES) return null;

  const ranked = tally(sz.map((s) => s.trigger).filter(Boolean));
  if (!ranked.length || ranked[0].count < 2) return null;

  const top = ranked[0];
  const pct = Math.round((top.count / sz.length) * 100);

  return {
    id: 'trigger',
    tone: 'watch',
    icon: '⚡',
    title: `"${top.value}" is your most logged trigger`,
    detail:
      `You recorded it for ${plural(top.count, 'seizure')} out of ${sz.length}. ` +
      (ranked.length > 1
        ? `Next most common: ${ranked.slice(1, 3).map((r) => `${r.value} (${r.count})`).join(', ')}.`
        : 'It is the only trigger you have logged so far.'),
    evidence: `${top.count}/${sz.length} seizures · ${pct}%`,
    strength: 60 + pct / 2,
  };
}

/* ============================================================
   5. Time-of-day clustering
   ------------------------------------------------------------
   Four-hour blocks. Finer buckets look precise but are meaningless
   at these sample sizes.
   ============================================================ */

const BLOCKS = [
  { from: 0,  to: 4,  label: 'late at night (12am–4am)' },
  { from: 4,  to: 8,  label: 'early morning (4am–8am)' },
  { from: 8,  to: 12, label: 'in the morning (8am–12pm)' },
  { from: 12, to: 16, label: 'in the early afternoon (12pm–4pm)' },
  { from: 16, to: 20, label: 'in the late afternoon (4pm–8pm)' },
  { from: 20, to: 24, label: 'in the evening (8pm–12am)' },
];

function timeOfDayPattern(sz) {
  if (sz.length < MIN_SEIZURES) return null;

  const counts = new Array(BLOCKS.length).fill(0);
  for (const s of sz) {
    const hour = parseStamp(s.at).getHours();
    const idx = BLOCKS.findIndex((b) => hour >= b.from && hour < b.to);
    if (idx >= 0) counts[idx]++;
  }

  let best = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;

  if (counts[best] < 2) return null;

  const pct = Math.round((counts[best] / sz.length) * 100);
  if (pct < 50) return null;

  return {
    id: 'time-of-day',
    tone: 'neutral',
    icon: '🕐',
    title: `Most of your seizures happen ${BLOCKS[best].label}`,
    detail:
      `${counts[best]} of ${sz.length} fell in that window. If that holds up, it is worth ` +
      'asking whether your dose timing lines up with it.',
    evidence: `${counts[best]}/${sz.length} seizures · ${pct}%`,
    strength: 40 + pct / 2,
  };
}

/* ============================================================
   6. Where they happen
   ============================================================ */

function placePattern(sz) {
  if (sz.length < MIN_SEIZURES) return null;

  const ranked = tally(sz.map((s) => s.place).filter(Boolean));
  if (!ranked.length || ranked[0].count < 2) return null;

  const top = ranked[0];
  const atSchool = sz.filter((s) => /school/i.test(s.place || '')).length;

  return {
    id: 'place',
    tone: 'neutral',
    icon: '📍',
    title: atSchool >= 2
      ? `${atSchool} of ${sz.length} happened at school`
      : `Most often at: ${top.value}`,
    detail: atSchool >= 2
      ? 'Worth making sure the staff who are actually around you — not just the front ' +
        'office — have seen your safety card.'
      : `You logged ${plural(top.count, 'seizure')} there out of ${sz.length}.`,
    evidence: `${top.count}/${sz.length} seizures`,
    strength: 35,
  };
}

/* ============================================================
   7. Adherence trend — is it getting better or worse?
   ============================================================ */

function adherenceOver(state, meds, days, skipRecent = 0) {
  const today = dayKey();
  let good = 0;
  let total = 0;

  for (let back = skipRecent + 1; back <= days; back++) {
    const day = addDays(today, -back);
    for (const med of meds) {
      for (const time of med.times) {
        const status = effectiveStatus(day, med.id, time, state);
        if (status === 'pending') continue;
        total++;
        if (status === 'taken') good++;
      }
    }
  }
  return { good, total };
}

function adherenceTrend(state) {
  const meds = activeMeds(state);
  if (!meds.length) return null;

  const recent = adherenceOver(state, meds, 14);
  const earlier = adherenceOver(state, meds, 45, 14);

  if (recent.total < 10 || earlier.total < 10) return null;

  const rPct = Math.round((recent.good / recent.total) * 100);
  const ePct = Math.round((earlier.good / earlier.total) * 100);
  const delta = rPct - ePct;

  if (Math.abs(delta) < 8) return null;   // noise

  const improving = delta > 0;

  return {
    id: 'adherence-trend',
    tone: improving ? 'good' : 'alert',
    icon: improving ? '📈' : '📉',
    title: improving
      ? `Your dose consistency is up ${delta} points`
      : `Your dose consistency has slipped ${Math.abs(delta)} points`,
    detail:
      `${rPct}% of doses taken on time over the last 14 days, against ${ePct}% in the ` +
      'month before that.' +
      (improving ? ' Keep going.' : ' Worth a look at which dose is slipping.'),
    evidence: `${recent.good}/${recent.total} recent · ${earlier.good}/${earlier.total} before`,
    strength: improving ? 50 : 85,
  };
}

/* ============================================================
   8. Are seizures getting more or less frequent?
   ============================================================ */

function frequencyTrend(sz) {
  if (sz.length < 4) return null;

  const today = dayKey();
  const sorted = [...sz].sort((a, b) => (a.at < b.at ? -1 : 1));
  const oldest = sorted[0].at.split('T')[0];
  const span = daysBetween(oldest, today);

  if (span < 30) return null;

  const half = Math.floor(span / 2);
  const midpoint = addDays(today, -half);

  const recent = sz.filter((s) => s.at.split('T')[0] > midpoint).length;
  const earlier = sz.length - recent;

  if (recent === earlier) return null;

  const fewer = recent < earlier;

  return {
    id: 'frequency',
    tone: fewer ? 'good' : 'alert',
    icon: fewer ? '🌤️' : '⚠️',
    title: fewer
      ? 'Fewer seizures in the most recent stretch'
      : 'More seizures in the most recent stretch',
    detail:
      `${plural(recent, 'seizure')} in the last ${half} days, against ${earlier} in the ` +
      `${half} days before. Over a window this short, a change like this can easily be ` +
      'chance — it is worth watching, not concluding.',
    evidence: `${recent} recent vs ${earlier} earlier`,
    strength: fewer ? 45 : 80,
  };
}

/* ============================================================
   Summary stats — used by the home dashboard and the Patterns header
   ============================================================ */

/** Consecutive days back from yesterday with every dose taken on time. */
function currentStreak(state, meds) {
  if (!meds.length) return 0;
  const today = dayKey();
  let streak = 0;

  for (let back = 1; back <= 120; back++) {
    const day = addDays(today, -back);
    let allGood = true;
    let any = false;

    for (const med of meds) {
      for (const time of med.times) {
        const status = effectiveStatus(day, med.id, time, state);
        if (status === 'pending') continue;
        any = true;
        if (status !== 'taken') { allGood = false; break; }
      }
      if (!allGood) break;
    }

    if (!any || !allGood) break;
    streak++;
  }
  return streak;
}

export function summary(state) {
  const meds = activeMeds(state);
  const sz = state.seizures || [];
  const today = dayKey();

  const { good, total } = adherenceOver(state, meds, 30);
  const adherence = total ? Math.round((good / total) * 100) : null;

  const lastSeizure = sz.length ? sz[0].at.split('T')[0] : null;
  const daysSince = lastSeizure ? daysBetween(lastSeizure, today) : null;
  const last30 = sz.filter((s) => daysBetween(s.at.split('T')[0], today) <= 30).length;

  const durations = sz.map((s) => s.duration).filter((d) => d > 0);
  const avgDuration = durations.length ? Math.round(avg(durations)) : null;

  return {
    adherence,
    adherenceGood: good,
    adherenceTotal: total,
    daysSince,
    lastSeizure,
    seizuresLast30: last30,
    totalSeizures: sz.length,
    avgDuration,
    avgDurationLabel: avgDuration ? prettySeconds(avgDuration) : null,
    streak: currentStreak(state, meds),
  };
}

/** Per-day status rollup for the calendar heatmap. */
export function calendarDays(state, days = 28) {
  const meds = activeMeds(state);
  const seizureDays = new Set((state.seizures || []).map((s) => s.at.split('T')[0]));
  const today = dayKey();

  return lastNDays(days).map((day) => {
    let taken = 0;
    let total = 0;
    let worst = 'none';

    for (const med of meds) {
      for (const time of med.times) {
        // Today is still in progress. Counting an unlogged morning dose
        // as missed at 2pm would paint today red while the student can
        // still log it — honest for statistics, wrong for a calendar.
        const status = day === today
          ? doseStatus(day, med.id, time, state)
          : effectiveStatus(day, med.id, time, state);
        if (status === 'pending') continue;
        total++;
        if (status === 'taken') taken++;
        if (status === 'missed') worst = 'missed';
        else if (status === 'late' && worst !== 'missed') worst = 'late';
        else if (worst === 'none') worst = 'taken';
      }
    }

    return {
      day,
      taken,
      total,
      status: total === 0 ? 'none' : worst,
      ratio: total ? taken / total : null,
      seizure: seizureDays.has(day),
    };
  });
}
