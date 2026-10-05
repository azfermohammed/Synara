/* ============================================================
   store.js — application state and persistence
   ------------------------------------------------------------
   This is the ONLY file that knows where data physically lives.

   Everything here is async even though localStorage is synchronous.
   That is the whole point: the ask was "on device for now with space
   for cloud sync later", and the expensive version of that migration
   is the one where every call site has to change from sync to async.
   So the seam is async from day one, and swapping in a server later
   is `setBackend(supabaseBackend)` plus one new object implementing
   read/write/clear.

   Imported by main.js at boot and by every view for reads/writes.
   ============================================================ */

import { dayKey, stamp, uid } from './util.js';

const STORAGE_KEY = 'synara.v2';
const SCHEMA_VERSION = 2;

/* ============================================================
   Backends
   ------------------------------------------------------------
   A backend is any object with { name, read(), write(state),
   clear() } returning promises. Add a Supabase one beside this
   and hand it to setBackend() — nothing else in the app changes.
   ============================================================ */

const localBackend = {
  name: 'local',

  async read() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      // Corrupt JSON, or storage blocked in a private window. Either
      // way we must not take the app down — fall back to a fresh seed
      // and log it, rather than silently pretending nothing happened.
      console.warn('[synara] could not read local state:', err);
      return null;
    }
  },

  async write(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[synara] could not save state:', err);
      throw new Error('save-failed');
    }
  },

  async clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[synara] could not clear state:', err);
    }
  },
};

let backend = localBackend;

/** Point the app at a different persistence layer (e.g. Supabase). */
export function setBackend(next) {
  backend = next;
}

export function backendName() {
  return backend.name;
}

/* ============================================================
   State shape
   ------------------------------------------------------------
   One plain object, versioned, JSON-serialisable throughout.
   Date formats are fixed across the app — see the note in util.js:
     day key   "YYYY-MM-DD"
     timestamp "YYYY-MM-DDTHH:mm"
     time      "HH:MM"
   ============================================================ */

export function emptyState() {
  return {
    v: SCHEMA_VERSION,

    profile: {
      name: '', pronouns: '', grade: '', school: '',
      seizureType: '', diagnosed: '',
      neurologist: '', neuroPhone: '',
      allergies: '', bloodType: '',
    },

    /* meds[] — {id, name, dose, form, times[], notes, color, active} */
    meds: [],

    /* doses — { "YYYY-MM-DD": { "<medId>|HH:MM": {status, at} } }
       status is one of pending | taken | late | missed
       `at` is the timestamp the student actually marked it. */
    doses: {},

    /* seizures[] — see addSeizure() for the full field list */
    seizures: [],

    /* checkins — { "YYYY-MM-DD": {sleepHours, sleepQuality, stress, mood, notes} }
       This is what makes "patterns between seizures and sleep/stress"
       possible at all; without a daily check-in there is nothing to
       correlate against. */
    checkins: {},

    /* contacts[] — {id, name, relation, phone, primary} */
    contacts: [],

    /* The first-aid steps are filled in from the start, deliberately.
       Seizure first aid is the same for everyone — it is not personal
       data — and a brand-new user's emergency card rendering as empty
       headings would be worse than useless in the moment it is needed.
       Only the genuinely personal fields start blank: what their
       seizures look like, and the notes for staff.

       Wording follows standard public guidance ("Stay, Safe, Side").
       The card itself tells the user to confirm it with a neurologist. */
    card: {
      looksLike: '',
      during: [
        'Stay with them and start timing the seizure.',
        'Move anything hard or sharp out of the way.',
        'Put something soft under their head.',
        'Loosen anything tight around their neck.',
        'If they are not aware or not awake, gently turn them onto their side.',
        'Stay calm and speak normally — they may be able to hear you.',
      ],
      doNot: [
        'Do NOT put anything in their mouth. They cannot swallow their tongue.',
        'Do NOT hold them down or try to stop the movements.',
        'Do NOT give food, drink, or pills until they are fully awake.',
        'Do NOT crowd them — ask other people to step back.',
      ],
      after: [
        'Stay with them until they are fully alert and know where they are.',
        'Tell them calmly what happened — they may not remember.',
        'Let them rest somewhere quiet.',
        'Call their emergency contact.',
        'Write down the time it started and how long it lasted.',
      ],
      callEms: [
        'The seizure lasts longer than 5 minutes.',
        'A second seizure starts soon after the first.',
        'They do not wake up or return to normal afterwards.',
        'They are having trouble breathing, or their lips stay blue.',
        'They were injured, or it happened in water.',
      ],
      forTeacher: '',
      forNurse: '',
      forCoach: '',
      updated: '',
    },

    settings: {
      theme: 'system',        // system | light | dark
      remindersOn: false,
      reminderLead: 0,        // minutes before the scheduled time
      quietHours: null,       // {from:"22:00", to:"07:00"} or null
      seeded: false,
    },
  };
}

