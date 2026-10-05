/* The pattern engine: finds what's planted, invents nothing.
   Run with `npm test`. */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { insights, summary, calendarDays } from '../js/insights.js';
import { seed } from '../js/seed.js';
import { freshStore, freezeTime, thawTime } from './helpers.js';

afterEach(() => thawTime());

test('never reports a pattern from fewer than two seizures', async () => {
  freezeTime(2026, 10, 5);
  await freshStore();
  await store.addSeizure({ at: '2026-10-01T10:00', trigger: 'Stress' });
  assert.deepEqual(insights(store.get()), []);
});

test('finds the correlations planted in the demo data — and only 3 of 4', async () => {
  freezeTime(2026, 10, 5, 14);
  await freshStore();
  await store.reset({ seedFn: seed });

  const found = insights(store.get());
  const byId = Object.fromEntries(found.map((i) => [i.id, i]));

  assert.ok(byId['dose-proximity'], 'dose correlation found');
  assert.equal(byId['dose-proximity'].evidence, '3/4 seizures · 75%');
  assert.ok(byId.sleep, 'short-sleep correlation found');
  assert.equal(found[0].id, 'dose-proximity', 'the most actionable insight ranks first');
});

test('the demo schedule change and stopped med do not dent the history', async () => {
  freezeTime(2026, 10, 5, 14);
  await freshStore();
  await store.reset({ seedFn: seed });
  const s = store.get();

  const lev = s.meds.find((m) => m.name === 'Levetiracetam');
  const top = s.meds.find((m) => m.name === 'Topiramate');
  assert.equal(lev.schedule.length, 2, 'evening dose moved once');
  assert.ok(top.ended, 'Topiramate was stopped');
  assert.equal(store.activeMeds(s).length, 2);

  // Every scheduled dose in the window has a logged status — the move
  // from 9pm to 8pm left no phantom "missed" doses behind.
  for (let back = 1; back <= 40; back++) {
    const d = new Date(2026, 9, 5 - back);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const { med, time } of store.dosesOn(day, s)) {
      assert.notEqual(store.doseStatus(day, med.id, time, s), 'pending', `${day} ${med.name} ${time}`);
    }
  }
});

test('a seizure from before any medication was tracked is not counted for or against', async () => {
  freezeTime(2026, 10, 20, 14);
  await freshStore();
  // Three seizures before any med existed, then a med that is always taken.
  for (const at of ['2026-09-01T10:00', '2026-09-05T10:00', '2026-09-09T10:00']) {
    await store.addSeizure({ at });
  }
  thawTime();
  freezeTime(2026, 10, 1, 9);
  await store.addMed({ name: 'Lev', times: ['08:00'] });
  assert.equal(insights(store.get()).find((i) => i.id === 'dose-proximity'), undefined);
});

test('the calendar leaves today neutral until it is over', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00'] });

  thawTime();
  freezeTime(2026, 10, 5, 22);
  const id = store.get().meds[0].id;
  // Unlogged at 10pm: statistics call it missed, the calendar does not.
  assert.equal(store.effectiveStatus('2026-10-05', id, '08:00'), 'missed');
  const today = calendarDays(store.get(), 28).at(-1);
  assert.equal(today.day, '2026-10-05');
  assert.equal(today.status, 'none');
});

test('the streak counts consecutive fully-taken days and stops at a miss', async () => {
  freezeTime(2026, 10, 1, 9);
  await freshStore();
  await store.addMed({ name: 'Lev', times: ['08:00', '20:00'] });
  const id = store.get().meds[0].id;
  for (const d of ['2026-10-02', '2026-10-03', '2026-10-04']) {
    await store.setDoseStatus(d, id, '08:00', 'taken');
    await store.setDoseStatus(d, id, '20:00', 'taken');
  }
  await store.setDoseStatus('2026-10-01', id, '08:00', 'taken');
  await store.setDoseStatus('2026-10-01', id, '20:00', 'late');

  thawTime();
  freezeTime(2026, 10, 5, 9);
  assert.equal(summary(store.get()).streak, 3);
});

test('days since the last seizure does not trust array order', async () => {
  freezeTime(2026, 10, 5);
  await freshStore();
  const unsorted = store.migrate({
    meds: [], doses: {},
    seizures: [{ at: '2026-09-01T10:00' }, { at: '2026-10-03T10:00' }, { at: '2026-09-20T10:00' }],
  });
  assert.equal(summary(unsorted).daysSince, 2);
});
