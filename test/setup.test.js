/* "Fill in your sections": what counts as done, and when Home asks.
   Run with `npm test`. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupItems, setupProgress, showSetup } from '../js/setup.js';
import { seed } from '../js/seed.js';
import { emptyState, migrate } from '../js/store.js';

const ids = (items) => items.map((i) => i.id);
const done = (state, opts) => setupItems(state, opts).filter((i) => i.done).map((i) => i.id);

test('a new student starts with every section to do', () => {
  const s = emptyState();
  assert.deepEqual(ids(setupItems(s)), ['details', 'meds', 'looksLike', 'contacts', 'reminders']);
  assert.deepEqual(done(s), []);
  assert.equal(showSetup(s), true);
});

test('each section is done when its part of the record is filled in', () => {
  const s = emptyState();
  s.profile.name = 'Riley';
  assert.ok(!done(s).includes('details'), 'a name alone is not the details');
  s.profile.school = 'Rosewood High';
  s.card.looksLike = 'I stare and don’t answer for about a minute.';
  s.contacts.push({ id: 'c1', name: 'Mom', relation: 'Mother', phone: '555-0100', primary: true });
  s.settings.remindersOn = true;
  assert.deepEqual(done(s), ['details', 'looksLike', 'contacts', 'reminders']);
  assert.equal(setupProgress(s).done, 4);
});

test('no medication: nothing to add and nothing to be reminded about', () => {
  const s = emptyState();
  s.settings.noMeds = true;
  assert.ok(done(s).includes('meds'));
  assert.ok(!ids(setupItems(s)).includes('reminders'));
});

test('a device that can’t show notifications isn’t asked to turn them on', () => {
  assert.ok(!ids(setupItems(emptyState(), { reminders: false })).includes('reminders'));
});

test('every item opens a real editor', () => {
  const known = new Set(['profile-edit', 'med-open', 'card-edit', 'contact-open', 'nav']);
  for (const it of setupItems(emptyState())) assert.ok(known.has(it.action), it.action);
});

test('Home stops asking when it’s all done, hidden, or the example record', () => {
  const s = emptyState();
  s.settings.setupHidden = true;
  assert.equal(showSetup(s), false);

  const example = emptyState();
  seed(example);
  example.settings.seeded = true;
  assert.equal(showSetup(migrate(example)), false);
});

test('the new settings survive a reload and default to off', () => {
  const s = migrate({ settings: { noMeds: true, setupHidden: 'yes' } });
  assert.equal(s.settings.noMeds, true);
  assert.equal(s.settings.setupHidden, false, 'only a real true counts');
  assert.equal(emptyState().settings.noMeds, false);
});