/* ============================================================
   Live state + subscriptions
   ============================================================ */

let state = emptyState();
const listeners = new Set();

/** Read-only-by-convention access to the current state. */
export function get() {
  return state;
}

/** Subscribe to every committed change. Returns an unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[synara] listener threw:', err);
    }
  }
}

/**
 * Mutate and persist in one step.
 *
 * `mutator` receives the live state object and may change it in
 * place. We persist after it returns, then notify. Writes are awaited
 * so a future network backend naturally applies backpressure.
 */
export async function update(mutator) {
  mutator(state);
  await backend.write(state);
  notify();
  return state;
}

/** Persist the current state without mutating it. */
export async function flush() {
  await backend.write(state);
}

/* ============================================================
   Boot
   ============================================================ */

/**
 * Load persisted state, migrating if needed.
 *
 * Deliberately does NOT seed. A real student opening this for the
 * first time should not find someone else's medications and seizure
 * history already in it — that was fine for the pitch demo and wrong
 * for the actual app. main.js asks instead, and nothing is written
 * until they choose, so closing the tab re-asks rather than silently
 * committing an empty record.
 */
export async function init() {
  const stored = await backend.read();

  if (!stored) {
    state = emptyState();
    return { state, firstRun: true };
  }

  state = migrate(stored);
  await backend.write(state);
  return { state, firstRun: false };
}

/**
 * Bring an older saved shape up to the current one.
 *
 * Anything without a version number predates `checkins` and
 * `settings`, so we fill those in rather than dropping the
 * student's real logs.
 */
function migrate(stored) {
  const base = emptyState();
  return {
    ...base,
    ...stored,
    v: SCHEMA_VERSION,
    profile:  { ...base.profile,  ...(stored.profile  || {}) },
    card:     { ...base.card,     ...(stored.card     || {}) },
    settings: { ...base.settings, ...(stored.settings || {}) },
    doses:    stored.doses    || {},
    checkins: stored.checkins || {},
    meds:     Array.isArray(stored.meds)     ? stored.meds     : [],
    seizures: Array.isArray(stored.seizures) ? stored.seizures : [],
    contacts: Array.isArray(stored.contacts) ? stored.contacts : [],
  };
}

/** Wipe everything and re-seed. Used by "Reset demo data". */
export async function reset({ seedFn } = {}) {
  await backend.clear();
  state = emptyState();
  if (seedFn) {
    seedFn(state);
    state.settings.seeded = true;
  }
  await backend.write(state);
  notify();
  return state;
}

/* ============================================================
   Domain operations
   ------------------------------------------------------------
   Views call these rather than reaching into state themselves, so
   the shape stays owned by this file.
   ============================================================ */

/* ---- Meds ---- */

export function addMed({ name, dose, form = 'tablet', times = [], notes = '', color = 'violet' }) {
  return update((s) => {
    s.meds.push({
      id: uid('med'),
      name: name.trim(),
      dose: dose.trim(),
      form,
      times: [...times].sort(),
      notes: notes.trim(),
      color,
      active: true,
      added: dayKey(),
    });
  });
}

export function updateMed(id, patch) {
  return update((s) => {
    const med = s.meds.find((m) => m.id === id);
    if (!med) return;
    Object.assign(med, patch);
    if (patch.times) med.times = [...patch.times].sort();
  });
}

export function removeMed(id) {
  return update((s) => {
    s.meds = s.meds.filter((m) => m.id !== id);
    // Leave the historical dose log alone on purpose. Deleting a med
    // should not rewrite the past — adherence for the weeks it *was*
    // being taken is still true, and a neurologist may ask about it.
  });
}

