/* ============================================================
   fluxlink.js — Synara and the Flux Planner, on one device
   ------------------------------------------------------------
   Inside Flux (synara.html), Synara and the Flux Planner share a
   browser origin. If the student turns it on (You → Flux Planner),
   Synara leaves a small summary under its own key for the planner
   to read:

     localStorage["synara.flux"] = {
       v: 1,
       meds: [{ name, dose, color, added, ended,
                schedule: [{ from: "2026-10-01", times: ["08:00"] }] }],
     }

   Medication names, doses and times: what a calendar needs and
   nothing more. Seizures, check-ins, contacts and notes never leave
   Synara's own record. The planner only reads this to draw its
   calendar and a link to the safety card; it never uploads it.
   Turning the setting off deletes the key.

   Standalone (not inside Flux) there is no planner to talk to, so
   none of this runs.
   ============================================================ */

export const FEED_KEY = 'synara.flux';

export function available() {
  return typeof document !== 'undefined' && document.documentElement.dataset.host === 'flux';
}

/** The summary the planner reads. Pure, so it can be tested. */
export function feedFor(state) {
  return {
    v: 1,
    meds: state.meds.map((m) => ({
      name: m.name,
      dose: m.dose,
      color: m.color,
      added: m.added,
      ended: m.ended,
      schedule: m.schedule.map((e) => ({ from: e.from, times: e.times.slice() })),
    })),
  };
}

/** Bring the planner's copy in line with the setting. Cheap enough per render. */
export function publish(state) {
  if (!available()) return;
  try {
    if (!state.settings.fluxLink) {
      localStorage.removeItem(FEED_KEY);
      return;
    }
    const json = JSON.stringify(feedFor(state));
    if (localStorage.getItem(FEED_KEY) !== json) localStorage.setItem(FEED_KEY, json);
  } catch {
    /* Storage full or blocked: the planner just won't show doses. */
  }
}
