/* Data layer: schedule history, validation, import, wipe.
   Run with `npm test`. */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { summary, calendarDays } from '../js/insights.js';
import { freshStore, freezeTime, thawTime } from './helpers.js';

afterEach(() => thawTime());

async function logAll(id, days, times, status = 'taken') {
  for (const d of days) for (const t of times) await store.setDoseStatus(d, id, t, status);
}

/* Must stay the first test in this file: it needs a store that has never
   been initialised. (node --test runs each file in its own process.) */
test('nothing can be written before the stored record has been read', async () => {
  const backend = (await import('./helpers.js')).memoryBackend();
  await backend.write({ meds: [], seizures: [], doses: {}, profile: { name: 'Real record' } });
  store.setBackend(backend);

  await assert.rejects(store.addContact({ name: 'x', phone: '555 0000' }), /not-ready/);
  assert.equal(backend.peek().profile.name, 'Real record', 'stored record untouched');
});

/* ---------- The three statistics bugs from the first build ---------- */

test('a med added today schedules nothing on earlier days', async () => {
  freezeTime(2026, 10, 5);
  await freshStore();
  await store.addMed({ name: 'Carbamazepine', dose: '200 mg', times: ['07:30', '19:30'] });

  assert.equal(store.dosesOn('2026-10-04').length, 0);
  assert.equal(store.dosesOn('2026-10-05').length, 2);

  // Previously: 0% adherence and 27 red calendar days on day one.
  const s = summary(store.get());
  assert.equal(s.adherence, null);
  assert.equal(s.adherenceTotal, 0);
  assert.equal(calendarDays(store.get(), 28).filter((d) => d.status === 'missed').length, 0);
});

test('changing dose times applies from today and leaves history alone', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Levetiracetam', times: ['08:00', '20:00'] });
  const id = store.get().meds[0].id;
  await logAll(id, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], ['08:00', '20:00']);

  thawTime();
  freezeTime(2026, 10, 5, 9);
  const before = summary(store.get()).adherence;
  await store.updateMed(id, { times: ['08:00', '21:00'] });

  // Previously: 79% → 56% in the demo, from re-reading the past at 9pm.
  assert.equal(before, 100);
  assert.equal(summary(store.get()).adherence, 100);

  const med = store.get().meds[0];
  assert.deepEqual(store.timesOn(med, '2026-10-04'), ['08:00', '20:00']);
  assert.deepEqual(store.timesOn(med, '2026-10-05'), ['08:00', '21:00']);
});

test('a second edit on the same day replaces that day, and undoing collapses it', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00'] });
  const id = store.get().meds[0].id;

  thawTime();
  freezeTime(2026, 10, 5, 9);
  await store.updateMed(id, { times: ['09:00'] });
  await store.updateMed(id, { times: ['10:00'] });
  assert.equal(store.get().meds[0].schedule.length, 2);

  await store.updateMed(id, { times: ['08:00'] });
  assert.equal(store.get().meds[0].schedule.length, 1);
});

test('stopping a med keeps its history in every statistic', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Lamotrigine', times: ['08:00'] });
  const id = store.get().meds[0].id;
  await logAll(id, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], ['08:00']);

  thawTime();
  freezeTime(2026, 10, 5, 9);
  const before = summary(store.get()).adherenceTotal;
  await store.removeMed(id);

  // Previously: the med vanished and took its doses with it.
  const med = store.get().meds[0];
  assert.ok(med, 'med is kept');
  assert.equal(med.ended, '2026-10-05');
  assert.equal(store.activeMeds().length, 0);
  assert.equal(store.dosesOn('2026-10-04').length, 1);
  assert.equal(store.dosesOn('2026-10-05').length, 0);
  assert.equal(summary(store.get()).adherenceTotal, before);
});

test('a med added and removed on the same day is deleted outright', async () => {
  freezeTime(2026, 10, 5, 9);
  await freshStore();
  await store.addMed({ name: 'Oops', times: ['08:00'] });
  const id = store.get().meds[0].id;
  await store.setDoseStatus('2026-10-05', id, '08:00', 'taken');
  await store.removeMed(id);

  assert.equal(store.get().meds.length, 0);
  assert.deepEqual(store.get().doses, {});
});

test('restarting a stopped med leaves the stopped days as a gap, not misses', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00'] });
  const id = store.get().meds[0].id;
  await logAll(id, ['2026-10-01', '2026-10-02'], ['08:00']);

  thawTime();
  freezeTime(2026, 10, 3, 9);
  await store.removeMed(id);

  thawTime();
  freezeTime(2026, 10, 6, 9);
  await store.restartMed(id);

  assert.equal(store.dosesOn('2026-10-04').length, 0);
  assert.equal(store.dosesOn('2026-10-06').length, 1);
  assert.equal(store.get().meds.length, 1, 'no duplicate med');
  assert.equal(summary(store.get()).adherence, 100);
});