export function activeMeds(s = state) {
  return s.meds.filter((m) => m.active !== false);
}

/* ---- Doses ---- */

export const doseKey = (medId, time) => `${medId}|${time}`;

export function setDoseStatus(day, medId, time, status) {
  return update((s) => {
    if (!s.doses[day]) s.doses[day] = {};
    if (status === 'pending') {
      delete s.doses[day][doseKey(medId, time)];
      if (!Object.keys(s.doses[day]).length) delete s.doses[day];
    } else {
      s.doses[day][doseKey(medId, time)] = { status, at: stamp() };
    }
  });
}

/** Raw logged status, or 'pending' if never marked. */
export function doseStatus(day, medId, time, s = state) {
  const entry = s.doses[day] && s.doses[day][doseKey(medId, time)];
  return entry ? entry.status : 'pending';
}

/**
 * Status for statistics, where "never marked and the time has passed"
 * has to count as missed — otherwise adherence would quietly round up
 * every time someone forgets to log, which is exactly the number that
 * must not lie.
 *
 * This deliberately differs from what the UI shows for *today*: a dose
 * two hours from now displays as "Due", not "Missed". One hour of
 * grace before a past dose flips to missed.
 */
export function effectiveStatus(day, medId, time, s = state) {
  const logged = doseStatus(day, medId, time, s);
  if (logged !== 'pending') return logged;

  const today = dayKey();
  if (day < today) return 'missed';
  if (day > today) return 'pending';

  const now = new Date();
  const [h, m] = time.split(':').map(Number);
  const passed = now.getHours() * 60 + now.getMinutes() > h * 60 + m + 60;
  return passed ? 'missed' : 'pending';
}

/* ---- Seizures ---- */

export function addSeizure({
  at, duration = 0, type = '', trigger = '', place = '',
  aura = '', injury = false, emsCalled = false, notes = '',
}) {
  return update((s) => {
    s.seizures.push({
      id: uid('sz'),
      at: at || stamp(),
      duration: Number(duration) || 0,   // seconds
      type, trigger, place, aura,
      injury: !!injury,
      emsCalled: !!emsCalled,
      notes: (notes || '').trim(),
      logged: stamp(),
    });
    s.seizures.sort((a, b) => (a.at < b.at ? 1 : -1));   // newest first
  });
}

export function updateSeizure(id, patch) {
  return update((s) => {
    const sz = s.seizures.find((x) => x.id === id);
    if (sz) Object.assign(sz, patch);
    s.seizures.sort((a, b) => (a.at < b.at ? 1 : -1));
  });
}

export function removeSeizure(id) {
  return update((s) => {
    s.seizures = s.seizures.filter((x) => x.id !== id);
  });
}

/* ---- Daily check-in ---- */

export function setCheckin(day, patch) {
  return update((s) => {
    s.checkins[day] = { ...(s.checkins[day] || {}), ...patch, at: stamp() };
  });
}

export function getCheckin(day, s = state) {
  return s.checkins[day] || null;
}

/* ---- Contacts ---- */

export function addContact({ name, relation, phone, primary = false }) {
  return update((s) => {
    if (primary) s.contacts.forEach((c) => { c.primary = false; });
    s.contacts.push({
      id: uid('c'),
      name: name.trim(),
      relation: relation.trim(),
      phone: phone.trim(),
      primary: !!primary,
    });
  });
}

export function updateContact(id, patch) {
  return update((s) => {
    const c = s.contacts.find((x) => x.id === id);
    if (!c) return;
    if (patch.primary) s.contacts.forEach((x) => { x.primary = false; });
    Object.assign(c, patch);
  });
}

export function removeContact(id) {
  return update((s) => {
    s.contacts = s.contacts.filter((x) => x.id !== id);
  });
}

/* ---- Card, profile, settings ---- */

export function updateCard(patch) {
  return update((s) => {
    Object.assign(s.card, patch, { updated: dayKey() });
  });
}

export function updateProfile(patch) {
  return update((s) => Object.assign(s.profile, patch));
}

export function updateSettings(patch) {
  return update((s) => Object.assign(s.settings, patch));
}

/* ---- Export ----

   A student handing their neurologist a file is a real use case and
   costs almost nothing to support, so it exists from v1. */
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
