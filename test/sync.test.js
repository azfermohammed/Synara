/* Sync keys, the sync rule, encryption, and what the Flux Planner gets.
   Run with `npm test`. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeKey, decodeKey, formatKey, decide, encrypt, decrypt, hash } from '../js/sync.js';
import { feedFor } from '../js/fluxlink.js';
import { seed } from '../js/seed.js';
import { emptyState, migrate } from '../js/store.js';

function exampleRecord() {
  const s = emptyState();
  seed(s);
  return migrate(s);
}

/* ---------- Sync key ---------- */

test('a sync key survives the trip from one device to another', () => {
  for (let i = 0; i < 200; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(16));
    const code = encodeKey(raw);
    assert.equal(code.length, 26);
    assert.deepEqual(decodeKey(code), raw);
    assert.deepEqual(decodeKey(formatKey(code)), raw, 'with dashes');
    assert.deepEqual(decodeKey(formatKey(code).toLowerCase()), raw, 'typed in lower case');
  }
});

test('a mistyped key is refused rather than half-read', () => {
  const code = encodeKey(new Uint8Array(16).fill(7));
  assert.equal(decodeKey(code.slice(0, 25)), null, 'too short');
  assert.equal(decodeKey(code + 'A'), null, 'too long');
  assert.equal(decodeKey(code.slice(0, 25) + 'Z'), null, 'padding bits set');
  assert.equal(decodeKey('U'.repeat(26)), null, 'U is not in the alphabet');
  assert.equal(decodeKey(''), null);
  // O and I/L read as 0 and 1, the way people type them.
  const zeros = encodeKey(new Uint8Array(16));
  assert.deepEqual(decodeKey(zeros.replace(/0/g, 'O')), new Uint8Array(16));
});

/* ---------- The rule ---------- */

test('sync uploads, downloads, or asks — never silently overwrites both', () => {
  const meta = { hash: 'h1', remoteAt: 't1' };
  const row = (at) => ({ updated_at: at });
  assert.equal(decide('h1', row('t1'), meta), 'none');
  assert.equal(decide('h2', row('t1'), meta), 'push', 'only this device changed');
  assert.equal(decide('h1', row('t2'), meta), 'pull', 'only the synced copy changed');
  assert.equal(decide('h2', row('t2'), meta), 'conflict', 'both changed');
  assert.equal(decide('h1', null, meta), 'gone', 'deleted from another device');
  assert.equal(decide('h1', null, {}), 'push', 'nothing synced yet');
});

/* ---------- Encryption ---------- */

test('the synced copy is unreadable without the key', async () => {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  const plain = JSON.stringify({ seizures: [{ notes: 'tonic-clonic in gym' }], contacts: [{ name: 'Mom' }] });
  const sealed = await encrypt(plain, raw);

  assert.ok(!atob(sealed.ciphertext).includes('gym'));
  assert.equal(await decrypt(sealed, raw), plain);

  const wrong = crypto.getRandomValues(new Uint8Array(16));
  await assert.rejects(decrypt(sealed, wrong), /wrong-key/);

  const again = await encrypt(plain, raw);
  assert.notEqual(again.iv, sealed.iv, 'a fresh nonce every time');
});

test('a whole example record round-trips and hashes stably', async () => {
  const plain = JSON.stringify(exampleRecord(), null, 2);
  const raw = crypto.getRandomValues(new Uint8Array(16));
  assert.equal(await decrypt(await encrypt(plain, raw), raw), plain);
  assert.equal(await hash(plain), await hash(plain));
  assert.notEqual(await hash(plain), await hash(plain + ' '));
});

/* ---------- What the Flux Planner sees ---------- */

test('the planner gets medication times and nothing else', () => {
  const state = exampleRecord();
  const feed = feedFor(state);
  const text = JSON.stringify(feed);

  assert.equal(feed.v, 1);
  assert.ok(feed.meds.length > 0);
  assert.equal(feed.meds.length, state.meds.length);
  assert.deepEqual(Object.keys(feed), ['v', 'meds']);
  assert.deepEqual(Object.keys(feed.meds[0]).sort(), ['added', 'color', 'dose', 'ended', 'name', 'schedule']);
  // Nothing from the seizure log, contacts or profile.
  for (const s of state.seizures) if (s.notes) assert.ok(!text.includes(s.notes));
  for (const c of state.contacts) assert.ok(!text.includes(c.phone));
  assert.ok(state.profile.name && !text.includes(state.profile.name));
});
