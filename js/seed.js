/* ============================================================
   seed.js — demo data
   ------------------------------------------------------------
   Called by main.js on first run (and by "Reset demo data").

   Two rules this file follows:

   1. EVERYTHING IS SYNTHETIC. Invented names, 555 phone numbers
      (reserved for fiction), a made-up school. No real person's
      health information is in this repo, which is what makes it
      safe to deploy publicly.

   2. THE CORRELATIONS ARE REAL. The insight engine computes from
      whatever is logged — it is not fed conclusions. So the seed
      plants genuine structure (seizures clustering after missed
      evening doses and short-sleep nights) and lets the engine
      find it. If you change the numbers below, the Patterns screen
      changes with them. That honesty is the point of the demo.

   Everything is generated relative to today, so the app never looks
   stale no matter when it is opened.
   ============================================================ */

import { dayKey, addDays, uid } from './util.js';

/* Offsets in days back from today. Three of the four seizures land
   within 48h of a missed or late evening dose — deliberately not all
   four. The one at day 38 was triggered by strobe lighting with a
   clean dose record around it, so the engine reports 3/4 rather than
   a suspiciously tidy 100%. Real correlations have exceptions; a demo
   without them is a lie. All four follow a short-sleep night. */
const MISSED_EVENING = [4, 12, 25, 26, 41];
const LATE_DOSES     = [2, 6, 9, 17, 22, 31];
const HISTORY_DAYS   = 45;

/* The evening dose moved from 9pm to 8pm this many days ago, and a
   previous medication was stopped this many days ago. Both exist so
   the demo exercises schedule history: neither change may rewrite the
   days before it. */
const EVENING_MOVED_BACK = 21;
const TOPIRAMATE_STOPPED_BACK = 30;

/** Nights with noticeably less sleep than baseline. */
const SHORT_SLEEP = { 3: 5.0, 4: 6.0, 11: 5.5, 12: 6.0, 24: 4.5, 25: 5.5, 38: 6.0 };

/** Days the student flagged as stressful (1–5 scale). */
const HIGH_STRESS = { 3: 5, 4: 4, 10: 4, 11: 5, 23: 4, 24: 5, 37: 4, 38: 4 };

const round1 = (n) => Math.round(n * 10) / 10;

