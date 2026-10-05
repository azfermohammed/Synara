/* Shared test setup: an in-memory backend and a frozen clock.
   Imported by the *.test.js files; not a test file itself. */

import { mock } from 'node:test';
import * as store from '../js/store.js';

/** A backend that keeps a deep copy in memory, like localStorage would. */
export function memoryBackend() {
  let saved = null;
  return {
    name: 'memory',
    async read() { return saved ? JSON.parse(JSON.stringify(saved)) : null; },
    async write(s) { saved = JSON.parse(JSON.stringify(s)); },
    async clear() { saved = null; },
    peek() { return saved; },
  };
}

/** Freeze "now" to a local date-time. Month is 1-based for readability. */
export function freezeTime(y, m, d, hh = 14, mm = 0) {
  mock.timers.enable({ apis: ['Date'], now: new Date(y, m - 1, d, hh, mm) });
}

export function thawTime() {
  mock.timers.reset();
}

/** Fresh, empty store on a fresh memory backend. */
export async function freshStore() {
  const backend = memoryBackend();
  store.setBackend(backend);
  await store.init();
  await store.reset();
  return backend;
}
