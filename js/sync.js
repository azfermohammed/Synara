/* ============================================================
   sync.js — Synara on every device, through a Flux account
   ------------------------------------------------------------
   Only inside Flux (synara.html), only for a student signed in to
   Flux, and only once they turn it on in You → Flux.

   END-TO-END ENCRYPTED. The whole record is encrypted on the
   device (AES-GCM, 128-bit key) before it goes anywhere. The key is
   made on the first device and is never uploaded: the student
   carries it to their other devices as a sync key, 26 characters
   shown as XXXX-XXXX-…. Flux stores only ciphertext (its
   synara_vaults table), so nobody with access to Flux's database
   can read a student's medication, seizures or contacts. Lose every
   device and the key, and the synced copy can't be opened — on
   purpose. The device's own copy is unaffected either way.

   THE RULE. A record is tens of kilobytes, so it moves whole:
     only this device changed      → upload
     only the synced copy changed  → download (validated by migrate)
     both changed                  → ask which to keep
     synced copy deleted elsewhere → stop syncing here, keep data
   "Changed" is measured against the last successful sync: a hash
   of this device's record, and the server's updated_at.

   The key and sync state live in localStorage "synara.sync",
   outside the record, so a backup file never contains the key.
   Flux side: window.FluxSynaraVault (Flux: flux-synara-vault.mjs).
   ============================================================ */

import * as store from './store.js';

const META_KEY = 'synara.sync';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const PUSH_DELAY = 3000;

/* ============================================================
   Pure helpers (tested in test/sync.test.js)
   ============================================================ */

/** 16 bytes → 26 base32 characters (the last 2 bits are zero padding). */
export function encodeKey(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** A typed or pasted key → 16 bytes, or null. Forgiving about case,
    spaces, dashes, and the letters people confuse with digits. */
export function decodeKey(text) {
  const clean = String(text || '').toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 26) return null;
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length !== 16 || (value & ((1 << bits) - 1)) !== 0) return null;
  return new Uint8Array(out);
}

export function formatKey(code) {
  return code.match(/.{1,4}/g).join('-');
}

/* Settings that belong to a device, not to the student. Reminders need
   that device's own notification permission: synced "on" to a phone that
   never granted it, the switch would say on while no reminder ever came.
   The planner link writes to that device's own storage. So these are left
   out of what syncs, and each device keeps its own when a copy arrives. */
export const DEVICE_ONLY = ['remindersOn', 'fluxLink'];

/** The record as it syncs: without this device's own settings. */
export function shareable(plain) {
  const rec = JSON.parse(plain);
  if (rec.settings) for (const k of DEVICE_ONLY) delete rec.settings[k];
  return JSON.stringify(rec);
}

/** A synced record, with this device's own settings kept as they are. */
export function withDeviceSettings(plain, local) {
  const rec = JSON.parse(plain);
  rec.settings = { ...(rec.settings || {}) };
  for (const k of DEVICE_ONLY) rec.settings[k] = local.settings[k];
  return JSON.stringify(rec);
}

/** What to do, given this device's record hash, the synced row, and
    what both looked like at the last successful sync. */
export function decide(localHash, remote, meta) {
  if (!remote) return meta.remoteAt ? 'gone' : 'push';
  const localChanged = localHash !== meta.hash;
  const remoteChanged = remote.updated_at !== meta.remoteAt;
  if (localChanged && remoteChanged) return 'conflict';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'none';
}

const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function cryptoKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain, raw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(raw), data);
  return { ciphertext: b64(new Uint8Array(sealed)), iv: b64(iv) };
}

/** Throws Error('wrong-key') when the key doesn't open it. */
export async function decrypt(row, raw) {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(row.iv) }, await cryptoKey(raw), unb64(row.ciphertext));
    return new TextDecoder().decode(opened);
  } catch {
    throw Object.assign(new Error('wrong-key'), { code: 'wrong-key' });
  }
}

export async function hash(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ============================================================
   State
   ============================================================ */

let status = { phase: 'off', error: '', account: null };
const listeners = new Set();
let pushTimer = null;
let running = null;
let started = false;

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) fn(status);
}

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStatus() { return status; }

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') || {}; } catch { return {}; }
}
function writeMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* blocked */ }
}

export function enabled() { return !!readMeta().key; }
export function lastSynced() { return readMeta().at || ''; }
export function keyText() {
  const k = readMeta().key;
  return k ? formatKey(k) : '';
}

/** Inside Flux, where Flux's sign-in is on the page. */
export function available() {
  return typeof document !== 'undefined' && document.documentElement.dataset.host === 'flux';
}
function vault() { return window.FluxSynaraVault || null; }

/** The vault script is deferred; wait for it rather than racing it. */
function vaultReady() {
  if (vault() || document.readyState !== 'loading') return Promise.resolve(vault());
  return new Promise((r) => document.addEventListener('DOMContentLoaded', () => r(vault()), { once: true }));
}

function need(v) {
  if (!v) throw Object.assign(new Error('not-ready'), { code: 'not-ready' });
  return v;
}

export async function account() {
  const v = await vaultReady();
  if (!v) return null;
  try { return await v.account(); } catch { return null; }
}