export function seed(state) {
  const today = dayKey();

  /* ---------- Profile ---------- */
  state.profile = {
    name: 'Maya Ellison',
    pronouns: 'she/her',
    grade: '11th grade',
    school: 'Rosewood High School',
    seizureType: 'Focal impaired awareness, occasional tonic-clonic',
    diagnosed: '2022',
    neurologist: 'Dr. Priya Raghavan',
    neuroPhone: '(555) 010-4488',
    allergies: 'Penicillin',
    bloodType: 'O+',
  };

  /* ---------- Meds ---------- */
  const start = addDays(today, -HISTORY_DAYS);
  const moved = addDays(today, -EVENING_MOVED_BACK);
  const stopped = addDays(today, -TOPIRAMATE_STOPPED_BACK);

  const lev = {
    id: uid('med'),
    name: 'Levetiracetam',
    dose: '500 mg',
    form: 'tablet',
    notes: 'Take with food. Evening dose moved to 8pm so it is done before homework.',
    color: 'violet',
    added: start,
    ended: null,
    schedule: [
      { from: start, times: ['08:00', '21:00'] },
      { from: moved, times: ['08:00', '20:00'] },
    ],
  };
  const lam = {
    id: uid('med'),
    name: 'Lamotrigine',
    dose: '100 mg',
    form: 'tablet',
    notes: 'Never stop suddenly — taper only with Dr. Raghavan.',
    color: 'mint',
    added: start,
    ended: null,
    schedule: [{ from: start, times: ['08:00'] }],
  };
  const top = {
    id: uid('med'),
    name: 'Topiramate',
    dose: '25 mg',
    form: 'tablet',
    notes: 'Stopped with Dr. Raghavan — made it hard to concentrate in class.',
    color: 'amber',
    added: start,
    ended: stopped,
    schedule: [{ from: start, times: ['21:00'] }],
  };
  state.meds = [lev, lam, top];

  /* ---------- Dose history ----------
     Built backwards from today so the calendar is full the moment the
     app opens. Each day logs whatever was scheduled THAT day, so the
     evening dose is keyed 21:00 before the move and 20:00 after it.
     Today is deliberately left unlogged — the home screen should have
     something for the student to do. */
  state.doses = {};

  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const day = addDays(today, -back);
    const entry = {};

    const missedEvening = MISSED_EVENING.includes(back);
    const late = LATE_DOSES.includes(back);
    const evening = day < moved ? '21:00' : '20:00';

    // Morning doses: near-perfect, occasionally late.
    entry[`${lev.id}|08:00`] = { status: late ? 'late' : 'taken', at: `${day}T08:12` };
    entry[`${lam.id}|08:00`] = { status: late ? 'late' : 'taken', at: `${day}T08:12` };

    // Evening dose: the realistic failure point. Nobody misses the one
    // they take at breakfast; they miss the one at night.
    if (missedEvening) {
      entry[`${lev.id}|${evening}`] = { status: 'missed', at: `${day}T23:50` };
    } else if (late) {
      entry[`${lev.id}|${evening}`] = { status: 'late', at: `${day}T22:40` };
    } else {
      entry[`${lev.id}|${evening}`] = { status: 'taken', at: `${day}T${evening === '21:00' ? '21:04' : '20:05'}` };
    }

    // The stopped med, for the days it was still being taken.
    if (day < stopped) {
      entry[`${top.id}|21:00`] = { status: 'taken', at: `${day}T21:06` };
    }

    state.doses[day] = entry;
  }

  /* ---------- Daily check-ins ----------
     Sleep and stress are the two things the brief explicitly wanted
     correlated against seizures, so they need somewhere to live.
     Baseline is a reasonable 7.4–8.4h; the short nights above are
     the exception. */
  state.checkins = {};
  for (let back = HISTORY_DAYS; back >= 0; back--) {
    const day = addDays(today, -back);
    const shortNight = SHORT_SLEEP[back];
    const sleepHours = shortNight != null
      ? shortNight
      : round1(7.4 + ((back * 37) % 11) / 10);
    const stress = HIGH_STRESS[back] != null
      ? HIGH_STRESS[back]
      : 1 + ((back * 17) % 3);

    state.checkins[day] = {
      sleepHours,
      sleepQuality: sleepHours < 6 ? 'poor' : sleepHours < 7 ? 'ok' : 'good',
      stress,
      mood: stress >= 4 ? 'low' : 'ok',
      notes: '',
      at: `${day}T07:30`,
    };
  }

  /* ---------- Seizures ----------
     Placed deliberately: each one follows a short-sleep night, and
     three of the four fall within 48h of a missed or late evening
     dose. The engine discovers that; it is not told. */
  const events = [
    {
      back: 3, time: '15:40', duration: 95,
      type: 'Focal impaired awareness',
      trigger: 'Missed sleep', place: 'School — classroom',
      aura: 'Metallic taste, felt "far away" for about a minute',
      injury: false, emsCalled: false,
      notes: 'Ms. Okafor followed the card. Sat with me until I came back. Missed the bus home.',
    },
    {
      back: 11, time: '21:10', duration: 130,
      type: 'Tonic-clonic',
      trigger: 'Missed dose', place: 'Home — bedroom',
      aura: 'None that I remember',
      injury: true, emsCalled: false,
      notes: 'Bit the inside of my cheek. Mom timed it at just over two minutes.',
    },
    {
      back: 24, time: '07:55', duration: 60,
      type: 'Focal aware',
      trigger: 'Missed sleep', place: 'Home — kitchen',
      aura: 'Stomach-dropping feeling',
      injury: false, emsCalled: false,
      notes: 'Stayed home first period. Was fine by lunch.',
    },
    {
      back: 38, time: '14:20', duration: 150,
      type: 'Tonic-clonic',
      trigger: 'Flashing lights', place: 'School — gym',
      aura: 'Visual static',
      injury: false, emsCalled: true,
      notes: 'Assembly with strobe lighting. Nurse called EMS because it went past two minutes. Did not go to hospital.',
    },
  ];

  state.seizures = events.map((e) => ({
    id: uid('sz'),
    at: `${addDays(today, -e.back)}T${e.time}`,
    duration: e.duration,
    type: e.type,
    trigger: e.trigger,
    place: e.place,
    aura: e.aura,
    injury: e.injury,
    emsCalled: e.emsCalled,
    notes: e.notes,
    logged: `${addDays(today, -e.back)}T${e.time}`,
  }));
  state.seizures.sort((a, b) => (a.at < b.at ? 1 : -1));

  /* ---------- Emergency contacts ----------
     555 numbers throughout — reserved for fiction, so nobody's
     real phone rings if someone taps one in the demo. */
  state.contacts = [
    { id: uid('c'), name: 'Dana Ellison',       relation: 'Mom',              phone: '(555) 014-2007', primary: true },
    { id: uid('c'), name: 'Marcus Ellison',     relation: 'Dad',              phone: '(555) 014-2019', primary: false },
    { id: uid('c'), name: 'Dr. Priya Raghavan', relation: 'Neurologist',      phone: '(555) 010-4488', primary: false },
    { id: uid('c'), name: 'Nurse Ruiz',         relation: 'School nurse',     phone: '(555) 018-8300', primary: false },
    { id: uid('c'), name: 'Aunt Jo',            relation: 'Emergency pickup', phone: '(555) 016-3520', primary: false },
  ];

  /* ---------- The safety card ----------
     First-aid steps follow standard public seizure first aid
     ("Stay, Safe, Side"). The app says plainly, on the card itself,
     that a real student's version should be confirmed with their
     neurologist — guidance in an app is not a care plan. */
  state.card = {
    looksLike:
      'Maya usually goes quiet and stops responding. She may stare, blink repeatedly, ' +
      'or pick at her clothes. She sometimes says food tastes metallic right before. ' +
      'Most last under two minutes. Afterwards she is confused and very tired for ' +
      '20–30 minutes and may not remember what happened.',

    during: [
      'Stay with her and start timing immediately.',
      'Move chairs, desks, and anything hard or sharp out of the way.',
      'Put something soft under her head.',
      'Loosen anything tight around her neck.',
      'If she is not aware or not awake, gently turn her onto her side.',
      'Stay calm and speak normally — she may be able to hear you.',
    ],

    doNot: [
      'Do NOT put anything in her mouth. She cannot swallow her tongue.',
      'Do NOT hold her down or try to stop the movements.',
      'Do NOT give food, drink, or pills until she is fully awake.',
      'Do NOT crowd her — ask other students to step back.',
    ],

    after: [
      'Stay with her until she is fully alert and knows where she is.',
      'Tell her calmly what happened — she will not remember.',
      'Let her rest somewhere quiet. The nurse\'s office is best.',
      'Call her mom, Dana, at (555) 014-2007.',
      'Write down the time it started and how long it lasted.',
    ],

    callEms: [
      'The seizure lasts longer than 5 minutes.',
      'A second seizure starts soon after the first.',
      'She does not wake up or return to normal afterwards.',
      'She is having trouble breathing, or her lips stay blue.',
      'She was injured, or it happened in water.',
    ],

    forTeacher:
      'Do not send her to the office alone afterwards — she will be confused and may ' +
      'not make it there. Send another student to get Nurse Ruiz instead. She is allowed ' +
      'to make up any assessment missed; this is in her 504 plan.',

    forNurse:
      'No rescue medication is prescribed at school. Standard first aid only. ' +
      'Call Dana Ellison first, then Dr. Raghavan\'s office if EMS criteria are met. ' +
      'Maya prefers to rest in the dark side room rather than the main bay.',

    forCoach:
      'Cleared for all sports except swimming without a spotter on deck. ' +
      'No climbing above head height. If she has a seizure at practice she is done ' +
      'for the day — no returning to play, even if she says she feels fine.',

    updated: addDays(today, -6),
  };

  /* ---------- Settings ---------- */
  state.settings = {
    theme: 'system',
    remindersOn: false,
    reminderLead: 0,
    quietHours: null,
    seeded: true,
  };

  return state;
}
