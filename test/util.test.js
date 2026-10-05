/* Dates, escaping, and labels. Run with `npm test`. */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  html, raw, parseKey, addDays, daysBetween, prettyDuration, prettyTime,
  telHref, doseLabel, initials, dialable,
} from '../js/util.js';
import { freezeTime, thawTime } from './helpers.js';

afterEach(() => thawTime());

test('day keys parse as local midnight, not UTC', () => {
  // new Date("2026-03-08") is UTC midnight — the 7th in the Americas.
  const d = parseKey('2026-03-08');
  assert.equal(d.getDate(), 8);
  assert.equal(d.getHours(), 0);
});

test('addDays crosses month ends, year ends, and DST changes', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
});

test('html escapes every value and keeps booleans for ARIA', () => {
  const out = html`<a title="${'"><x>'}" aria-pressed="${false}" data-n="${0}">${null}</a>`;
  assert.ok(out.includes('&quot;&gt;&lt;x&gt;'));
  assert.ok(out.includes('aria-pressed="false"'), 'false must not collapse to ""');
  assert.ok(out.includes('data-n="0"'));
  assert.ok(out.endsWith('></a>'), 'null renders as nothing');
});

test('raw() is the only way markup passes through unescaped', () => {
  assert.equal(html`${raw('<b>x</b>')}`, '<b>x</b>');
  assert.equal(html`${'<b>x</b>'}`, '&lt;b&gt;x&lt;/b&gt;');
});

test('dose labels distinguish scheduled, due, and genuinely overdue', () => {
  freezeTime(2026, 10, 5, 14, 0);
  assert.equal(doseLabel('pending', '15:00'), 'Scheduled');
  assert.equal(doseLabel('pending', '13:30'), 'Due now');
  assert.equal(doseLabel('pending', '08:00'), '6h overdue');
  assert.equal(doseLabel('taken', '08:00'), 'Taken');
  assert.equal(doseLabel('late', '08:00'), 'Taken late');
  assert.equal(doseLabel('missed', '08:00'), 'Missed');
});

test('formatting helpers', () => {
  assert.equal(prettyTime('08:00'), '8:00 AM');
  assert.equal(prettyTime('00:30'), '12:30 AM');
  assert.equal(prettyTime('12:05'), '12:05 PM');
  assert.equal(prettyDuration(135), '2h 15m');
  assert.equal(prettyDuration(45), '45m');
  assert.equal(telHref('(555) 014-2007'), 'tel:5550142007');
  assert.equal(initials('Maya  Ellison'), 'ME');
});

test('only numbers with enough digits count as dialable', () => {
  assert.equal(dialable('(555) 014-2007'), true);
  assert.equal(dialable('911'), true);
  assert.equal(dialable('ask the office'), false);
  assert.equal(dialable('javascript:alert(1)'), false);
  assert.equal(dialable(''), false);
});
