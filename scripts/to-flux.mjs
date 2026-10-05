#!/usr/bin/env node
/* Copy Synara into a Flux checkout, where it runs as synara.html.

     npm run flux -- "../dev/Flux Planner"

   This repo stays the source. Flux gets the same js/, css/ and icons/ under
   public/synara/, and its own build (npm run build:web in Flux) bundles them
   into public/bundles/flux-synara.<hash>.js and .css. Run Flux's build after
   this, then commit there. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (!target) {
  console.error('Usage: npm run flux -- <path to the Flux checkout>');
  process.exit(1);
}
const flux = path.resolve(target);
if (!fs.existsSync(path.join(flux, 'hub.html')) || !fs.existsSync(path.join(flux, 'scripts', 'build-web-bundles.mjs'))) {
  console.error(`${flux} does not look like a Flux checkout (no hub.html or build script).`);
  process.exit(1);
}

const dest = path.join(flux, 'public', 'synara');
// Replace, not merge, so a file deleted here is deleted there too.
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['js', 'css', 'icons']) {
  fs.cpSync(path.join(ROOT, dir), path.join(dest, dir), { recursive: true });
}

const count = fs.readdirSync(dest, { recursive: true }).filter((f) => path.extname(f)).length;
console.log(`Copied ${count} files to ${dest}`);
console.log('Next, in Flux: npm run build:web');