/** Re-check who is signed in (they may have signed in in another tab). */
export async function refreshAccount() {
  setStatus({ account: await account() });
  return status.account;
}

function errorCode(e) {
  return (e && (e.code || e.message)) || 'failed';
}

/* ============================================================
   Sync
   ============================================================ */

const localRecord = () => shareable(store.exportJSON());

async function push(meta, raw) {
  const plain = localRecord();
  const sealed = await encrypt(plain, raw);
  const row = await need(vault()).put(sealed);
  writeMeta({ ...meta, hash: await hash(plain), remoteAt: row.updated_at, at: new Date().toISOString() });
}

async function pull(meta, raw, remote) {
  const plain = await decrypt(remote, raw);
  // Remember the server version first, so the re-render this import
  // triggers sees nothing new to upload.
  writeMeta({ ...meta, remoteAt: remote.updated_at });
  await store.importJSON(withDeviceSettings(plain, store.get()));
  writeMeta({ ...readMeta(), hash: await hash(localRecord()), at: new Date().toISOString() });
}

/** One round of the rule above. Never runs twice at once. */
export function syncNow() {
  if (running) return running;
  running = (async () => {
    const meta = readMeta();
    if (!meta.key || !available()) { setStatus({ phase: 'off' }); return 'off'; }
    const v = await vaultReady();
    if (!v) { setStatus({ phase: 'error', error: 'not-ready' }); return 'error'; }
    setStatus({ phase: 'syncing', error: '' });
    try {
      const raw = decodeKey(meta.key);
      const remote = await v.get();
      const what = decide(await hash(localRecord()), remote, meta);
      if (what === 'push') await push(meta, raw);
      else if (what === 'pull') await pull(meta, raw, remote);
      else if (what === 'gone') {
        writeMeta({});
        setStatus({ phase: 'off', error: 'gone' });
        return what;
      } else if (what === 'conflict') {
        setStatus({ phase: 'conflict' });
        return what;
      }
      setStatus({ phase: 'idle', error: '' });
      return what;
    } catch (e) {
      setStatus({ phase: 'error', error: errorCode(e) });
      return 'error';
    }
  })().finally(() => { running = null; });
  return running;
}

/** Settle a conflict: 'device' keeps this device's record, 'cloud' the synced one. */
export async function resolve(choice) {
  const meta = readMeta();
  const raw = decodeKey(meta.key);
  setStatus({ phase: 'syncing', error: '' });
  try {
    if (choice === 'cloud') await pull(meta, raw, await need(vault()).get());
    else await push(meta, raw);
    setStatus({ phase: 'idle' });
  } catch (e) {
    setStatus({ phase: 'error', error: errorCode(e) });
    throw e;
  }
}

/** First device: make a key and upload this device's record. */
export async function startNew() {
  const v = need(await vaultReady());
  if (!(await account())) throw Object.assign(new Error('signed-out'), { code: 'signed-out' });
  if (await v.get()) throw Object.assign(new Error('has-copy'), { code: 'has-copy' });
  const raw = crypto.getRandomValues(new Uint8Array(16));
  await push({ key: encodeKey(raw) }, raw);
  setStatus({ phase: 'idle', error: '' });
}

/** Another device: check the key opens the synced copy. Returns a
    summary for the student to confirm before anything is replaced. */
export async function inspect(keyInput) {
  const raw = decodeKey(keyInput);
  if (!raw) throw Object.assign(new Error('bad-key'), { code: 'bad-key' });
  const remote = await need(await vaultReady()).get();
  if (!remote) throw Object.assign(new Error('no-copy'), { code: 'no-copy' });
  const parsed = JSON.parse(await decrypt(remote, raw));
  return {
    key: encodeKey(raw),
    updatedAt: remote.updated_at,
    meds: Array.isArray(parsed.meds) ? parsed.meds.length : 0,
    seizures: Array.isArray(parsed.seizures) ? parsed.seizures.length : 0,
    name: (parsed.profile && typeof parsed.profile.name === 'string') ? parsed.profile.name : '',
  };
}

/** Another device, confirmed: replace this device's record with the synced one. */
export async function join(key) {
  const raw = decodeKey(key);
  await pull({ key }, raw, await need(vault()).get());
  setStatus({ phase: 'idle', error: '' });
}

/** Stop syncing on this device. The device keeps its record. With
    deleteCopy, the synced copy is removed for every device. */
export async function stop({ deleteCopy = false } = {}) {
  if (deleteCopy) await need(vault()).remove();
  writeMeta({});
  clearTimeout(pushTimer);
  setStatus({ phase: 'off', error: '' });
}

/* ============================================================
   Start
   ============================================================ */

export async function start() {
  if (!available() || started) return;
  started = true;

  // Changes go up a few seconds after the last edit.
  store.subscribe(() => {
    if (!enabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, PUSH_DELAY);
  });
  // Coming back to the tab is when another device's changes matter.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    refreshAccount();
    if (enabled()) syncNow();
  });
  window.addEventListener('online', () => { if (enabled()) syncNow(); });

  await refreshAccount();
  if (enabled()) syncNow();
}
