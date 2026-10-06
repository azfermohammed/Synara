/* Offline: every file the app loads must be in the service worker's
   precache list, or the app fails to start with no signal — emergency
   card included. Version 2.2 shipped two new modules without listing
   them; this catches the next one. Run with `npm test`. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function precacheList() {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js has a PRECACHE list');
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/** Every module reachable from the entry, by its static imports. */
function moduleGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    const rel = relative(ROOT, file);
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      walk(normalize(join(dirname(file), m[1])));
    }
  };
  walk(join(ROOT, entry));
  return seen;
}

test('every module the app imports is precached for offline use', () => {
  const cached = precacheList();
  const missing = [...moduleGraph('js/main.js')].filter((f) => !cached.has(f));
  assert.deepEqual(missing, [], `add these to PRECACHE in sw.js (and bump VERSION): ${missing.join(', ')}`);
});

test('every precached file exists', () => {
  for (const f of precacheList()) {
    if (f === './') continue;
    assert.ok(existsSync(join(ROOT, f)), `${f} is in PRECACHE but not on disk`);
  }
});

test('the stylesheets and icons index.html loads are precached', () => {
  const cached = precacheList();
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const local = [...html.matchAll(/(?:href|src)="([^"#:?]+\.(?:css|js|svg|png|webmanifest))"/g)].map((m) => m[1]);
  const missing = local.filter((f) => !cached.has(f) && f !== 'sw.js');
  assert.deepEqual(missing, []);
});