/* ---------- Grace window ---------- */

test('an unlogged dose today gets an hour of grace before counting as missed', async () => {
  freezeTime(2026, 10, 5, 9, 0);
  await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00'] });
  const id = store.get().meds[0].id;
  assert.equal(store.effectiveStatus('2026-10-05', id, '08:00'), 'pending');

  thawTime();
  freezeTime(2026, 10, 5, 9, 1);
  assert.equal(store.effectiveStatus('2026-10-05', id, '08:00'), 'missed');
});

/* ---------- Migration and validation ---------- */

test('schema-2 meds migrate without losing history', () => {
  const legacy = {
    meds: [
      { id: 'med_a', name: 'Lev', dose: '500 mg', times: ['20:00', '08:00'], active: true },
      { id: 'med_b', name: 'Old', dose: '25 mg', times: ['21:00'], active: false },
    ],
    doses: { '2026-09-20': { 'med_a|08:00': { status: 'taken', at: '2026-09-20T08:05' } } },
    seizures: [],
  };
  const s = store.migrate(legacy);
  const a = s.meds.find((m) => m.id === 'med_a');
  assert.equal(a.added, '2026-09-20', 'dated from its first logged dose');
  assert.deepEqual(a.schedule, [{ from: '2026-09-20', times: ['08:00', '20:00'] }]);
  assert.equal(a.ended, null);
  assert.ok(s.meds.find((m) => m.id === 'med_b').ended, 'active:false becomes an end date');
  assert.equal(s.doses['2026-09-20']['med_a|08:00'].status, 'taken');
});

test('the validator neutralises a crafted backup', () => {
  const evilId = 'x" onmouseover="alert(1)';
  const s = store.migrate({
    meds: [{ id: evilId, name: '<img src=x onerror=alert(1)>', times: ['08:00', '8am', '"><script>'], color: 'red;}' }],
    doses: {
      '2026-10-01': { [`${evilId}|08:00`]: { status: 'taken' } },
      'not-a-date': { 'med_x|08:00': { status: 'taken' } },
    },
    seizures: [{ id: '<b>', at: '2026-10-01T10:00' }, { at: 'yesterday' }],
    contacts: [{ name: 'A', phone: '1', primary: true }, { name: 'B', phone: '2', primary: true }],
    settings: { theme: 'hacker', reminderLead: 9999 },
  });

  const med = s.meds[0];
  assert.match(med.id, /^[A-Za-z0-9_-]+$/, 'unsafe id replaced');
  assert.deepEqual(med.schedule[0].times, ['08:00'], 'only valid HH:MM survives');
  assert.equal(med.color, 'violet');
  assert.equal(typeof med.name, 'string', 'text is kept as text and escaped at render');
  assert.deepEqual(s.doses, {}, 'doses for unknown ids and bad days are dropped');
  assert.equal(s.seizures.length, 1, 'seizure with an invalid timestamp is dropped');
  assert.match(s.seizures[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(s.contacts.filter((c) => c.primary).length, 1, 'one first-call contact at most');
  assert.equal(s.settings.theme, 'system');
  assert.equal(s.settings.reminderLead, 120);
});

/* ---------- Import, wipe ---------- */

test('importJSON rejects files that are not backups and leaves data untouched', async () => {
  freezeTime(2026, 10, 5);
  await freshStore();
  await store.addMed({ name: 'Keep me', times: ['08:00'] });

  await assert.rejects(store.importJSON('not json'), /not-json/);
  await assert.rejects(store.importJSON('{"hello":1}'), /not-synara/);
  assert.equal(store.get().meds[0].name, 'Keep me');
});

test('importJSON round-trips an export', async () => {
  freezeTime(2026, 10, 5);
  await freshStore();
  await store.addMed({ name: 'Lev', dose: '500 mg', times: ['08:00'] });
  await store.addContact({ name: 'Mom', relation: 'Mom', phone: '(555) 014-2007', primary: true });
  const exported = store.exportJSON();

  await store.reset();
  assert.equal(store.get().meds.length, 0);
  await store.importJSON(exported);
  assert.equal(store.get().meds[0].name, 'Lev');
  assert.equal(store.get().contacts[0].phone, '(555) 014-2007');
});

test('wipe empties storage so the next start is a first run again', async () => {
  freezeTime(2026, 10, 5);
  const backend = await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00'] });
  await store.wipe();

  assert.equal(backend.peek(), null);
  const { firstRun } = await store.init();
  assert.equal(firstRun, true);
});

test('a fresh record ships with standard first aid but no personal details', () => {
  const s = store.emptyState();
  assert.ok(s.card.during.length > 0);
  assert.ok(s.card.callEms.some((x) => /5 minutes/.test(x)));
  assert.equal(s.card.looksLike, '');
  assert.equal(s.contacts.length, 0);
});
