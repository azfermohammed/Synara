/* ============================================================
   setup.js — "Fill in your sections"
   ------------------------------------------------------------
   The parts of Synara a new student still has to fill in, worked
   out from the record itself. The intro ends on this list, and
   Home keeps showing it until everything is done or the student
   hides it.

   Each item names the action that opens its editor, so tapping it
   does exactly what the button for it elsewhere in the app does.
   Pure: tested in test/setup.test.js.
   ============================================================ */

import { activeMeds } from './store.js';

/**
 * @param state the record
 * @param {{reminders?: boolean}} opts reminders: false when this
 *   device can't show notifications, so asking would be a dead end.
 */
export function setupItems(state, { reminders = true } = {}) {
  const { profile, settings, card, contacts } = state;
  const items = [
    {
      id: 'details',
      icon: 'user',
      title: 'Your details',
      todo: 'School, grade, neurologist and allergies',
      done: !!(profile.name.trim() && profile.school.trim()),
      action: 'profile-edit',
    },
    {
      id: 'meds',
      icon: 'pill',
      title: 'Your medication',
      todo: 'Each one, with the times you take it',
      done: settings.noMeds || activeMeds(state).length > 0,
      action: 'med-open',
    },
    {
      id: 'looksLike',
      icon: 'note',
      title: 'What your seizures look like',
      todo: 'So someone watching knows what’s happening',
      done: !!card.looksLike.trim(),
      action: 'card-edit',
      data: { field: 'looksLike' },
    },
    {
      id: 'contacts',
      icon: 'phone',
      title: 'Emergency contacts',
      todo: 'Who to call, and their number',
      done: contacts.length > 0,
      action: 'contact-open',
    },
  ];
  // No medication means nothing to be reminded about.
  if (reminders && !settings.noMeds) {
    items.push({
      id: 'reminders',
      icon: 'bell',
      title: 'Dose reminders',
      todo: 'A nudge at each dose time',
      done: settings.remindersOn,
      action: 'nav',
      data: { to: 'you' },
    });
  }
  return items;
}

export function setupProgress(state, opts) {
  const items = setupItems(state, opts);
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, complete: done === items.length };
}

/** Whether Home should still ask. Not for the example record: it's complete
    by design, and it isn't the student's to fill in. */
export function showSetup(state, opts) {
  return !state.settings.setupHidden && !state.settings.seeded && !setupProgress(state, opts).complete;
}
